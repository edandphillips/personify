const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

function verifyNorthSignature(rawBody, signature, secret) {
  if (!signature || !secret || !Buffer.isBuffer(rawBody)) return false;
  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (signature.length !== expectedHex.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedHex, 'hex')
    );
  } catch {
    return false;
  }
}

router.post('/north', async (req, res, next) => {
  try {
    const secret = process.env.NORTH_WEBHOOK_SECRET;
    if (!secret) {
      console.error('NORTH_WEBHOOK_SECRET not configured');
      return res.status(503).json({ error: 'webhook secret not configured' });
    }

    const rawBody = req.body;
    const signature = req.get('X-North-Signature');

    if (!verifyNorthSignature(rawBody, signature, secret)) {
      return res.status(401).json({ error: 'invalid signature' });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'invalid JSON payload' });
    }

    if (!event || typeof event !== 'object') {
      return res.status(400).json({ error: 'invalid event payload' });
    }

    const type = event.type;
    if (!type || typeof type !== 'string') {
      return res.status(400).json({ error: 'event.type is required' });
    }

    if (type !== 'payment.succeeded' && type !== 'payment.failed') {
      return res.status(200).json({ status: 'ignored', type });
    }

    const paymentId = event.data && event.data.payment_id;
    if (!paymentId || typeof paymentId !== 'string') {
      return res.status(400).json({ error: 'event.data.payment_id is required' });
    }

    let rows;
    if (type === 'payment.succeeded') {
      // Splits use BIGINT integer arithmetic in-SQL so the row mutation stays atomic
      // with the status flip. Flat 7% platform fee; creator gets the 93% residue.
      ({ rows } = await db.query(
        `UPDATE invoices
           SET status = 'paid',
               north_payment_status = 'succeeded',
               platform_fee_cents = (amount_cents * 700) / 10000,
               creator_net_cents  = amount_cents - ((amount_cents * 700) / 10000),
               updated_at = NOW()
         WHERE north_payment_id = $1
           AND status = 'pending_payment'
         RETURNING id, invoice_number, status, north_payment_status,
                  amount_cents, platform_fee_cents, creator_net_cents`,
        [paymentId]
      ));
    } else {
      ({ rows } = await db.query(
        `UPDATE invoices
           SET status = 'failed',
               north_payment_status = 'failed',
               updated_at = NOW()
         WHERE north_payment_id = $1
           AND status = 'pending_payment'
         RETURNING id, invoice_number, status, north_payment_status`,
        [paymentId]
      ));
    }

    if (rows.length === 0) {
      const { rows: existing } = await db.query(
        'SELECT id, status FROM invoices WHERE north_payment_id = $1',
        [paymentId]
      );
      if (existing.length === 0) {
        return res.status(404).json({ status: 'not_found', payment_id: paymentId });
      }
      return res.status(200).json({
        status: 'noop',
        reason: `invoice already in '${existing[0].status}'`,
        invoice_id: existing[0].id,
      });
    }

    const updated = rows[0];
    const response = {
      status: 'updated',
      invoice_id: updated.id,
      invoice_number: updated.invoice_number,
      new_status: updated.status,
    };
    if (type === 'payment.succeeded') {
      response.splits = {
        amount_cents: updated.amount_cents,
        platform_fee_cents: updated.platform_fee_cents,
        creator_net_cents: updated.creator_net_cents,
      };
    }
    return res.status(200).json(response);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
