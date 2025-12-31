const { chromium } = require("playwright");

const axios = require("axios");



const WIDGET_URL = "https://tikfinity.zerody.one/widget/chat?cid=2661497";

const N8N_WEBHOOK = "http://3.25.204.161:5678/webhook-test/tikfinity";



(async () => {

  const browser = await chromium.launch({

    headless: false

  });



  const page = await browser.newPage();

  await page.goto(WIDGET_URL, { waitUntil: "networkidle" });



  console.log("TikFinity widget loaded");



  const sent = new Set();



  await page.exposeFunction("sendToN8n", async (payload) => {

    try {

      await axios.post(N8N_WEBHOOK, payload);

      console.log("Sent:", payload.comment);

    } catch (err) {

      console.error("Webhook error:", err.message);

    }

  });



  await page.evaluate(() => {

    setInterval(() => {

      document.querySelectorAll("div").forEach(el => {

        const text = el.innerText?.trim();

        if (!text) return;



        if (

          text.length > 5 &&

          text.length < 150 &&

          text.includes(":") &&

          !window.__sent?.has(text)

        ) {

          if (!window.__sent) window.__sent = new Set();

          window.__sent.add(text);



          window.sendToN8n({

            source: "tikfinity",

            comment: text,

            timestamp: Date.now()

          });

        }

      });

    }, 1200);

  });

})();
