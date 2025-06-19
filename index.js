import puppeteer from 'puppeteer';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import fetch from 'node-fetch';
import express from 'express';
import bodyParser from 'body-parser';
import qrcode from 'qrcode';
import cloudinary from 'cloudinary';
import jwt from 'jsonwebtoken';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config(); // Load .env file

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// ✅ Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Firebase Service Account
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

  // ✅ Validasi access token
  if (!data.access_token) {
    console.error('❌ Gagal ambil access token:', data);
    throw new Error(`Gagal ambil access token: ${data.error_description || JSON.stringify(data)}`);
  }

  return data.access_token;
}


// === WhatsApp Client ===

const client1 = new Client({
  authStrategy: new LocalAuth({ clientId: 'BOT' }),
  puppeteer: {
    executablePath: puppeteer.executablePath(), // ✅ Pakai path Chrome yang di-download puppeteer
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

/*const client2 = new Client({
  authStrategy: new LocalAuth({ clientId: 'Bendera' }),
  puppeteer: {
    executablePath: puppeteer.executablePath(), // ✅ Pakai path Chrome yang di-download puppeteer
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});*/

// === QR Handler ===

function setupQR(client, label) {
  client.on('qr', async (qr) => {
    console.log(`[${label}] Scan QR:`);
    const url = await qrcode.toDataURL(qr);
    const result = await cloudinary.v2.uploader.upload(url, {
      folder: 'whatsapp_qrcodes',
      public_id: `qr_${label}`,
      resource_type: 'image',
    });
    console.log(`[${label}] QR uploaded:`, result.secure_url);
  });
}

setupQR(client1, 'BOT');
/*setupQR(client2, 'Bendera');*/

// === Status Logger ===

function setupClientStatus(client, label) {
  client.on('ready', () => console.log(`✅ [${label}] Bot siap digunakan!`));
  client.on('auth_failure', msg => console.error(`❌ [${label}] Gagal autentikasi:`, msg));
  client.on('disconnected', reason => console.warn(`⚠️ [${label}] Terputus:`, reason));
  client.on('loading_screen', (percent, message) => {
    console.log(`🌀 [${label}] Loading ${percent}% - ${message}`);
  });
}

setupClientStatus(client1, 'BOT');
/*setupClientStatus(client2, 'Bendera');*/

// === Message Handler ===

client1.on('message', async (msg) => {
  console.log(`[BOT] Pesan dari ${msg.from} ke ${msg.to}: "${msg.body}" pada ${new Date(msg.timestamp * 1000).toLocaleString()}`);
  if (msg.fromMe) return;

  try {
    const accessToken = await getAccessToken();

   if (msg.hasMedia) {
  const media = await msg.downloadMedia();
  const isVoice = msg.type === 'ptt';

  const buffer = Buffer.from(media.data, 'base64');
  const extension = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
  const tempFilePath = join(tmpdir(), `${uuidv4()}.${extension}`);
  writeFileSync(tempFilePath, buffer);

  const upload = await cloudinary.v2.uploader.upload(tempFilePath, {
    folder: 'wa-inbox-files',
    resource_type: 'auto',
  });

  unlinkSync(tempFilePath);

  const res = await fetch(process.env.WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: msg.from,
      imageUrl: upload.secure_url,
      mimetype: media.mimetype,
      text: msg.caption || msg.body || '',
      access_token: accessToken,
      timestamp: new Date().toISOString(),
      isVoiceNote: isVoice,
    }),
  });

  console.log(`[BOT] Webhook (media) status: ${res.status}`);
} else {
      const res = await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: msg.from,
          text: msg.body,
          access_token: accessToken,
          timestamp: new Date().toISOString(),
        }),
      });

      console.log(`[BOT] Webhook (teks) status: ${res.status}`);
    }
  } catch (err) {
    console.error(`[BOT] Gagal kirim ke webhook:`, err);
  }
});

