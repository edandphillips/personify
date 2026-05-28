require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const MIGRATION = path.join(__dirname, '..', 'db', 'migrations', '001_init.sql');

const SEED_CREATORS = `
INSERT INTO creators (id, email, display_name, status) VALUES
  ('11111111-1111-4111-8111-111111111111', 'alex@studio.example',   'Alex Rivera', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'maya@studio.example',   'Maya Chen',   'active'),
  ('33333333-3333-4333-8333-333333333333', 'jordan@studio.example', 'Jordan Park', 'active')
ON CONFLICT (id) DO NOTHING;
`;

(async () => {
  try {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    console.log(`Applying schema from ${path.relative(process.cwd(), MIGRATION)}…`);
    await db.query(sql);

    console.log('Seeding creators…');
    await db.query(SEED_CREATORS);

    const creators = await db.query('SELECT COUNT(*)::int AS n FROM creators');
    const invoices = await db.query('SELECT COUNT(*)::int AS n FROM invoices');
    console.log(`Done. creators=${creators.rows[0].n}, invoices=${invoices.rows[0].n}`);
  } catch (err) {
    console.error('Init failed:', err.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
})();
