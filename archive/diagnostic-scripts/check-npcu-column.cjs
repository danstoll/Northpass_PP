const { query } = require('./server/db/connection.cjs');

async function checkColumn() {
  try {
    const cols = await query('SHOW COLUMNS FROM partners');
    const npcuCols = cols.filter(c => c.Field.includes('npcu'));
    console.log('NPCU-related columns:', npcuCols);
    
    // Try to add the column if missing
    if (!npcuCols.find(c => c.Field === 'total_npcu')) {
      console.log('Adding total_npcu column...');
      await query('ALTER TABLE partners ADD COLUMN total_npcu INT DEFAULT 0');
      console.log('Column added!');
    }
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

checkColumn();
