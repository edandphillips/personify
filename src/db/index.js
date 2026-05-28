const { Pool } = require('pg');

// Local dev fallback — intentionally has no embedded password so we don't
// commit a secret. For real local Postgres, set DATABASE_URL in .env (which
// is gitignored). For cloud, set DATABASE_URL in your host's env config.
const LOCAL_FALLBACK = 'postgres://postgres@localhost:5432/personify';

const connectionString = process.env.DATABASE_URL || LOCAL_FALLBACK;

if (!process.env.DATABASE_URL) {
  console.warn(
    '[db] DATABASE_URL not set — using local fallback. ' +
      'Set DATABASE_URL in .env for local dev or your host for production.'
  );
}

// Managed Postgres providers (Neon, Supabase, Render, RDS, etc.) require SSL.
// Loopback connections to a local dev cluster typically don't. We toggle by host.
const isLocalConn =
  connectionString.includes('@localhost') ||
  connectionString.includes('@127.0.0.1');

const pool = new Pool({
  connectionString,
  ssl: isLocalConn ? false : { rejectUnauthorized: false },
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
