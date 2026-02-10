/**
 * Check current account_region and country values in database
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const config = require('./server/config.cjs');

async function check() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  });
  
  try {
    // Check current region values
    const [regions] = await conn.query(`
      SELECT DISTINCT account_region, COUNT(*) as cnt 
      FROM partners 
      WHERE account_region IS NOT NULL AND account_region != ''
      GROUP BY account_region 
      ORDER BY cnt DESC 
      LIMIT 30
    `);
    
    console.log('Current account_region values (should be APAC/EMEA/AMER/MENA):');
    console.log('================================================================');
    regions.forEach(r => console.log(`  ${r.account_region}: ${r.cnt} partners`));
    console.log('\nTotal with region:', regions.reduce((sum, r) => sum + Number(r.cnt), 0), 'partners');
    
    // Check country values
    const [countries] = await conn.query(`
      SELECT DISTINCT country, COUNT(*) as cnt 
      FROM partners 
      WHERE country IS NOT NULL AND country != ''
      GROUP BY country 
      ORDER BY cnt DESC 
      LIMIT 30
    `);
    
    console.log('\n\nCurrent country values (actual countries):');
    console.log('===========================================');
    countries.forEach(r => console.log(`  ${r.country}: ${r.cnt} partners`));
    console.log('\nTotal with country:', countries.reduce((sum, r) => sum + Number(r.cnt), 0), 'partners');
    
    // Check sample partners
    const [samples] = await conn.query(`
      SELECT account_name, account_region, country 
      FROM partners 
      WHERE is_active = TRUE
      ORDER BY RAND()
      LIMIT 10
    `);
    
    console.log('\n\nSample partners:');
    console.log('================');
    samples.forEach(r => console.log(`  ${r.account_name} | Region: ${r.account_region || 'NULL'} | Country: ${r.country || 'NULL'}`));
    
  } finally {
    conn.end();
  }
}

check().catch(console.error);
