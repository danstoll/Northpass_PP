/**
 * Migration: Add owner_email column to partners table
 * This enables filtering reports by logged-in Channel Manager's email
 */

const { query } = require('../connection.cjs');

async function up() {
  console.log('Running migration: add-owner-email');
  
  // Add owner_email column to partners table
  try {
    await query(`
      ALTER TABLE partners 
      ADD COLUMN owner_email VARCHAR(255) AFTER account_owner
    `);
    console.log('✅ Added owner_email column to partners');
  } catch (err) {
    if (err.message.includes('Duplicate column')) {
      console.log('  - owner_email column already exists');
    } else {
      throw err;
    }
  }
  
  // Add index for faster lookups
  try {
    await query(`ALTER TABLE partners ADD INDEX idx_owner_email (owner_email)`);
    console.log('✅ Added index on owner_email');
  } catch (err) {
    if (err.message.includes('Duplicate key name')) {
      console.log('  - idx_owner_email index already exists');
    } else {
      throw err;
    }
  }
  
  return true;
}

async function down() {
  console.log('Rolling back migration: add-owner-email');
  
  try {
    await query('ALTER TABLE partners DROP INDEX idx_owner_email');
    console.log('✅ Dropped idx_owner_email index');
  } catch (err) {
    console.log('  - Index might not exist:', err.message);
  }
  
  try {
    await query('ALTER TABLE partners DROP COLUMN owner_email');
    console.log('✅ Dropped owner_email column');
  } catch (err) {
    console.log('  - Column might not exist:', err.message);
  }
  
  return true;
}

// Run migration if called directly
if (require.main === module) {
  up()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { up, down };
