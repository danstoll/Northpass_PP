/**
 * Check email_log table structure
 */
const { query } = require('./server/db/connection.cjs');

async function main() {
  try {
    const cols = await query('SHOW COLUMNS FROM email_log');
    console.log('email_log columns:', cols.map(c => `${c.Field} (${c.Type})`).join(', '));
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

main();
