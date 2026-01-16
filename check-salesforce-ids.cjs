const mysql = require('mysql2/promise');

async function checkSalesforceIds() {
  const conn = await mysql.createConnection({
    host: '20.29.25.238',
    port: 31337,
    user: 'root',
    password: 'P6Rof2DQo5wZqa9yM7y6',
    database: 'northpass_portal'
  });
  
  console.log('Checking Salesforce ID formats...\n');
  
  const [rows] = await conn.query(`
    SELECT account_name, salesforce_id, LENGTH(salesforce_id) as len
    FROM partners 
    WHERE salesforce_id IS NOT NULL 
      AND partner_tier IN ('Premier', 'Premier Plus', 'Certified', 'Registered', 'Aggregator')
      AND is_active = TRUE
    ORDER BY account_name
    LIMIT 10
  `);
  
  console.log('Sample Salesforce IDs:');
  console.table(rows);
  
  const [stats] = await conn.query(`
    SELECT 
      LENGTH(salesforce_id) as id_length,
      COUNT(*) as count
    FROM partners 
    WHERE salesforce_id IS NOT NULL 
      AND partner_tier IN ('Premier', 'Premier Plus', 'Certified', 'Registered', 'Aggregator')
      AND is_active = TRUE
    GROUP BY LENGTH(salesforce_id)
  `);
  
  console.log('\nSalesforce ID length distribution:');
  console.table(stats);
  
  await conn.end();
}

checkSalesforceIds().catch(console.error);
