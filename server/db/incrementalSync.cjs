/**
 * Incremental Sync Service
 * Only syncs users who have logged in since the last sync (based on last_active_at)
 * This reduces API calls and bandwidth by targeting only active users
 */
const { getPool } = require('./connection.cjs');
const appConfig = require('../config.cjs');

const API_KEY = appConfig.northpass.apiKey;

// Convert ISO 8601 date to MySQL datetime format
function toMySQLDate(isoDate) {
  if (!isoDate) return null;
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return null;
  }
}

/**
 * Create a sync log entry in the database
 */
async function createSyncLog(conn, syncType, mode = 'incremental') {
  const [result] = await conn.query(
    `INSERT INTO sync_logs (sync_type, status, started_at, details) 
     VALUES (?, 'running', NOW(), ?)`,
    [syncType, JSON.stringify({ mode, version: '2.0' })]
  );
  return result.insertId;
}

/**
 * Update sync log with results
 */
async function updateSyncLog(conn, logId, status, stats, errorMessage = null) {
  await conn.query(
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
      errorMessage,
      JSON.stringify(stats.details || {}),
      logId
    ]
  );
}

/**
 * Fetch transcripts for a user from Northpass API
 */
async function fetchTranscripts(userId) {
  const url = `https://api.northpass.com/v2/transcripts/${userId}?limit=100`;
  try {
    const response = await fetch(url, { 
      headers: { 'X-Api-Key': API_KEY },
      timeout: 30000
    });
    if (!response.ok) {
      if (response.status === 429) {
        console.log('  Rate limited, waiting 10s...');
        await new Promise(r => setTimeout(r, 10000));
        return fetchTranscripts(userId);
      }
      return [];
    }
    const data = await response.json();
    return data.data || [];
  } catch (err) {
    console.error(`  Fetch error for ${userId}:`, err.message);
    return [];
  }
}

/**
 * Process a single user's enrollments
 */
async function processUserEnrollments(conn, user) {
  const items = await fetchTranscripts(user.id);
  let created = 0;
  let updated = 0;
  let failed = 0;
  
  for (const item of items) {
    const attrs = item.attributes || {};
    
    // Only courses
    if (attrs.resource_type !== 'course' || !attrs.resource_id) continue;
    
    const status = attrs.progress_status || 'enrolled';
    const progress = status === 'completed' ? 100 : (status === 'in_progress' ? 50 : 0);
    
    // Convert dates to MySQL format
    const enrolledAt = toMySQLDate(attrs.enrolled_at);
    const startedAt = toMySQLDate(attrs.started_at);
    const completedAt = toMySQLDate(attrs.completed_at);
    
    try {
      // Check if record exists
      const [existing] = await conn.query(
        'SELECT id FROM lms_enrollments WHERE id = ?',
        [item.id]
      );
      
      await conn.query(
        `INSERT INTO lms_enrollments (id, user_id, course_id, status, progress_percent, enrolled_at, started_at, completed_at, synced_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW()) 
         ON DUPLICATE KEY UPDATE 
           status = VALUES(status), 
           progress_percent = VALUES(progress_percent), 
           completed_at = VALUES(completed_at), 
           synced_at = NOW()`,
        [item.id, user.id, attrs.resource_id, status, progress, enrolledAt, startedAt, completedAt]
      );
      
      if (existing.length > 0) {
        updated++;
      } else {
        created++;
      }
    } catch (err) {
      if (!err.message.includes('foreign key')) {
        console.error('  DB error:', err.message);
      }
      failed++;
    }
  }
  
  return { created, updated, failed, total: items.length };
}

/**
 * Get the last successful sync timestamp
 */
async function getLastSyncTime(conn, syncType = 'enrollments') {
  const [rows] = await conn.query(
    `SELECT completed_at FROM sync_logs 
     WHERE sync_type = ? AND status = 'completed' 
     ORDER BY completed_at DESC LIMIT 1`,
    [syncType]
  );
  return rows[0]?.completed_at || null;
}

/**
 * Get users who have been active since a given date
 * This is the key optimization - only sync recently active users
 */
async function getActiveUsersSince(conn, sinceDate) {
  if (!sinceDate) {
    // If no last sync, return all users
    const [users] = await conn.query('SELECT id, email, last_active_at FROM lms_users');
    return users;
  }
  
  // Only get users active since last sync
  const [users] = await conn.query(
    `SELECT id, email, last_active_at FROM lms_users 
     WHERE last_active_at > ? OR last_active_at IS NULL`,
    [sinceDate]
  );
  return users;
}

/**
 * Run incremental enrollment sync
 * Only syncs users who have logged in since the last sync
 */
