import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import fetch from 'node-fetch';
import express from 'express';
import bodyParser from 'body-parser';
import qrcode from 'qrcode';
import cloudinary from 'cloudinary';

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

// QR Code handler (tetap sama)
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

// Event handlers (tetap sama)
client.on('ready', () => console.log('✅ Bot siap digunakan!'));
client.on('disconnected', (reason) => console.log('❌ Terputus:', reason));
client.on('auth_failure', (msg) => console.error('❌ Autentikasi gagal:', msg));

// Pesan masuk handler (tetap sama)
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
    }
  } catch (error) {
    console.error('❌ Gagal memproses pesan:', error);
  }
});

// Inisialisasi client (tetap sama)
client.initialize();

// Perbaikan hanya pada bagian ini ▼ (Express endpoint)
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.post('/reply', async (req, res) => {
  try {
    // Handle both raw JSON string and parsed JSON
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    const { from, reply } = payload;
    
    if (!from || !reply) {
      console.error('❌ Parameter kurang:', { from, reply });
      return res.status(400).json({
        error: 'Parameter from dan reply diperlukan',
        contoh_format: {
          from: "628xxxx@c.us",
          reply: "Pesan balasan"
        },
        received: payload
      });
    }

    // Validasi format nomor WhatsApp
    if (!from.endsWith('@c.us')) {
      return res.status(400).json({ 
        error: 'Format nomor harus [kode negara][nomor]@c.us',
        contoh: "6281234567890@c.us" 
      });
    }

    await client.sendMessage(from, reply);
    console.log('📤 Mengirim balasan ke', from);
    return res.json({ success: true });
    
  } catch (err) {
    console.error('❌ Error processing /reply:', {
      rawBody: req.rawBody,
      error: err.message
    });
    return res.status(400).json({ 
      error: 'Format request tidak valid',
      detail: err.message,
      contoh_valid: {
        from: "6281234567890@c.us",
        reply: "Halo! Ini balasan"
      }
    });
  }
});

// Server listener (tetap sama)
app.listen(PORT, () => {
  console.log(`🚀 Webhook listener aktif di http://localhost:${PORT}/reply`);
});
