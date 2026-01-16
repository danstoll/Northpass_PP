/**
 * Sync Routes
 * LMS synchronization endpoints for users, groups, courses, enrollments
 */

const express = require('express');
const router = express.Router();

// Import sync services
const { 
  runFullSync, 
  syncUsers,
  syncUsersIncremental,
  syncGroups,
  syncGroupsIncremental,
  syncCourses,
  syncCoursesIncremental,
  syncCourseProperties,
  syncGroupMembers,
  syncEnrollments,
  syncEnrollmentsIncremental,
  linkContactsToLmsUsers,
  getLastSyncStatus, 
  getSyncHistory,
  getApiHealthStatus,
  northpassRequest
} = require('../db/lmsSyncService.cjs');

const { refreshNpcuCache } = require('../db/reportingService.cjs');
const { runIncrementalSync, runFullEnrollmentSync } = require('../db/incrementalSync.cjs');
const { query } = require('../db/connection.cjs');

// Import WebSocket emitters
let emitSyncProgress, emitSyncComplete, emitSyncError;
function initWebSocketEmitters() {
  try {
    const server = require('../../server-with-proxy.cjs');
    emitSyncProgress = server.emitSyncProgress || (() => {});
    emitSyncComplete = server.emitSyncComplete || (() => {});
    emitSyncError = server.emitSyncError || (() => {});
  } catch (e) {
    emitSyncProgress = () => {};
    emitSyncComplete = () => {};
    emitSyncError = () => {};
  }
}
initWebSocketEmitters();

// Track sync status (shared state)
let currentSync = null;
const STALE_LOCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Export for use by other modules
module.exports.getCurrentSync = () => currentSync;
module.exports.setCurrentSync = (sync) => { currentSync = sync; };
module.exports.clearCurrentSync = () => { currentSync = null; };

// Auto-clear stale sync locks
function clearStaleSyncLock() {
  if (currentSync && currentSync.startedAt) {
    const elapsed = Date.now() - new Date(currentSync.startedAt).getTime();
    if (elapsed > STALE_LOCK_TIMEOUT) {
      console.log(`🔄 Auto-clearing stale sync lock (${Math.round(elapsed/60000)} minutes old)`);
      currentSync = null;
    }
  }
}

// Helper: Create sync log entry
async function createSyncLog(syncType) {
  const result = await query(
    'INSERT INTO sync_logs (sync_type, status, started_at) VALUES (?, ?, NOW())',
    [syncType, 'running']
  );
  return result.insertId;
}

// Helper: Update sync log entry with full details
async function updateSyncLog(logId, status, stats, error, syncType) {
  await query(
    `UPDATE sync_logs SET 
      status = ?, 
      completed_at = NOW(), 
      records_processed = ?,
      records_created = ?,
      records_updated = ?,
      records_deleted = ?,
      records_failed = ?,
      error_message = ?,
      details = ?
    WHERE id = ?`,
    [
      status, 
      stats.processed || stats.synced || 0, 
      stats.created || 0,
      stats.updated || 0,
      stats.deleted || 0,
      stats.failed || 0,
      error, 
      JSON.stringify(stats.details || stats),
      logId
    ]
  );
}

// ============================================
// Sync Endpoints
// ============================================

// API Health Check - Check if Northpass API is responsive
router.get('/api-health', async (req, res) => {
  try {
    const health = getApiHealthStatus();
    
    // Also do a quick live check by hitting the groups endpoint
    const https = require('https');
    const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';
    
    const liveCheck = await new Promise((resolve) => {
      const options = {
        hostname: 'api.northpass.com',
        path: '/v2/groups?limit=1',
        method: 'GET',
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
          'X-Api-Key': API_KEY
        }
      };
      
      const req = https.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            ok: response.statusCode === 200,
            responseTime: Date.now() - startTime
          });
        });
      });
      
      const startTime = Date.now();
      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 0, ok: false, error: 'Timeout (10s)', responseTime: 10000 });
      });
      req.on('error', (err) => {
        resolve({ status: 0, ok: false, error: err.message, responseTime: Date.now() - startTime });
      });
      req.end();
    });
    
    const isHealthy = liveCheck.ok && health.isHealthy;
    
    res.json({
      healthy: isHealthy,
      status: isHealthy ? 'operational' : liveCheck.ok ? 'degraded' : 'down',
      liveCheck: {
        endpoint: '/v2/groups?limit=1',
        status: liveCheck.status,
        ok: liveCheck.ok,
        responseTimeMs: liveCheck.responseTime,
        error: liveCheck.error || null
      },
      recentHistory: {
        consecutiveErrors: health.consecutiveErrors,
        lastSuccessfulCall: health.lastSuccess,
        status: health.status
      },
      message: isHealthy 
        ? 'Northpass API is operational' 
        : liveCheck.status === 500 
          ? 'Northpass API is returning 500 errors - contact support@northpass.com'
          : liveCheck.status === 401
            ? 'Northpass API authentication failed - check API key'
            : `Northpass API is ${health.status} (${liveCheck.error || 'HTTP ' + liveCheck.status})`
    });
  } catch (error) {
    res.status(500).json({
      healthy: false,
      status: 'error',
      error: error.message
    });
  }
});

