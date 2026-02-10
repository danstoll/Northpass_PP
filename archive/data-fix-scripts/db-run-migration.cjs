/**
 * Run migration using existing connection module
 */
const db = require('./connection.cjs');

async function migrate() {
  try {
    console.log('🔌 Connecting to database...');
    await db.initializePool();
    console.log('✅ Connected to database');
    
    // Check if column already exists
    console.log('🔍 Checking if column exists...');
    const columns = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'northpass_portal' 
        AND TABLE_NAME = 'contacts' 
        AND COLUMN_NAME = 'crm_last_modified'
    `);
    
    if (columns.length > 0) {
      console.log('ℹ️  Column crm_last_modified already exists - skipping');
    } else {
      console.log('📦 Adding crm_last_modified column...');
      await db.query(`
        ALTER TABLE contacts 
        ADD COLUMN crm_last_modified TIMESTAMP NULL
      `);
      console.log('📦 Adding index...');
      await db.query(`
        ALTER TABLE contacts 
        ADD INDEX idx_crm_modified (crm_last_modified)
      `);
      console.log('✅ Migration successful - crm_last_modified column added');
    }
    
    console.log('🔌 Closing connection...');
    await db.closePool();
    console.log('✅ Done!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

migrate();
