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

// Inisialisasi Express
const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());

// Inisialisasi WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Event: Tampilkan QR code saat login dibutuhkan
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

// Event: Bot siap digunakan
client.on('ready', () => {
  console.log('✅ Bot siap digunakan!');
});

// Event: Gagal autentikasi
client.on('auth_failure', (msg) => {
  console.error('❌ Autentikasi gagal:', msg);
});

// Event: Terputus
client.on('disconnected', (reason) => {
  console.log('❌ Terputus:', reason);
});

// Event: Pesan masuk
client.on('message', async (message) => {
  if (message.fromMe) return;

  const userId = message.from;
  const userMessage = message.body;

  console.log('📥 Pesan dari', userId, ':', userMessage);

  try {
    const webhookResponse = await fetch('https://hook.eu2.make.com/5u1hm76pfynq7ix19mkb4j6dauj4aiew', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: userMessage,
        from: userId,
      }),
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

// Endpoint manual: /reply
app.post('/reply', async (req, res) => {
  try {
    let payload = req.body;
    if (req.body.data) {
      payload = typeof req.body.data === 'string' 
        ? JSON.parse(req.body.data) 
        : req.body.data;
    }

    const { from, reply } = payload;

    if (!from || !reply) {
      return res.status(400).json({ 
        error: 'Parameter from atau reply kosong',
        contoh_format: {
          from: "628xxxx@c.us",
          reply: "Pesan balasan"
        }
      });
    }

    await client.sendMessage(from, reply);
    console.log('✅ Balasan dikirim melalui endpoint:', reply);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error di endpoint /reply:', err);
    res.status(500).json({ error: err.message });
  }
});

// Jalankan server dan inisialisasi bot
app.listen(PORT, () => {
  console.log(`🚀 Server webhook aktif di port ${PORT}`);
  client.initialize();
});