/*client2.on('message', async (msg) => {
  console.log(`[Bendera] Pesan dari ${msg.from} ke ${msg.to}: "${msg.body}" pada ${new Date(msg.timestamp * 1000).toLocaleString()}`);
  if (msg.fromMe) return;

  try {
    const accessToken = await getAccessToken();

   if (msg.hasMedia) {
  const media = await msg.downloadMedia();
  const isVoice = msg.type === 'ptt';

  const buffer = Buffer.from(media.data, 'base64');
  const extension = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
  const tempFilePath = join(tmpdir(), `${uuidv4()}.${extension}`);
  writeFileSync(tempFilePath, buffer);

  const upload = await cloudinary.v2.uploader.upload(tempFilePath, {
    folder: 'wa-inbox-files',
    resource_type: 'auto',
  });

  unlinkSync(tempFilePath);

  const res = await fetch(process.env.WEBHOOK_URL2, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: msg.from,
      imageUrl: upload.secure_url,
      mimetype: media.mimetype,
      text: msg.caption || msg.body || '',
      access_token: accessToken,
      timestamp: new Date().toISOString(),
      isVoiceNote: isVoice,
    }),
  });

  console.log(`[BENDERA] Webhook (media) status: ${res.status}`);
} else {
      const res = await fetch(process.env.WEBHOOK_URL2, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: msg.from,
          text: msg.body,
          access_token: accessToken,
          timestamp: new Date().toISOString(),
        }),
      });

      console.log(`[Bendera] Webhook (teks) status: ${res.status}`);
    }
  } catch (err) {
    console.error(`[Bendera] Gagal kirim ke webhook:`, err);
  }
});*/

// === Endpoint Balasan ===

app.post('/reply', async (req, res) => {
  await handleReply(req, res, client1, 'PMY');
});

/*app.post('/reply-bendera', async (req, res) => {
  await handleReply(req, res, client2, 'Bendera');
});*/


async function handleReply(req, res, client, label) {
  try {
console.log(`[${label}] Payload masuk ke /reply:`, JSON.stringify(req.body, null, 2));
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
      if (imageUrl.length === 1) {
        // ✅ Jika hanya 1 gambar dalam array, kirim seperti biasa
        const media = await MessageMedia.fromUrl(imageUrl[0], { unsafeMime: true });
        await client.sendMessage(from, media, { caption: caption || reply || '' });
      } else {
        // ✅ Jika banyak gambar, kirim sebagai galeri
        const mediaList = await Promise.all(
  imageUrl.map(async (url) => await MessageMedia.fromUrl(url, { unsafeMime: true }))
);

console.log(`[${label}] Kirim ${mediaList.length} gambar ke ${from}`);

for (let i = 0; i < mediaList.length; i++) {
  const options = i === 0 ? { caption: caption || reply || '' } : {};
  await client.sendMessage(from, mediaList[i], options);
}
      }
    } else if (typeof imageUrl === 'string') {
      const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
      await client.sendMessage(from, media, { caption: caption || reply || '' });
    } else {
      await client.sendMessage(from, reply);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(`[${label}] Error balas:`, err.message);
    res.status(500).json({ error: 'Gagal balas', detail: err.message });
  }
}

// === Server Start ===

app.get('/', (req, res) => {
  res.send('WhatsApp bot aktif!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  startBot(); // Panggil fungsi async ini
});

async function startBot() {
  try {
    console.log('🔄 Inisialisasi BOT...');
    await client1.initialize();
    console.log('✅ Inisialisasi BOT selesai');
  } catch (err) {
    console.error('❌ Gagal inisialisasi BOT:', err.message);
  }
/*try {
    console.log('🔄 Inisialisasi Bendera...');
    await client2.initialize();
    console.log('✅ Inisialisasi Bendera selesai');
  } catch (err) {
    console.error('❌ Gagal inisialisasi Bendera:', err.message);
  }
}*/

setInterval(async () => {
  try {
    const state = await client1.getState();
    console.log(`[PING] Bot state: ${state}`);
    if (state !== 'CONNECTED') {
      console.log('[RESTART] State bukan CONNECTED, force exit...');
      process.exit(); // PM2 akan restart otomatis
    }
  } catch (err) {
    console.log('[RESTART] Gagal ambil state:', err.message);
    process.exit();
  }
}, 60000); // cek tiap 60 detik

/*setInterval(async () => {
  try {
    const state = await client2.getState();
    console.log(`[PING] Bot state: ${state}`);
    if (state !== 'CONNECTED') {
      console.log('[RESTART] State bukan CONNECTED, force exit...');
      process.exit(); // PM2 akan restart otomatis
    }
  } catch (err) {
    console.log('[RESTART] Gagal ambil state:', err.message);
    process.exit();
  }
}, 60000); // cek tiap 60 detik */

client1.on('disconnected', (reason) => {
  console.log('❌ WhatsApp terputus:', reason);
  process.exit();
});

/*client2.on('disconnected', (reason) => {
  console.log('❌ WhatsApp terputus:', reason);
  process.exit();
});*/