router.post('/full', async (req, res) => {
  clearStaleSyncLock();
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  currentSync = {
    type: 'full',
    status: 'running',
    startedAt: new Date().toISOString(),
    progress: { stage: 'starting', current: 0, total: 0 }
  };

  res.json({ message: 'Full sync started', sync: currentSync });

  try {
    const result = await runFullSync((stage, current, total) => {
      currentSync.progress = { stage, current, total };
    });
    
    currentSync = {
      ...currentSync,
      status: result.success ? 'completed' : 'failed',
      completedAt: new Date().toISOString(),
      result
    };
  } catch (error) {
    currentSync = {
      ...currentSync,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: error.message
    };
  }
});

router.post('/users', async (req, res) => {
  clearStaleSyncLock();
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  const mode = req.body?.mode || req.query?.mode || 'incremental';
  const isIncremental = mode === 'incremental';
  
  currentSync = { 
    type: 'users', 
    mode,
    status: 'running', 
    startedAt: new Date().toISOString() 
  };
  const logId = await createSyncLog('users');
  
  res.json({ 
    success: true, 
    message: `User sync started in background (${mode} mode)`,
    mode,
    logId,
    status: 'running'
  });
  
  try {
    const syncFn = isIncremental ? syncUsersIncremental : syncUsers;
    const result = await syncFn(logId, (stage, current, total) => {
      currentSync.progress = { stage, current, total };
      emitSyncProgress('users', { stage, current, total, percent: Math.round((current / total) * 100) });
    });
    await updateSyncLog(logId, 'completed', result, null, 'users');
    currentSync = null;
  } catch (error) {
    await updateSyncLog(logId, 'failed', {}, error.message, 'users');
    currentSync = null;
    console.error('User sync failed:', error.message);
  }
});

router.post('/groups', async (req, res) => {
  clearStaleSyncLock();
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  const mode = req.body?.mode || req.query?.mode || 'incremental';
  const isIncremental = mode === 'incremental';

  currentSync = { 
    type: 'groups', 
    mode,
    status: 'running', 
    startedAt: new Date().toISOString() 
  };
  const logId = await createSyncLog('groups');
  
  res.json({ 
    success: true, 
    message: `Group sync started in background (${mode} mode)`,
    mode,
    logId,
    status: 'running'
  });
  
  try {
    const syncFn = isIncremental ? syncGroupsIncremental : syncGroups;
    const result = await syncFn(logId, (stage, current, total) => {
      currentSync.progress = { stage, current, total };
      emitSyncProgress('groups', { stage, current, total, percent: Math.round((current / total) * 100) });
    });
    await updateSyncLog(logId, 'completed', result, null, 'groups');
    currentSync = null;
  } catch (error) {
    await updateSyncLog(logId, 'failed', {}, error.message, 'groups');
    currentSync = null;
    console.error('Group sync failed:', error.message);
  }
});

