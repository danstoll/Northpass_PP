const { query } = require('./server/db/connection.cjs');\nconst config = require('./server/config.cjs');", "oldString": "const { query } = require('./server/db/connection.cjs');

async function check() {
  try {
    // Check All Partners group in lms_groups
    const groups = await query(`SELECT id, name, user_count FROM lms_groups WHERE LOWER(name) = 'all partners'`);
    console.log('All Partners in lms_groups:', groups);
    
    const groupId = '3d2d008f-a818-4fa0-b448-dcfdac15431d';
    
    // Check members in lms_group_members
    const members = await query(`SELECT COUNT(*) as count FROM lms_group_members WHERE group_id = ?`, [groupId]);
    console.log('Members in lms_group_members for All Partners:', members[0]?.count || 0);
    
    // Check how many groups have 0 members
    const emptyGroups = await query(`SELECT COUNT(*) as count FROM lms_groups WHERE user_count = 0`);
    console.log('Groups with 0 members:', emptyGroups[0]?.count);
    
    // Check top 5 groups by member count
    const topGroups = await query(`SELECT name, user_count FROM lms_groups ORDER BY user_count DESC LIMIT 5`);
    console.log('Top 5 groups by member count:', topGroups);
    
    // Try to fetch All Partners memberships from API directly
    console.log('\n--- Fetching All Partners memberships from API ---');
    const fetch = require('node-fetch');
    const response = await fetch(`https://api.northpass.com/v2/groups/${groupId}/memberships?page[size]=5`, {
      headers: { 'X-Api-Key': config.northpass.apiKey }
    });
    const data = await response.json();
    console.log('API Response status:', response.status);
    console.log('API Response sample:', JSON.stringify(data, null, 2).substring(0, 1000));
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

check();
