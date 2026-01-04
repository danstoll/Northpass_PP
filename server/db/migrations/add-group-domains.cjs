/**
 * Migration: Add blocked_domains and custom_domains columns to lms_groups
 * 
 * - blocked_domains: JSON array of domains to exclude from potential users (e.g., ["nintex.com"])
 * - custom_domains: JSON array of domains to include for groups with no members
 */

const { query } = require('../connection.cjs');

async function migrate() {
  console.log('🔄 Adding blocked_domains and custom_domains columns to lms_groups...');
  
  try {
    // Check if columns exist
    const columns = await query('SHOW COLUMNS FROM lms_groups');
    const columnNames = columns.map(c => c.Field);
    
    if (!columnNames.includes('blocked_domains')) {
      await query(`
        ALTER TABLE lms_groups 
        ADD COLUMN blocked_domains JSON DEFAULT NULL 
        COMMENT 'JSON array of email domains to exclude from potential users'
      `);
      console.log('✅ Added blocked_domains column');
    } else {
      console.log('ℹ️  blocked_domains column already exists');
    }
    
    if (!columnNames.includes('custom_domains')) {
      await query(`
        ALTER TABLE lms_groups 
        ADD COLUMN custom_domains JSON DEFAULT NULL 
        COMMENT 'JSON array of custom email domains to search for potential users'
      `);
      console.log('✅ Added custom_domains column');
    } else {
      console.log('ℹ️  custom_domains column already exists');
    }
    
    console.log('✅ Migration complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const { initializePool, closePool } = require('../connection.cjs');
  
  initializePool()
    .then(() => migrate())
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { migrate };
