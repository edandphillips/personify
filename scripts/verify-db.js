require('dotenv').config();
const db = require('../src/db');

(async () => {
  try {
    const tables = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    console.log('Tables:', tables.rows.map((r) => r.table_name).join(', '));

    const creators = await db.query(
      'SELECT id, email, display_name, status FROM creators ORDER BY display_name'
    );
    console.log('\nCreators:');
    creators.rows.forEach((c) =>
      console.log(`  ${c.id}  ${c.display_name.padEnd(15)} ${c.status}  <${c.email}>`)
    );
  } catch (err) {
    console.error('Verify failed:', err.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
})();
