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
  getSyncHistory 
} = require('../db/lmsSyncService.cjs');

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
  const [result] = await query(
    'INSERT INTO sync_log (sync_type, status, started_at) VALUES (?, ?, NOW())',
    [syncType, 'running']
  );
  return result.insertId;
}

// Helper: Update sync log entry
async function updateSyncLog(logId, status, stats, error, syncType) {
  await query(
    `UPDATE sync_log SET 
      status = ?, 
      completed_at = NOW(), 
      records_processed = ?,
      error_message = ?,
      sync_mode = ?
    WHERE id = ?`,
    [status, stats.processed || stats.synced || 0, error, syncType, logId]
  );
}

// ============================================
// Sync Endpoints
// ============================================

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

module.exports = router;
