/**
 * Quick script to sync group memberships
 */
const { getPool, closePool } = require('./connection.cjs');

const NORTHPASS_API_URL = 'https://api.northpass.com';
const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';

async function fetchMemberships(groupId) {
  const url = `${NORTHPASS_API_URL}/v2/groups/${groupId}/memberships?limit=100`;
  
  try {
    const response = await fetch(url, {
      headers: { 'X-Api-Key': API_KEY }
    });
    
    if (!response.ok) {
      console.log(`  ⚠️ Memberships endpoint returned ${response.status} for group ${groupId}`);
      return [];
    }
    
    const data = await response.json();
    const memberships = data.data || [];
    
    // Extract user IDs from memberships
    return memberships.map(m => m.relationships?.person?.data?.id).filter(Boolean);
  } catch (err) {
    console.error(`  ❌ Error fetching memberships:`, err.message);
    return [];
  }
}

async function main() {
  console.log('👥 Syncing group memberships...');
  
  const pool = await getPool();
  
  try {
    // Get all groups
    const [groups] = await pool.query('SELECT id, name FROM lms_groups');
    console.log(`📦 Found ${groups.length} groups to process`);
    
    let totalMembers = 0;
    let processedGroups = 0;
    
    for (const group of groups) {
      processedGroups++;
      
      // Fetch memberships
      const userIds = await fetchMemberships(group.id);
      
      if (userIds.length === 0) {
        continue;
      }
      
      // Clear existing memberships
      await pool.query('DELETE FROM lms_group_members WHERE group_id = ?', [group.id]);
      
      // Insert new memberships
      let insertedCount = 0;
      for (const userId of userIds) {
        try {
          await pool.query(
            'INSERT IGNORE INTO lms_group_members (group_id, user_id, added_at) VALUES (?, ?, NOW())',
            [group.id, userId]
          );
          insertedCount++;
        } catch (e) {
          // Ignore FK errors
        }
      }
      
      // Update group user count
      await pool.query('UPDATE lms_groups SET user_count = ? WHERE id = ?', [insertedCount, group.id]);
      
      totalMembers += insertedCount;
      
      if (insertedCount > 0) {
        console.log(`  ✓ ${group.name}: ${insertedCount} members`);
      }
      
      // Progress update
      if (processedGroups % 50 === 0) {
        console.log(`  📊 Progress: ${processedGroups}/${groups.length} groups`);
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 200));
    }
    
    console.log(`\n✅ Sync complete!`);
    console.log(`   Groups processed: ${processedGroups}`);
    console.log(`   Total members synced: ${totalMembers}`);
    
    // Verify
    const [count] = await pool.query('SELECT COUNT(*) as c FROM lms_group_members');
    console.log(`   DB record count: ${count[0].c}`);
    
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await closePool();
  }
}

main();
