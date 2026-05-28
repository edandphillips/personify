require('dotenv').config();
const db = require('../src/db');

(async () => {
  try {
    console.log('DATABASE_URL =', process.env.DATABASE_URL);

    const id = await db.query(
      `SELECT current_database() AS db, current_user AS usr,
              current_schema() AS schm, inet_server_addr()::text AS host,
              inet_server_port() AS port`
    );
    console.log('Connected to:', id.rows[0]);

    const counts = await db.query(`
      SELECT 'creators' AS t, COUNT(*)::int AS n FROM creators
      UNION ALL SELECT 'invoices', COUNT(*)::int FROM invoices
    `);
    counts.rows.forEach((r) => console.log(`  ${r.t}: ${r.n}`));

    const invs = await db.query(
      `SELECT id, invoice_number, creator_id, status FROM invoices ORDER BY created_at`
    );
    console.log('\nInvoices:');
    invs.rows.forEach((r) =>
      console.log(`  ${r.invoice_number.padEnd(24)} creator=${r.creator_id}  ${r.status}`)
    );
  } catch (err) {
    console.error('Inspect failed:', err.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
})();
