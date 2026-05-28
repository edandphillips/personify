const express = require('express');
const db = require('../db');
const northProvider = require('../services/payments/MockNorthProvider');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM invoices ORDER BY created_at DESC LIMIT 100`
    );
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      creator_id,
      invoice_number,
      amount_cents,
      currency,
      description,
      due_date,
      brand_name,
    } = req.body || {};

    if (!creator_id || !UUID_RE.test(creator_id)) {
      return res.status(400).json({ error: 'creator_id must be a valid UUID' });
    }
    if (!invoice_number || typeof invoice_number !== 'string') {
      return res.status(400).json({ error: 'invoice_number is required' });
    }
    if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
      return res.status(400).json({ error: 'amount_cents must be a positive integer' });
    }

    const trimmedBrand =
      typeof brand_name === 'string' && brand_name.trim() ? brand_name.trim() : null;

    const { rows } = await db.query(
      `INSERT INTO invoices
         (creator_id, invoice_number, amount_cents, currency, description, due_date, brand_name)
       VALUES ($1, $2, $3, COALESCE($4, 'USD'), $5, $6, $7)
       RETURNING *`,
      [creator_id, invoice_number, amount_cents, currency || null, description || null, due_date || null, trimmedBrand]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'invoice_number already exists' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'creator_id does not reference an existing creator' });
    }
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'id must be a valid UUID' });
    }

    const { rows } = await db.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'invoice not found' });
    }
    return res.json(rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/pay', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'id must be a valid UUID' });
    }

    const { rows } = await db.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'invoice not found' });
    }

    const invoice = rows[0];
    if (!['draft', 'sent'].includes(invoice.status)) {
      return res.status(409).json({
        error: `invoice cannot be paid from status '${invoice.status}'`,
      });
    }

    const payment = await northProvider.createPaymentIntent(invoice);

    const { rows: updated } = await db.query(
      `UPDATE invoices
         SET status = 'pending_payment',
             north_payment_id = $1,
             north_payment_status = $2,
             north_raw_response = $3,
             updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [payment.id, payment.status, payment, id]
    );

    return res.status(200).json({
      invoice: updated[0],
      checkout_url: payment.checkout_url,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
