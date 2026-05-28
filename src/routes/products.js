const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const northProvider = require('../services/payments/MockNorthProvider');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Solo studio creator — hardcoded while auth isn't wired.
const CREATOR_ID = '11111111-1111-4111-8111-111111111111';

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, title, price_cents, type, created_at FROM products ORDER BY created_at DESC'
    );
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/checkout', async (req, res, next) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID' });
  }

  let client;
  try {
    const prodRes = await db.query(
      'SELECT id, title, price_cents, file_url FROM products WHERE id = $1',
      [id]
    );
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'product not found' });
    }
    const product = prodRes.rows[0];

    const invoiceNumber = `FAN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const description = `Fan store purchase: ${product.title}`;

    client = await db.pool.connect();
    await client.query('BEGIN');

    const insRes = await client.query(
      `INSERT INTO invoices
         (creator_id, invoice_number, amount_cents, currency, description, brand_name, status)
       VALUES ($1, $2, $3, 'USD', $4, 'Fan Store Sale', 'draft')
       RETURNING id`,
      [CREATOR_ID, invoiceNumber, product.price_cents, description]
    );
    const invoiceId = insRes.rows[0].id;

    const payment = await northProvider.createPaymentIntent({
      id: invoiceId,
      amount_cents: product.price_cents,
    });

    // Fan-store checkouts settle instantly (POS-style), so we skip the
    // pending_payment hop and compute splits inline — same 7% / 93% math
    // the webhook uses for the async invoice flow.
    const updRes = await client.query(
      `UPDATE invoices
         SET status = 'paid',
             north_payment_id = $1,
             north_payment_status = 'succeeded',
             north_raw_response = $2,
             platform_fee_cents = (amount_cents * 700) / 10000,
             creator_net_cents = amount_cents - ((amount_cents * 700) / 10000),
             updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [payment.id, payment, invoiceId]
    );

    await client.query('COMMIT');
    return res.status(201).json({
      invoice: updRes.rows[0],
      file_url: product.file_url,
    });
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'invoice_number collision, please retry' });
    }
    return next(err);
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
