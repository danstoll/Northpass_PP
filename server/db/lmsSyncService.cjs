/**
 * LMS Sync Service
 * Syncs data from Northpass LMS to the local MariaDB database
 */

const https = require('https');
const { query, transaction } = require('./connection.cjs');

const NORTHPASS_API_URL = 'https://api.northpass.com';
const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';

/**
 * Make an API request to Northpass
 */
function northpassRequest(endpoint, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, NORTHPASS_API_URL);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, error: 'Parse error' });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch all pages of a paginated endpoint
 * Northpass API uses links.next for pagination
 */
async function fetchAllPages(endpoint, dataKey = 'data') {
  const allData = [];
  let currentUrl = endpoint.includes('?') 
    ? `${endpoint}&limit=100` 
    : `${endpoint}?limit=100`;
  let pageNum = 1;

  while (currentUrl) {
    console.log(`  📄 Fetching page ${pageNum}...`);
    const response = await northpassRequest(currentUrl);
    
    if (response.status !== 200 || !response.data) {
      console.error(`API error on page ${pageNum}:`, response);
      break;
    }

    const pageData = response.data[dataKey] || response.data.data || [];
    allData.push(...pageData);
    console.log(`  📥 Got ${pageData.length} records (total: ${allData.length})`);

    // Check for next page using links.next
    const links = response.data.links;
    if (links && links.next) {
      // Extract path from full URL
      currentUrl = links.next.replace(NORTHPASS_API_URL, '');
      pageNum++;
    } else {
      currentUrl = null; // No more pages
    }
    
    // Rate limiting delay - 500ms to avoid 429 errors
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return allData;
}

/**
 * Get the last successful sync time for a given sync type
 */
async function getLastSyncTime(syncType = 'users') {
  const rows = await query(
    `SELECT completed_at FROM sync_logs 
     WHERE sync_type = ? AND status = 'completed' 
     ORDER BY completed_at DESC LIMIT 1`,
    [syncType]
  );
  return rows[0]?.completed_at || null;
}

/**
 * Format date for API filter (ISO 8601)
 */
function formatDateForApi(date) {
  if (!date) return null;
  if (typeof date === 'string') date = new Date(date);
  return date.toISOString();
}

/**
 * Create a sync log entry
 */
async function createSyncLog(syncType) {
  const result = await query(
    'INSERT INTO sync_logs (sync_type, status, started_at) VALUES (?, ?, NOW())',
    [syncType, 'running']
  );
  return result.insertId;
}

/**
 * Update sync log with results
 */
async function updateSyncLog(logId, status, stats, error = null) {
  await query(
    `UPDATE sync_logs SET 
      status = ?, 
      completed_at = NOW(), 
      records_processed = ?,
      records_created = ?,
      records_updated = ?,
      records_failed = ?,
      error_message = ?,
      details = ?
    WHERE id = ?`,
    [
      status,
      stats.processed || 0,
      stats.created || 0,
      stats.updated || 0,
      stats.failed || 0,
      error,
      JSON.stringify(stats.details || {}),
      logId
    ]
  );
}

/**
 * Find the "All Partners" group ID
 */
async function findAllPartnerGroupId() {
  console.log('🔍 Looking for "All Partners" group...');
  const groups = await fetchAllPages('/v2/groups');
  
  const allPartnerGroup = groups.find(g => {
    const name = (g.attributes?.name || '').toLowerCase().trim();
    return name === 'all partners' || name === 'all partner';
  });
  
  if (allPartnerGroup) {
    console.log(`✅ Found "All Partners" group: ${allPartnerGroup.id} (${allPartnerGroup.attributes?.user_count} users)`);
    return allPartnerGroup.id;
  }
  
  console.warn('⚠️ "All Partners" group not found, will sync all users');
  return null;
}

/**
 * Fetch members of a specific group via memberships endpoint
 * Returns array of user IDs (not full user objects)
 */
async function fetchGroupMemberIds(groupId) {
  console.log(`👥 Fetching member IDs from group ${groupId}...`);
  const allUserIds = [];
  let page = 1;
  
  while (true) {
    const response = await northpassRequest(`/v2/groups/${groupId}/memberships?page=${page}&limit=100`);
    
    if (response.status !== 200 || !response.data) {
      console.error(`API error fetching memberships page ${page}:`, response);
      break;
    }
    
    const memberships = response.data.data || [];
    if (memberships.length === 0) break;
    
    // Extract user IDs from membership relationships
    for (const membership of memberships) {
      const userId = membership?.relationships?.person?.data?.id;
      if (userId) {
        allUserIds.push(userId);
      }
    }
    
    console.log(`  📄 Page ${page}: ${memberships.length} memberships (total: ${allUserIds.length} users)`);
    
    page++;
    if (page > 100) {
      console.warn('⚠️ Stopped after 100 pages');
      break;
    }
  }
  
  console.log(`📥 Found ${allUserIds.length} member IDs in group`);
  return allUserIds;
}

/**
 * Fetch user details for a batch of user IDs
 */
async function fetchUsersBatch(userIds) {
  const users = [];
  const CONCURRENT_LIMIT = 10;
  
  for (let i = 0; i < userIds.length; i += CONCURRENT_LIMIT) {
    const batch = userIds.slice(i, i + CONCURRENT_LIMIT);
    const promises = batch.map(async (userId) => {
      try {
        const response = await northpassRequest(`/v2/people/${userId}`);
        if (response.status === 200 && response.data?.data) {
          return response.data.data;
        }
      } catch (err) {
        console.warn(`  ⚠️ Failed to fetch user ${userId}`);
      }
      return null;
    });
    
    const results = await Promise.all(promises);
    users.push(...results.filter(u => u !== null));
    
    if ((i + CONCURRENT_LIMIT) % 100 === 0) {
      console.log(`  📥 Fetched ${users.length}/${userIds.length} user details`);
    }
  }
  
  return users;
}

/**
 * Sync LMS users - ALL users from Northpass (not just partner group)
 * Uses batch inserts for performance
 */
async function syncUsers(logId, onProgress) {
  console.log('👥 Syncing ALL LMS users...');
  const stats = { processed: 0, created: 0, updated: 0, failed: 0 };
  const BATCH_SIZE = 100;

  try {
    // Fetch ALL users from Northpass (not just partner group)
    const users = await fetchAllPages('/v2/people');
    console.log(`📥 Fetched ${users.length} total users from LMS`);

    // Process in batches for better performance
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      
      try {
        // Build batch insert values
        const values = batch.map(user => {
          const attrs = user.attributes || {};
          return [
            user.id,
            attrs.email?.toLowerCase() || '',
            attrs.first_name || '',
            attrs.last_name || '',
            attrs.created_at ? new Date(attrs.created_at) : null,
            attrs.last_active_at ? new Date(attrs.last_active_at) : null,
            attrs.deactivated_at ? new Date(attrs.deactivated_at) : null,
            attrs.deactivated_at ? 'deactivated' : 'active'
          ];
        });

        // Batch upsert
        const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, NOW())').join(', ');
        const flatValues = values.flat();
        
        await query(
          `INSERT INTO lms_users (id, email, first_name, last_name, created_at_lms, last_active_at, deactivated_at, status, synced_at)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             email = VALUES(email),
             first_name = VALUES(first_name),
             last_name = VALUES(last_name),
             last_active_at = VALUES(last_active_at),
             deactivated_at = VALUES(deactivated_at),
             status = VALUES(status),
             synced_at = NOW()`,
          flatValues
        );

        stats.processed += batch.length;
        console.log(`  Processed ${stats.processed}/${users.length} users`);
        onProgress && onProgress('users', stats.processed, users.length);
      } catch (error) {
        // If batch fails, fall back to individual inserts
        console.warn(`  Batch ${i}-${i+BATCH_SIZE} failed, falling back to individual inserts`);
        for (const user of batch) {
          try {
            const attrs = user.attributes || {};
            await query(
              `INSERT INTO lms_users (id, email, first_name, last_name, created_at_lms, last_active_at, deactivated_at, status, synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
               ON DUPLICATE KEY UPDATE
                 email = VALUES(email),
                 first_name = VALUES(first_name),
                 last_name = VALUES(last_name),
                 last_active_at = VALUES(last_active_at),
                 deactivated_at = VALUES(deactivated_at),
                 status = VALUES(status),
                 synced_at = NOW()`,
              [
                user.id,
                attrs.email?.toLowerCase() || '',
                attrs.first_name || '',
                attrs.last_name || '',
                attrs.created_at ? new Date(attrs.created_at) : null,
                attrs.last_active_at ? new Date(attrs.last_active_at) : null,
                attrs.deactivated_at ? new Date(attrs.deactivated_at) : null,
                attrs.deactivated_at ? 'deactivated' : 'active'
              ]
            );
            stats.processed++;
          } catch (err) {
            stats.failed++;
            console.error(`  Failed to sync user ${user.id}:`, err.message);
          }
        }
      }
    }

    // Note: Using upserts, so we can't distinguish created vs updated - report as processed
    stats.created = stats.processed; // For backwards compatibility with sync log schema
    console.log(`✅ Users synced: ${stats.processed} processed, ${stats.failed} failed`);
  } catch (error) {
    console.error('❌ User sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Sync LMS users - INCREMENTAL mode
 * Only fetches users updated since the last successful sync
 * Uses API filter: filter[updated_at][gteq]=<timestamp>
 */
async function syncUsersIncremental(logId, onProgress) {
  console.log('👥 Syncing LMS users (INCREMENTAL mode)...');
  const stats = { processed: 0, created: 0, updated: 0, failed: 0, skipped: 0, mode: 'incremental' };
  const BATCH_SIZE = 100;

  try {
    // Get last successful sync time
    const lastSyncTime = await getLastSyncTime('users');
    
    // Build API endpoint with filter
    let endpoint = '/v2/people';
    if (lastSyncTime) {
      const sinceDate = formatDateForApi(lastSyncTime);
      endpoint = `/v2/people?filter[updated_at][gteq]=${encodeURIComponent(sinceDate)}`;
      console.log(`📅 Fetching users updated since: ${sinceDate}`);
    } else {
      console.log('📅 No previous sync found - performing full sync');
    }

    // Fetch users (only changed ones if we have a last sync time)
    const users = await fetchAllPages(endpoint);
    console.log(`📥 Fetched ${users.length} users ${lastSyncTime ? '(incremental)' : '(full)'}`);

    if (users.length === 0) {
      console.log('✅ No new/updated users to sync');
      stats.skipped = 0;
      return stats;
    }

    // Get total user count for context
    const totalCount = await query('SELECT COUNT(*) as count FROM lms_users');
    stats.skipped = (totalCount[0]?.count || 0) - users.length;

    // Process in batches for better performance
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      
      try {
        // Build batch insert values
        const values = batch.map(user => {
          const attrs = user.attributes || {};
          return [
            user.id,
            attrs.email?.toLowerCase() || '',
            attrs.first_name || '',
            attrs.last_name || '',
            attrs.created_at ? new Date(attrs.created_at) : null,
            attrs.last_active_at ? new Date(attrs.last_active_at) : null,
            attrs.deactivated_at ? new Date(attrs.deactivated_at) : null,
            attrs.deactivated_at ? 'deactivated' : 'active'
          ];
        });

        // Batch upsert
        const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, NOW())').join(', ');
        const flatValues = values.flat();
        
        await query(
          `INSERT INTO lms_users (id, email, first_name, last_name, created_at_lms, last_active_at, deactivated_at, status, synced_at)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             email = VALUES(email),
             first_name = VALUES(first_name),
             last_name = VALUES(last_name),
             last_active_at = VALUES(last_active_at),
             deactivated_at = VALUES(deactivated_at),
             status = VALUES(status),
             synced_at = NOW()`,
          flatValues
        );

        stats.processed += batch.length;
        console.log(`  Processed ${stats.processed}/${users.length} users`);
        onProgress && onProgress('users', stats.processed, users.length);
      } catch (error) {
        // If batch fails, fall back to individual inserts
        console.warn(`  Batch ${i}-${i+BATCH_SIZE} failed, falling back to individual inserts`);
        for (const user of batch) {
          try {
            const attrs = user.attributes || {};
            await query(
              `INSERT INTO lms_users (id, email, first_name, last_name, created_at_lms, last_active_at, deactivated_at, status, synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
               ON DUPLICATE KEY UPDATE
                 email = VALUES(email),
                 first_name = VALUES(first_name),
                 last_name = VALUES(last_name),
                 last_active_at = VALUES(last_active_at),
                 deactivated_at = VALUES(deactivated_at),
                 status = VALUES(status),
                 synced_at = NOW()`,
              [
                user.id,
                attrs.email?.toLowerCase() || '',
                attrs.first_name || '',
                attrs.last_name || '',
                attrs.created_at ? new Date(attrs.created_at) : null,
                attrs.last_active_at ? new Date(attrs.last_active_at) : null,
                attrs.deactivated_at ? new Date(attrs.deactivated_at) : null,
                attrs.deactivated_at ? 'deactivated' : 'active'
              ]
            );
            stats.processed++;
          } catch (err) {
            stats.failed++;
            console.error(`  Failed to sync user ${user.id}:`, err.message);
          }
        }
      }
    }

    stats.updated = stats.processed;
    console.log(`✅ Users synced (incremental): ${stats.processed} processed, ${stats.skipped} unchanged, ${stats.failed} failed`);
  } catch (error) {
    console.error('❌ User sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Sync LMS groups - only partner groups (ptr_ prefix or matched to partner)
 */
async function syncGroups(logId, onProgress) {
  console.log('📁 Syncing LMS groups (partner groups only)...');
  const stats = { processed: 0, created: 0, updated: 0, failed: 0, skipped: 0 };

  try {
    const groups = await fetchAllPages('/v2/groups');
    console.log(`📥 Fetched ${groups.length} groups from LMS`);

    // Filter to partner groups PLUS the "All Partners" group (needed for partner-only training access)
    const partnerGroups = groups.filter(g => {
      const name = (g.attributes?.name || '').toLowerCase();
      // Always include "All Partners" group - it's needed for partner access control
      if (name === 'all partners') return true;
      // Include groups with ptr_ prefix, or exclude system groups
      return name.startsWith('ptr_') || 
             (!name.includes('admin') && 
              !name.includes('internal') &&
              !name.includes('test'));
    });
    console.log(`📋 Filtering to ${partnerGroups.length} partner groups (including All Partners)`);

    for (const group of partnerGroups) {
      try {
        const attrs = group.attributes || {};
        
        // Match to partner by name (with or without ptr_ prefix)
        const cleanName = attrs.name?.replace(/^ptr_/, '');
        const partnerMatch = await query(
          `SELECT id FROM partners WHERE account_name = ? OR account_name = ?`,
          [attrs.name, cleanName]
        );
        const partnerId = partnerMatch[0]?.id || null;

        await query(
          `INSERT INTO lms_groups (id, name, description, user_count, partner_id, synced_at)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             description = VALUES(description),
             user_count = VALUES(user_count),
             partner_id = VALUES(partner_id),
             synced_at = NOW()`,
          [
            group.id,
            attrs.name || '',
            attrs.description || '',
            attrs.user_count || 0,
            partnerId
          ]
        );

        stats.processed++;
        if (stats.processed % 50 === 0) {
          onProgress && onProgress('groups', stats.processed, partnerGroups.length);
        }
      } catch (error) {
        stats.failed++;
        console.error(`  Failed to sync group ${group.id}:`, error.message);
      }
    }

    // Note: Using upserts, so we can't distinguish created vs updated - report as processed
    stats.created = stats.processed; // For backwards compatibility with sync log schema
    stats.skipped = groups.length - partnerGroups.length;
    console.log(`✅ Groups synced: ${stats.processed} processed, ${stats.skipped} skipped (non-partner), ${stats.failed} failed`);
  } catch (error) {
    console.error('❌ Group sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Sync LMS groups - INCREMENTAL mode
 * Only fetches groups updated since the last successful sync
 */
async function syncGroupsIncremental(logId, onProgress) {
  console.log('📁 Syncing LMS groups (INCREMENTAL mode)...');
  const stats = { processed: 0, created: 0, updated: 0, failed: 0, skipped: 0, mode: 'incremental' };

  try {
    // Get last successful sync time
    const lastSyncTime = await getLastSyncTime('groups');
    
    // Build API endpoint with filter
    let endpoint = '/v2/groups';
    if (lastSyncTime) {
      const sinceDate = formatDateForApi(lastSyncTime);
      endpoint = `/v2/groups?filter[updated_at][gteq]=${encodeURIComponent(sinceDate)}`;
      console.log(`📅 Fetching groups updated since: ${sinceDate}`);
    } else {
      console.log('📅 No previous sync found - performing full sync');
    }

    const groups = await fetchAllPages(endpoint);
    console.log(`📥 Fetched ${groups.length} groups ${lastSyncTime ? '(incremental)' : '(full)'}`);

    if (groups.length === 0) {
      console.log('✅ No new/updated groups to sync');
      return stats;
    }

    // Filter to partner groups PLUS the "All Partners" group
    const partnerGroups = groups.filter(g => {
      const name = (g.attributes?.name || '').toLowerCase();
      if (name === 'all partners') return true;
      return name.startsWith('ptr_') || 
             (!name.includes('admin') && 
              !name.includes('internal') &&
              !name.includes('test'));
    });
    console.log(`📋 Processing ${partnerGroups.length} partner groups`);

    for (const group of partnerGroups) {
      try {
        const attrs = group.attributes || {};
        
        const cleanName = attrs.name?.replace(/^ptr_/, '');
        const partnerMatch = await query(
          `SELECT id FROM partners WHERE account_name = ? OR account_name = ?`,
          [attrs.name, cleanName]
        );
        const partnerId = partnerMatch[0]?.id || null;

        await query(
          `INSERT INTO lms_groups (id, name, description, user_count, partner_id, synced_at)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             description = VALUES(description),
             user_count = VALUES(user_count),
             partner_id = VALUES(partner_id),
             synced_at = NOW()`,
          [
            group.id,
            attrs.name || '',
            attrs.description || '',
            attrs.user_count || 0,
            partnerId
          ]
        );

        stats.processed++;
        if (stats.processed % 50 === 0) {
          onProgress && onProgress('groups', stats.processed, partnerGroups.length);
        }
      } catch (error) {
        stats.failed++;
        console.error(`  Failed to sync group ${group.id}:`, error.message);
      }
    }

    stats.updated = stats.processed;
    stats.skipped = groups.length - partnerGroups.length;
    console.log(`✅ Groups synced (incremental): ${stats.processed} processed, ${stats.skipped} skipped, ${stats.failed} failed`);
  } catch (error) {
    console.error('❌ Group sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Sync group memberships
 */
async function syncGroupMembers(logId, onProgress) {
  console.log('👥 Syncing group memberships...');
  const stats = { processed: 0, created: 0, updated: 0, failed: 0 };

  try {
    // Only sync partner groups (those linked to partners) + the special "All Partners" group
    // This avoids syncing large non-partner groups that can have thousands of members
    const groups = await query(`
      SELECT g.id, g.name FROM lms_groups g
      WHERE g.partner_id IS NOT NULL 
         OR LOWER(g.name) = 'all partners'
      ORDER BY g.name
    `);
    console.log(`📥 Syncing members for ${groups.length} partner groups (+ All Partners)`);

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      try {
        // Fetch memberships for this group (using /memberships endpoint which works)
        const memberships = await fetchAllPages(`/v2/groups/${group.id}/memberships`);
        
        // Clear existing memberships for this group
        await query('DELETE FROM lms_group_members WHERE group_id = ?', [group.id]);

        // Insert new memberships - extract user ID from relationships
        let memberCount = 0;
        for (const membership of memberships) {
          try {
            // Membership structure: { relationships: { person: { data: { id: 'user-id' } } } }
            const userId = membership.relationships?.person?.data?.id;
            if (userId) {
              await query(
                `INSERT IGNORE INTO lms_group_members (group_id, user_id, added_at) VALUES (?, ?, NOW())`,
                [group.id, userId]
              );
              memberCount++;
              stats.processed++;
            }
          } catch (e) {
            // Ignore foreign key errors (user might not be synced)
          }
        }

        // Update user count
        await query(
          'UPDATE lms_groups SET user_count = ? WHERE id = ?',
          [memberCount, group.id]
        );

        if ((i + 1) % 10 === 0) {
          console.log(`  Processed ${i + 1}/${groups.length} groups`);
          onProgress && onProgress('group_members', i + 1, groups.length);
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        stats.failed++;
        console.error(`  Failed to sync members for group ${group.name}:`, error.message);
      }
    }

    console.log(`✅ Group memberships synced: ${stats.processed} memberships`);
  } catch (error) {
    console.error('❌ Group members sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Sync all LMS courses
 */
async function syncCourses(logId, onProgress) {
  console.log('📚 Syncing LMS courses...');
  const stats = { processed: 0, created: 0, updated: 0, failed: 0 };

  try {
    const courses = await fetchAllPages('/v2/courses');
    console.log(`📥 Fetched ${courses.length} courses from LMS`);

    for (const course of courses) {
      try {
        const attrs = course.attributes || {};
        
        await query(
          `INSERT INTO lms_courses (id, name, description, status, synced_at)
           VALUES (?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             description = VALUES(description),
             status = VALUES(status),
             synced_at = NOW()`,
          [
            course.id,
            attrs.name || attrs.title || '',
            attrs.description || '',
            attrs.status || 'active'
          ]
        );

        stats.processed++;
      } catch (error) {
        stats.failed++;
        console.error(`  Failed to sync course ${course.id}:`, error.message);
      }
    }

    stats.created = stats.processed - stats.failed;
    console.log(`✅ Courses synced: ${stats.processed} processed, ${stats.failed} failed`);
  } catch (error) {
    console.error('❌ Course sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Sync LMS courses - INCREMENTAL mode
 * Only fetches courses updated since the last successful sync
 */
async function syncCoursesIncremental(logId, onProgress) {
  console.log('📚 Syncing LMS courses (INCREMENTAL mode)...');
  const stats = { processed: 0, created: 0, updated: 0, failed: 0, skipped: 0, mode: 'incremental' };

  try {
    // Get last successful sync time
    const lastSyncTime = await getLastSyncTime('courses');
    
    // Build API endpoint with filter
    let endpoint = '/v2/courses';
    if (lastSyncTime) {
      const sinceDate = formatDateForApi(lastSyncTime);
      endpoint = `/v2/courses?filter[updated_at][gteq]=${encodeURIComponent(sinceDate)}`;
      console.log(`📅 Fetching courses updated since: ${sinceDate}`);
    } else {
      console.log('📅 No previous sync found - performing full sync');
    }

    const courses = await fetchAllPages(endpoint);
    console.log(`📥 Fetched ${courses.length} courses ${lastSyncTime ? '(incremental)' : '(full)'}`);

    if (courses.length === 0) {
      console.log('✅ No new/updated courses to sync');
      return stats;
    }

    // Get total count for context
    const totalCount = await query('SELECT COUNT(*) as count FROM lms_courses');
    stats.skipped = (totalCount[0]?.count || 0);

    for (const course of courses) {
      try {
        const attrs = course.attributes || {};
        
        await query(
          `INSERT INTO lms_courses (id, name, description, status, synced_at)
           VALUES (?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             description = VALUES(description),
             status = VALUES(status),
             synced_at = NOW()`,
          [
            course.id,
            attrs.name || attrs.title || '',
            attrs.description || '',
            attrs.status || 'active'
          ]
        );

        stats.processed++;
      } catch (error) {
        stats.failed++;
        console.error(`  Failed to sync course ${course.id}:`, error.message);
      }
    }

    stats.updated = stats.processed;
    console.log(`✅ Courses synced (incremental): ${stats.processed} processed, ${stats.failed} failed`);
  } catch (error) {
    console.error('❌ Course sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Sync course NPCU properties using bulk Properties API
 * Uses /v2/properties/courses endpoint which returns all courses with NPCU values
 */
async function syncCourseProperties(logId, onProgress) {
  console.log('🏷️ Syncing course properties (NPCU values) via bulk API...');
  const stats = { processed: 0, created: 0, updated: 0, failed: 0, skipped: 0 };

  try {
    // Fetch ALL course properties from bulk endpoint
    let allProperties = [];
    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const response = await northpassRequest(`/v2/properties/courses?limit=100&page=${currentPage}`);
      
      if (response.status !== 200 || !response.data) {
        console.error(`API error on page ${currentPage}:`, response);
        hasMorePages = false;
        break;
      }

      const pageData = response.data.data || [];
      if (pageData.length === 0) {
        hasMorePages = false;
      } else {
        allProperties = [...allProperties, ...pageData];
        console.log(`  📄 Page ${currentPage}: ${pageData.length} courses (Total: ${allProperties.length})`);
        currentPage++;
        
        // Safety limit
        if (currentPage > 30) {
          console.warn('⚠️ Stopped after 30 pages');
          hasMorePages = false;
        }
      }
    }

    console.log(`📥 Fetched properties for ${allProperties.length} courses`);

    // Process each course
    let certificationCount = 0;
    for (const item of allProperties) {
      try {
        const courseId = item.id;
        const attrs = item.attributes || {};
        const properties = attrs.properties || {};
        
        // Extract NPCU value
        let npcuValue = 0;
        if (properties.npcu !== undefined && properties.npcu !== null && properties.npcu !== '') {
          npcuValue = parseInt(properties.npcu) || 0;
          // Validate NPCU is 0, 1, or 2
          if (npcuValue < 0 || npcuValue > 2) {
            npcuValue = 0;
          }
        }
        
        if (npcuValue > 0) {
          certificationCount++;
          console.log(`  ✅ ${properties.name || courseId}: NPCU=${npcuValue}`);
        }

        // Store in course_properties table
        await query(
          `INSERT INTO course_properties (course_id, npcu_value, property_data, fetched_at)
           VALUES (?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             npcu_value = VALUES(npcu_value),
             property_data = VALUES(property_data),
             fetched_at = NOW()`,
          [courseId, npcuValue, JSON.stringify(properties)]
        );

        // Update or insert course record with NPCU value
        await query(
          `INSERT INTO lms_courses (id, name, npcu_value, is_certification, synced_at)
           VALUES (?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             name = COALESCE(VALUES(name), name),
             npcu_value = VALUES(npcu_value),
             is_certification = VALUES(is_certification),
             synced_at = NOW()`,
          [courseId, properties.name || '', npcuValue, npcuValue > 0]
        );

        stats.processed++;
      } catch (error) {
        stats.failed++;
        console.error(`  Failed to process course ${item.id}:`, error.message);
      }
    }

    console.log(`✅ Course properties synced: ${stats.processed} processed, ${certificationCount} with NPCU > 0, ${stats.failed} failed`);
  } catch (error) {
    console.error('❌ Course properties sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Sync enrollments for all users
 */
async function syncEnrollments(logId, onProgress) {
  console.log('📊 Syncing enrollments...');
  const stats = { processed: 0, created: 0, updated: 0, failed: 0 };

  try {
    // Get all users
    const users = await query('SELECT id, email FROM lms_users WHERE status = "active"');
    console.log(`📥 Syncing enrollments for ${users.length} active users`);

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      try {
        // Fetch transcripts for this user
        const response = await northpassRequest(`/v2/people/${user.id}/transcripts`);
        
        if (response.status === 200 && response.data?.data) {
          for (const transcript of response.data.data) {
            const attrs = transcript.attributes || {};
            const courseId = transcript.relationships?.course?.data?.id;
            
            if (!courseId) continue;

            await query(
              `INSERT INTO lms_enrollments (id, user_id, course_id, status, progress_percent, enrolled_at, started_at, completed_at, expires_at, score, synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
               ON DUPLICATE KEY UPDATE
                 status = VALUES(status),
                 progress_percent = VALUES(progress_percent),
                 completed_at = VALUES(completed_at),
                 expires_at = VALUES(expires_at),
                 score = VALUES(score),
                 synced_at = NOW()`,
              [
                transcript.id,
                user.id,
                courseId,
                attrs.status || 'enrolled',
                attrs.progress_percent || 0,
                attrs.enrolled_at ? new Date(attrs.enrolled_at) : null,
                attrs.started_at ? new Date(attrs.started_at) : null,
                attrs.completed_at ? new Date(attrs.completed_at) : null,
                attrs.expires_at ? new Date(attrs.expires_at) : null,
                attrs.score || null
              ]
            );
            stats.processed++;
          }
        }

        if ((i + 1) % 50 === 0) {
          console.log(`  Processed ${i + 1}/${users.length} users`);
          onProgress && onProgress('enrollments', i + 1, users.length);
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        stats.failed++;
      }
    }

    console.log(`✅ Enrollments synced: ${stats.processed} records`);
  } catch (error) {
    console.error('❌ Enrollments sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Link contacts to LMS users by email (bulk operation)
 * Called after user sync for optimal performance
 */
async function linkContactsToLmsUsers() {
  console.log('🔗 Linking contacts to LMS users...');
  const startTime = Date.now();
  
  try {
    // Single efficient UPDATE with JOIN
    const result = await query(`
      UPDATE contacts c
      INNER JOIN lms_users u ON LOWER(c.email) = LOWER(u.email)
      SET c.lms_user_id = u.id
      WHERE c.lms_user_id IS NULL
    `);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Linked ${result.affectedRows} contacts to LMS users in ${duration}ms`);
    
    return { linked: result.affectedRows, duration };
  } catch (error) {
    console.error('❌ Contact linking failed:', error);
    return { linked: 0, error: error.message };
  }
}

/**
 * Run a full LMS sync
 */
async function runFullSync(onProgress) {
  console.log('🔄 Starting full LMS sync...');
  const startTime = Date.now();
  
  const logId = await createSyncLog('full');
  const results = {
    users: null,
    groups: null,
    groupMembers: null,
    courses: null,
    courseProperties: null,
    enrollments: null,
    contactsLinked: null
  };

  try {
    // Sync in order (users first, then things that depend on users)
    results.users = await syncUsers(logId, onProgress);
    results.groups = await syncGroups(logId, onProgress);
    results.groupMembers = await syncGroupMembers(logId, onProgress);
    results.courses = await syncCourses(logId, onProgress);
    results.courseProperties = await syncCourseProperties(logId, onProgress);
    results.enrollments = await syncEnrollments(logId, onProgress);
    
    // Link contacts to LMS users (fast bulk operation at end)
    results.contactsLinked = await linkContactsToLmsUsers();

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`✅ Full sync completed in ${duration}s`);

    await updateSyncLog(logId, 'completed', {
      processed: Object.values(results).reduce((sum, r) => sum + (r?.processed || r?.linked || 0), 0),
      details: results
    });

    return { success: true, logId, results, duration };
  } catch (error) {
    console.error('❌ Full sync failed:', error);
    await updateSyncLog(logId, 'failed', { details: results }, error.message);
    return { success: false, logId, error: error.message, results };
  }
}

/**
 * Get the last sync status
 */
async function getLastSyncStatus() {
  const rows = await query(
    'SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 1'
  );
  return rows[0] || null;
}

/**
 * Get sync history
 */
async function getSyncHistory(limit = 10) {
  return await query(
    'SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT ?',
    [limit]
  );
}

module.exports = {
  syncUsers,
  syncUsersIncremental,
  syncGroups,
  syncGroupsIncremental,
  syncGroupMembers,
  syncCourses,
  syncCoursesIncremental,
  syncCourseProperties,
  syncEnrollments,
  linkContactsToLmsUsers,
  runFullSync,
  getLastSyncStatus,
  getSyncHistory
};