router.post('/courses', async (req, res) => {
  clearStaleSyncLock();
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  const mode = req.body?.mode || req.query?.mode || 'incremental';
  const isIncremental = mode === 'incremental';

  currentSync = { 
    type: 'courses', 
    mode,
    status: 'running', 
    startedAt: new Date().toISOString() 
  };
  const logId = await createSyncLog('courses');
  
  res.json({ 
    success: true, 
    message: `Course sync started in background (${mode} mode)`,
    mode,
    logId,
    status: 'running'
  });
  
  try {
    const syncFn = isIncremental ? syncCoursesIncremental : syncCourses;
    const result = await syncFn(logId, (stage, current, total) => {
      currentSync.progress = { stage, current, total };
      emitSyncProgress('courses', { stage, current, total, percent: Math.round((current / total) * 100) });
    });
    await updateSyncLog(logId, 'completed', result, null, 'courses');
    currentSync = null;
  } catch (error) {
    await updateSyncLog(logId, 'failed', {}, error.message, 'courses');
    currentSync = null;
    console.error('Course sync failed:', error.message);
  }
});

router.post('/course-properties', async (req, res) => {
  clearStaleSyncLock();
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  currentSync = { type: 'course-properties', status: 'running', startedAt: new Date().toISOString() };
  const logId = await createSyncLog('course-properties');
  
  res.json({ 
    success: true, 
    message: 'Course properties sync started in background',
    logId,
    status: 'running'
  });
  
  try {
    const result = await syncCourseProperties(logId, (stage, current, total) => {
      currentSync.progress = { stage, current, total };
      emitSyncProgress('course-properties', { stage, current, total, percent: Math.round((current / total) * 100) });
    });
    await updateSyncLog(logId, 'completed', result, null, 'course-properties');
    currentSync = null;
  } catch (error) {
    await updateSyncLog(logId, 'failed', {}, error.message, 'course-properties');
    currentSync = null;
    console.error('Course properties sync failed:', error.message);
  }
});

router.post('/group-members', async (req, res) => {
  clearStaleSyncLock();
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  currentSync = { type: 'group-members', status: 'running', startedAt: new Date().toISOString() };
  const logId = await createSyncLog('group-members');
  
  res.json({ 
    success: true, 
    message: 'Group members sync started in background',
    logId,
    status: 'running'
  });
  
  try {
    const result = await syncGroupMembers(logId, (stage, current, total) => {
      currentSync.progress = { stage, current, total };
      emitSyncProgress('group-members', { stage, current, total, percent: Math.round((current / total) * 100) });
    });
    await updateSyncLog(logId, 'completed', result, null, 'group-members');
    currentSync = null;
  } catch (error) {
    await updateSyncLog(logId, 'failed', {}, error.message, 'group-members');
    currentSync = null;
    console.error('Group members sync failed:', error.message);
  }
});

router.get('/status', (req, res) => {
  clearStaleSyncLock();
  res.json({ currentSync });
});

router.post('/reset', (req, res) => {
  const wasRunning = currentSync;
  currentSync = null;
  console.log('🔄 Sync lock manually reset. Previous state:', wasRunning);
  res.json({ 
    success: true, 
    message: 'Sync lock cleared',
    previousState: wasRunning 
  });
});

