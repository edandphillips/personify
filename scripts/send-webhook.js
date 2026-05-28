require('dotenv').config();
const crypto = require('crypto');
const http = require('http');

const [, , type, paymentId] = process.argv;
if (!type || !paymentId) {
  console.error('usage: node scripts/send-webhook.js <event_type> <payment_id>');
  console.error('  event_type: payment.succeeded | payment.failed');
  process.exit(1);
}

const secret = process.env.NORTH_WEBHOOK_SECRET;
if (!secret) {
  console.error('NORTH_WEBHOOK_SECRET missing from .env');
  process.exit(1);
}

const body = JSON.stringify({ type, data: { payment_id: paymentId } });
const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

const req = http.request(
  {
    host: 'localhost',
    port: Number(process.env.PORT) || 3000,
    path: '/api/webhooks/north',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-North-Signature': signature,
      'Content-Length': Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', () => console.log(res.statusCode, data));
  }
);
req.on('error', (e) => {
  console.error('request error:', e.message);
  process.exit(1);
});
req.write(body);
req.end();
