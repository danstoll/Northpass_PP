/**
 * Migration: Add pending_source column to lms_group_members
 */
const { initializePool, query, closePool } = require('./connection.cjs');

async function migrate() {
  await initializePool();
  
  console.log('Adding pending_source column...');
  
  try {
    await query(`ALTER TABLE lms_group_members ADD COLUMN pending_source VARCHAR(10) DEFAULT 'api'`);
    console.log('✅ Column added');
  } catch (e) {
    if (e.message.includes('Duplicate column')) {
      console.log('Column already exists');
    } else {
      console.error('Error:', e.message);
    }
  }
  
  try {
    await query(`ALTER TABLE lms_group_members ADD INDEX idx_pending (pending_source)`);
    console.log('✅ Index added');
  } catch (e) {
    if (e.message.includes('Duplicate key')) {
      console.log('Index already exists');
    } else {
      console.error('Index error:', e.message);
    }
  }
  
  // Verify
  const [cols] = await query('DESCRIBE lms_group_members');
  console.log('\nTable structure:');
  for (const col of cols) {
    console.log(`  ${col.Field}: ${col.Type} ${col.Default ? `(default: ${col.Default})` : ''}`);
  }
  
  await closePool();
}

migrate();