router.get('/history', async (req, res) => {
  try {
    const history = await getSyncHistory(20);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/last', async (req, res) => {
  try {
    const last = await getLastSyncStatus();
    res.json(last);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Incremental Sync Endpoints
// ============================================

router.post('/incremental', async (req, res) => {
  clearStaleSyncLock();
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  currentSync = {
    type: 'incremental',
    status: 'running',
    startedAt: new Date().toISOString(),
    progress: { stage: 'starting', current: 0, total: 0 }
  };

  res.json({ message: 'Incremental sync started', sync: currentSync });

  try {
    const result = await runIncrementalSync((progress) => {
      currentSync.progress = progress;
    });

    currentSync = {
      ...currentSync,
      status: 'completed',
      completedAt: new Date().toISOString(),
      result: result.stats
    };
  } catch (error) {
    currentSync = {
      ...currentSync,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: error.message
    };
  }
});

router.post('/enrollments', async (req, res) => {
  clearStaleSyncLock();
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  const mode = req.body?.mode || req.query?.mode || 'incremental';
  const isIncremental = mode === 'incremental';
  const maxAgeDays = parseInt(req.body?.maxAgeDays || req.query?.maxAgeDays || '7');

  currentSync = {
    type: 'enrollments',
    mode,
    status: 'running',
    startedAt: new Date().toISOString(),
    progress: { stage: 'starting', current: 0, total: 0 }
  };
  const logId = await createSyncLog('enrollments');

  res.json({ 
    success: true,
    message: `Enrollment sync started in background (${mode} mode)`,
    mode,
    maxAgeDays: isIncremental ? maxAgeDays : 'N/A',
    logId,
    status: 'running'
  });

  try {
    const syncFn = isIncremental ? syncEnrollmentsIncremental : syncEnrollments;
    const result = await syncFn(logId, (stage, current, total) => {
      currentSync.progress = { stage, current, total };
      emitSyncProgress('enrollments', { stage, current, total, percent: Math.round((current / total) * 100) });
    }, isIncremental ? { maxAgeDays } : undefined);
    
    await updateSyncLog(logId, 'completed', result, null, 'enrollments');
    currentSync = null;
  } catch (error) {
    await updateSyncLog(logId, 'failed', {}, error.message, 'enrollments');
    currentSync = null;
    console.error('Enrollment sync failed:', error.message);
  }
});

router.post('/full-enrollments', async (req, res) => {
  clearStaleSyncLock();
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  currentSync = {
    type: 'full-enrollments',
    status: 'running',
    startedAt: new Date().toISOString(),
    progress: { stage: 'starting', current: 0, total: 0 }
  };

  res.json({ message: 'Full enrollment sync started', sync: currentSync });

  try {
    const result = await runFullEnrollmentSync((progress) => {
      currentSync.progress = progress;
    });

    currentSync = {
      ...currentSync,
      status: 'completed',
      completedAt: new Date().toISOString(),
      result: result.stats
    };
  } catch (error) {
    currentSync = {
      ...currentSync,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: error.message
    };
  }
});

router.get('/stats', async (req, res) => {
  try {
    const { getSyncStats } = require('../db/incrementalSync.cjs');
    const stats = await getSyncStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/history/detailed', async (req, res) => {
  try {
    const { getIncrementalSyncHistory } = require('../db/incrementalSync.cjs');
    const { limit = 20 } = req.query;
    const history = await getIncrementalSyncHistory(parseInt(limit));
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/schedule', async (req, res) => {
  try {
    const { getScheduleSettings } = require('../db/incrementalSync.cjs');
    const settings = await getScheduleSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/schedule', async (req, res) => {
  try {
    const { updateScheduleSettings } = require('../db/incrementalSync.cjs');
    const settings = await updateScheduleSettings(req.body);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Clean up stuck sync logs (logs stuck in 'running' status)
 * @route POST /api/db/sync/cleanup-stuck
 */
router.post('/cleanup-stuck', async (req, res) => {
  try {
    const { olderThanMinutes = 30 } = req.body;
    
    // Find stuck sync logs
    const stuckLogs = await query(`
      SELECT id, sync_type, started_at 
      FROM sync_logs 
      WHERE status = 'running' 
      AND started_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
    `, [olderThanMinutes]);
    
    if (stuckLogs.length === 0) {
      return res.json({ 
        message: 'No stuck sync logs found',
        cleaned: 0 
      });
    }
    
    // Mark as failed with explanation
    const result = await query(`
      UPDATE sync_logs 
      SET status = 'failed', 
          completed_at = NOW(),
          error_message = 'Automatically cleaned up - task was stuck in running state'
      WHERE status = 'running' 
      AND started_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
    `, [olderThanMinutes]);
    
    console.log(`🧹 Cleaned up ${result.affectedRows} stuck sync log(s)`);
    
    res.json({
      message: `Cleaned up ${result.affectedRows} stuck sync log(s)`,
      cleaned: result.affectedRows,
      logs: stuckLogs
    });
  } catch (error) {
    console.error('Error cleaning up stuck sync logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Refresh partner NPCU cache (recalculates active_npcu, excludes expired certifications)
router.post('/refresh-npcu-cache', async (req, res) => {
  try {
    console.log('🔄 Manual NPCU cache refresh requested');
    const result = await refreshNpcuCache();
    res.json(result);
  } catch (error) {
    console.error('NPCU cache refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Single Partner Sync
// ============================================

// Sync all data for a single partner (group members, enrollments, NPCU)
router.post('/partner/:partnerId', async (req, res) => {
  const { partnerId } = req.params;
  
  try {
    console.log(`🔄 Starting sync for partner ID: ${partnerId}`);
    
    const stats = {
      partner: null,
      group: null,
      users: [],
      enrollments: { processed: 0, created: 0, updated: 0, failed: 0 },
      npcu: { total: 0 }
    };
    
    // 1. Find the partner
    const [partner] = await query(
      'SELECT id, account_name, partner_tier FROM partners WHERE id = ? AND is_active = 1',
      [partnerId]
    );
    
    if (!partner) {
      return res.status(404).json({ error: `Partner ID ${partnerId} not found or inactive` });
    }
    stats.partner = { id: partner.id, name: partner.account_name, tier: partner.partner_tier };
    console.log(`📋 Found partner: ${partner.account_name}`);
    
    // 2. Find the partner's LMS group
    const [group] = await query(
      'SELECT id, name FROM lms_groups WHERE partner_id = ?',
      [partnerId]
    );
    
    if (!group) {
      return res.status(404).json({ 
        error: `No LMS group linked to partner "${partner.account_name}"`,
        partner: stats.partner
      });
    }
    stats.group = { id: group.id, name: group.name };
    console.log(`📂 Found LMS group: ${group.name}`);
    
    // 3. Sync group members from Northpass API
    console.log(`👥 Syncing group members for group ${group.id}...`);
    try {
      const membersResponse = await northpassRequest(`/v2/groups/${group.id}/people`);
      
      if (membersResponse.status === 200 && Array.isArray(membersResponse.data)) {
        const apiMembers = membersResponse.data.map(m => m.id);
        
        // Get current members in DB
        const currentMembers = await query(
          'SELECT user_id FROM lms_group_members WHERE group_id = ?',
          [group.id]
        );
        const currentMemberIds = new Set(currentMembers.map(m => m.user_id));
        
        // Add new members
        let added = 0;
        for (const userId of apiMembers) {
          if (!currentMemberIds.has(userId)) {
            await query(
              'INSERT IGNORE INTO lms_group_members (group_id, user_id, joined_at) VALUES (?, ?, NOW())',
              [group.id, userId]
            );
            added++;
          }
        }
        
        // Remove members no longer in group
        const apiMemberSet = new Set(apiMembers);
        let removed = 0;
        for (const member of currentMembers) {
          if (!apiMemberSet.has(member.user_id)) {
            await query(
              'DELETE FROM lms_group_members WHERE group_id = ? AND user_id = ?',
              [group.id, member.user_id]
            );
            removed++;
          }
        }
        
        stats.groupMembers = { 
          total: apiMembers.length, 
          added, 
          removed,
          synced: true
        };
        console.log(`✅ Group members synced: ${apiMembers.length} total, +${added} added, -${removed} removed`);
      } else {
        stats.groupMembers = { synced: false, error: 'Failed to fetch members from API' };
        console.log(`⚠️ Could not fetch group members from API`);
      }
    } catch (memberError) {
      stats.groupMembers = { synced: false, error: memberError.message };
      console.error(`⚠️ Error syncing group members:`, memberError.message);
    }
    
    // 4. Get all users in this partner's group
    const users = await query(`
      SELECT u.id, u.email, u.first_name, u.last_name
      FROM lms_users u
      JOIN lms_group_members gm ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `, [group.id]);
    
    stats.users = users.map(u => ({ id: u.id, email: u.email, name: `${u.first_name} ${u.last_name}` }));
    console.log(`👥 Found ${users.length} users in group`);
    
    // 5. Sync enrollments for each user
    console.log(`📊 Syncing enrollments for ${users.length} users...`);
    
    for (const user of users) {
      try {
        const response = await northpassRequest(`/v2/transcripts/${user.id}`);
        
        if (response.status !== 200) {
          stats.enrollments.failed++;
          continue;
        }
        
        // API returns { data: [...transcript_items...] }
        const transcripts = response.data?.data || response.data || [];
        
        // Handle case where transcripts is not an array
        if (!Array.isArray(transcripts)) {
          console.log(`  Warning: No transcripts array for ${user.email}, got:`, typeof transcripts);
          stats.enrollments.processed++;
          continue;
        }
        
        stats.enrollments.processed++;
        
        for (const transcript of transcripts) {
          const attrs = transcript.attributes || transcript.attrs || {};
          const courseId = attrs.resource_id;
          
          if (!courseId || attrs.resource_type !== 'course') continue;
          
          const progressStatus = attrs.progress_status || 'not_started';
          
          // Helper to convert ISO 8601 dates to MySQL format
          const parseDate = (isoDate) => {
            if (!isoDate) return null;
            try {
              const d = new Date(isoDate);
              if (isNaN(d.getTime())) return null;
              return d.toISOString().slice(0, 19).replace('T', ' ');
            } catch {
              return null;
            }
          };
          
          const completedAt = parseDate(attrs.completed_at);
          const enrolledAt = parseDate(attrs.enrolled_at);
          const startedAt = parseDate(attrs.started_at);
          const progressPercent = progressStatus === 'completed' ? 100 : 
                                  progressStatus === 'in_progress' ? 50 : 0;
          
          // Use the transcript ID from the API (UUID)
          const enrollmentId = transcript.id;
          
          // Check if course exists (foreign key constraint)
          const [courseExists] = await query('SELECT id FROM lms_courses WHERE id = ?', [courseId]);
          if (!courseExists) {
            // Skip enrollments for courses not in our database
            continue;
          }
          
          // Check if enrollment exists
          const [existing] = await query(
            'SELECT id, progress_percent, status FROM lms_enrollments WHERE id = ?',
            [enrollmentId]
          );
          
          if (existing) {
            // Update if changed
            if (existing.progress_percent !== progressPercent || existing.status !== progressStatus) {
              await query(`
                UPDATE lms_enrollments 
                SET progress_percent = ?, status = ?, completed_at = ?, synced_at = NOW()
                WHERE id = ?
              `, [progressPercent, progressStatus, completedAt, enrollmentId]);
              stats.enrollments.updated++;
            }
          } else {
            // Create new enrollment
            await query(`
              INSERT INTO lms_enrollments (id, user_id, course_id, progress_percent, status, enrolled_at, started_at, completed_at, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [enrollmentId, user.id, courseId, progressPercent, progressStatus, enrolledAt, startedAt, completedAt]);
            stats.enrollments.created++;
          }
        }
      } catch (userError) {
        console.error(`  Error syncing user ${user.email}:`, userError.message);
        stats.enrollments.failed++;
      }
    }
    
    console.log(`✅ Enrollments synced: ${stats.enrollments.created} created, ${stats.enrollments.updated} updated, ${stats.enrollments.failed} failed`);
    
    // 6. Recalculate NPCU for this partner
    console.log(`🎯 Recalculating NPCU for partner...`);
    const npcuResult = await query(`
      SELECT 
        COALESCE(SUM(c.npcu_value), 0) as total_npcu,
        COUNT(DISTINCT e.id) as cert_count
      FROM lms_enrollments e
      JOIN lms_courses c ON c.id = e.course_id
      JOIN lms_group_members gm ON gm.user_id = e.user_id
      WHERE gm.group_id = ?
        AND e.status = 'completed'
        AND c.npcu_value > 0
        AND (e.completed_at IS NULL OR e.completed_at > DATE_SUB(NOW(), INTERVAL 24 MONTH))
    `, [group.id]);
    
    const totalNpcu = npcuResult[0]?.total_npcu || 0;
    const certCount = npcuResult[0]?.cert_count || 0;
    
    // Update partner's NPCU directly in partners table
    await query(`
      UPDATE partners 
      SET total_npcu = ?, cert_counts_updated_at = NOW()
      WHERE id = ?
    `, [totalNpcu, partnerId]);
    
    stats.npcu = { total: totalNpcu, certifications: certCount };
    console.log(`✅ Partner NPCU updated: ${totalNpcu} NPCU from ${certCount} certifications`);
    
    res.json({
      success: true,
      message: `Successfully synced partner "${partner.account_name}"`,
      stats
    });
    
  } catch (error) {
    console.error('Partner sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sync partner by name (for CompanyWidget)
router.post('/partner-by-name', async (req, res) => {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Partner name is required' });
  }
  
  try {
    // Find partner by name
    const [partner] = await query(
      'SELECT id FROM partners WHERE LOWER(account_name) = LOWER(?) AND is_active = 1',
      [name]
    );
    
    if (!partner) {
      return res.status(404).json({ error: `Partner "${name}" not found` });
    }
    
    // Redirect to the partner sync endpoint internally
    // We'll just call the same logic but with the ID
    req.params.partnerId = partner.id;
    
    // Call the partner sync handler directly
    const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/db/sync/partner/${partner.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const result = await response.json();
    res.status(response.status).json(result);
    
  } catch (error) {
    console.error('Partner sync by name error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
