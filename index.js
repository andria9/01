// ... (all your existing imports and configurations remain exactly the same)

// ... (all your existing WhatsApp client setup and event handlers remain exactly the same)

// Only modifying the /reply endpoint ▼
app.post('/reply', async (req, res) => {
  try {
    // NEW: Handle both direct JSON and Make.com's nested "data" format
    let payload = req.body;
    if (req.body.data) {
      payload = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
    }

    const { from, reply } = payload;

    if (!from || !reply) {
      return res.status(400).json({ 
        error: 'Parameter from atau reply kosong.',
        received: payload // Added for debugging
      });
    }

    // Existing WhatsApp send logic
    await client.sendMessage(from, reply);
    console.log('✅ Balasan dikirim:', reply);
    res.status(200).json({ status: 'success' });

  } catch (err) {
    console.error('❌ Gagal mengirim balasan:', {
      error: err.message,
      rawRequest: req.body // Added for debugging
    });
    res.status(500).json({ 
      error: 'Internal server error',
      detail: err.message 
    });
  }
});
// End of modification ▲

// ... (all remaining code stays exactly the same)
