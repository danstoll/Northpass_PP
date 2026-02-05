/**
 * LMS Sync Service
 * Syncs data from Northpass LMS to the local MariaDB database
 */

const https = require('https');
const { query, transaction } = require('./connection.cjs');
const { getSyncContext } = require('./syncContext.cjs');

// Import WebSocket emitters (may not be available if run standalone)
let emitSyncProgress, emitSyncComplete, emitSyncError;
try {
  const server = require('../../server-with-proxy.cjs');
  emitSyncProgress = server.emitSyncProgress;
  emitSyncComplete = server.emitSyncComplete;
  emitSyncError = server.emitSyncError;
} catch (e) {
  // Running standalone, create no-op functions
  emitSyncProgress = () => {};
  emitSyncComplete = () => {};
  emitSyncError = () => {};
}

const NORTHPASS_API_URL = 'https://api.northpass.com';
const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';

/**
 * Custom error class for API failures
 */
class NorthpassApiError extends Error {
  constructor(message, statusCode, endpoint, details = null) {
    super(message);
    this.name = 'NorthpassApiError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.details = details;
    this.isApiError = true;
  }

  static fromResponse(response, endpoint) {
    const status = response.status;
    const errorDetail = response.data?.errors?.[0]?.detail || response.data?.error || response.error;
    
    let message;
    switch (status) {
      case 401:
        message = 'Northpass API authentication failed - check API key';
        break;
      case 403:
        message = 'Northpass API access forbidden - check permissions';
        break;
      case 404:
        message = `Northpass API endpoint not found: ${endpoint}`;
        break;
      case 429:
        message = 'Northpass API rate limit exceeded';
        break;
      case 500:
        message = 'Northpass API internal server error - API may be down';
        break;
      case 502:
      case 503:
      case 504:
        message = `Northpass API unavailable (${status}) - API may be down`;
        break;
      default:
        message = `Northpass API error (${status}): ${errorDetail || 'Unknown error'}`;
    }
    
    return new NorthpassApiError(message, status, endpoint, errorDetail);
  }
}

// Track consecutive API errors for health monitoring
let consecutiveApiErrors = 0;
let lastSuccessfulApiCall = null;
const MAX_CONSECUTIVE_ERRORS = 5;

/**
 * Check API health status
 */
function getApiHealthStatus() {
  return {
    consecutiveErrors: consecutiveApiErrors,
    lastSuccess: lastSuccessfulApiCall,
    isHealthy: consecutiveApiErrors < MAX_CONSECUTIVE_ERRORS,
    status: consecutiveApiErrors === 0 ? 'healthy' : 
            consecutiveApiErrors < MAX_CONSECUTIVE_ERRORS ? 'degraded' : 'unhealthy'
  };
}

/**
 * Reset API error counter after successful calls
 */
function resetApiErrorCounter() {
  consecutiveApiErrors = 0;
  lastSuccessfulApiCall = new Date().toISOString();
}

/**
 * Increment API error counter
 */
function incrementApiErrorCounter() {
  consecutiveApiErrors++;
  if (consecutiveApiErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.error(`🚨 CRITICAL: ${consecutiveApiErrors} consecutive Northpass API failures detected!`);
  }
}

/**
 * Make an API request to Northpass with enhanced error handling
 */
function northpassRequest(endpoint, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, NORTHPASS_API_URL);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      timeout: 30000, // 30 second timeout
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
          // Track successful vs failed responses
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resetApiErrorCounter();
          } else {
            incrementApiErrorCounter();
          }
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          incrementApiErrorCounter();
          resolve({ status: res.statusCode, data: null, error: 'JSON parse error', rawData: data?.substring(0, 500) });
        }
      });
    });

    req.on('timeout', () => {
      incrementApiErrorCounter();
      req.destroy();
      resolve({ status: 0, data: null, error: 'Request timeout (30s)' });
    });

    req.on('error', (err) => {
      incrementApiErrorCounter();
      resolve({ status: 0, data: null, error: err.message, networkError: true });
    });
    
    req.end();
  });
}

/**
 * Fetch all pages of a paginated endpoint
 * Northpass API uses links.next for pagination
 * @param {string} endpoint - API endpoint to fetch
 * @param {string} dataKey - Key to extract data from response
 * @param {Object} options - Additional options
 * @param {boolean} options.throwOnError - Whether to throw on API errors (default: true)
 * @param {boolean} options.allowPartialData - Whether to return partial data on mid-pagination errors (default: false)
 */
