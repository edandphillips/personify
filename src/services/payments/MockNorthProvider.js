const crypto = require('crypto');

class MockNorthProvider {
  constructor() {
    this._payments = new Map();
  }

  async createPaymentIntent(invoice) {
    const paymentId = `mock_pay_${crypto.randomBytes(8).toString('hex')}`;
    const record = {
      id: paymentId,
      amount: invoice.amount_cents,
      status: 'pending',
      checkout_url: `https://mock-north.local/checkout/${paymentId}`,
    };
    this._payments.set(paymentId, record);
    return record;
  }

  async getPaymentStatus(paymentId) {
    return this._payments.get(paymentId);
  }

  async onboardMerchant(creator) {
    return {
      merchant_id: `mock_merch_${crypto.randomBytes(6).toString('hex')}`,
      status: 'approved',
    };
  }
}

module.exports = new MockNorthProvider();
