require('dotenv').config();
const express = require('express');
const cors = require('cors');

const invoicesRouter = require('./routes/invoices');
const webhooksRouter = require('./routes/webhooks');
const productsRouter = require('./routes/products');

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    // No Origin header: server-to-server, curl, healthchecks — allow.
    if (!origin) return cb(null, true);
    // Local dev.
    if (origin === 'http://localhost:5173') return cb(null, true);
    // Any Vercel deployment for this project: production alias OR per-deployment preview.
    if (/^https:\/\/personify(-[\w-]+)?\.vercel\.app$/.test(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
}));
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
