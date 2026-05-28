const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post('/simulate-settlement/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'id must be a valid UUID' });
    }

    const secret = process.env.NORTH_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(503).json({ error: 'webhook secret not configured' });
    }

    const { rows } = await db.query(
      'SELECT id, status, north_payment_id FROM invoices WHERE id = $1',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'invoice not found' });
    }
    const invoice = rows[0];
    if (!invoice.north_payment_id) {
      return res
        .status(409)
        .json({ error: 'invoice has no north_payment_id — must be paid first' });
    }

    const body = JSON.stringify({
      type: 'payment.succeeded',
      data: { payment_id: invoice.north_payment_id },
    });
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const port = Number(process.env.PORT) || 3000;
    const hookRes = await fetch(`http://localhost:${port}/api/webhooks/north`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-North-Signature': signature,
      },
      body,
    });
    const hookBody = await hookRes.json().catch(() => ({}));

    return res.status(hookRes.status).json({
      simulated: true,
      invoice_id: id,
      webhook: hookBody,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
