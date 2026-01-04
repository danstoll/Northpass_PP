/**
 * Migration: Add crm_last_modified column to contacts table
 * This enables incremental imports by tracking when each CRM record was last modified
 */
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: '20.29.25.238',
  port: 31337,
  user: 'northpass',
  password: 'Nintex2025!',
  database: 'northpass',
  connectionLimit: 1
});

async function migrate() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('✅ Connected to database');
    
    // Check if column already exists
    const columns = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'northpass' 
        AND TABLE_NAME = 'contacts' 
        AND COLUMN_NAME = 'crm_last_modified'
    `);
    
    if (columns.length > 0) {
      console.log('ℹ️  Column crm_last_modified already exists - skipping migration');
    } else {
      console.log('📦 Adding crm_last_modified column...');
      await conn.query(`
        ALTER TABLE contacts 
        ADD COLUMN crm_last_modified TIMESTAMP NULL,
        ADD INDEX idx_crm_modified (crm_last_modified)
      `);
      console.log('✅ Migration successful - crm_last_modified column added');
    }
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

migrate();