async function fetchAllPages(endpoint, dataKey = 'data', options = {}) {
  const { throwOnError = true, allowPartialData = false } = options;
  const allData = [];
  let currentUrl = endpoint.includes('?') 
    ? `${endpoint}&limit=100` 
    : `${endpoint}?limit=100`;
  let pageNum = 1;
  let apiError = null;

  while (currentUrl) {
    console.log(`  📄 Fetching page ${pageNum}...`);
    const response = await northpassRequest(currentUrl);
    
    if (response.status !== 200 || !response.data) {
      const errorDetails = {
        status: response.status,
        error: response.error,
        endpoint: currentUrl,
        page: pageNum,
        dataFetchedSoFar: allData.length
      };
      console.error(`❌ API error on page ${pageNum}:`, errorDetails);
      
      // Create proper error object
      apiError = NorthpassApiError.fromResponse(response, endpoint);
      
      if (throwOnError && !allowPartialData) {
        throw apiError;
      }
      
      // If allowing partial data, log warning and break
      if (allowPartialData && allData.length > 0) {
        console.warn(`⚠️ Returning partial data (${allData.length} records) due to API error`);
      }
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
    
    // Rate limiting delay - 125ms (8 req/sec, well under 10 req/sec limit)
    await new Promise(resolve => setTimeout(resolve, 125));
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
 * Update sync log with results and emit WebSocket event
 */
async function updateSyncLog(logId, status, stats, error = null, syncType = 'unknown') {
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
  
  // Emit WebSocket event for real-time updates
  if (status === 'completed') {
    emitSyncComplete(syncType, {
      logId,
      ...stats,
      timestamp: new Date().toISOString()
    });
  } else if (status === 'failed') {
    emitSyncError(syncType, error || 'Sync failed');
  }
}

/**
 * Find the "All Partners" group ID
 * Uses cached groups from sync context if available to avoid duplicate API calls
 */
async function findAllPartnerGroupId() {
  console.log('🔍 Looking for "All Partners" group...');
  
  // Check sync context cache first
  let groups;
  const ctx = getSyncContext();
  if (ctx) {
    groups = ctx.getGroups();
    if (groups) {
      console.log(`  📦 Using cached groups (${groups.length} groups from sync context)`);
    }
  }
  
  // Fallback to API if no cache
  if (!groups) {
    groups = await fetchAllPages('/v2/groups');
  }
  
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
 * @param {string} groupId - The group ID to fetch members for
 * @param {Object} options - Options
 * @param {boolean} options.throwOnError - Whether to throw on first API error (default: true)
 */
async function fetchGroupMemberIds(groupId, options = {}) {
  const { throwOnError = true } = options;
  console.log(`👥 Fetching member IDs from group ${groupId}...`);
  const allUserIds = [];
  let page = 1;
  let apiErrors = 0;
  
  while (true) {
    const response = await northpassRequest(`/v2/groups/${groupId}/memberships?page=${page}&limit=100`);
    
    if (response.status !== 200 || !response.data) {
      apiErrors++;
      const errorDetails = {
        status: response.status,
        error: response.error,
        groupId,
        page,
        usersFetchedSoFar: allUserIds.length
      };
      console.error(`❌ API error fetching memberships page ${page}:`, errorDetails);
      
      if (throwOnError) {
        throw NorthpassApiError.fromResponse(response, `/v2/groups/${groupId}/memberships`);
      }
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

    // Check if there are more pages (using links.next or page count)
    const hasNextPage = response.data.links?.next ? true : false;
    if (!hasNextPage) break;

    page++;
    if (page > 100) {
      console.warn('⚠️ Stopped after 100 pages');
      break;
    }

    // Rate limiting
    // Rate limiting delay - 125ms (optimized from 200ms)
    await new Promise(resolve => setTimeout(resolve, 125));
  }
  
  console.log(`📥 Found ${allUserIds.length} member IDs in group${apiErrors > 0 ? ` (${apiErrors} API errors)` : ''}`);
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

    // Mark users not in Northpass as deleted (they exist in our DB but weren't returned by API)
    // This catches users who were completely removed from Northpass
    const lmsUserIds = users.map(u => u.id);
    if (lmsUserIds.length > 0) {
      const deletedResult = await query(`
        UPDATE lms_users
        SET status = 'deleted', synced_at = NOW()
        WHERE id NOT IN (${lmsUserIds.map(() => '?').join(',')})
          AND status != 'deleted'
      `, lmsUserIds);

      stats.deleted = deletedResult.affectedRows || 0;
      if (stats.deleted > 0) {
        console.log(`🗑️ Marked ${stats.deleted} users as deleted (no longer in Northpass)`);
      }
    }

    console.log(`✅ Users synced: ${stats.processed} processed, ${stats.deleted || 0} deleted, ${stats.failed} failed`);
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
 * Returns detailed change tracking
 */
async function syncUsersIncremental(logId, onProgress) {
  console.log('👥 Syncing LMS users (INCREMENTAL mode)...');
  const stats = { 
    processed: 0, created: 0, updated: 0, failed: 0, skipped: 0, mode: 'incremental',
    details: { newUsers: [], updatedUsers: [], failedUsers: [] }
  };
  const BATCH_SIZE = 100;
  const MAX_DETAILS = 50; // Limit detail tracking to avoid huge logs

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

    // Get existing user IDs to determine new vs updated
    const userIds = users.map(u => u.id);
    const existingUsersResult = await query(
      `SELECT id FROM lms_users WHERE id IN (${userIds.map(() => '?').join(',')})`,
      userIds
    );
    const existingUsers = Array.isArray(existingUsersResult) ? existingUsersResult : [];
    const existingUserIds = new Set(existingUsers.map(u => u.id));

    // Get total user count for context
    const totalCount = await query('SELECT COUNT(*) as count FROM lms_users');
    stats.skipped = (totalCount[0]?.count || 0);

    // Process in batches for better performance
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      
      try {
        // Track new vs updated for this batch
        for (const user of batch) {
          const attrs = user.attributes || {};
          const isNew = !existingUserIds.has(user.id);
          const userInfo = {
            id: user.id,
            email: attrs.email || '',
            name: `${attrs.first_name || ''} ${attrs.last_name || ''}`.trim()
          };
          
          if (isNew) {
            stats.created++;
            if (stats.details.newUsers.length < MAX_DETAILS) {
              stats.details.newUsers.push(userInfo);
            }
          } else {
            stats.updated++;
            if (stats.details.updatedUsers.length < MAX_DETAILS) {
              stats.details.updatedUsers.push(userInfo);
            }
          }
        }

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
            if (stats.details.failedUsers.length < MAX_DETAILS) {
              stats.details.failedUsers.push({ id: user.id, error: err.message });
            }
            console.error(`  Failed to sync user ${user.id}:`, err.message);
          }
        }
      }
    }

    console.log(`✅ Users synced (incremental): ${stats.created} new, ${stats.updated} updated, ${stats.skipped} unchanged, ${stats.failed} failed`);
  } catch (error) {
    console.error('❌ User sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Sync LMS groups - only partner groups (ptr_ prefix or matched to partner)
 * Returns detailed change tracking
 */
async function syncGroups(logId, onProgress) {
  console.log('📁 Syncing LMS groups (partner groups only)...');
  const stats = { 
    processed: 0, created: 0, updated: 0, failed: 0, skipped: 0,
    details: { newGroups: [], updatedGroups: [], matchedPartners: [], failedGroups: [] }
  };
  const MAX_DETAILS = 50;

  try {
    const groups = await fetchAllPages('/v2/groups');
    console.log(`📥 Fetched ${groups.length} groups from LMS`);

    // Filter to partner groups PLUS the "All Partners" group (needed for partner-only training access)
    const partnerGroups = groups.filter(g => {
      const name = (g.attributes?.name || '').toLowerCase();
      // Skip "All Users" group - not relevant for partner portal
      if (name === 'all users') return false;
      // Always include "All Partners" group - it's needed for partner access control
      if (name === 'all partners') return true;
      // Include groups with ptr_ prefix, or exclude system groups
      return name.startsWith('ptr_') || 
             (!name.includes('admin') && 
              !name.includes('internal') &&
              !name.includes('test'));
    });
    console.log(`📋 Filtering to ${partnerGroups.length} partner groups (including All Partners)`);

    // Get existing group IDs
    const groupIds = partnerGroups.map(g => g.id);
    let existingGroups = [];
    if (groupIds.length > 0) {
      const result = await query(
        `SELECT id FROM lms_groups WHERE id IN (${groupIds.map(() => '?').join(',')})`,
        groupIds
      );
      existingGroups = Array.isArray(result) ? result : [];
    }
    const existingGroupIds = new Set(existingGroups.map(g => g.id));

    for (const group of partnerGroups) {
      try {
        const attrs = group.attributes || {};
        const isNew = !existingGroupIds.has(group.id);
        const groupInfo = {
          id: group.id,
          name: attrs.name || '',
          userCount: attrs.user_count || 0
        };
        
        // Match to partner by name (with or without ptr_ prefix)
        const cleanName = attrs.name?.replace(/^ptr_/, '');
        const partnerMatch = await query(
          `SELECT id, account_name FROM partners WHERE account_name = ? OR account_name = ?`,
          [attrs.name, cleanName]
        );
        const partnerId = partnerMatch[0]?.id || null;
        
        // Track matched partners
        if (partnerId && stats.details.matchedPartners.length < MAX_DETAILS) {
          stats.details.matchedPartners.push({
            groupName: attrs.name,
            partnerName: partnerMatch[0].account_name
          });
        }

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
        if (isNew) {
          stats.created++;
          if (stats.details.newGroups.length < MAX_DETAILS) {
            stats.details.newGroups.push(groupInfo);
          }
        } else {
          stats.updated++;
          if (stats.details.updatedGroups.length < MAX_DETAILS) {
            stats.details.updatedGroups.push(groupInfo);
          }
        }
        
        if (stats.processed % 50 === 0) {
          onProgress && onProgress('groups', stats.processed, partnerGroups.length);
        }
      } catch (error) {
        stats.failed++;
        if (stats.details.failedGroups.length < MAX_DETAILS) {
          stats.details.failedGroups.push({ id: group.id, error: error.message });
        }
        console.error(`  Failed to sync group ${group.id}:`, error.message);
      }
    }

    stats.skipped = groups.length - partnerGroups.length;
    console.log(`✅ Groups synced: ${stats.created} new, ${stats.updated} updated, ${stats.skipped} skipped (non-partner), ${stats.failed} failed`);
    
    // Cache groups in sync context for other operations
    const ctx = getSyncContext();
    if (ctx) {
      ctx.setGroups(groups);
      console.log(`  📦 Cached ${groups.length} groups in sync context`);
    }
  } catch (error) {
    console.error('❌ Group sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Sync LMS groups - INCREMENTAL mode
 * Only fetches groups updated since the last successful sync
 * Returns detailed change tracking
 */
async function syncGroupsIncremental(logId, onProgress) {
  console.log('📁 Syncing LMS groups (INCREMENTAL mode)...');
  const stats = { 
    processed: 0, created: 0, updated: 0, failed: 0, skipped: 0, mode: 'incremental',
    details: { newGroups: [], updatedGroups: [], matchedPartners: [], failedGroups: [] }
  };
  const MAX_DETAILS = 50;

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
      // Skip "All Users" group - not relevant for partner portal
      if (name === 'all users') return false;
      if (name === 'all partners') return true;
      return name.startsWith('ptr_') || 
             (!name.includes('admin') && 
              !name.includes('internal') &&
              !name.includes('test'));
    });
    console.log(`📋 Processing ${partnerGroups.length} partner groups`);

    // Get existing group IDs
    const groupIds = partnerGroups.map(g => g.id);
    let existingGroups = [];
    if (groupIds.length > 0) {
      const result = await query(
        `SELECT id FROM lms_groups WHERE id IN (${groupIds.map(() => '?').join(',')})`,
        groupIds
      );
      existingGroups = Array.isArray(result) ? result : [];
    }
    const existingGroupIds = new Set(existingGroups.map(g => g.id));

    for (const group of partnerGroups) {
      try {
        const attrs = group.attributes || {};
        const isNew = !existingGroupIds.has(group.id);
        const groupInfo = {
          id: group.id,
          name: attrs.name || '',
          userCount: attrs.user_count || 0
        };
        
        const cleanName = attrs.name?.replace(/^ptr_/, '');
        const partnerMatch = await query(
          `SELECT id, account_name FROM partners WHERE account_name = ? OR account_name = ?`,
          [attrs.name, cleanName]
        );
        const partnerId = partnerMatch[0]?.id || null;
        
        if (partnerId && stats.details.matchedPartners.length < MAX_DETAILS) {
          stats.details.matchedPartners.push({
            groupName: attrs.name,
            partnerName: partnerMatch[0].account_name
          });
        }

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
        if (isNew) {
          stats.created++;
          if (stats.details.newGroups.length < MAX_DETAILS) {
            stats.details.newGroups.push(groupInfo);
          }
        } else {
          stats.updated++;
          if (stats.details.updatedGroups.length < MAX_DETAILS) {
            stats.details.updatedGroups.push(groupInfo);
          }
        }
        
        if (stats.processed % 50 === 0) {
          onProgress && onProgress('groups', stats.processed, partnerGroups.length);
        }
      } catch (error) {
        stats.failed++;
        if (stats.details.failedGroups.length < MAX_DETAILS) {
          stats.details.failedGroups.push({ id: group.id, error: error.message });
        }
        console.error(`  Failed to sync group ${group.id}:`, error.message);
      }
    }

    stats.skipped = groups.length - partnerGroups.length;
    console.log(`✅ Groups synced (incremental): ${stats.created} new, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.failed} failed`);
    
    // Cache groups in sync context for other operations
    const ctx = getSyncContext();
    if (ctx) {
      ctx.setGroups(groups);
      console.log(`  📦 Cached ${groups.length} groups in sync context`);
    }
  } catch (error) {
    console.error('❌ Group sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Log a sync failure to the database for tracking
 */
async function logSyncFailure(syncType, entityType, entityId, entityName, reason, httpStatus = null, errorDetails = null) {
  try {
    await query(`
      INSERT INTO sync_failures (sync_type, entity_type, entity_id, entity_name, failure_reason, http_status, error_details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [syncType, entityType, entityId, entityName, reason, httpStatus, errorDetails]);
  } catch (err) {
    // Table might not exist yet, just log to console
    console.error(`  Could not log sync failure: ${err.message}`);
  }
}

/**
 * Mark a group as deleted/inactive (soft delete)
 */
async function softDeleteGroup(groupId, groupName, reason) {
  try {
    await query(`
      UPDATE lms_groups 
      SET is_active = FALSE, 
          deleted_at = NOW(), 
          deletion_reason = ?,
          last_api_check = NOW()
      WHERE id = ?
    `, [reason, groupId]);
    console.log(`  ⚠️ Soft-deleted group "${groupName}" (${groupId}): ${reason}`);
    return true;
  } catch (err) {
    console.error(`  Failed to soft-delete group ${groupId}: ${err.message}`);
    return false;
  }
}

/**
 * Sync group memberships - OPTIMIZED with cache and count comparison
 * Only syncs groups where member count has changed
 * Uses cached group data from syncContext to avoid API calls when possible
 * Now tracks which groups fail and why, with soft-delete support
 */
async function syncGroupMembers(logId, onProgress) {
  console.log('👥 Syncing group memberships (smart mode)...');
  const stats = { 
    processed: 0, 
    created: 0, 
    updated: 0, 
    failed: 0, 
    skipped: 0, 
    unchanged: 0,
    softDeleted: 0,
    cacheUsed: false,
    apiCallsSaved: 0,
    failedGroups: [] // Track which groups failed and why
  };

  try {
    // Only sync ACTIVE partner groups (those linked to partners) + the special "All Partners" group
    const dbGroups = await query(`
      SELECT g.id, g.name, g.user_count as stored_count, g.partner_id, g.last_checked_at, g.synced_at 
      FROM lms_groups g
      WHERE (g.partner_id IS NOT NULL OR LOWER(g.name) = 'all partners')
        AND (g.is_active = TRUE OR g.is_active IS NULL)
      ORDER BY g.name
    `);
    console.log(`📥 Found ${dbGroups.length} active partner groups to check...`);

    // OPTIMIZATION: Check if we have cached groups from sync context
    let groupsToSync = [];
    const ctx = getSyncContext();
    const cachedGroups = ctx ? ctx.getGroups() : null;
    
    if (cachedGroups && cachedGroups.length > 0) {
      // Use cached data - no API calls needed for count checking!
      console.log(`  📦 Using cached group data (${cachedGroups.length} groups) - skipping ${dbGroups.length} API calls`);
      stats.cacheUsed = true;
      stats.apiCallsSaved = dbGroups.length;
      
      // Build map of cached groups by ID
      const cachedGroupMap = new Map(cachedGroups.map(g => [g.id, g]));
      
      for (const dbGroup of dbGroups) {
        const cached = cachedGroupMap.get(dbGroup.id);
        if (cached) {
          const apiCount = cached.attributes?.user_count || 0;
          const storedCount = dbGroup.stored_count || 0;
          
          if (apiCount !== storedCount) {
            groupsToSync.push({ ...dbGroup, api_count: apiCount });
          } else {
            stats.unchanged++;
          }
        } else {
          // Group not in cache - might be new or deleted, skip for now
          stats.skipped++;
        }
      }
    } else {
      // Fallback to API-based checking (original behavior)
      console.log(`  📡 No cached data available - checking via API...`);
      const CONCURRENT_LIMIT = 10; // Max parallel API requests

      // Helper function to check a single group
      async function checkGroupCount(group) {
        try {
          const response = await fetch(`https://api.northpass.com/v2/groups/${group.id}`, {
            headers: {
              'X-Api-Key': process.env.NORTHPASS_API_KEY || 'wcU0QRpN9jnPvXEc5KXMiuVWk',
              'Content-Type': 'application/json'
            }
          });

          // Update last_api_check timestamp
          await query('UPDATE lms_groups SET last_api_check = NOW() WHERE id = ?', [group.id]);

          if (!response.ok) {
            const statusCode = response.status;
            let reason;

            if (statusCode === 404) {
              reason = 'Group not found in LMS (deleted)';
              await softDeleteGroup(group.id, group.name, reason);
              return { type: 'softDeleted', group };
            } else if (statusCode === 403) {
              reason = 'Access denied (permissions issue)';
            } else if (statusCode === 429) {
              reason = 'Rate limited';
            } else {
              reason = `HTTP ${statusCode}`;
            }

            await logSyncFailure('group_members', 'group', group.id, group.name, reason, statusCode);
            return { type: 'failed', group, reason, status: statusCode };
          }

          const data = await response.json();
          const apiCount = data.data?.attributes?.user_count || 0;
          const storedCount = group.stored_count || 0;

          if (apiCount !== storedCount) {
            return { type: 'needsSync', group: { ...group, api_count: apiCount } };
          } else {
            return { type: 'unchanged', group };
          }
        } catch (e) {
          await logSyncFailure('group_members', 'group', group.id, group.name, `Exception: ${e.message}`);
          return { type: 'error', group, reason: e.message };
        }
      }

      // Process groups in parallel batches
      for (let i = 0; i < dbGroups.length; i += CONCURRENT_LIMIT) {
        const batch = dbGroups.slice(i, i + CONCURRENT_LIMIT);
        const promises = batch.map(group => checkGroupCount(group));
        const results = await Promise.all(promises);

        // Process results from this batch
        for (const result of results) {
          switch (result.type) {
            case 'needsSync':
              groupsToSync.push(result.group);
              break;
            case 'unchanged':
              stats.unchanged++;
              break;
            case 'softDeleted':
              stats.softDeleted++;
              break;
            case 'failed':
              stats.failedGroups.push({ id: result.group.id, name: result.group.name, reason: result.reason, status: result.status });
              stats.failed++;
              break;
            case 'error':
              stats.failedGroups.push({ id: result.group.id, name: result.group.name, reason: result.reason, status: null });
              groupsToSync.push(result.group); // Try to sync anyway on network errors
              break;
          }
        }

        if (i + CONCURRENT_LIMIT < dbGroups.length) {
          console.log(`  Checked ${Math.min(i + CONCURRENT_LIMIT, dbGroups.length)}/${dbGroups.length} groups for changes...`);
          // Small delay between batches to be respectful of rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    
    console.log(`📊 Found ${groupsToSync.length} groups with membership changes (${stats.unchanged} unchanged, ${stats.softDeleted} soft-deleted${stats.cacheUsed ? ', used cache' : ''})`);
    
    // Log summary of failures if any
    if (stats.failedGroups.length > 0) {
      console.log(`⚠️ ${stats.failedGroups.length} groups had API errors:`);
      // Show first 10 failures
      stats.failedGroups.slice(0, 10).forEach(g => {
        console.log(`   - ${g.name}: ${g.reason}`);
      });
      if (stats.failedGroups.length > 10) {
        console.log(`   ... and ${stats.failedGroups.length - 10} more (see sync_failures table)`);
      }
    }
    
    // Now sync only the groups that need updating
    for (let i = 0; i < groupsToSync.length; i++) {
      const group = groupsToSync[i];
      try {
        // Fetch memberships for this group
        const memberships = await fetchAllPages(`/v2/groups/${group.id}/memberships`);
        
        // Get existing memberships to preserve added_at timestamps
        const existingMembers = await query(
          'SELECT user_id, added_at FROM lms_group_members WHERE group_id = ?',
          [group.id]
        );
        const existingMap = new Map(existingMembers.map(m => [m.user_id, m.added_at]));
        
        // Clear existing memberships for this group
        await query('DELETE FROM lms_group_members WHERE group_id = ?', [group.id]);

        // Insert new memberships
        let memberCount = 0;
        for (const membership of memberships) {
          try {
            const userId = membership.relationships?.person?.data?.id;
            if (userId) {
              const originalAddedAt = existingMap.get(userId);
              if (originalAddedAt) {
                await query(
                  `INSERT IGNORE INTO lms_group_members (group_id, user_id, added_at) VALUES (?, ?, ?)`,
                  [group.id, userId, originalAddedAt]
                );
              } else {
                await query(
                  `INSERT IGNORE INTO lms_group_members (group_id, user_id, added_at) VALUES (?, ?, NOW())`,
                  [group.id, userId]
                );
                stats.created++;
              }
              memberCount++;
              stats.processed++;
            }
          } catch (e) {
            // Ignore foreign key errors
          }
        }

        // Update user count, last_checked_at, and mark as active (in case it was previously soft-deleted)
        await query(
          'UPDATE lms_groups SET user_count = ?, last_checked_at = NOW(), is_active = TRUE, deleted_at = NULL, deletion_reason = NULL WHERE id = ?',
          [memberCount, group.id]
        );
        stats.updated++;

        if ((i + 1) % 10 === 0 || i === groupsToSync.length - 1) {
          console.log(`  Synced ${i + 1}/${groupsToSync.length} changed groups`);
          onProgress && onProgress('group_members', i + 1, groupsToSync.length);
        }

        // Rate limit (optimized from 300ms)
        await new Promise(resolve => setTimeout(resolve, 125));
      } catch (error) {
        stats.failed++;
        console.error(`  Failed to sync members for group ${group.name}:`, error.message);
      }
    }

    const cacheMsg = stats.cacheUsed ? `, saved ${stats.apiCallsSaved} API calls` : '';
    console.log(`✅ Group memberships synced: ${stats.processed} memberships, ${stats.updated} groups updated, ${stats.unchanged} unchanged${cacheMsg}`);
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
 * Returns detailed change tracking
 */
async function syncCoursesIncremental(logId, onProgress) {
  console.log('📚 Syncing LMS courses (INCREMENTAL mode)...');
  const stats = { 
    processed: 0, created: 0, updated: 0, failed: 0, skipped: 0, mode: 'incremental',
    details: { newCourses: [], updatedCourses: [], failedCourses: [] }
  };
  const MAX_DETAILS = 50;

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

    // Get existing course IDs to determine new vs updated
    const courseIds = courses.map(c => c.id);
    const existingCourses = await query(
      `SELECT id FROM lms_courses WHERE id IN (${courseIds.map(() => '?').join(',')})`,
      courseIds
    );
    const existingCourseIds = new Set(existingCourses.map(c => c.id));

    // Get total count for context
    const totalCount = await query('SELECT COUNT(*) as count FROM lms_courses');
    stats.skipped = (totalCount[0]?.count || 0);

    for (const course of courses) {
      try {
        const attrs = course.attributes || {};
        const isNew = !existingCourseIds.has(course.id);
        const courseInfo = {
          id: course.id,
          name: attrs.name || attrs.title || ''
        };
        
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
        if (isNew) {
          stats.created++;
          if (stats.details.newCourses.length < MAX_DETAILS) {
            stats.details.newCourses.push(courseInfo);
          }
        } else {
          stats.updated++;
          if (stats.details.updatedCourses.length < MAX_DETAILS) {
            stats.details.updatedCourses.push(courseInfo);
          }
        }
      } catch (error) {
        stats.failed++;
        if (stats.details.failedCourses.length < MAX_DETAILS) {
          stats.details.failedCourses.push({ id: course.id, error: error.message });
        }
        console.error(`  Failed to sync course ${course.id}:`, error.message);
      }
    }

    console.log(`✅ Courses synced (incremental): ${stats.created} new, ${stats.updated} updated, ${stats.failed} failed`);
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

    // Get existing courses to track which ones need to be created
    const existingCourses = await query('SELECT id FROM lms_courses');
    const existingCourseIds = new Set(existingCourses.map(c => c.id));
    console.log(`📚 Found ${existingCourseIds.size} courses in database`);

    // Process each course
    let certificationCount = 0;
    let coursesCreated = 0;
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

        // If course doesn't exist in lms_courses, create it only if it has NPCU value
        // (These are typically older "v1" versions of certifications)
        if (!existingCourseIds.has(courseId)) {
          if (npcuValue > 0) {
            // Create the course record for NPCU-valued courses
            const courseName = properties.name || `Unknown Course (${courseId})`;
            await query(
              `INSERT INTO lms_courses (id, name, description, status, npcu_value, is_certification, synced_at)
               VALUES (?, ?, ?, 'archived', ?, TRUE, NOW())
               ON DUPLICATE KEY UPDATE
                 name = VALUES(name),
                 npcu_value = VALUES(npcu_value),
                 is_certification = TRUE,
                 synced_at = NOW()`,
              [courseId, courseName, 'Archived certification (from properties API)', npcuValue]
            );
            coursesCreated++;
            console.log(`  📝 Created archived course: ${courseName} (NPCU=${npcuValue})`);
          } else {
            // Skip non-NPCU courses that don't exist - these are old artifacts
            stats.skipped++;
            continue;
          }
        } else {
          // Update existing course record with NPCU value
          await query(
            `UPDATE lms_courses SET
               npcu_value = ?,
               is_certification = ?,
               synced_at = NOW()
             WHERE id = ?`,
            [npcuValue, npcuValue > 0, courseId]
          );
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

        stats.processed++;
        stats.updated++;
      } catch (error) {
        stats.failed++;
        console.error(`  Failed to process course ${item.id}:`, error.message);
      }
    }

    stats.created = coursesCreated;

    console.log(`✅ Course properties synced: ${stats.processed} processed, ${certificationCount} with NPCU > 0, ${coursesCreated} archived courses created, ${stats.failed} failed`);
  } catch (error) {
    console.error('❌ Course properties sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Fetch ALL transcripts for a user (with pagination)
 * The transcripts API returns paginated results - we must iterate through all pages
 * to get the complete enrollment history for users with many courses
 * @param {string} userId - The LMS user ID
 * @returns {Object} { transcripts: Array, error: Object|null, pages: number }
 */
async function fetchAllUserTranscripts(userId) {
  const allTranscripts = [];
  let page = 1;
  let hasMore = true;
  let lastError = null;

  while (hasMore && page <= 20) { // Safety limit: 20 pages = ~2000 transcripts max
    const response = await northpassRequest(`/v2/transcripts/${userId}?page=${page}&limit=100`);

    if (response.status !== 200) {
      lastError = {
        status: response.status,
        error: response.error || `HTTP ${response.status}`,
        page
      };
      // If first page fails, return error
      if (page === 1) {
        return { transcripts: [], error: lastError, pages: 0 };
      }
      // If subsequent page fails, return what we have
      console.warn(`  ⚠️ Transcript fetch failed on page ${page}, returning ${allTranscripts.length} records`);
      break;
    }

    const pageData = response.data?.data || [];
    if (pageData.length === 0) {
      hasMore = false;
    } else {
      allTranscripts.push(...pageData);
      // Check for next page
      hasMore = response.data?.links?.next ? true : false;
      page++;
    }

    // Rate limit between pages
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return {
    transcripts: allTranscripts,
    error: lastError,
    pages: page - 1
  };
}

/**
 * Sync enrollments for partner users only
 * Only syncs for users who are in partner groups or linked via contacts
 * This avoids syncing data for non-partner users (customers, internal users)
 */
async function syncEnrollments(logId, onProgress) {
  console.log('📊 Syncing enrollments for partner users...');
  const stats = { 
    processed: 0, 
    created: 0, 
    updated: 0, 
    failed: 0, 
    skipped: 0,
    apiErrors: 0,
    details: { errors: [] }
  };

  try {
    // Get only partner users - users in partner groups OR linked via contacts
    const users = await query(`
      SELECT DISTINCT u.id, u.email 
      FROM lms_users u
      WHERE u.status = 'active'
      AND (
        -- User is linked via contacts table to a partner
        EXISTS (
          SELECT 1 FROM contacts ct 
          WHERE ct.lms_user_id = u.id AND ct.partner_id IS NOT NULL
        )
        OR
        -- User is in a group that's linked to a partner
        EXISTS (
          SELECT 1 FROM lms_group_members gm
          INNER JOIN lms_groups g ON g.id = gm.group_id
          WHERE gm.user_id = u.id AND g.partner_id IS NOT NULL
        )
      )
    `);
    
    // Log how many were skipped
    const [totalActive] = await query('SELECT COUNT(*) as count FROM lms_users WHERE status = "active"');
    stats.skipped = totalActive.count - users.length;
    console.log(`📥 Syncing enrollments for ${users.length} partner users (skipped ${stats.skipped} non-partner users)`);

    // Check API health before starting
    const apiHealth = getApiHealthStatus();
    if (!apiHealth.isHealthy) {
      console.error(`🚨 API health check failed: ${apiHealth.consecutiveErrors} consecutive errors`);
      throw new NorthpassApiError(
        `Northpass API appears to be down (${apiHealth.consecutiveErrors} consecutive failures)`,
        0, '/v2/transcripts', null
      );
    }

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      try {
        // Fetch ALL transcripts for this user (with pagination)
        const { transcripts, error: fetchError, pages } = await fetchAllUserTranscripts(user.id);

        // Check for API errors
        if (fetchError && transcripts.length === 0) {
          stats.apiErrors++;
          const errorInfo = {
            userId: user.id,
            email: user.email,
            status: fetchError.status,
            error: fetchError.error
          };

          // Log first few errors in details
          if (stats.details.errors.length < 10) {
            stats.details.errors.push(errorInfo);
          }

          // If getting many consecutive API errors, abort
          if (stats.apiErrors >= 10 && stats.apiErrors > stats.processed) {
            console.error(`🚨 Too many API errors (${stats.apiErrors}), aborting sync`);
            stats.details.abortReason = 'Too many consecutive API errors';
            throw new NorthpassApiError(
              `Too many API errors: ${fetchError.error}`,
              fetchError.status,
              `/v2/transcripts/${user.id}`
            );
          }

          stats.failed++;
          continue;
        }

        // Process all transcripts
        for (const transcript of transcripts) {
          const attrs = transcript.attributes || {};
          // resource_id contains the course ID, resource_type indicates if it's a course
          const courseId = attrs.resource_id;
          const resourceType = attrs.resource_type;

          // Only process course enrollments (skip learning_path, event, etc.)
          if (!courseId || resourceType !== 'course') continue;

          // Derive progress percent from progress_status
          const progressStatus = attrs.progress_status || 'enrolled';
          const progressPercent = progressStatus === 'completed' ? 100 :
                                  progressStatus === 'in_progress' ? 50 : 0;

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
              progressStatus,
              progressPercent,
              attrs.enrolled_at ? new Date(attrs.enrolled_at) : null,
              attrs.started_at ? new Date(attrs.started_at) : null,
              attrs.completed_at ? new Date(attrs.completed_at) : null,
              attrs.expires_at ? new Date(attrs.expires_at) : null,
              attrs.score || null
            ]
          );
          stats.processed++;
        }

        if ((i + 1) % 50 === 0) {
          console.log(`  Processed ${i + 1}/${users.length} users (${stats.apiErrors} API errors)`);
          onProgress && onProgress('enrollments', i + 1, users.length);
        }

        // Rate limit between users (optimized from 150ms)
        await new Promise(resolve => setTimeout(resolve, 125));
      } catch (error) {
        stats.failed++;
        // Track if it's an API error vs DB error
        if (error.isApiError) {
          stats.apiErrors++;
        }
      }
    }

    // Log summary with API error count
    if (stats.apiErrors > 0) {
      console.warn(`⚠️ Enrollments synced with ${stats.apiErrors} API errors: ${stats.processed} records`);
      stats.details.warning = `${stats.apiErrors} API errors encountered`;
    } else {
      console.log(`✅ Enrollments synced: ${stats.processed} records`);
    }
  } catch (error) {
    console.error('❌ Enrollments sync failed:', error.message || error);
    stats.details.fatalError = error.message || 'Unknown error';
    throw error;
  }

  return stats;
}

/**
 * Sync enrollments INCREMENTALLY for partner users
 * Only syncs users who:
 * 1. Have never had enrollments synced (no enrollment_synced_at)
 * 2. Were updated in LMS since their last enrollment sync
 * 3. Haven't been synced in the past X days (configurable, default 7)
 * 
 * This reduces API calls from ~4500 (all partner users) to typically <500
 */
async function syncEnrollmentsIncremental(logId, onProgress, options = {}) {
  const maxAgeDays = options.maxAgeDays || 7; // Re-sync users not synced in 7 days
  console.log(`📊 Syncing enrollments INCREMENTALLY (max age: ${maxAgeDays} days)...`);
  const stats = {
    processed: 0, created: 0, updated: 0, failed: 0, skipped: 0,
    mode: 'incremental',
    usersChecked: 0,
    newUsers: 0,
    updatedUsers: 0,
    staleUsers: 0,
    apiErrors: 0,
    usersNotFound: 0, // Users that no longer exist in LMS (404s)
    dbErrors: 0, // Database errors
    details: { errors: [] }
  };

  try {
    // Get last successful enrollment sync time
    const lastSyncTime = await getLastSyncTime('enrollments');
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - maxAgeDays);
    
    // Get partner users who need enrollment sync:
    // 1. Never synced (enrollment_synced_at IS NULL)
    // 2. Had activity since last enrollment sync (last_active_at)
    // 3. Enrollment sync is stale (older than maxAgeDays)
    // 4. NEW: Added to a partner group since last enrollment sync
    const users = await query(`
      SELECT DISTINCT u.id, u.email, u.last_active_at, u.enrollment_synced_at,
        CASE 
          WHEN u.enrollment_synced_at IS NULL THEN 'new'
          WHEN u.last_active_at > u.enrollment_synced_at THEN 'updated'
          WHEN EXISTS (
            SELECT 1 FROM lms_group_members gm
            INNER JOIN lms_groups g ON g.id = gm.group_id
            WHERE gm.user_id = u.id 
              AND g.partner_id IS NOT NULL
              AND gm.added_at > u.enrollment_synced_at
          ) THEN 'new_group_member'
          WHEN u.enrollment_synced_at < ? THEN 'stale'
          ELSE 'skip'
        END as sync_reason
      FROM lms_users u
      WHERE u.status = 'active'
      AND (
        -- User is linked via contacts table to a partner
        EXISTS (
          SELECT 1 FROM contacts ct 
          WHERE ct.lms_user_id = u.id AND ct.partner_id IS NOT NULL
        )
        OR
        -- User is in a group that's linked to a partner
        EXISTS (
          SELECT 1 FROM lms_group_members gm
          INNER JOIN lms_groups g ON g.id = gm.group_id
          WHERE gm.user_id = u.id AND g.partner_id IS NOT NULL
        )
      )
      AND (
        u.enrollment_synced_at IS NULL
        OR u.last_active_at > u.enrollment_synced_at
        OR u.enrollment_synced_at < ?
        OR EXISTS (
          SELECT 1 FROM lms_group_members gm
          INNER JOIN lms_groups g ON g.id = gm.group_id
          WHERE gm.user_id = u.id 
            AND g.partner_id IS NOT NULL
            AND gm.added_at > u.enrollment_synced_at
        )
      )
    `, [staleDate, staleDate]);
    
    // Count reasons
    let newGroupMembers = 0;
    for (const u of users) {
      if (u.sync_reason === 'new') stats.newUsers++;
      else if (u.sync_reason === 'updated') stats.updatedUsers++;
      else if (u.sync_reason === 'new_group_member') newGroupMembers++;
      else if (u.sync_reason === 'stale') stats.staleUsers++;
    }
    
    // Get total partner users for context
    const [totalPartnerUsers] = await query(`
      SELECT COUNT(DISTINCT u.id) as count
      FROM lms_users u
      WHERE u.status = 'active'
      AND (
        EXISTS (SELECT 1 FROM contacts ct WHERE ct.lms_user_id = u.id AND ct.partner_id IS NOT NULL)
        OR EXISTS (
          SELECT 1 FROM lms_group_members gm
          INNER JOIN lms_groups g ON g.id = gm.group_id
          WHERE gm.user_id = u.id AND g.partner_id IS NOT NULL
        )
      )
    `);
    
    stats.skipped = totalPartnerUsers.count - users.length;
    stats.usersChecked = users.length;
    
    console.log(`📥 Found ${users.length} users needing enrollment sync:`);
    console.log(`   - ${stats.newUsers} new (never synced)`);
    console.log(`   - ${stats.updatedUsers} updated (changed since last sync)`);
    console.log(`   - ${newGroupMembers} new group members (recently added to partner group)`);
    console.log(`   - ${stats.staleUsers} stale (not synced in ${maxAgeDays}+ days)`);
    console.log(`   - ${stats.skipped} skipped (up to date)`);

    if (users.length === 0) {
      console.log('✅ No users need enrollment sync');
      return stats;
    }

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      try {
        // Fetch ALL transcripts for this user (with pagination)
        const { transcripts, error: fetchError, pages } = await fetchAllUserTranscripts(user.id);

        // Check for API errors
        if (fetchError && transcripts.length === 0) {
          // Track 404s separately - these are users deleted from LMS (expected churn)
          if (fetchError.status === 404) {
            stats.usersNotFound++;
            // Mark user's enrollment as synced so we don't keep retrying
            await query('UPDATE lms_users SET enrollment_synced_at = NOW() WHERE id = ?', [user.id]);
          } else {
            // Real API errors (500s, 429s, etc.)
            stats.apiErrors++;
            const errorInfo = {
              userId: user.id,
              email: user.email,
              status: fetchError.status,
              error: fetchError.error
            };

            // Log first few errors in details
            if (stats.details.errors.length < 10) {
              stats.details.errors.push(errorInfo);
            }

            // If getting many consecutive real API errors, abort
            if (stats.apiErrors >= 10 && stats.apiErrors > stats.processed) {
              console.error(`🚨 Too many API errors (${stats.apiErrors}), aborting sync`);
              stats.details.abortReason = 'Too many consecutive API errors';
              throw new NorthpassApiError(
                `Too many API errors: ${fetchError.error}`,
                fetchError.status,
                `/v2/transcripts/${user.id}`
              );
            }
          }

          stats.failed++;
          continue;
        }

        // Process all transcripts (now properly paginated)
        for (const transcript of transcripts) {
          const attrs = transcript.attributes || {};
          // resource_id contains the course ID, resource_type indicates if it's a course
          const courseId = attrs.resource_id;
          const resourceType = attrs.resource_type;

          // Only process course enrollments (skip learning_path, event, etc.)
          if (!courseId || resourceType !== 'course') continue;

          // Derive progress percent from progress_status
          const progressStatus = attrs.progress_status || 'enrolled';
          const progressPercent = progressStatus === 'completed' ? 100 :
                                  progressStatus === 'in_progress' ? 50 : 0;

          const result = await query(
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
              progressStatus,
              progressPercent,
              attrs.enrolled_at ? new Date(attrs.enrolled_at) : null,
              attrs.started_at ? new Date(attrs.started_at) : null,
              attrs.completed_at ? new Date(attrs.completed_at) : null,
              attrs.expires_at ? new Date(attrs.expires_at) : null,
              attrs.score || null
            ]
          );

          if (result.insertId) stats.created++;
          else if (result.affectedRows > 0) stats.updated++;
          stats.processed++;
        }

        // Update user's enrollment_synced_at timestamp
        await query('UPDATE lms_users SET enrollment_synced_at = NOW() WHERE id = ?', [user.id]);

        if ((i + 1) % 50 === 0) {
          console.log(`  Processed ${i + 1}/${users.length} users (${stats.apiErrors} API errors)`);
          onProgress && onProgress('enrollments', i + 1, users.length);
        }

        // Rate limit between users (optimized from 150ms)
        await new Promise(resolve => setTimeout(resolve, 125));
      } catch (error) {
        stats.failed++;
        if (error.isApiError) {
          stats.apiErrors++;
        } else {
          // Database or other errors
          stats.dbErrors++;
          if (stats.details.errors.length < 10) {
            stats.details.errors.push({
              userId: user.id,
              email: user.email,
              error: error.message || 'Unknown error',
              type: 'db_error'
            });
          }
        }
      }
    }

    // Log detailed summary
    const summaryParts = [`${stats.processed} enrollments from ${users.length - stats.failed} users`];
    if (stats.usersNotFound > 0) summaryParts.push(`${stats.usersNotFound} users not found in LMS`);
    if (stats.apiErrors > 0) summaryParts.push(`${stats.apiErrors} API errors`);
    if (stats.dbErrors > 0) summaryParts.push(`${stats.dbErrors} DB errors`);

    if (stats.apiErrors > 0 || stats.dbErrors > 0) {
      console.warn(`⚠️ Enrollments synced (incremental): ${summaryParts.join(', ')}`);
      stats.details.warning = summaryParts.slice(1).join(', ');
    } else if (stats.usersNotFound > 0) {
      console.log(`✅ Enrollments synced (incremental): ${summaryParts.join(', ')}`);
      stats.details.info = `${stats.usersNotFound} users no longer exist in LMS (expected churn)`;
    } else {
      console.log(`✅ Enrollments synced (incremental): ${summaryParts[0]}`);
    }
  } catch (error) {
    console.error('❌ Incremental enrollments sync failed:', error.message || error);
    stats.details.fatalError = error.message || 'Unknown error';
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
  syncEnrollmentsIncremental,
  linkContactsToLmsUsers,
  runFullSync,
  getLastSyncStatus,
  getSyncHistory,
  // API health monitoring
  getApiHealthStatus,
  NorthpassApiError,
  // Low-level API function for external use
  northpassRequest,
  // Transcript fetching with pagination
  fetchAllUserTranscripts,
  // Sync failure tracking
  logSyncFailure,
  softDeleteGroup
};
