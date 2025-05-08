import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import fetch from 'node-fetch';
import express from 'express';
import bodyParser from 'body-parser';
import qrcode from 'qrcode';
import cloudinary from 'cloudinary';

// Pertama: Inisialisasi Express
const app = express();
const PORT = process.env.PORT || 3000;

// Konfigurasi Cloudinary (tetap sama)
cloudinary.config({
  cloud_name: 'dizjo8vzg',
  api_key: '373539693517747',
  api_secret: 'HcUwhQbFHK9j4PJ0fypeT-LIaj8',
});

// Inisialisasi WhatsApp client (tetap sama)
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// ... (semua event handler WhatsApp tetap sama persis)
// ... (qr code, ready, disconnected, auth_failure)

// Pesan masuk handler (tetap sama persis)
client.on('message', async (message) => {
  // ... (kode yang sudah ada)
});

// Endpoint /reply yang sudah diperbaiki
app.use(bodyParser.json());
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
    res.json({ success: true });
  } catch (err) {
    console.error('Error di /reply:', err);
    res.status(500).json({ error: err.message });
  }
});

// Inisialisasi WhatsApp client
client.initialize();

// Jalankan server
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
});
