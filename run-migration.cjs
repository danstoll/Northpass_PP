/**
 * Run database migration for certification categories
 */
const { query, getPool } = require('./server/db/connection.cjs');
const schema = require('./server/db/schema.cjs');

async function migrate() {
  try {
    console.log('Running migration...');
    await schema.initializeSchema();
    console.log('✅ Migration complete');
    process.exit(0);
  } catch (e) {
    console.error('Migration error:', e);
    process.exit(1);
  }
}

migrate();