async function runIncrementalSync(onProgress) {
  console.log('🔄 Starting INCREMENTAL enrollment sync...');
  const startTime = Date.now();
  
  let pool, conn;
  const stats = {
    processed: 0,
    created: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    details: {
      mode: 'incremental',
      totalUsers: 0,
      activeUsers: 0,
      apiCalls: 0
    }
  };
  
  try {
    pool = await getPool();
    conn = await pool.getConnection();
    
    // Create sync log
    const logId = await createSyncLog(conn, 'enrollments', 'incremental');
    
    // Get last sync time
    const lastSyncTime = await getLastSyncTime(conn, 'enrollments');
    console.log(`  Last sync: ${lastSyncTime || 'Never'}`);
    
    // Get total user count for reference
    const [allUsers] = await conn.query('SELECT COUNT(*) as count FROM lms_users');
    stats.details.totalUsers = allUsers[0].count;
    
    // Get active users since last sync
    const activeUsers = await getActiveUsersSince(conn, lastSyncTime);
    stats.details.activeUsers = activeUsers.length;
    stats.skipped = stats.details.totalUsers - activeUsers.length;
    
    console.log(`  Found ${activeUsers.length} users active since last sync (skipping ${stats.skipped})`);
    
    if (activeUsers.length === 0) {
      console.log('✅ No active users to sync!');
      await updateSyncLog(conn, logId, 'completed', stats);
      conn.release();
      return { success: true, stats, duration: 0 };
    }
    
    // Process each active user
    for (let i = 0; i < activeUsers.length; i++) {
      const user = activeUsers[i];
      
      try {
        const result = await processUserEnrollments(conn, user);
        stats.created += result.created;
        stats.updated += result.updated;
        stats.failed += result.failed;
        stats.processed += result.total;
        stats.details.apiCalls++;
        
        // Progress callback
        if (onProgress) {
          onProgress({
            stage: 'enrollments',
            current: i + 1,
            total: activeUsers.length,
            currentUser: user.email
          });
        }
        
        // Log progress every 25 users
        if ((i + 1) % 25 === 0) {
          console.log(`  [${i + 1}/${activeUsers.length}] Created: ${stats.created}, Updated: ${stats.updated}`);
        }
        
        // Rate limiting - 100ms between users
        await new Promise(r => setTimeout(r, 100));
        
      } catch (err) {
        console.error(`  Error processing user ${user.email}:`, err.message);
        stats.failed++;
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    stats.details.durationSeconds = duration;
    
    console.log('\n✅ INCREMENTAL SYNC COMPLETE');
    console.log(`  Users processed: ${activeUsers.length} (skipped ${stats.skipped} inactive)`);
    console.log(`  Enrollments: ${stats.created} created, ${stats.updated} updated, ${stats.failed} failed`);
    console.log(`  Duration: ${duration}s`);
    console.log(`  API calls saved: ~${stats.skipped} (${Math.round(stats.skipped / stats.details.totalUsers * 100)}%)`);
    
    await updateSyncLog(conn, logId, 'completed', stats);
    
    return { success: true, stats, duration };
    
  } catch (err) {
    console.error('❌ Incremental sync failed:', err);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Run full sync (all users regardless of activity)
 */
async function runFullEnrollmentSync(onProgress) {
  console.log('🔄 Starting FULL enrollment sync...');
  const startTime = Date.now();
  
  let pool, conn;
  const stats = {
    processed: 0,
    created: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    details: {
      mode: 'full',
      totalUsers: 0,
      apiCalls: 0
    }
  };
  
  try {
    pool = await getPool();
    conn = await pool.getConnection();
    
    // Create sync log
    const logId = await createSyncLog(conn, 'enrollments', 'full');
    
    // Get all users
    const [users] = await conn.query('SELECT id, email, last_active_at FROM lms_users');
    stats.details.totalUsers = users.length;
    
    console.log(`  Processing ${users.length} users...`);
    
    // Process each user
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      
      try {
        const result = await processUserEnrollments(conn, user);
        stats.created += result.created;
        stats.updated += result.updated;
        stats.failed += result.failed;
        stats.processed += result.total;
        stats.details.apiCalls++;
        
        // Progress callback
        if (onProgress) {
          onProgress({
            stage: 'enrollments',
            current: i + 1,
            total: users.length,
            currentUser: user.email
          });
        }
        
        // Log progress every 50 users
        if ((i + 1) % 50 === 0) {
          console.log(`  [${i + 1}/${users.length}] Created: ${stats.created}, Updated: ${stats.updated}`);
        }
        
        // Rate limiting
        await new Promise(r => setTimeout(r, 100));
        
      } catch (err) {
        console.error(`  Error processing user ${user.email}:`, err.message);
        stats.failed++;
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    stats.details.durationSeconds = duration;
    
    console.log('\n✅ FULL SYNC COMPLETE');
    console.log(`  Users processed: ${users.length}`);
    console.log(`  Enrollments: ${stats.created} created, ${stats.updated} updated, ${stats.failed} failed`);
    console.log(`  Duration: ${duration}s`);
    
    await updateSyncLog(conn, logId, 'completed', stats);
    
    return { success: true, stats, duration };
    
  } catch (err) {
    console.error('❌ Full sync failed:', err);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Get sync statistics
 */
async function getSyncStats() {
  let pool, conn;
  try {
    pool = await getPool();
    conn = await pool.getConnection();
    
    // Get database counts
    const [[userCount]] = await conn.query('SELECT COUNT(*) as count FROM lms_users');
    const [[enrollmentCount]] = await conn.query('SELECT COUNT(*) as count FROM lms_enrollments');
    const [[courseCount]] = await conn.query('SELECT COUNT(*) as count FROM lms_courses');
    const [[groupCount]] = await conn.query('SELECT COUNT(*) as count FROM lms_groups');
    const [[contactCount]] = await conn.query('SELECT COUNT(*) as count FROM contacts');
    
    // Get last sync
    const [lastSyncs] = await conn.query(
      `SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 1`
    );
    
    // Get user activity stats
    const [[userActivity]] = await conn.query(`
      SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN last_active_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as active_24h,
         SUM(CASE WHEN last_active_at > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as active_7d,
         SUM(CASE WHEN last_active_at > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as active_30d
       FROM lms_users
    `);
    
    // Get today's sync stats
    const [[todayStats]] = await conn.query(`
      SELECT 
        COUNT(*) as syncs,
        SUM(records_processed) as total_records,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM sync_logs 
      WHERE DATE(started_at) = CURDATE()
    `);
    
    return {
      counts: {
        users: userCount.count,
        enrollments: enrollmentCount.count,
        courses: courseCount.count,
        groups: groupCount.count,
        contacts: contactCount.count
      },
      lastSync: lastSyncs[0] || null,
      userActivity: {
        total: userActivity.total || 0,
        active_24h: userActivity.active_24h || 0,
        active_7d: userActivity.active_7d || 0,
        active_30d: userActivity.active_30d || 0
      },
      today: {
        syncs: todayStats.syncs || 0,
        total_records: todayStats.total_records || 0,
        successful: todayStats.successful || 0,
        failed: todayStats.failed || 0
      }
    };
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Get recent sync history with details
 */
async function getSyncHistory(limit = 20) {
  let pool, conn;
  try {
    pool = await getPool();
    conn = await pool.getConnection();
    
    const [logs] = await conn.query(
      `SELECT 
         id,
         sync_type,
         status,
         started_at,
         completed_at,
         records_processed,
         records_created,
         records_updated,
         records_failed,
         error_message,
         details,
         TIMESTAMPDIFF(SECOND, started_at, completed_at) as duration_seconds
       FROM sync_logs 
       ORDER BY started_at DESC 
       LIMIT ?`,
      [limit]
    );
    
    // Parse JSON details
    return logs.map(log => ({
      ...log,
      details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details
    }));
    
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Get current sync schedule settings
 */
async function getScheduleSettings() {
  let pool, conn;
  try {
    pool = await getPool();
    conn = await pool.getConnection();
    
    const [rows] = await conn.query('SELECT * FROM sync_schedule WHERE id = 1');
    if (rows.length === 0) {
      // Create default schedule
      await conn.query(
        `INSERT INTO sync_schedule (id, enabled, interval_hours, sync_types, sync_mode) 
         VALUES (1, 0, 2, '["enrollments"]', 'incremental')`
      );
      return {
        enabled: false,
        interval_hours: 2,
        sync_types: ['enrollments'],
        sync_mode: 'incremental'
      };
    }
    
    const schedule = rows[0];
    return {
      ...schedule,
      sync_types: typeof schedule.sync_types === 'string' 
        ? JSON.parse(schedule.sync_types) 
        : schedule.sync_types
    };
    
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Update sync schedule settings
 */
async function updateScheduleSettings(settings) {
  let pool, conn;
  try {
    pool = await getPool();
    conn = await pool.getConnection();
    
    await conn.query(
      `UPDATE sync_schedule SET 
         enabled = ?,
         interval_hours = ?,
         sync_types = ?,
         sync_mode = ?
       WHERE id = 1`,
      [
        settings.enabled ? 1 : 0,
        settings.interval_hours || 2,
        JSON.stringify(settings.sync_types || ['enrollments']),
        settings.sync_mode || 'incremental'
      ]
    );
    
    return getScheduleSettings();
    
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  runIncrementalSync,
  runFullEnrollmentSync,
  getSyncStats,
  getSyncHistory,
  getScheduleSettings,
  updateScheduleSettings
};
