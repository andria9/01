process.env.CHROME_BIN = require('puppeteer').executablePath();
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import fetch from 'node-fetch';
import express from 'express';
import bodyParser from 'body-parser';
import qrcode from 'qrcode';
import cloudinary from 'cloudinary';
import jwt from 'jsonwebtoken';
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
  return data.access_token;
}

// === WhatsApp Client ===

const client = new Client({
  puppeteer: {
    executablePath: process.env.CHROME_BIN,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

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

setupQR(client1, 'client1');

// === Status Logger ===

function setupClientStatus(client, label) {
  client.on('ready', () => console.log(`✅ [${label}] Bot siap digunakan!`));
  client.on('auth_failure', msg => console.error(`❌ [${label}] Gagal autentikasi:`, msg));
  client.on('disconnected', reason => console.warn(`⚠️ [${label}] Terputus:`, reason));
  client.on('loading_screen', (percent, message) => {
    console.log(`🌀 [${label}] Loading ${percent}% - ${message}`);
  });
}

setupClientStatus(client1, 'client1');

// === Message Handler ===

client1.on('message', async (msg) => {
  console.log(`[client1] Pesan dari ${msg.from} ke ${msg.to}: "${msg.body}" pada ${new Date(msg.timestamp * 1000).toLocaleString()}`);
  if (msg.fromMe) return;

  try {
    const accessToken = await getAccessToken();

    const payload = {
      from: msg.from,
      text: msg.caption || msg.body || '',
      access_token: accessToken,
      timestamp: new Date().toISOString(),
    };

    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      const upload = await cloudinary.v2.uploader.upload(`data:${media.mimetype};base64,${media.data}`, {
        folder: 'wa-inbox-images',
        resource_type: 'image',
      });

      payload.imageUrl = upload.secure_url;
      payload.mimetype = media.mimetype;
    }

    const res = await fetch(process.env.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log(`[client1] Webhook status: ${res.status}`);
  } catch (err) {
    console.error(`[client1] Gagal kirim ke webhook:`, err);
  }
});

client1.initialize();

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
