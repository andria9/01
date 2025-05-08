import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import fetch from 'node-fetch';
import express from 'express';
import bodyParser from 'body-parser';
import qrcode from 'qrcode';
import cloudinary from 'cloudinary';

const app = express();
const PORT = process.env.PORT || 3000;

// Konfigurasi Cloudinary
cloudinary.config({
  cloud_name: 'dizjo8vzg',
  api_key: '373539693517747',
  api_secret: 'HcUwhQbFHK9j4PJ0fypeT-LIaj8',
});

// Inisialisasi WhatsApp client
console.log('Memulai inisialisasi WhatsApp client...');
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// QR Code login
client.on('qr', async (qr) => {
  console.log('📸 QR Code diterima, silakan scan...');
  try {
    const url = await qrcode.toDataURL(qr);
    const result = await cloudinary.v2.uploader.upload(url, {
      folder: 'whatsapp_qrcodes',
      public_id: 'qrcode_image',
      resource_type: 'image',
    });
    console.log('✅ QR Code diupload:', result.secure_url);
  } catch (err) {
    console.error('❌ Gagal membuat/mengupload QR:', err);
  }
});

// Event saat bot siap
client.on('ready', () => {
  console.log('
