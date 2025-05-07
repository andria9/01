import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import fetch from 'node-fetch';
import express from 'express';
import bodyParser from 'body-parser';
import qrcode from 'qrcode';
import cloudinary from 'cloudinary';

// Konfigurasi Cloudinary
cloudinary.config({
  cloud_name: 'dizjo8vzg',
  api_key: '373539693517747',
  api_secret: 'HcUwhQbFHK9j4PJ0fypeT-LIaj8',
});

// Inisialisasi WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Tampilkan QR Code saat login dibutuhkan
client.on('qr', async (qr) => {
  console.log('📸 Silakan scan QR Code ini untuk login:');
  try {
    const url = await qrcode.toDataURL(qr);
    const result = await cloudinary.v2.uploader.upload(url, {
      folder: 'whatsapp_qrcodes',
      public_id: 'qrcode_image',
      resource_type: 'image',
    });
    console.log('✅ QR Code berhasil diupload:', result.url);
  } catch (err) {
    console.error('❌ Gagal menghasilkan/mengupload QR Code:', err);
  }
});

// WA Bot siap digunakan
client.on('ready', () => {
  console.log('✅ Bot siap digunakan!');
});

// Error koneksi atau autentikasi
client.on('disconnected', (reason) => console.log('❌ Terputus:', reason));
client.on('auth_failure', (msg) => console.error('❌ Autentikasi gagal:', msg));

// Pesan masuk
client.on('message', async (message) => {
  if (message.fromMe) return;

  const userId = message.from;
  const userMessage = message.body;

  console.log('📥 Pesan dari', userId, ':', userMessage);

  try {
    // Kirim pesan ke webhook Make
    const webhookResponse = await fetch('https://hook.eu2.make.com/5u1hm76pfynq7ix19mkb4j6dauj4aiew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage, from: userId }),
    });

    const contentType = webhookResponse.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await webhookResponse.text();
      console.warn('⚠️ Webhook tidak mengembalikan JSON. Respons:', text);
      return;
    }

    const data = await webhookResponse.json();

    if (data.reply) {
      await message.reply(data.reply);
      console.log('✅ Balasan berhasil dikirim.');
    } else {
      console.log('ℹ️ Webhook tidak memberikan balasan.');
    }
  } catch (error) {
    console.error('❌ Gagal memproses pesan:', error);
  }
});

// Jalankan WhatsApp client
client.initialize();

// Setup Express untuk endpoint webhook manual
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

app.post('/reply', async (req, res) => {
  const { from, reply } = req.body;

  if (!from || !reply) {
    return res.status(400).json({ error: 'Parameter from atau reply kosong.' });
  }

  try {
    await client.sendMessage(from, reply);
    console.log('✅ Balasan dikirim:', reply);
    res.status(200).json({ status: 'success' });
  } catch (err) {
    console.error('❌ Gagal mengirim balasan dari endpoint:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Jalankan server listener
app.listen(PORT, () => {
  console.log(`🚀 Webhook listener aktif di http://localhost:${PORT}/reply`);
});
