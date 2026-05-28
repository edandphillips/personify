require('dotenv').config();
const express = require('express');
const cors = require('cors');

const invoicesRouter = require('./routes/invoices');
const webhooksRouter = require('./routes/webhooks');
const productsRouter = require('./routes/products');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(cors({ origin: allowedOrigins }));
app.use('/api/webhooks/north', express.raw({ type: 'application/json' }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/invoices', invoicesRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/products', productsRouter);

if (process.env.NODE_ENV !== 'production') {
  const devRouter = require('./routes/dev');
  app.use('/api/dev', devRouter);
  console.log('[dev] /api/dev/* routes enabled');
}

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Personify API listening on port ${PORT}`);
});
