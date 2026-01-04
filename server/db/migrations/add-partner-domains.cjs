/**
 * Migration: Add domains column to partners table
 * Stores JSON array of email domains associated with each partner
 */

const { query, getPool } = require('../connection.cjs');

async function up() {
  console.log('🔄 Running migration: add-partner-domains');
  
  // Add domains column to partners table (JSON array)
  try {
    await query(`
      ALTER TABLE partners 
      ADD COLUMN domains JSON DEFAULT NULL
      COMMENT 'JSON array of email domains associated with this partner'
    `);
    console.log('✅ Added domains column to partners table');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ domains column already exists');
    } else {
      throw err;
    }
  }
  
  console.log('✅ Migration complete: add-partner-domains');
}

async function down() {
  console.log('🔄 Rolling back migration: add-partner-domains');
  await query('ALTER TABLE partners DROP COLUMN domains');
  console.log('✅ Rollback complete');
}

// Run migration if called directly
if (require.main === module) {
  const pool = getPool();
  up()
    .then(() => {
      console.log('Migration finished');
      pool.end();
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      pool.end();
      process.exit(1);
    });
}

module.exports = { up, down };
