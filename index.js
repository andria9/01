import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import fetch from 'node-fetch';
import express from 'express';
import bodyParser from 'body-parser';
import qrcode from 'qrcode';
import cloudinary from 'cloudinary';
import { GoogleAuth } from 'google-auth-library'; // <--- Tambahan

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
  console.log('✅ Bot WhatsApp siap digunakan!');
});

// Event error
client.on('auth_failure', msg => {
  console.error('❌ Autentikasi gagal:', msg);
});

client.on('disconnected', reason => {
  console.error('❌ Bot terputus:', reason);
});

// Pesan masuk
client.on('message', async (message) => {
  if (message.fromMe) return;

  const userId = message.from;
  const userMessage = message.body;

  console.log('📥 Pesan dari', userId, ':', userMessage);

  try {
    const webhookResponse = await fetch('https://hook.eu2.make.com/wu413lv36m0amr7hkhjivfej5extz375', {
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
      console.log('ℹ️ Tidak ada balasan dari webhook.');
    }
  } catch (error) {
    console.error('❌ Gagal memproses pesan:', error);
  }
});

// Endpoint test untuk Railway
app.get('/', (req, res) => {
  res.send('WhatsApp bot aktif.');
});

// Endpoint kirim pesan manual
app.use(bodyParser.json());
app.post('/reply', async (req, res) => {
  try {
    let payload;

    if (typeof req.body === 'string') {
      payload = JSON.parse(req.body);
    } else if (typeof req.body.data === 'string') {
      payload = JSON.parse(req.body.data);
    } else {
      payload = req.body.data || req.body;
    }

    const { from, reply, imageUrl, caption } = payload;

    if (!from || (!reply && !imageUrl)) {
      return res.status(400).json({
        error: 'Parameter "from" dan minimal salah satu dari "reply" atau "imageUrl" wajib diisi',
        contoh_format: {
          from: '628xxxx@c.us',
          reply: 'Pesan balasan',
          imageUrl: 'https://domain.com/file.jpg',
          caption: 'Ini caption opsional',
        },
      });
    }

    if (imageUrl) {
      const media = await MessageMedia.fromUrl(imageUrl);
      await client.sendMessage(from, media, { caption: caption || reply || '' });
    } else {
      await client.sendMessage(from, reply);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error di /reply:', err);
    res.status(500).json({
      error: 'Gagal memproses permintaan.',
      detail: err.message,
      raw: req.body,
    });
  }
});

// ======= TAMBAHAN: Endpoint untuk token Google =======
app.post('/token', async (req, res) => {
  try {
    const { sender, message } = req.body;
    if (!sender || !message) {
      return res.status(400).json({ error: 'Parameter "sender" dan "message" wajib diisi.' });
    }

    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT.replace(/\\n/g, '\n'));

    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const client = await auth.getClient();
    const token = await client.getAccessToken();

    res.json({
      sender,
      message,
      access_token: token.token,
    });
  } catch (err) {
    console.error('❌ Gagal membuat token:', err);
    res.status(500).json({ error: err.message });
  }
});
// =====================================================

// Inisialisasi bot
client.initialize()
  .then(() => console.log('✅ client.initialize() sukses'))
  .catch(err => console.error('❌ Gagal initialize WhatsApp client:', err));

// Jalankan server Express
app.listen(PORT, () => {
  console.log(`🚀 Server Express aktif di port ${PORT}`);
});
