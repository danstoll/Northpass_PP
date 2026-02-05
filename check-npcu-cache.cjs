const { query } = require('./server/db/connection.cjs');

async function check() {
  console.log('=== NPCU Cache Investigation ===\n');
  
  // Check when cache was last updated
  const cacheAge = await query(`
    SELECT MAX(last_updated) as newest, MIN(last_updated) as oldest, COUNT(*) as total 
    FROM partner_npcu_cache
  `);
  console.log('Cache timestamp info:');
  console.table(cacheAge);
  
  // Check Definiti partner specifically
  const definiti = await query(`
    SELECT 
      p.id, 
      p.account_name, 
      nc.active_npcu, 
      nc.total_certifications, 
      nc.certified_users,
      nc.last_updated
    FROM partner_npcu_cache nc
    JOIN partners p ON p.id = nc.partner_id
    WHERE p.account_name LIKE '%definiti%'
  `);
  console.log('\nDefiniti partner NPCU:');
  console.table(definiti);
  
  process.exit(0);
}

check().catch(e => { 
  console.error('Error:', e.message); 
  process.exit(1); 
});
