// Check partners with missing LMS groups
const { query } = require('./server/db/connection.cjs');

(async () => {
  // Check Data3 specifically
  console.log('=== Data3 Partner ===');
  const data3 = await query(`
    SELECT p.id, p.account_name, p.partner_tier, p.account_owner, 
           g.id as group_id, g.name as group_name
    FROM partners p 
    LEFT JOIN lms_groups g ON g.partner_id = p.id 
    WHERE p.account_name LIKE '%Data3%'
  `);
  console.log(data3);
  
  // Check if there's a group named "Data3" or similar
  console.log('\n=== LMS Groups containing "Data3" ===');
  const groups = await query(`
    SELECT id, name, partner_id 
    FROM lms_groups 
    WHERE name LIKE '%Data3%'
  `);
  console.log(groups);
  
  // Check Steve Barkle's partners with missing groups
  console.log('\n=== Steve Barkle Partners Without LMS Groups ===');
  const sbPartners = await query(`
    SELECT p.id, p.account_name, p.partner_tier, p.is_active,
           g.id as group_id, g.name as group_name
    FROM partners p 
    LEFT JOIN lms_groups g ON g.partner_id = p.id 
    WHERE p.account_owner LIKE '%Steve%Barkle%' OR p.account_owner LIKE '%Barkle%'
    ORDER BY g.id IS NULL DESC, p.account_name
  `);
  console.log(sbPartners);
  
  // Summary of partners without groups
  console.log('\n=== All Active Partners Without LMS Groups (first 20) ===');
  const noGroups = await query(`
    SELECT p.id, p.account_name, p.partner_tier, p.account_owner
    FROM partners p 
    LEFT JOIN lms_groups g ON g.partner_id = p.id 
    WHERE g.id IS NULL AND p.is_active = 1
    LIMIT 20
  `);
  console.log(noGroups);
  console.log(`\nTotal active partners without LMS groups: ${noGroups.length}+`);
  
  process.exit(0);
})();
