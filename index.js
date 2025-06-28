import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

import fs, { writeFileSync, unlinkSync } from 'fs';
import puppeteer from 'puppeteer';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import fetch from 'node-fetch';
import express from 'express';
import bodyParser from 'body-parser';
import qrcode from 'qrcode';
import cloudinary from 'cloudinary';
import jwt from 'jsonwebtoken';
import { tmpdir } from 'os';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = 3000; // ✅ Port tetap
app.use(bodyParser.json());

// === Config Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// === Firebase Service Account
const serviceAccount = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  token_uri: 'https://oauth2.googleapis.com/token',
};

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  };

  const jwtToken = jwt.sign(payload, serviceAccount.private_key, { algorithm: 'RS256' });

  const response = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwtToken,
    }),
  });

  const data = await response.json();
  if (!data.access_token) throw new Error(data.error_description || 'Token kosong');
  return data.access_token;
}

// === WhatsApp Client Tanpa Username/ClientID
const client = new Client({
  authStrategy: new LocalAuth(), // ✅ tidak pakai clientId
  puppeteer: {
    executablePath: puppeteer.executablePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// === QR Handler
client.on('qr', async (qr) => {
  const url = await qrcode.toDataURL(qr);
  const result = await cloudinary.v2.uploader.upload(url, {
    folder: 'whatsapp_qrcodes',
    public_id: `qr_pribadi`,
    resource_type: 'image',
  });
  console.log(`✅ QR uploaded: ${result.secure_url}`);
});

// === WhatsApp Lifecycle
client.on('ready', () => console.log(`✅ Bot siap digunakan!`));
client.on('auth_failure', msg => console.log(`❌ Gagal autentikasi: ${msg}`));
client.on('disconnected', reason => {
  console.log(`⚠️ Terputus: ${reason}`);
  process.exit();
});
client.on('loading_screen', (percent, message) => {
  console.log(`🌀 Loading ${percent}% - ${message}`);
});

// === Message Handler
client.on('message', async (msg) => {
  if (msg.fromMe) return;

  try {
    const accessToken = await getAccessToken();
    const payload = {
      from: msg.from,
      access_token: accessToken,
      timestamp: new Date().toISOString(),
    };

    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      const isVoice = msg.type === 'ptt';
      const buffer = Buffer.from(media.data, 'base64');
      const extension = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
      const tempFilePath = join(tmpdir(), `${uuidv4()}.${extension}`);
      writeFileSync(tempFilePath, buffer);

      const upload = await cloudinary.v2.uploader.upload(tempFilePath, {
        folder: isVoice ? 'wa-inbox-audio' : 'wa-inbox-images',
        resource_type: 'auto',
      });

      unlinkSync(tempFilePath);
      payload.imageUrl = upload.secure_url;
      payload.mimetype = media.mimetype;
      payload.text = msg.caption || msg.body || '';
      payload.isVoiceNote = isVoice;
    } else {
      payload.text = msg.body;
    }

    // === Kirim ke Webhook Test dulu
    let testOk = false;
    try {
      const testRes = await fetch(process.env.WEBHOOK_TEST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (testRes.ok) {
        console.log(`[✅] Webhook TEST OK (${testRes.status})`);
        testOk = true;
      } else {
        console.warn(`[⚠️] Webhook TEST gagal: ${testRes.status}`);
      }
    } catch (err) {
      console.warn(`[❌] Error webhook TEST: ${err.message}`);
    }

    // === Webhook Production jika test gagal
    if (!testOk) {
      try {
        const prodRes = await fetch(process.env.WEBHOOK_PROD, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        console.log(`[⛔️] Webhook PROD: ${prodRes.status}`);
      } catch (err) {
        console.error(`[❌] Error webhook PROD: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`❌ Gagal proses pesan: ${err.message}`);
  }
});

// === Balas Pesan
app.post('/reply', async (req, res) => {
  try {
    const payload = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : typeof req.body.data === 'string'
        ? JSON.parse(req.body.data)
        : req.body.data || req.body;

    const { from, reply, imageUrl, caption } = payload;
    if (!from || (!reply && !imageUrl)) {
      return res.status(400).json({ error: 'from dan reply/imageUrl wajib' });
    }

    if (Array.isArray(imageUrl)) {
      for (let i = 0; i < imageUrl.length; i++) {
        const media = await MessageMedia.fromUrl(imageUrl[i], { unsafeMime: true });
        const options = i === 0 ? { caption: caption || reply || '' } : {};
        await client.sendMessage(from, media, options);
      }
    } else if (typeof imageUrl === 'string') {
      const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
      await client.sendMessage(from, media, { caption: caption || reply || '' });
    } else {
      await client.sendMessage(from, reply);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(`❌ Gagal balas: ${err.message}`);
    res.status(500).json({ error: 'Gagal balas', detail: err.message });
  }
});

// === Health Check
app.get('/', (req, res) => {
  res.send(`✅ Bot WhatsApp pribadi aktif!`);
});

// === Jalankan Bot
app.listen(PORT, () => {
  console.log(`🚀 Server listening at http://localhost:${PORT}`);
  startBot();
});

async function startBot() {
  try {
    console.log('🔄 Inisialisasi...');
    await client.initialize();
    console.log('✅ Bot berhasil diinisialisasi');
  } catch (err) {
    console.error('❌ Gagal inisialisasi:', err.message);
  }
}

// === Auto Restart Jika Terputus
setInterval(async () => {
  try {
    const state = await client.getState();
    console.log(`[PING] State: ${state}`);
    if (state !== 'CONNECTED') {
      console.log('[RESTART] Tidak CONNECTED, restart...');
      process.exit();
    }
  } catch (err) {
    console.log('[RESTART] Gagal ambil state:', err.message);
    process.exit();
  }
}, 5 * 60 * 1000);

setInterval(async () => {
  try {
    const state = await client.getState();
    console.log(`[PING] Bot state: ${state}`);
    if (state !== 'CONNECTED') {
      console.log('[RESTART] State bukan CONNECTED, force exit...');
      process.exit(); // PM2 akan restart otomatis
    }
  } catch (err) {
    console.log('[RESTART] Gagal ambil state:', err.message);
    process.exit();
  }
}, 300000); // cek tiap 5 menit
