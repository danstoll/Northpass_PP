/**
 * Migration: Add analysis columns to lms_groups
 * These columns store the results of group analysis (bulk or single)
 * so they can be displayed in the grid without expensive queries
 */

const { query } = require('../connection.cjs');

async function up() {
  console.log('Adding analysis columns to lms_groups...');
  
  // Add columns for storing analysis results
  const columnsToAdd = [
    ['potential_users', 'INT DEFAULT NULL', 'Count of users who could be added to group'],
    ['total_npcu', 'INT DEFAULT NULL', 'Total NPCU credits for group members'],
    ['last_analyzed', 'TIMESTAMP NULL', 'When analysis was last run']
  ];
  
  for (const [column, definition, description] of columnsToAdd) {
    try {
      await query(`ALTER TABLE lms_groups ADD COLUMN ${column} ${definition}`);
      console.log(`  ✓ Added ${column}: ${description}`);
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log(`  - ${column} already exists`);
      } else {
        throw err;
      }
    }
  }
  
  // Add index for filtering by analyzed groups
  try {
    await query(`ALTER TABLE lms_groups ADD INDEX idx_analyzed (last_analyzed)`);
    console.log('  ✓ Added index on last_analyzed');
  } catch (err) {
    if (err.code === 'ER_DUP_KEYNAME') {
      console.log('  - Index idx_analyzed already exists');
    }
  }
  
  console.log('Migration complete!');
}

async function down() {
  console.log('Removing analysis columns from lms_groups...');
  
  try {
    await query(`ALTER TABLE lms_groups DROP INDEX idx_analyzed`);
  } catch (err) { /* ignore */ }
  
  await query(`ALTER TABLE lms_groups DROP COLUMN IF EXISTS potential_users`);
  await query(`ALTER TABLE lms_groups DROP COLUMN IF EXISTS total_npcu`);
  await query(`ALTER TABLE lms_groups DROP COLUMN IF EXISTS last_analyzed`);
  
  console.log('Rollback complete!');
}

// Run if executed directly
if (require.main === module) {
  const { initializePool, closePool } = require('../connection.cjs');
  
  initializePool()
    .then(() => up())
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { up, down };
