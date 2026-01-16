const { query, closePool } = require('./server/db/connection.cjs');

async function main() {
  try {
    console.log('Checking partner status breakdown...\n');
    
    // Get status breakdown
    const statusBreakdown = await query(`
      SELECT 
        is_active,
        account_status,
        COUNT(*) as cnt 
      FROM partners 
      GROUP BY is_active, account_status 
      ORDER BY is_active DESC, account_status
    `);
    
    console.log('Partner Status Breakdown:');
    console.log('========================');
    statusBreakdown.forEach(row => {
      console.log(`  is_active=${row.is_active}, account_status=${row.account_status || 'NULL'}: ${row.cnt}`);
    });
    
    // Get recently deactivated partners
    const recentlyDeactivated = await query(`
      SELECT account_name, account_status, deleted_at, partner_tier
      FROM partners 
      WHERE is_active = FALSE 
      ORDER BY deleted_at DESC 
      LIMIT 20
    `);
    
    console.log('\n\nRecently Deactivated Partners (last 20):');
    console.log('==========================================');
    recentlyDeactivated.forEach(row => {
      console.log(`  ${row.account_name} | ${row.partner_tier || 'No Tier'} | ${row.account_status || 'NULL'} | deleted: ${row.deleted_at || 'never'}`);
    });
    
    // Check for partners with Pending tier
    const pendingPartners = await query(`
      SELECT account_name, partner_tier, account_status, is_active
      FROM partners 
      WHERE partner_tier = 'Pending' OR partner_tier IS NULL OR partner_tier = ''
      ORDER BY is_active DESC
      LIMIT 20
    `);
    
    console.log('\n\nPartners with Pending/NULL/Empty Tier (showing 20):');
    console.log('====================================================');
    pendingPartners.forEach(row => {
      console.log(`  ${row.account_name} | tier=${row.partner_tier || 'NULL'} | status=${row.account_status || 'NULL'} | active=${row.is_active}`);
    });
    
    // Check total counts
    const [totals] = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_active = FALSE THEN 1 ELSE 0 END) as inactive
      FROM partners
    `);
    
    console.log('\n\nTotals:');
    console.log('=======');
    console.log(`  Total partners: ${totals.total}`);
    console.log(`  Active: ${totals.active}`);
    console.log(`  Inactive: ${totals.inactive}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await closePool();
  }
}

main();
