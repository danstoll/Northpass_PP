/**
 * Database API Routes
 * Express routes for database operations
 */

const express = require('express');

// Northpass API configuration
const API_BASE = 'https://api.northpass.com';
const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';

// Import WebSocket emitters (may not be available during module load)
let emitSyncProgress, emitSyncComplete, emitSyncError;
function initWebSocketEmitters() {
  try {
    const server = require('../server-with-proxy.cjs');
    emitSyncProgress = server.emitSyncProgress || (() => {});
    emitSyncComplete = server.emitSyncComplete || (() => {});
    emitSyncError = server.emitSyncError || (() => {});
  } catch (e) {
    // Running standalone or during init, create no-op functions
    emitSyncProgress = () => {};
    emitSyncComplete = () => {};
    emitSyncError = () => {};
  }
}
// Initialize immediately (will be no-ops initially, re-init later)
initWebSocketEmitters();

// Simple in-memory cache for expensive reports
const reportCache = {
  overview: { data: null, timestamp: 0 },
  CACHE_TTL: 5 * 60 * 1000 // 5 minutes TTL
};

// Helper to check if cache is valid
function isCacheValid(cacheKey) {
  const cache = reportCache[cacheKey];
  return cache && cache.data && (Date.now() - cache.timestamp) < reportCache.CACHE_TTL;
}

// Helper to set cache
function setCache(cacheKey, data) {
  reportCache[cacheKey] = { data, timestamp: Date.now() };
}

// Helper to invalidate cache (call after data changes)
function invalidateReportCache() {
  reportCache.overview = { data: null, timestamp: 0 };
}

const { initializePool, closePool } = require('./db/connection.cjs');
const { initializeSchema, getSchemaVersion } = require('./db/schema.cjs');
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
} = require('./db/lmsSyncService.cjs');
const {
  importPartners,
  importContacts,
  getPartnerSummary,
  getPartnersByOwner,
  getAccountOwners,
  getContactsByPartner,
  getContactsByAccountName,
  searchPartners,
  getDatabaseStats,
  clearPartnerData
} = require('./db/partnerService.cjs');
const {
  importContacts: importContactsFromExcel,
  getDatabaseStats: getImportStats,
  getPartnerSummary: getPartnerList,
  getContactsByPartner: getPartnerContacts,
  searchContacts,
  deletePartner,
  deleteByRegion,
  deleteByTier,
  deleteByAccountPattern,
  getContactsPreview,
  getUnmatchedContacts,
  getMatchStats,
  clearAllData,
  getImportProgress
} = require('./db/partnerImportService.cjs');
// Legacy scheduledSync.cjs removed. All syncs now use modern taskScheduler.
const taskScheduler = require('./db/taskScheduler.cjs');
const { initializeScheduler } = taskScheduler;
const { query } = require('./db/connection.cjs');
const {
  runIncrementalSync,
  runFullEnrollmentSync,
  getSyncStats,
  getSyncHistory: getIncrementalSyncHistory,
  getScheduleSettings,
  updateScheduleSettings
} = require('./db/incrementalSync.cjs');
const {
  autoMatchGroups,
  getMatchingSuggestions,
  linkGroupToPartner,
  unlinkGroup,
  getMatchingStats
} = require('./db/partnerMatchingService.cjs');
const {
  getAccountOwnerReport,
  getRegionalReport,
  getComplianceGapsReport,
  getAccountOwnersOverview,
  getPartnersByOwnerEmail,
  getExpiringCertificationsReport,
  getPartnerLeaderboard,
  generateAccountOwnerEmailReport,
  getPartnerCertificationSummary,
  getLmsUsersNotInCrm
} = require('./db/reportingService.cjs');
const {
  getUserRegistrationTrends,
  getEnrollmentTrends,
  getCertificationTrends,
  getCoursePopularityTrends,
  getComplianceTrends,
  getRegionalTrends,
  getKpiSummary,
  getWeeklySummary,
  getYtdComparison,
  getFullTrendReport,
  getOwnerTrends
} = require('./db/trendService.cjs');
const {
  login,
  logout,
  validateSession,
  cleanupExpiredSessions,
  getUsers,
  getUserById,
  createUser,
  updateUser,
  changePassword,
  deleteUser,
  getProfiles,
  getProfileById,
  createProfile,
  updateProfile,
  deleteProfile
} = require('./db/authService.cjs');

const router = express.Router();

// Track sync status
let currentSync = null;

// Auto-clear stale sync locks (30 minute timeout)
function clearStaleSyncLock() {
  if (currentSync && currentSync.startedAt) {
    const startTime = new Date(currentSync.startedAt).getTime();
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;
    if (now - startTime > thirtyMinutes) {
      console.log('⚠️ Auto-clearing stale sync:', currentSync.type, 'started at', currentSync.startedAt);
      currentSync = null;
      return true;
    }
  }
  return false;
}

/**
 * Helper to create a sync log entry
 */
async function createSyncLog(syncType) {
  const result = await query(
    'INSERT INTO sync_logs (sync_type, status, started_at) VALUES (?, ?, NOW())',
    [syncType, 'running']
  );
  return result.insertId;
}

/**
 * Helper to update a sync log entry and emit WebSocket event
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
      JSON.stringify(stats.details || stats || {}),
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
 * Initialize database on startup
 */
async function initializeDatabase() {
  try {
    await initializePool();
    await initializeSchema();
    
    // Start the scheduler if enabled
    await initializeScheduler();
    
    console.log('✅ Database initialized');
    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    return false;
  }
}

// ============================================
// Health & Status Endpoints
// ============================================

router.get('/health', async (req, res) => {
  try {
    const stats = await getDatabaseStats();
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      stats 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await getDatabaseStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Sync Endpoints
// ============================================

router.post('/sync/full', async (req, res) => {
  clearStaleSyncLock(); // Auto-clear if stale
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  // Start sync in background
  currentSync = {
    type: 'full',
    status: 'running',
    startedAt: new Date().toISOString(),
    progress: { stage: 'starting', current: 0, total: 0 }
  };

  res.json({ 
    message: 'Full sync started', 
    sync: currentSync 
  });

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

router.post('/sync/users', async (req, res) => {
  clearStaleSyncLock(); // Auto-clear if stale
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  // Check for incremental mode (default: incremental for efficiency)
  const mode = req.body?.mode || req.query?.mode || 'incremental';
  const isIncremental = mode === 'incremental';
  
  currentSync = { 
    type: 'users', 
    mode,
    status: 'running', 
    startedAt: new Date().toISOString() 
  };
  const logId = await createSyncLog('users');
  
  // Respond immediately to avoid gateway timeout
  res.json({ 
    success: true, 
    message: `User sync started in background (${mode} mode)`,
    mode,
    logId,
    status: 'running'
  });
  
  // Run sync in background
  try {
    const syncFn = isIncremental ? syncUsersIncremental : syncUsers;
    const result = await syncFn(logId, (stage, current, total) => {
      currentSync.progress = { stage, current, total };
      // Emit WebSocket progress
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

router.post('/sync/groups', async (req, res) => {
  clearStaleSyncLock(); // Auto-clear if stale
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  // Check for incremental mode (default: incremental for efficiency)
  const mode = req.body?.mode || req.query?.mode || 'incremental';
  const isIncremental = mode === 'incremental';

  currentSync = { 
    type: 'groups', 
    mode,
    status: 'running', 
    startedAt: new Date().toISOString() 
  };
  const logId = await createSyncLog('groups');
  
  // Respond immediately to avoid gateway timeout
  res.json({ 
    success: true, 
    message: `Group sync started in background (${mode} mode)`,
    mode,
    logId,
    status: 'running'
  });
  
  // Run sync in background
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

router.post('/sync/courses', async (req, res) => {
  clearStaleSyncLock(); // Auto-clear if stale
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  // Check for incremental mode (default: incremental for efficiency)
  const mode = req.body?.mode || req.query?.mode || 'incremental';
  const isIncremental = mode === 'incremental';

  currentSync = { 
    type: 'courses', 
    mode,
    status: 'running', 
    startedAt: new Date().toISOString() 
  };
  const logId = await createSyncLog('courses');
  
  // Respond immediately to avoid gateway timeout
  res.json({ 
    success: true, 
    message: `Course sync started in background (${mode} mode)`,
    mode,
    logId,
    status: 'running'
  });
  
  // Run sync in background
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

// Sync course properties (NPCU values) separately
router.post('/sync/course-properties', async (req, res) => {
  clearStaleSyncLock(); // Auto-clear if stale
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  currentSync = { type: 'course-properties', status: 'running', startedAt: new Date().toISOString() };
  const logId = await createSyncLog('course-properties');
  
  // Respond immediately to avoid gateway timeout
  res.json({ 
    success: true, 
    message: 'Course properties sync started in background',
    logId,
    status: 'running'
  });
  
  // Run sync in background
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

// Sync group memberships from Northpass API
router.post('/sync/group-members', async (req, res) => {
  clearStaleSyncLock(); // Auto-clear if stale
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  currentSync = { type: 'group-members', status: 'running', startedAt: new Date().toISOString() };
  const logId = await createSyncLog('group-members');
  
  // Respond immediately to avoid gateway timeout
  res.json({ 
    success: true, 
    message: 'Group members sync started in background',
    logId,
    status: 'running'
  });
  
  // Run sync in background
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

router.get('/sync/status', (req, res) => {
  clearStaleSyncLock(); // Auto-clear if stale
  res.json({ currentSync });
});

// Force reset sync lock (use when sync gets stuck)
router.post('/sync/reset', (req, res) => {
  const wasRunning = currentSync;
  currentSync = null;
  console.log('🔄 Sync lock manually reset. Previous state:', wasRunning);
  res.json({ 
    success: true, 
    message: 'Sync lock cleared',
    previousState: wasRunning 
  });
});

// Refresh NPCU cache (call after syncs or periodically)
router.post('/cache/refresh-npcu', async (req, res) => {
  try {
    const { refreshNpcuCache } = require('./db/reportingService.cjs');
    const result = await refreshNpcuCache();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/sync/history', async (req, res) => {
  try {
    const history = await getSyncHistory(20);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sync/last', async (req, res) => {
  try {
    const last = await getLastSyncStatus();
    res.json(last);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Incremental Sync Endpoints (v2)
// ============================================

// Run incremental sync (only active users since last sync)
router.post('/sync/incremental', async (req, res) => {
  clearStaleSyncLock(); // Auto-clear if stale
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

// Run incremental enrollment sync (only users changed since last sync)
router.post('/sync/enrollments', async (req, res) => {
  clearStaleSyncLock(); // Auto-clear if stale
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      currentSync,
      hint: 'POST /api/db/sync/reset to force clear the lock'
    });
  }

  // Check for mode (default: incremental)
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

// Run full enrollment sync (all users) - LEGACY endpoint
router.post('/sync/full-enrollments', async (req, res) => {
  clearStaleSyncLock(); // Auto-clear if stale
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

// Get sync statistics (for dashboard)
router.get('/sync/stats', async (req, res) => {
  try {
    const stats = await getSyncStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get detailed sync history (with mode info)
router.get('/sync/history/detailed', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const history = await getIncrementalSyncHistory(parseInt(limit));
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get/update sync schedule settings
router.get('/sync/schedule', async (req, res) => {
  try {
    const settings = await getScheduleSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/sync/schedule', async (req, res) => {
  try {
    const settings = await updateScheduleSettings(req.body);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Partner Endpoints
// ============================================

router.get('/partners', async (req, res) => {
  try {
    const { search, tier, region, owner } = req.query;
    const partners = await searchPartners(search, { tier, region, owner });
    res.json(partners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/partners/summary', async (req, res) => {
  try {
    const summary = await getPartnerSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/partners/owners', async (req, res) => {
  try {
    const owners = await getAccountOwners();
    res.json(owners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/partners/by-owner/:owner', async (req, res) => {
  try {
    const partners = await getPartnersByOwner(req.params.owner);
    res.json(partners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/partners/:id/contacts', async (req, res) => {
  try {
    const contacts = await getContactsByPartner(req.params.id);
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all contacts (for User Management page)
router.get('/contacts/all', async (req, res) => {
  try {
    const contacts = await query(`
      SELECT 
        c.id,
        c.email,
        c.first_name as firstName,
        c.last_name as lastName,
        c.title,
        p.account_name as accountName,
        p.partner_tier as partnerTier,
        p.account_region as accountRegion,
        p.account_owner as accountOwner
      FROM contacts c
      LEFT JOIN partners p ON c.partner_id = p.id
      ORDER BY c.email
    `);
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a contact by ID
router.delete('/contacts/:id', async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (!contactId) {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }
    
    // Get contact info before deleting
    const [contact] = await query('SELECT email, partner_id FROM contacts WHERE id = ?', [contactId]);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    await query('DELETE FROM contacts WHERE id = ?', [contactId]);
    
    console.log(`Deleted contact ${contactId} (${contact.email}) from partner ${contact.partner_id}`);
    res.json({ 
      success: true, 
      message: `Deleted contact ${contact.email}`,
      deletedId: contactId 
    });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/partners/import', async (req, res) => {
  try {
    const { partners, contacts, clearExisting } = req.body;
    
    if (clearExisting) {
      await clearPartnerData();
    }

    const results = { partners: null, contacts: null };

    if (partners && partners.length > 0) {
      results.partners = await importPartners(partners);
    }

    if (contacts && contacts.length > 0) {
      results.contacts = await importContacts(contacts);
    }

    // Link contacts to LMS users
    const linkResult = await linkContactsToLmsUsers();
    results.linked = linkResult.linked;

    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/partners', async (req, res) => {
  try {
    await clearPartnerData();
    res.json({ success: true, message: 'Partner data cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual contact linking endpoint
router.post('/partners/link-contacts', async (req, res) => {
  try {
    const result = await linkContactsToLmsUsers();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LMS Data Query Endpoints
// ============================================

router.get('/lms/users', async (req, res) => {
  try {
    const { search, status, page = 1, limit = 100, all } = req.query;
    
    // If all=true, return all users (for User Management comparison)
    if (all === 'true') {
      const users = await query(`
        SELECT id, email, first_name, last_name, status
        FROM lms_users
        ORDER BY email
      `);
      return res.json(users);
    }
    
    const offset = (page - 1) * limit;
    
    let sql = 'SELECT * FROM lms_users WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY last_name, first_name LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const users = await query(sql, params);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/lms/users/:id', async (req, res) => {
  try {
    const [user] = await query('SELECT * FROM lms_users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get groups
    const groups = await query(`
      SELECT g.* FROM lms_groups g
      INNER JOIN lms_group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ?
    `, [req.params.id]);

    // Get enrollments
    const enrollments = await query(`
      SELECT e.*, c.name as course_name, c.npcu_value, c.is_certification
      FROM lms_enrollments e
      INNER JOIN lms_courses c ON c.id = e.course_id
      WHERE e.user_id = ?
      ORDER BY e.completed_at DESC
    `, [req.params.id]);

    res.json({ user, groups, enrollments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/lms/groups', async (req, res) => {
  try {
    const { search, hasPartner } = req.query;
    
    let sql = 'SELECT * FROM lms_groups WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    if (hasPartner === 'true') {
      sql += ' AND partner_id IS NOT NULL';
    } else if (hasPartner === 'false') {
      sql += ' AND partner_id IS NULL';
    }

    sql += ' ORDER BY name';

    const groups = await query(sql, params);
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/lms/groups/:id', async (req, res) => {
  try {
    const [group] = await query('SELECT * FROM lms_groups WHERE id = ?', [req.params.id]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Get members
    const members = await query(`
      SELECT u.* FROM lms_users u
      INNER JOIN lms_group_members gm ON gm.user_id = u.id
      WHERE gm.group_id = ?
      ORDER BY u.last_name, u.first_name
    `, [req.params.id]);

    res.json({ group, members });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/lms/courses', async (req, res) => {
  try {
    const courses = await query(`
      SELECT c.*, cp.npcu_value as npcu_from_properties
      FROM lms_courses c
      LEFT JOIN course_properties cp ON cp.course_id = c.id
      ORDER BY c.name
    `);
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/lms/courses/:id', async (req, res) => {
  try {
    const [course] = await query(`
      SELECT c.*, cp.npcu_value, cp.property_data
      FROM lms_courses c
      LEFT JOIN course_properties cp ON cp.course_id = c.id
      WHERE c.id = ?
    `, [req.params.id]);
    
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json(course);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Domain Analysis Endpoints
// ============================================

// Public email domains to exclude from domain analysis
const PUBLIC_EMAIL_DOMAINS = [
  // Major providers
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'aol.com',
  'icloud.com', 'live.com', 'msn.com', 'me.com', 'mail.com',
  'protonmail.com', 'ymail.com', 'googlemail.com', 'fastmail.com',
  'zoho.com', 'tutanota.com', 'gmx.com', 'gmx.net', 'web.de',
  'qq.com', '163.com', '126.com', 'sina.com', 'naver.com',
  // ISPs
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net',
  'cox.net', 'charter.net', 'earthlink.net', 'optonline.net',
  'mac.com', 'pm.me', 'hey.com', 'bigpond.com', 'bigpond.net.au',
  // Disposable/temp email services
  'sharklasers.com', 'guerrillamail.com', 'mailinator.com', 'tempmail.com',
  'throwaway.email', '10minutemail.com', 'fakeinbox.com', 'trashmail.com',
  'yopmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc',
  // Regional providers
  'hotmail.co.uk', 'yahoo.co.uk', 'outlook.co.uk', 'btinternet.com',
  'yahoo.com.au', 'optusnet.com.au', 'hotmail.fr', 'yahoo.fr',
  'wanadoo.fr', 'orange.fr', 't-online.de', 'freenet.de'
];

/**
 * Extract domains from CRM contacts and store against partners
 * POST /api/db/partners/extract-domains
 */
router.post('/partners/extract-domains', async (req, res) => {
  try {
    // Get all contacts with their partner associations
    const contacts = await query(`
      SELECT c.email, c.partner_id, p.account_name
      FROM contacts c
      JOIN partners p ON p.id = c.partner_id
      WHERE c.partner_id IS NOT NULL AND c.email IS NOT NULL
    `);
    
    // Step 1: Build domain -> partner frequency map
    // Track how many contacts from each partner use each domain
    const domainPartnerCounts = new Map(); // domain -> Map(partnerId -> { count, partnerName })
    
    contacts.forEach(contact => {
      const email = contact.email?.toLowerCase();
      if (!email || !email.includes('@')) return;
      const domain = email.split('@')[1];
      
      // Skip public email domains
      if (PUBLIC_EMAIL_DOMAINS.includes(domain)) return;
      
      if (!domainPartnerCounts.has(domain)) {
        domainPartnerCounts.set(domain, new Map());
      }
      const partnerMap = domainPartnerCounts.get(domain);
      if (!partnerMap.has(contact.partner_id)) {
        partnerMap.set(contact.partner_id, { count: 0, partnerName: contact.account_name });
      }
      partnerMap.get(contact.partner_id).count++;
    });
    
    // Step 2: For each domain, determine the "owner" partner
    // A domain belongs to a partner if:
    // - That partner has the majority of contacts using this domain (>= 50%)
    // - OR the partner has at least 3 contacts AND >= 30% of contacts for this domain
    // - AND the domain is not shared across too many different partners (max 3)
    const partnerDomains = new Map(); // partnerId -> Set of domains
    const rejectedDomains = []; // for logging
    
    for (const [domain, partnerMap] of domainPartnerCounts) {
      const totalContacts = Array.from(partnerMap.values()).reduce((sum, p) => sum + p.count, 0);
      const partnerCount = partnerMap.size;
      
      // Skip domains used by too many different partners (likely shared/generic)
      if (partnerCount > 3) {
        rejectedDomains.push({ domain, reason: 'used by too many partners', partnerCount });
        continue;
      }
      
      // Find the dominant partner for this domain
      let dominantPartner = null;
      let maxCount = 0;
      
      for (const [partnerId, data] of partnerMap) {
        if (data.count > maxCount) {
          maxCount = data.count;
          dominantPartner = { partnerId, ...data };
        }
      }
      
      if (!dominantPartner) continue;
      
      const percentage = (maxCount / totalContacts) * 100;
      
      // STRICT RULES for domain ownership:
      // - Must have at least 2 contacts using this domain (avoids single wrong email)
      // - Must have majority (>= 50%) of contacts for this domain
      // OR
      // - Must have at least 5 contacts using this domain (strong signal)
      const isValidDomain = (
        (maxCount >= 2 && percentage >= 50) ||  // At least 2 contacts with majority
        (maxCount >= 5)                          // Or 5+ contacts (strong signal regardless of %)
      );
      
      if (isValidDomain) {
        if (!partnerDomains.has(dominantPartner.partnerId)) {
          partnerDomains.set(dominantPartner.partnerId, new Set());
        }
        partnerDomains.get(dominantPartner.partnerId).add(domain);
      } else {
        rejectedDomains.push({ 
          domain, 
          reason: maxCount < 2 ? 'only 1 contact' : 'no clear owner', 
          topPartner: dominantPartner.partnerName,
          count: maxCount,
          percentage: percentage.toFixed(1)
        });
      }
    }
    
    console.log(`📊 Domain extraction: ${rejectedDomains.length} domains rejected`);
    if (rejectedDomains.length > 0 && rejectedDomains.length <= 20) {
      console.log('Rejected:', rejectedDomains);
    }
    
    // Step 3: Update each partner with their domains
    // First clear all existing domains
    await query('UPDATE partners SET domains = NULL');
    
    let updated = 0;
    for (const [partnerId, domains] of partnerDomains) {
      const domainsArray = Array.from(domains).sort();
      await query(
        'UPDATE partners SET domains = ? WHERE id = ?',
        [JSON.stringify(domainsArray), partnerId]
      );
      updated++;
    }
    
    // Get summary stats
    const totalDomains = Array.from(partnerDomains.values())
      .reduce((sum, set) => sum + set.size, 0);
    
    res.json({
      message: `Extracted domains for ${updated} partners`,
      partnersUpdated: updated,
      totalDomains,
      avgDomainsPerPartner: updated > 0 ? (totalDomains / updated).toFixed(1) : 0
    });
  } catch (error) {
    console.error('Extract domains error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all partner domains (for quick lookup)
 * GET /api/db/partners/domains
 */
router.get('/partners/domains', async (req, res) => {
  try {
    const partners = await query(`
      SELECT id, account_name, partner_tier, domains
      FROM partners
      WHERE domains IS NOT NULL AND domains != '[]'
      ORDER BY account_name
    `);
    
    // Build domain -> partner lookup
    const domainLookup = {};
    let totalDomains = 0;
    
    partners.forEach(p => {
      const domains = typeof p.domains === 'string' ? JSON.parse(p.domains) : p.domains;
      if (Array.isArray(domains)) {
        domains.forEach(domain => {
          domainLookup[domain] = {
            partnerId: p.id,
            partnerName: p.account_name,
            partnerTier: p.partner_tier
          };
          totalDomains++;
        });
      }
    });
    
    res.json({
      partnersWithDomains: partners.length,
      totalDomains,
      domainLookup
    });
  } catch (error) {
    console.error('Get partner domains error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get domain analysis for PARTNER LMS users only
 * Filters to only users whose email domain matches a known partner domain
 */
router.get('/lms/partner-domain-analysis', async (req, res) => {
  try {
    // First, get all partner domains
    const partners = await query(`
      SELECT id, account_name, partner_tier, domains
      FROM partners
      WHERE domains IS NOT NULL AND domains != '[]'
    `);
    
    // Build domain -> partner lookup
    const partnerDomainLookup = new Map();
    partners.forEach(p => {
      const domains = typeof p.domains === 'string' ? JSON.parse(p.domains) : p.domains;
      if (Array.isArray(domains)) {
        domains.forEach(domain => {
          partnerDomainLookup.set(domain.toLowerCase(), {
            partnerId: p.id,
            partnerName: p.account_name,
            partnerTier: p.partner_tier
          });
        });
      }
    });
    
    if (partnerDomainLookup.size === 0) {
      return res.json({
        error: 'No partner domains found. Run "Extract Partner Domains" first.',
        summary: { totalDomains: 0, totalUsers: 0 },
        domains: []
      });
    }
    
    // Get all LMS users with their group memberships
    const users = await query(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        GROUP_CONCAT(DISTINCT g.id) as group_ids,
        GROUP_CONCAT(DISTINCT g.name) as group_names
      FROM lms_users u
      LEFT JOIN lms_group_members gm ON gm.user_id = u.id
      LEFT JOIN lms_groups g ON g.id = gm.group_id
      WHERE u.status = 'active'
      GROUP BY u.id
    `);
    
    // Get all groups (not just ptr_ prefix - also match by partner_id or exact name)
    const allGroups = await query(`
      SELECT g.id, g.name, g.partner_id, p.account_name
      FROM lms_groups g
      LEFT JOIN partners p ON p.id = g.partner_id
      ORDER BY g.name
    `);
    
    // Build group lookup by partner name and partner_id
    const groupByPartnerName = new Map();
    const groupByPartnerId = new Map();
    allGroups.forEach(g => {
      // Map by partner_id if linked
      if (g.partner_id) {
        groupByPartnerId.set(g.partner_id, g);
      }
      
      // Map by group name (with and without ptr_ prefix)
      const nameLower = g.name.toLowerCase();
      groupByPartnerName.set(nameLower, g);
      
      // If has ptr_ prefix, also map without it
      if (nameLower.startsWith('ptr_')) {
        const nameWithoutPrefix = nameLower.replace(/^ptr_/, '');
        groupByPartnerName.set(nameWithoutPrefix, g);
      }
      
      // Also map by linked partner account name
      if (g.account_name) {
        groupByPartnerName.set(g.account_name.toLowerCase(), g);
      }
    });
    
    // Analyze users - only include those with partner domains
    const domainStats = new Map();
    let totalPartnerUsers = 0;
    let skippedNonPartnerUsers = 0;
    
    users.forEach(user => {
      const email = user.email?.toLowerCase();
      if (!email || !email.includes('@')) return;
      const domain = email.split('@')[1];
      
      // Only include if domain belongs to a partner
      const partnerInfo = partnerDomainLookup.get(domain);
      if (!partnerInfo) {
        skippedNonPartnerUsers++;
        return;
      }
      
      totalPartnerUsers++;
      
      if (!domainStats.has(domain)) {
        // Find partner group - check by partner_id first, then by name variations
        let partnerGroup = null;
        
        // First try by partner_id (most reliable)
        if (partnerInfo.partnerId && groupByPartnerId.has(partnerInfo.partnerId)) {
          partnerGroup = groupByPartnerId.get(partnerInfo.partnerId);
        }
        
        // Then try by name variations
        if (!partnerGroup) {
          const possibleNames = [
            partnerInfo.partnerName?.toLowerCase(),
            `ptr_${partnerInfo.partnerName?.toLowerCase()}`
          ];
          for (const name of possibleNames) {
            if (name && groupByPartnerName.has(name)) {
              partnerGroup = groupByPartnerName.get(name);
              break;
            }
          }
        }
        
        domainStats.set(domain, {
          domain,
          userCount: 0,
          inPartnerGroup: 0,
          notInPartnerGroup: 0,
          matchedPartner: partnerInfo.partnerName,
          matchedPartnerId: partnerInfo.partnerId,
          partnerTier: partnerInfo.partnerTier,
          partnerGroupId: partnerGroup?.id || null,
          partnerGroupName: partnerGroup?.name || null,
          users: []
        });
      }
      
      const stats = domainStats.get(domain);
      stats.userCount++;
      
      // Check if user is in their specific partner group (by ID or name)
      const userGroupIds = user.group_ids?.split(',').filter(Boolean) || [];
      const userGroupNames = user.group_names?.split(',').filter(Boolean) || [];
      
      // User is "in partner group" if they're in the matched partner group for this domain
      const inPartnerGroup = stats.partnerGroupId 
        ? (userGroupIds.includes(stats.partnerGroupId) || 
           userGroupNames.some(g => g && g.toLowerCase() === stats.partnerGroupName?.toLowerCase()))
        : false;
      
      if (inPartnerGroup) {
        stats.inPartnerGroup++;
      } else {
        stats.notInPartnerGroup++;
      }
      
      stats.users.push({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        groupIds: userGroupIds,
        groupNames: userGroupNames,
        inPartnerGroup
      });
    });
    
    // Sort domains by user count descending
    const sortedDomains = Array.from(domainStats.values())
      .sort((a, b) => b.userCount - a.userCount);
    
    // Calculate summary stats
    const summary = {
      totalDomains: sortedDomains.length,
      totalUsers: totalPartnerUsers,
      usersInPartnerGroups: sortedDomains.reduce((sum, d) => sum + d.inPartnerGroup, 0),
      usersNotInPartnerGroups: sortedDomains.reduce((sum, d) => sum + d.notInPartnerGroup, 0),
      skippedNonPartnerUsers,
      domainsWithGroupRecommendation: sortedDomains.filter(d => d.partnerGroupId).length
    };
    
    res.json({
      summary,
      domains: sortedDomains
    });
  } catch (error) {
    console.error('Partner domain analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get domain analysis for all LMS users (original - includes non-partners)
 * Groups users by email domain, matches domains to partners, identifies ungrouped users
 */
router.get('/lms/domain-analysis', async (req, res) => {
  try {
    const { includePublic = 'false' } = req.query;
    
    // Get all LMS users with their group memberships
    const users = await query(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        GROUP_CONCAT(DISTINCT g.id) as group_ids,
        GROUP_CONCAT(DISTINCT g.name) as group_names
      FROM lms_users u
      LEFT JOIN lms_group_members gm ON gm.user_id = u.id
      LEFT JOIN lms_groups g ON g.id = gm.group_id
      WHERE u.status = 'active'
      GROUP BY u.id
    `);
    
    // Get CRM contacts with their partner info (for domain matching)
    const contacts = await query(`
      SELECT c.email, p.account_name, p.partner_tier, p.id as partner_id
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      WHERE c.email IS NOT NULL
    `);
    
    // Get all partner groups (ptr_ prefix)
    const partnerGroups = await query(`
      SELECT g.id, g.name, g.partner_id, p.account_name
      FROM lms_groups g
      LEFT JOIN partners p ON p.id = g.partner_id
      WHERE g.name LIKE 'ptr\\_%'
      ORDER BY g.name
    `);
    
    // Build domain -> partner mapping from CRM contacts
    const domainToPartner = new Map();
    contacts.forEach(contact => {
      const email = contact.email?.toLowerCase();
      if (!email || !email.includes('@')) return;
      const domain = email.split('@')[1];
      if (domain && !PUBLIC_EMAIL_DOMAINS.includes(domain)) {
        if (!domainToPartner.has(domain)) {
          domainToPartner.set(domain, {
            partnerId: contact.partner_id,
            partnerName: contact.account_name,
            partnerTier: contact.partner_tier
          });
        }
      }
    });
    
    // Build group lookup by name (for finding matching partner group)
    const groupByName = new Map();
    partnerGroups.forEach(g => {
      groupByName.set(g.name.toLowerCase(), g);
      // Also index by name without ptr_ prefix
      const nameWithoutPrefix = g.name.toLowerCase().replace(/^ptr_/, '');
      groupByName.set(nameWithoutPrefix, g);
    });
    
    // Analyze users by domain
    const domainStats = new Map();
    
    users.forEach(user => {
      const email = user.email?.toLowerCase();
      if (!email || !email.includes('@')) return;
      const domain = email.split('@')[1];
      
      // Skip public email domains unless requested
      if (!includePublic && PUBLIC_EMAIL_DOMAINS.includes(domain)) return;
      
      if (!domainStats.has(domain)) {
        const partnerInfo = domainToPartner.get(domain);
        domainStats.set(domain, {
          domain,
          userCount: 0,
          inPartnerGroup: 0,
          notInPartnerGroup: 0,
          matchedPartner: partnerInfo?.partnerName || null,
          matchedPartnerId: partnerInfo?.partnerId || null,
          partnerTier: partnerInfo?.partnerTier || null,
          partnerGroupId: null,
          partnerGroupName: null,
          users: [],
          isPublicDomain: PUBLIC_EMAIL_DOMAINS.includes(domain)
        });
      }
      
      const stats = domainStats.get(domain);
      stats.userCount++;
      
      // Check if user is in any partner group (ptr_*)
      const userGroups = user.group_names?.split(',') || [];
      const inAnyPartnerGroup = userGroups.some(g => g && g.toLowerCase().startsWith('ptr_'));
      
      if (inAnyPartnerGroup) {
        stats.inPartnerGroup++;
      } else {
        stats.notInPartnerGroup++;
      }
      
      stats.users.push({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        groupIds: user.group_ids?.split(',').filter(Boolean) || [],
        groupNames: userGroups.filter(Boolean),
        inPartnerGroup: inAnyPartnerGroup
      });
    });
    
    // Find recommended partner group for each domain
    domainStats.forEach((stats, domain) => {
      if (stats.matchedPartner) {
        // Try to find matching partner group
        const possibleNames = [
          `ptr_${stats.matchedPartner}`.toLowerCase(),
          stats.matchedPartner.toLowerCase()
        ];
        for (const name of possibleNames) {
          const group = groupByName.get(name);
          if (group) {
            stats.partnerGroupId = group.id;
            stats.partnerGroupName = group.name;
            break;
          }
        }
      }
    });
    
    // Sort domains by user count descending
    const sortedDomains = Array.from(domainStats.values())
      .sort((a, b) => b.userCount - a.userCount);
    
    // Calculate summary stats
    const summary = {
      totalDomains: sortedDomains.length,
      totalUsers: sortedDomains.reduce((sum, d) => sum + d.userCount, 0),
      usersInPartnerGroups: sortedDomains.reduce((sum, d) => sum + d.inPartnerGroup, 0),
      usersNotInPartnerGroups: sortedDomains.reduce((sum, d) => sum + d.notInPartnerGroup, 0),
      domainsMatchedToPartners: sortedDomains.filter(d => d.matchedPartner).length,
      domainsWithGroupRecommendation: sortedDomains.filter(d => d.partnerGroupId).length
    };
    
    res.json({
      summary,
      domains: sortedDomains
    });
  } catch (error) {
    console.error('Domain analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get LMS users by domain
 */
router.get('/lms/users-by-domain/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const { notInGroup } = req.query;
    
    let sql = `
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        GROUP_CONCAT(DISTINCT g.id) as group_ids,
        GROUP_CONCAT(DISTINCT g.name) as group_names
      FROM lms_users u
      LEFT JOIN lms_group_members gm ON gm.user_id = u.id
      LEFT JOIN lms_groups g ON g.id = gm.group_id
      WHERE u.email LIKE ? AND u.status = 'active'
      GROUP BY u.id
    `;
    
    const users = await query(sql, [`%@${domain}`]);
    
    // Optionally filter to only users not in the specified group
    let filteredUsers = users;
    if (notInGroup) {
      filteredUsers = users.filter(u => {
        const groupIds = u.group_ids?.split(',') || [];
        return !groupIds.includes(notInGroup);
      });
    }
    
    res.json(filteredUsers.map(u => ({
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      groupIds: u.group_ids?.split(',').filter(Boolean) || [],
      groupNames: u.group_names?.split(',').filter(Boolean) || []
    })));
  } catch (error) {
    console.error('Users by domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Sync a single group to the database (after creating via API)
 * POST body: { groupId, groupName, partnerId? }
 */
router.post('/lms/groups/sync-one', async (req, res) => {
  try {
    const { groupId, groupName, partnerId } = req.body;
    
    if (!groupId || !groupName) {
      return res.status(400).json({ error: 'groupId and groupName are required' });
    }
    
    // Insert or update the group in our database
    // The partner relationship is stored in lms_groups.partner_id
    await query(`
      INSERT INTO lms_groups (id, name, partner_id, synced_at)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE 
        name = VALUES(name),
        partner_id = COALESCE(VALUES(partner_id), partner_id),
        synced_at = NOW()
    `, [groupId, groupName, partnerId || null]);
    
    console.log(`✅ Group synced to database: ${groupName} (${groupId}), partner_id: ${partnerId || 'none'}`);
    
    res.json({ 
      success: true, 
      message: 'Group synced to database',
      groupId,
      groupName,
      partnerId
    });
  } catch (error) {
    console.error('Group sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Add users to a group via Northpass API
 * POST body: { userIds: string[] }
 */
router.post('/lms/groups/:groupId/add-users', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userIds } = req.body;
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    
    // Verify group exists
    const [group] = await query('SELECT * FROM lms_groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Get user emails for reporting
    const users = await query(
      `SELECT id, email FROM lms_users WHERE id IN (${userIds.map(() => '?').join(',')})`,
      userIds
    );
    
    const results = {
      success: 0,
      alreadyMember: 0,
      failed: 0,
      errors: []
    };
    
    // Build the JSON:API format payload for batch add
    const peopleData = users.map(user => ({
      type: 'people',
      id: String(user.id)
    }));
    
    console.log(`📤 Adding ${users.length} users to group ${groupId}`);
    console.log(`   Payload: ${JSON.stringify({ data: peopleData.slice(0, 2) })}...`);
    
    try {
      // Call Northpass API to add users to group (batch)
      const apiUrl = `${API_BASE}/v2/groups/${groupId}/relationships/people`;
      console.log(`   API URL: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'X-Api-Key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: peopleData })
      });
      
      console.log(`   Response status: ${response.status}`);
      
      if (response.ok || response.status === 201 || response.status === 204) {
        // Success - update local database for all users
        for (const user of users) {
          await query(
            'INSERT IGNORE INTO lms_group_members (group_id, user_id, pending_source) VALUES (?, ?, ?)',
            [groupId, user.id, 'api']
          );
        }
        results.success = users.length;
        console.log(`✅ Added ${users.length} users to group ${groupId}`);
      } else {
        const errorText = await response.text();
        console.error(`❌ Northpass API error (${response.status}): ${errorText}`);
        
        // If batch failed, try one by one
        console.log(`🔄 Batch failed, trying one by one...`);
        for (const user of users) {
          try {
            const singleResponse = await fetch(`${API_BASE}/v2/groups/${groupId}/relationships/people`, {
              method: 'POST',
              headers: {
                'X-Api-Key': API_KEY,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ data: [{ type: 'people', id: String(user.id) }] })
            });
            
            console.log(`   ${user.email}: ${singleResponse.status}`);
            
            if (singleResponse.ok || singleResponse.status === 201 || singleResponse.status === 204) {
              await query(
                'INSERT IGNORE INTO lms_group_members (group_id, user_id, pending_source) VALUES (?, ?, ?)',
                [groupId, user.id, 'api']
              );
              results.success++;
            } else if (singleResponse.status === 422) {
              // Already a member
              results.alreadyMember++;
              await query(
                'INSERT IGNORE INTO lms_group_members (group_id, user_id, pending_source) VALUES (?, ?, ?)',
                [groupId, user.id, 'api']
              );
            } else {
              const singleError = await singleResponse.text();
              results.failed++;
              results.errors.push({ email: user.email, error: singleError || `Status ${singleResponse.status}` });
            }
          } catch (singleErr) {
            results.failed++;
            results.errors.push({ email: user.email, error: singleErr.message });
          }
        }
      }
    } catch (err) {
      console.error('❌ Error calling Northpass API:', err.message);
      results.failed = users.length;
      results.errors = users.map(u => ({ email: u.email, error: err.message }));
    }
    
    // Update group user count
    const [countResult] = await query(
      'SELECT COUNT(*) as count FROM lms_group_members WHERE group_id = ?',
      [groupId]
    );
    await query(
      'UPDATE lms_groups SET user_count = ? WHERE id = ?',
      [countResult.count, groupId]
    );
    
    res.json({
      message: `Added ${results.success} users to group "${group.name}"`,
      results
    });
  } catch (error) {
    console.error('Add users to group error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Group Analysis Endpoints (Local DB)
// ============================================

// Get all groups with partner matching data
router.get('/group-analysis/groups', async (req, res) => {
  try {
    const { filter, search } = req.query;
    
    // Base query - fast, no correlated subqueries
    // Now includes stored analysis columns
    const groups = await query(`
      SELECT 
        g.id,
        g.name,
        g.description,
        g.partner_id,
        g.synced_at,
        g.potential_users,
        g.total_npcu,
        g.last_analyzed,
        p.account_name as partner_name,
        p.partner_tier,
        p.account_region,
        p.account_owner
      FROM lms_groups g
      LEFT JOIN partners p ON g.partner_id = p.id
      ORDER BY g.name
    `);

    // Get member counts in one query
    const memberCounts = await query(`
      SELECT group_id, COUNT(*) as count 
      FROM lms_group_members 
      GROUP BY group_id
    `);
    const memberMap = Object.fromEntries(memberCounts.map(m => [m.group_id, m.count]));

    // Get potential users per group - DISABLED for performance
    // The LOWER(email) JOIN is too slow on production
    // This calculation is done in the detail view when a group is selected
    let potentialMap = {};
    
    /* Commented out - too slow:
    const partnerIds = [...new Set(groups.filter(g => g.partner_id).map(g => g.partner_id))];
    if (partnerIds.length > 0) {
      const potentialUsers = await query(`
        SELECT 
          g.id as group_id,
          COUNT(DISTINCT u.id) as potential_count
        FROM lms_groups g
        JOIN contacts c ON c.partner_id = g.partner_id
        JOIN lms_users u ON LOWER(c.email) = LOWER(u.email)
        LEFT JOIN lms_group_members gm ON gm.group_id = g.id AND gm.user_id = u.id
        WHERE g.partner_id IS NOT NULL AND gm.user_id IS NULL
        GROUP BY g.id
      `);
      potentialMap = Object.fromEntries(potentialUsers.map(p => [p.group_id, p.potential_count]));
    }
    */

    // Get NPCU totals per group
    const npcuTotals = await query(`
      SELECT 
        gm.group_id,
        COALESCE(SUM(lc.npcu_value), 0) as total_npcu
      FROM lms_group_members gm 
      JOIN lms_enrollments le ON le.user_id = gm.user_id AND le.status = 'completed'
      JOIN lms_courses lc ON lc.id = le.course_id AND lc.npcu_value > 0
      GROUP BY gm.group_id
    `);
    const npcuMap = Object.fromEntries(npcuTotals.map(n => [n.group_id, n.total_npcu]));

    // Merge all data - use stored values if available, otherwise calculate live
    const enrichedGroups = groups.map(g => ({
      ...g,
      user_count: memberMap[g.id] || 0,
      // Use stored values from DB if available
      potential_users: g.potential_users ?? potentialMap[g.id] ?? null,
      total_npcu: g.total_npcu ?? npcuMap[g.id] ?? 0,
      last_analyzed: g.last_analyzed ?? null
    }));

    // Get all partners for matching
    const partners = await query(`
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        COUNT(c.id) as contact_count,
        g.id as group_id
      FROM partners p
      LEFT JOIN contacts c ON c.partner_id = p.id
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      GROUP BY p.id
      ORDER BY p.account_name
    `);

    // Apply filters
    let filteredGroups = enrichedGroups;
    
    if (search) {
      const term = search.toLowerCase();
      filteredGroups = filteredGroups.filter(g => 
        g.name?.toLowerCase().includes(term) ||
        g.partner_name?.toLowerCase().includes(term)
      );
    }

    if (filter === 'matched') {
      filteredGroups = filteredGroups.filter(g => g.partner_id);
    } else if (filter === 'unmatched') {
      filteredGroups = filteredGroups.filter(g => !g.partner_id);
    }

    // Calculate stats
    const stats = {
      totalGroups: enrichedGroups.length,
      withMembers: enrichedGroups.filter(g => g.user_count > 0).length,
      matched: enrichedGroups.filter(g => g.partner_id).length,
      unmatched: enrichedGroups.filter(g => !g.partner_id).length,
      totalMembers: enrichedGroups.reduce((sum, g) => sum + (g.user_count || 0), 0),
      totalPotentialUsers: enrichedGroups.reduce((sum, g) => sum + (g.potential_users || 0), 0),
      groupsWithPotential: enrichedGroups.filter(g => g.potential_users > 0).length,
      totalPartners: partners.length,
      partnersWithGroups: partners.filter(p => p.group_id).length,
      partnersWithoutGroups: partners.filter(p => !p.group_id).length
    };

    res.json({ groups: filteredGroups, partners, stats });
  } catch (error) {
    console.error('Group analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get group details with members
router.get('/group-analysis/groups/:id', async (req, res) => {
  try {
    const [group] = await query(`
      SELECT 
        g.*,
        p.account_name as partner_name,
        p.partner_tier,
        p.account_region
      FROM lms_groups g
      LEFT JOIN partners p ON g.partner_id = p.id
      WHERE g.id = ?
    `, [req.params.id]);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Parse blocked and custom domains from group settings
    const blockedDomains = group.blocked_domains ? JSON.parse(group.blocked_domains) : [];
    const customDomains = group.custom_domains ? JSON.parse(group.custom_domains) : [];

    // Get members with contact info
    const members = await query(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        u.last_active_at,
        gm.pending_source,
        c.id as contact_id,
        c.title,
        p.account_name as crm_partner
      FROM lms_users u
      INNER JOIN lms_group_members gm ON gm.user_id = u.id
      LEFT JOIN contacts c ON c.email = u.email
      LEFT JOIN partners p ON p.id = c.partner_id
      WHERE gm.group_id = ?
      ORDER BY u.last_name, u.first_name
    `, [req.params.id]);

    // Public email domains to exclude (unless CRM match)
    const publicDomains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'aol.com', 'icloud.com', 'live.com', 'msn.com', 'me.com', 'mail.com', 'protonmail.com', 'ymail.com'];
    
    // Extract unique email domains from members
    const allDomains = [...new Set(
      members
        .map(m => m.email?.split('@')[1])
        .filter(Boolean)
        .map(d => d.toLowerCase())
    )];
    
    // Corporate domains (non-public) - also exclude blocked domains
    let corporateDomains = allDomains.filter(d => !publicDomains.includes(d) && !blockedDomains.includes(d));
    
    // Add custom domains if no members or custom domains specified
    // Custom domains are domains to SEARCH for (override auto-detection)
    let searchDomains = corporateDomains;
    if (customDomains.length > 0) {
      // If custom domains are set, use them (but also include corporate domains found)
      searchDomains = [...new Set([...corporateDomains, ...customDomains])];
    }
    
    // Remove blocked domains from search
    searchDomains = searchDomains.filter(d => !blockedDomains.includes(d));

    // Find potential users (matching domain, not in group)
    let potentialUsers = [];
    if (searchDomains.length > 0) {
      potentialUsers = await query(`
        SELECT 
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.status,
          NULL as crm_match
        FROM lms_users u
        WHERE u.id NOT IN (
          SELECT user_id FROM lms_group_members WHERE group_id = ?
        )
        AND (${searchDomains.map(() => 'u.email LIKE ?').join(' OR ')})
        ORDER BY u.last_name, u.first_name
      `, [req.params.id, ...searchDomains.map(d => `%@${d}`)]);
    }
    
    // Filter out users with blocked domains
    if (blockedDomains.length > 0) {
      potentialUsers = potentialUsers.filter(u => {
        const userDomain = u.email?.split('@')[1]?.toLowerCase();
        return !blockedDomains.includes(userDomain);
      });
    }
    
    // Also find LMS users that are direct CRM matches for this partner (including public domains)
    // These are added separately to catch gmail/hotmail users who ARE in CRM
    if (group.partner_id) {
      const existingIds = potentialUsers.map(p => p.id);
      let crmMatchedUsers = await query(`
        SELECT DISTINCT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.status,
          'CRM' as crm_match
        FROM lms_users u
        INNER JOIN contacts c ON LOWER(c.email) = LOWER(u.email)
        WHERE c.partner_id = ?
        AND u.id NOT IN (
          SELECT user_id FROM lms_group_members WHERE group_id = ?
        )
        ORDER BY u.last_name, u.first_name
      `, [group.partner_id, req.params.id]);
      
      // Filter CRM matches by blocked domains too
      if (blockedDomains.length > 0) {
        crmMatchedUsers = crmMatchedUsers.filter(u => {
          const userDomain = u.email?.split('@')[1]?.toLowerCase();
          return !blockedDomains.includes(userDomain);
        });
      }
      
      // Add CRM matched users that aren't already in the list
      for (const user of crmMatchedUsers) {
        if (!existingIds.includes(user.id)) {
          potentialUsers.push(user);
        }
      }
    }

    // Get CRM contacts not in LMS (if matched to partner)
    let crmContactsNotInLms = [];
    if (group.partner_id) {
      crmContactsNotInLms = await query(`
        SELECT 
          c.email,
          c.first_name,
          c.last_name,
          c.title
        FROM contacts c
        WHERE c.partner_id = ?
        AND c.lms_user_id IS NULL
        AND c.email IS NOT NULL
        AND c.email NOT LIKE '%@gmail.com'
        AND c.email NOT LIKE '%@hotmail.com'
        AND c.email NOT LIKE '%@outlook.com'
        AND c.email NOT LIKE '%@yahoo.com'
        ORDER BY c.last_name, c.first_name
      `, [group.partner_id]);
      
      // Also filter CRM contacts by blocked domains
      if (blockedDomains.length > 0) {
        crmContactsNotInLms = crmContactsNotInLms.filter(c => {
          const contactDomain = c.email?.split('@')[1]?.toLowerCase();
          return !blockedDomains.includes(contactDomain);
        });
      }
    }

    // Calculate totalNpcu for this group's members
    const [npcuResult] = await query(`
      SELECT COALESCE(SUM(lc.npcu_value), 0) as total_npcu
      FROM lms_group_members gm 
      JOIN lms_enrollments le ON le.user_id = gm.user_id AND le.status = 'completed'
      JOIN lms_courses lc ON lc.id = le.course_id AND lc.npcu_value > 0
      WHERE gm.group_id = ?
    `, [req.params.id]);
    const totalNpcu = npcuResult?.total_npcu || 0;

    res.json({
      group,
      members,
      domains: allDomains,
      corporateDomains,
      publicDomainsExcluded: allDomains.filter(d => publicDomains.includes(d)),
      blockedDomains,
      customDomains,
      searchDomains, // The actual domains being searched
      potentialUsers,
      crmContactsNotInLms,
      stats: {
        memberCount: members.length,
        domainCount: allDomains.length,
        corporateDomainCount: corporateDomains.length,
        potentialCount: potentialUsers.length,
        crmNotInLmsCount: crmContactsNotInLms.length,
        totalNpcu
      }
    });
  } catch (error) {
    console.error('Group detail error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get partners without groups
router.get('/group-analysis/partners-without-groups', async (req, res) => {
  try {
    const { search, tier, sort } = req.query;

    let sql = `
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        COUNT(c.id) as contact_count,
        COUNT(CASE WHEN c.lms_user_id IS NOT NULL THEN 1 END) as lms_user_count
      FROM partners p
      LEFT JOIN contacts c ON c.partner_id = p.id
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE g.id IS NULL
    `;
    const params = [];

    if (search) {
      sql += ' AND p.account_name LIKE ?';
      params.push(`%${search}%`);
    }

    if (tier) {
      sql += ' AND p.partner_tier = ?';
      params.push(tier);
    }

    sql += ' GROUP BY p.id';

    if (sort === 'tier') {
      sql += ` ORDER BY FIELD(p.partner_tier, 'Premier', 'Select', 'Registered', 'Certified'), p.account_name`;
    } else if (sort === 'region') {
      sql += ' ORDER BY p.account_region, p.account_name';
    } else {
      sql += ' ORDER BY p.account_name';
    }

    const partners = await query(sql, params);
    res.json(partners);
  } catch (error) {
    console.error('Partners without groups error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get sync timestamp for groups
router.get('/group-analysis/sync-status', async (req, res) => {
  try {
    const [lastSync] = await query(`
      SELECT MIN(synced_at) as oldest, MAX(synced_at) as newest 
      FROM lms_groups
    `);
    
    const [groupCount] = await query(`SELECT COUNT(*) as count FROM lms_groups`);
    const [memberCount] = await query(`SELECT COUNT(*) as count FROM lms_group_members`);

    res.json({
      lastSync: lastSync?.newest,
      oldestSync: lastSync?.oldest,
      groupCount: groupCount?.count || 0,
      memberCount: memberCount?.count || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save analysis results for a group
router.post('/group-analysis/groups/:id/save-analysis', async (req, res) => {
  try {
    const { id } = req.params;
    const { potential_users, total_npcu } = req.body;
    
    await query(`
      UPDATE lms_groups 
      SET potential_users = ?,
          total_npcu = ?,
          last_analyzed = NOW()
      WHERE id = ?
    `, [potential_users, total_npcu, id]);
    
    res.json({ success: true, id, potential_users, total_npcu });
  } catch (error) {
    console.error('Save analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get group domain settings (blocked and custom domains)
router.get('/group-analysis/groups/:id/domains', async (req, res) => {
  try {
    const [group] = await query(`
      SELECT id, name, blocked_domains, custom_domains 
      FROM lms_groups 
      WHERE id = ?
    `, [req.params.id]);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json({
      id: group.id,
      name: group.name,
      blocked_domains: group.blocked_domains ? JSON.parse(group.blocked_domains) : [],
      custom_domains: group.custom_domains ? JSON.parse(group.custom_domains) : []
    });
  } catch (error) {
    console.error('Get domain settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update group domain settings (blocked and custom domains)
router.put('/group-analysis/groups/:id/domains', async (req, res) => {
  try {
    const { id } = req.params;
    const { blocked_domains, custom_domains } = req.body;
    
    // Validate domains are arrays of strings
    const validateDomains = (arr) => {
      if (!arr) return [];
      if (!Array.isArray(arr)) return [];
      return arr.filter(d => typeof d === 'string' && d.trim())
        .map(d => d.trim().toLowerCase().replace(/^@/, ''));
    };
    
    const blockedList = validateDomains(blocked_domains);
    const customList = validateDomains(custom_domains);
    
    await query(`
      UPDATE lms_groups 
      SET blocked_domains = ?,
          custom_domains = ?,
          last_analyzed = NULL
      WHERE id = ?
    `, [
      blockedList.length > 0 ? JSON.stringify(blockedList) : null,
      customList.length > 0 ? JSON.stringify(customList) : null,
      id
    ]);
    
    res.json({ 
      success: true, 
      blocked_domains: blockedList, 
      custom_domains: customList 
    });
  } catch (error) {
    console.error('Update domain settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add a blocked domain to a group
router.post('/group-analysis/groups/:id/block-domain', async (req, res) => {
  try {
    const { id } = req.params;
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }
    
    const cleanDomain = domain.trim().toLowerCase().replace(/^@/, '');
    
    // Get current blocked domains
    const [group] = await query('SELECT blocked_domains FROM lms_groups WHERE id = ?', [id]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const currentBlocked = group.blocked_domains ? JSON.parse(group.blocked_domains) : [];
    
    if (!currentBlocked.includes(cleanDomain)) {
      currentBlocked.push(cleanDomain);
      await query(`
        UPDATE lms_groups 
        SET blocked_domains = ?, last_analyzed = NULL 
        WHERE id = ?
      `, [JSON.stringify(currentBlocked), id]);
    }
    
    res.json({ success: true, blocked_domains: currentBlocked });
  } catch (error) {
    console.error('Block domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove a blocked domain from a group
router.delete('/group-analysis/groups/:id/block-domain/:domain', async (req, res) => {
  try {
    const { id, domain } = req.params;
    const cleanDomain = domain.trim().toLowerCase().replace(/^@/, '');
    
    const [group] = await query('SELECT blocked_domains FROM lms_groups WHERE id = ?', [id]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    let currentBlocked = group.blocked_domains ? JSON.parse(group.blocked_domains) : [];
    currentBlocked = currentBlocked.filter(d => d !== cleanDomain);
    
    await query(`
      UPDATE lms_groups 
      SET blocked_domains = ?, last_analyzed = NULL 
      WHERE id = ?
    `, [currentBlocked.length > 0 ? JSON.stringify(currentBlocked) : null, id]);
    
    res.json({ success: true, blocked_domains: currentBlocked });
  } catch (error) {
    console.error('Unblock domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add a custom domain to a group
router.post('/group-analysis/groups/:id/custom-domain', async (req, res) => {
  try {
    const { id } = req.params;
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }
    
    const cleanDomain = domain.trim().toLowerCase().replace(/^@/, '');
    
    const [group] = await query('SELECT custom_domains FROM lms_groups WHERE id = ?', [id]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const currentCustom = group.custom_domains ? JSON.parse(group.custom_domains) : [];
    
    if (!currentCustom.includes(cleanDomain)) {
      currentCustom.push(cleanDomain);
      await query(`
        UPDATE lms_groups 
        SET custom_domains = ?, last_analyzed = NULL 
        WHERE id = ?
      `, [JSON.stringify(currentCustom), id]);
    }
    
    res.json({ success: true, custom_domains: currentCustom });
  } catch (error) {
    console.error('Add custom domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove a custom domain from a group
router.delete('/group-analysis/groups/:id/custom-domain/:domain', async (req, res) => {
  try {
    const { id, domain } = req.params;
    const cleanDomain = domain.trim().toLowerCase().replace(/^@/, '');
    
    const [group] = await query('SELECT custom_domains FROM lms_groups WHERE id = ?', [id]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    let currentCustom = group.custom_domains ? JSON.parse(group.custom_domains) : [];
    currentCustom = currentCustom.filter(d => d !== cleanDomain);
    
    await query(`
      UPDATE lms_groups 
      SET custom_domains = ?, last_analyzed = NULL 
      WHERE id = ?
    `, [currentCustom.length > 0 ? JSON.stringify(currentCustom) : null, id]);
    
    res.json({ success: true, custom_domains: currentCustom });
  } catch (error) {
    console.error('Remove custom domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk save analysis results for multiple groups
router.post('/group-analysis/save-bulk-analysis', async (req, res) => {
  try {
    const { analyses } = req.body;
    
    if (!analyses || !Array.isArray(analyses)) {
      return res.status(400).json({ error: 'Invalid analyses array' });
    }
    
    let saved = 0;
    for (const analysis of analyses) {
      try {
        await query(`
          UPDATE lms_groups 
          SET potential_users = ?,
              total_npcu = ?,
              last_analyzed = NOW()
          WHERE id = ?
        `, [analysis.potential_users, analysis.total_npcu, analysis.group_id]);
        saved++;
      } catch (e) {
        console.error(`Failed to save analysis for ${analysis.group_id}:`, e);
      }
    }
    
    res.json({ success: true, saved, total: analyses.length });
  } catch (error) {
    console.error('Bulk save analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get LMS users for a partner (to add to new group)
router.get('/group-analysis/partner-lms-users/:partnerId', async (req, res) => {
  try {
    const { partnerId } = req.params;
    
    // Get LMS users linked to contacts for this partner
    const users = await query(`
      SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
      FROM lms_users u
      INNER JOIN contacts c ON c.lms_user_id = u.id
      WHERE c.partner_id = ?
      ORDER BY u.last_name, u.first_name
    `, [partnerId]);
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync a single group's members from the API
router.post('/group-analysis/sync-group/:groupId', async (req, res) => {
  const { groupId } = req.params;
  
  try {
    console.log(`🔄 Syncing single group: ${groupId}`);
    
    // Fetch the group info from API to verify it exists
    const groupResponse = await fetch(`${API_BASE}/v2/groups/${groupId}`, {
      headers: { 'X-Api-Key': API_KEY }
    });
    
    if (!groupResponse.ok) {
      return res.status(404).json({ error: 'Group not found in LMS' });
    }
    
    const groupData = await groupResponse.json();
    const groupAttrs = groupData.data?.attributes || {};
    
    // Update group info in database
    await query(
      `UPDATE lms_groups SET name = ?, synced_at = NOW() WHERE id = ?`,
      [groupAttrs.name || '', groupId]
    );
    
    // Fetch memberships for this group
    let memberships = [];
    let page = 1;
    while (true) {
      const membersResponse = await fetch(
        `${API_BASE}/v2/groups/${groupId}/memberships?page=${page}&limit=100`,
        { headers: { 'X-Api-Key': API_KEY } }
      );
      
      if (!membersResponse.ok) break;
      
      const membersData = await membersResponse.json();
      const pageData = membersData.data || [];
      if (pageData.length === 0) break;
      
      memberships = memberships.concat(pageData);
      
      if (!membersData.links?.next || pageData.length < 100) break;
      page++;
      await new Promise(r => setTimeout(r, 100)); // Rate limit
    }
    
    console.log(`  Found ${memberships.length} memberships from API`);
    
    // Get user IDs from API response
    const apiUserIds = memberships
      .map(m => m.relationships?.person?.data?.id)
      .filter(Boolean);
    
    // Clear ONLY api-synced memberships (preserve local pending additions)
    // Local additions will be confirmed when they appear in API response
    await query('DELETE FROM lms_group_members WHERE group_id = ? AND pending_source = ?', [groupId, 'api']);
    
    // Insert memberships from API
    let addedCount = 0;
    let skippedCount = 0;
    let confirmedCount = 0;
    
    for (const userId of apiUserIds) {
      try {
        // Check if this user was a local pending addition
        const [existing] = await query(
          'SELECT pending_source FROM lms_group_members WHERE group_id = ? AND user_id = ?',
          [groupId, userId]
        );
        
        if (existing && existing.pending_source === 'local') {
          // Confirm the local addition - it's now verified by API
          await query(
            'UPDATE lms_group_members SET pending_source = ? WHERE group_id = ? AND user_id = ?',
            ['api', groupId, userId]
          );
          confirmedCount++;
        } else if (!existing) {
          // New member from API
          await query(
            `INSERT INTO lms_group_members (group_id, user_id, added_at, pending_source) VALUES (?, ?, NOW(), 'api')`,
            [groupId, userId]
          );
          addedCount++;
        }
      } catch (e) {
        // User might not exist in lms_users table
        skippedCount++;
      }
    }
    
    // Update user count
    const [countResult] = await query(
      'SELECT COUNT(*) as count FROM lms_group_members WHERE group_id = ?',
      [groupId]
    );
    const memberCount = countResult?.count || 0;
    
    await query(
      'UPDATE lms_groups SET user_count = ? WHERE id = ?',
      [memberCount, groupId]
    );
    
    // Count pending local additions still waiting for API confirmation
    const [pendingResult] = await query(
      'SELECT COUNT(*) as count FROM lms_group_members WHERE group_id = ? AND pending_source = ?',
      [groupId, 'local']
    );
    const pendingCount = pendingResult?.count || 0;
    
    console.log(`✅ Group ${groupId} synced: ${addedCount} new, ${confirmedCount} confirmed, ${skippedCount} skipped, ${pendingCount} still pending`);
    
    res.json({
      success: true,
      groupId,
      groupName: groupAttrs.name,
      membershipsFromApi: memberships.length,
      membersAdded: addedCount,
      membersConfirmed: confirmedCount,
      membersSkipped: skippedCount,
      membersPending: pendingCount,
      finalMemberCount: memberCount
    });
  } catch (error) {
    console.error(`❌ Single group sync failed for ${groupId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Add members to a group in the local database (without syncing from API)
// This is used after adding users via the API to immediately update local DB
router.post('/group-analysis/groups/:groupId/add-members', async (req, res) => {
  const { groupId } = req.params;
  const { userIds } = req.body;
  
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds array is required' });
  }
  
  try {
    console.log(`📝 Locally adding ${userIds.length} members to group ${groupId}`);
    
    let addedCount = 0;
    let existingCount = 0;
    
    for (const userId of userIds) {
      try {
        // Check if already exists
        const [existing] = await query(
          'SELECT 1 FROM lms_group_members WHERE group_id = ? AND user_id = ?',
          [groupId, userId]
        );
        
        if (existing) {
          existingCount++;
          continue;
        }
        
        await query(
          `INSERT INTO lms_group_members (group_id, user_id, added_at, pending_source) VALUES (?, ?, NOW(), 'local')`,
          [groupId, userId]
        );
        addedCount++;
      } catch (e) {
        console.log(`  Skipped user ${userId}: ${e.message}`);
      }
    }
    
    // Update user count
    const [countResult] = await query(
      'SELECT COUNT(*) as count FROM lms_group_members WHERE group_id = ?',
      [groupId]
    );
    const newCount = countResult?.count || 0;
    
    await query('UPDATE lms_groups SET user_count = ? WHERE id = ?', [newCount, groupId]);
    
    console.log(`✅ Locally added ${addedCount} members (${existingCount} already existed), new count: ${newCount}`);
    
    res.json({
      success: true,
      groupId,
      addedCount,
      existingCount,
      newMemberCount: newCount
    });
  } catch (error) {
    console.error(`❌ Failed to add local members:`, error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Maintenance Endpoints
// ============================================

// Audit partner contacts vs LMS users and group memberships
router.get('/maintenance/partner-contact-audit', async (req, res) => {
  try {
    // Get "All Partners" group ID - this group grants access to partner-only LMS training
    const [allPartnersGroup] = await query(`
      SELECT id, name FROM lms_groups 
      WHERE LOWER(name) = 'all partners'
      LIMIT 1
    `);
    
    const allPartnersGroupId = allPartnersGroup?.id;
    
    // Get all contacts with their LMS status and group memberships
    const contacts = await query(`
      SELECT 
        c.id as contact_id,
        c.email as contact_email,
        c.first_name,
        c.last_name,
        c.lms_user_id,
        p.id as partner_id,
        p.account_name as partner_name,
        p.partner_tier,
        u.email as lms_email,
        u.id as lms_id,
        g.id as partner_group_id,
        g.name as partner_group_name
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      LEFT JOIN lms_users u ON u.id = c.lms_user_id
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      ORDER BY p.account_name, c.last_name, c.first_name
    `);
    
    // Get group memberships for users with LMS accounts
    const memberships = await query(`
      SELECT user_id, group_id FROM lms_group_members
    `);
    const membershipMap = new Map();
    for (const m of memberships) {
      if (!membershipMap.has(m.user_id)) {
        membershipMap.set(m.user_id, new Set());
      }
      membershipMap.get(m.user_id).add(m.group_id);
    }
    
    // Analyze each contact
    const audit = {
      totalContacts: contacts.length,
      withLmsAccount: 0,
      withoutLmsAccount: 0,
      inPartnerGroup: 0,
      missingPartnerGroup: 0,
      inAllPartnersGroup: 0,
      missingAllPartnersGroup: 0,
      issues: [],
      byPartner: {}
    };
    
    for (const contact of contacts) {
      // Initialize partner tracking
      if (!audit.byPartner[contact.partner_id]) {
        audit.byPartner[contact.partner_id] = {
          partnerName: contact.partner_name,
          tier: contact.partner_tier,
          partnerGroupId: contact.partner_group_id,
          partnerGroupName: contact.partner_group_name,
          totalContacts: 0,
          withLms: 0,
          withoutLms: 0,
          missingPartnerGroup: [],
          missingAllPartnersGroup: []
        };
      }
      
      const partnerData = audit.byPartner[contact.partner_id];
      partnerData.totalContacts++;
      
      if (contact.lms_user_id) {
        audit.withLmsAccount++;
        partnerData.withLms++;
        
        const userGroups = membershipMap.get(contact.lms_user_id) || new Set();
        
        // Check partner group membership
        if (contact.partner_group_id) {
          if (userGroups.has(contact.partner_group_id)) {
            audit.inPartnerGroup++;
          } else {
            audit.missingPartnerGroup++;
            partnerData.missingPartnerGroup.push({
              userId: contact.lms_user_id,
              email: contact.lms_email || contact.contact_email,
              name: `${contact.first_name} ${contact.last_name}`.trim()
            });
          }
        }
        
        // Check All Partners group membership
        if (allPartnersGroupId) {
          if (userGroups.has(allPartnersGroupId)) {
            audit.inAllPartnersGroup++;
          } else {
            audit.missingAllPartnersGroup++;
            partnerData.missingAllPartnersGroup.push({
              userId: contact.lms_user_id,
              email: contact.lms_email || contact.contact_email,
              name: `${contact.first_name} ${contact.last_name}`.trim()
            });
          }
        }
      } else {
        audit.withoutLmsAccount++;
        partnerData.withoutLms++;
      }
    }
    
    // Convert byPartner to array and filter to only those with issues
    audit.partnersWithIssues = Object.entries(audit.byPartner)
      .filter(([_, p]) => p.missingPartnerGroup.length > 0 || p.missingAllPartnersGroup.length > 0)
      .map(([id, p]) => ({ partnerId: id, ...p }));
    
    audit.allPartnersGroupId = allPartnersGroupId;
    audit.allPartnersGroupName = allPartnersGroup?.name;
    
    res.json(audit);
  } catch (error) {
    console.error('Audit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get contacts without LMS accounts that could potentially be matched
router.get('/maintenance/unmatched-contacts', async (req, res) => {
  try {
    // Find contacts without LMS user_id but with email that matches an LMS user
    const potentialMatches = await query(`
      SELECT 
        c.id as contact_id,
        c.email as contact_email,
        c.first_name,
        c.last_name,
        p.account_name as partner_name,
        u.id as potential_lms_id,
        u.email as lms_email,
        u.first_name as lms_first_name,
        u.last_name as lms_last_name
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      INNER JOIN lms_users u ON LOWER(u.email) = LOWER(c.email)
      WHERE c.lms_user_id IS NULL
      ORDER BY p.account_name, c.last_name
    `);
    
    // Find contacts with no matching LMS user at all
    const noLmsAccount = await query(`
      SELECT 
        c.id as contact_id,
        c.email,
        c.first_name,
        c.last_name,
        p.account_name as partner_name,
        p.partner_tier
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      LEFT JOIN lms_users u ON LOWER(u.email) = LOWER(c.email)
      WHERE c.lms_user_id IS NULL AND u.id IS NULL
      ORDER BY p.account_name, c.last_name
    `);
    
    res.json({
      potentialMatches,
      noLmsAccount,
      potentialMatchCount: potentialMatches.length,
      noLmsAccountCount: noLmsAccount.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Audit partner group members vs "All Partners" group membership
// Checks that all users in partner groups are also in the "All Partners" group
// Users must be in "All Partners" to access partner-only LMS training
router.get('/maintenance/all-partners-sync-audit', async (req, res) => {
  try {
    // Get "All Partners" group - grants access to partner-only LMS training
    const [allPartnersGroup] = await query(`
      SELECT id, name, user_count FROM lms_groups 
      WHERE LOWER(name) = 'all partners'
      LIMIT 1
    `);
    
    if (!allPartnersGroup) {
      return res.status(404).json({ 
        error: '"All Partners" group not found in database. This group must exist in Northpass to grant partner users access to partner-only training. Please create the group in Northpass and sync LMS groups.',
        suggestion: 'Create a group named "All Partners" in Northpass LMS, then run LMS Groups sync'
      });
    }
    
    // Get All Partners group members
    const allPartnersMembers = await query(`
      SELECT user_id FROM lms_group_members WHERE group_id = ?
    `, [allPartnersGroup.id]);
    const allPartnersMemberSet = new Set(allPartnersMembers.map(m => m.user_id));
    
    // Get all partner groups (matched to partners) with their members
    const partnerGroups = await query(`
      SELECT 
        g.id as group_id,
        g.name as group_name,
        g.user_count,
        p.id as partner_id,
        p.account_name as partner_name,
        p.partner_tier
      FROM lms_groups g
      INNER JOIN partners p ON p.id = g.partner_id
      WHERE g.id != ?
      ORDER BY p.account_name
    `, [allPartnersGroup.id]);
    
    const audit = {
      allPartnersGroupId: allPartnersGroup.id,
      allPartnersGroupName: allPartnersGroup.name,
      allPartnersMemberCount: allPartnersMembers.length,
      totalPartnerGroups: partnerGroups.length,
      totalUsersChecked: 0,
      usersAlreadyInAllPartners: 0,
      usersMissingFromAllPartners: 0,
      partnerGroupsWithIssues: [],
      allMissingUsers: []
    };
    
    // Check each partner group
    for (const group of partnerGroups) {
      // Get members of this partner group
      const groupMembers = await query(`
        SELECT gm.user_id, u.email, u.first_name, u.last_name
        FROM lms_group_members gm
        INNER JOIN lms_users u ON u.id = gm.user_id
        WHERE gm.group_id = ?
      `, [group.group_id]);
      
      const missingUsers = [];
      
      for (const member of groupMembers) {
        audit.totalUsersChecked++;
        
        if (allPartnersMemberSet.has(member.user_id)) {
          audit.usersAlreadyInAllPartners++;
        } else {
          audit.usersMissingFromAllPartners++;
          missingUsers.push({
            userId: member.user_id,
            email: member.email,
            name: `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email
          });
          audit.allMissingUsers.push({
            userId: member.user_id,
            email: member.email,
            name: `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email,
            partnerGroupId: group.group_id,
            partnerGroupName: group.group_name,
            partnerId: group.partner_id,
            partnerName: group.partner_name,
            partnerTier: group.partner_tier
          });
        }
      }
      
      if (missingUsers.length > 0) {
        audit.partnerGroupsWithIssues.push({
          groupId: group.group_id,
          groupName: group.group_name,
          partnerId: group.partner_id,
          partnerName: group.partner_name,
          partnerTier: group.partner_tier,
          totalMembers: groupMembers.length,
          missingUsers
        });
      }
    }
    
    // REVERSE CHECK: Find users in "All Partners" who are NOT in any partner group
    // These users shouldn't have access to partner-only training
    const allPartnerGroupIds = partnerGroups.map(g => g.group_id);
    
    // Get all users who are in at least one partner group
    let usersInPartnerGroups = new Set();
    if (allPartnerGroupIds.length > 0) {
      const partnerGroupMembers = await query(`
        SELECT DISTINCT user_id FROM lms_group_members 
        WHERE group_id IN (${allPartnerGroupIds.map(() => '?').join(',')})
      `, allPartnerGroupIds);
      // Ensure we have an array
      const membersList = Array.isArray(partnerGroupMembers) ? partnerGroupMembers : [];
      usersInPartnerGroups = new Set(membersList.map(m => m.user_id));
    }
    
    // Find users in All Partners who are NOT in any partner group
    const usersToRemove = [];
    const allPartnersArray = Array.isArray(allPartnersMembers) ? allPartnersMembers : [];
    for (const member of allPartnersArray) {
      if (!usersInPartnerGroups.has(member.user_id)) {
        usersToRemove.push(member.user_id);
      }
    }
    
    // Get details for users who shouldn't be in All Partners
    let usersNotInAnyPartnerGroup = [];
    if (usersToRemove.length > 0) {
      usersNotInAnyPartnerGroup = await query(`
        SELECT id as userId, email, 
               CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) as name
        FROM lms_users 
        WHERE id IN (${usersToRemove.map(() => '?').join(',')})
        ORDER BY email
      `, usersToRemove);
    }
    
    audit.usersToRemoveFromAllPartners = usersNotInAnyPartnerGroup.length;
    audit.allUsersToRemove = usersNotInAnyPartnerGroup;
    
    res.json(audit);
  } catch (error) {
    console.error('All Partners sync audit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add users to "All Partners" group via API AND update local database
// This ensures the local DB reflects the changes immediately after API calls
router.post('/maintenance/add-to-all-partners', async (req, res) => {
  const { userIds, allPartnersGroupId } = req.body;
  
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds array is required' });
  }
  
  if (!allPartnersGroupId) {
    return res.status(400).json({ error: 'allPartnersGroupId is required' });
  }
  
  const results = { 
    apiAdded: 0, 
    apiFailed: 0, 
    dbAdded: 0, 
    dbFailed: 0, 
    errors: [] 
  };
  
  try {
    // Process in batches of 10
    const BATCH_SIZE = 10;
    
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);
      
      try {
        // Build the data array for JSON:API format
        const peopleData = batch.map(userId => ({
          type: 'people',
          id: String(userId)
        }));
        
        // Make API call to add users to group
        const apiResponse = await fetch(`https://api.northpass.com/v2/groups/${allPartnersGroupId}/relationships/people`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': process.env.NORTHPASS_API_KEY || 'wcU0QRpN9jnPvXEc5KXMiuVWk'
          },
          body: JSON.stringify({ data: peopleData })
        });
        
        if (apiResponse.ok) {
          results.apiAdded += batch.length;
          
          // Update local database for each user in this batch
          for (const userId of batch) {
            try {
              await query(
                `INSERT IGNORE INTO lms_group_members (group_id, user_id, added_at) VALUES (?, ?, NOW())`,
                [allPartnersGroupId, userId]
              );
              results.dbAdded++;
            } catch (dbErr) {
              results.dbFailed++;
              console.error(`DB insert failed for user ${userId}:`, dbErr.message);
            }
          }
        } else {
          const errorData = await apiResponse.json().catch(() => ({}));
          results.apiFailed += batch.length;
          results.errors.push({ 
            batch: Math.floor(i / BATCH_SIZE), 
            userIds: batch,
            status: apiResponse.status,
            error: errorData.error || errorData.message || `API returned ${apiResponse.status}` 
          });
        }
      } catch (err) {
        results.apiFailed += batch.length;
        results.errors.push({ 
          batch: Math.floor(i / BATCH_SIZE), 
          error: err.message 
        });
      }
      
      // Rate limit between batches
      if (i + BATCH_SIZE < userIds.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    // Update the group's user count in local DB
    const [memberCount] = await query(
      `SELECT COUNT(*) as count FROM lms_group_members WHERE group_id = ?`,
      [allPartnersGroupId]
    );
    await query(
      `UPDATE lms_groups SET user_count = ? WHERE id = ?`,
      [memberCount.count, allPartnersGroupId]
    );
    
    console.log(`✅ Add to All Partners: API added ${results.apiAdded}, DB added ${results.dbAdded}, Failed ${results.apiFailed}`);
    
    res.json({
      success: results.apiFailed === 0,
      results,
      message: `Added ${results.apiAdded} users via API, ${results.dbAdded} to local DB`
    });
    
  } catch (error) {
    console.error('Add to All Partners error:', error);
    res.status(500).json({ error: error.message, results });
  }
});

// ============================================
// Report Endpoints
// ============================================
// Simple in-memory cache for report endpoints (5 min TTL)
// ...existing code...

router.get('/reports/partner-npcu', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCacheValid('partner-npcu')) {
      return res.json(reportCache['partner-npcu'].data);
    }
    const report = await query(`
      SELECT 
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        COUNT(DISTINCT c.id) as contact_count,
        COUNT(DISTINCT CASE WHEN c.lms_user_id IS NOT NULL THEN c.id END) as lms_users,
        SUM(CASE WHEN e.status = 'completed' AND c.npcu_value > 0 THEN c.npcu_value ELSE 0 END) as total_npcu,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' AND c.is_certification = 1 THEN e.id END) as certifications
      FROM partners p
      LEFT JOIN contacts ct ON ct.partner_id = p.id
      LEFT JOIN lms_users u ON u.id = ct.lms_user_id
      LEFT JOIN lms_enrollments e ON e.user_id = u.id
      LEFT JOIN lms_courses c ON c.id = e.course_id
      GROUP BY p.id
      ORDER BY total_npcu DESC
    `);
    setCache('partner-npcu', report);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/certification-gaps', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCacheValid('certification-gaps')) {
      return res.json(reportCache['certification-gaps'].data);
    }
    const { tier } = req.query;
    
    // Fetch tier requirements from database (partner_tiers table)
    const tiers = await query('SELECT name, npcu_required FROM partner_tiers WHERE is_active = TRUE');
    const tierRequirements = {};
    tiers.forEach(t => {
      tierRequirements[t.name] = t.npcu_required || 0;
    });
    // Fallback defaults if no tiers in database
    if (Object.keys(tierRequirements).length === 0) {
      tierRequirements['Premier'] = 20;
      tierRequirements['Premier Plus'] = 20;
      tierRequirements['Certified'] = 10;
      tierRequirements['Registered'] = 5;
      tierRequirements['Aggregator'] = 5;
    }

    let sql = `
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        COALESCE(SUM(CASE WHEN e.status = 'completed' AND c.npcu_value > 0 THEN c.npcu_value ELSE 0 END), 0) as current_npcu
      FROM partners p
      LEFT JOIN contacts ct ON ct.partner_id = p.id
      LEFT JOIN lms_users u ON u.id = ct.lms_user_id
      LEFT JOIN lms_enrollments e ON e.user_id = u.id
      LEFT JOIN lms_courses c ON c.id = e.course_id
      WHERE 1=1
    `;
    const params = [];

    if (tier) {
      sql += ' AND p.partner_tier = ?';
      params.push(tier);
    }

    sql += ' GROUP BY p.id ORDER BY p.partner_tier, current_npcu';

    const results = await query(sql, params);
    // Add gap calculation
    const report = results.map(r => ({
      ...r,
      required_npcu: tierRequirements[r.partner_tier] || 0,
      npcu_gap: Math.max(0, (tierRequirements[r.partner_tier] || 0) - r.current_npcu)
    }));
    setCache('certification-gaps', report);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Partner Leaderboard - Top partners by NPCU
router.get('/reports/partner-leaderboard', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCacheValid('partner-leaderboard')) {
      return res.json(reportCache['partner-leaderboard'].data);
    }
    const { tier, region, limit = 50 } = req.query;
    
    // Simple query using lms_groups.user_count and partner_npcu_cache
    // LMS group is master for user count
    let sql = `
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        (SELECT COUNT(*) FROM contacts ct WHERE ct.partner_id = p.id) as total_contacts,
        COALESCE(g.user_count, 0) as lms_users,
        COALESCE(nc.total_certifications, 0) as total_certifications,
        COALESCE(nc.active_npcu, 0) as total_npcu,
        COALESCE(nc.certified_users, 0) as certified_users
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      LEFT JOIN partner_npcu_cache nc ON nc.partner_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (tier) {
      sql += ' AND p.partner_tier = ?';
      params.push(tier);
    }
    if (region) {
      sql += ' AND p.account_region = ?';
      params.push(region);
    }
    sql += ' ORDER BY total_npcu DESC, total_certifications DESC';
    sql += ' LIMIT ?';
    params.push(parseInt(limit));
    
    const results = await query(sql, params);
    setCache('partner-leaderboard', results);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Course Popularity - Most completed courses
router.get('/reports/course-popularity', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCacheValid('course-popularity')) {
      return res.json(reportCache['course-popularity'].data);
    }
    const { limit = 20 } = req.query;
    const results = await query(`
      SELECT 
        c.id,
        c.name,
        c.product_category,
        c.npcu_value,
        c.is_certification,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.id END) as completion_count,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.user_id END) as unique_users,
        AVG(CASE WHEN e.status = 'completed' THEN e.score END) as avg_score
      FROM lms_courses c
      LEFT JOIN lms_enrollments e ON e.course_id = c.id
      GROUP BY c.id
      HAVING completion_count > 0
      ORDER BY completion_count DESC
      LIMIT ?
    `, [parseInt(limit)]);
    setCache('course-popularity', results);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Recent Activity - Latest completions
router.get('/reports/recent-activity', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const cacheKey = `recent-activity-${req.query.days || 30}-${req.query.limit || 100}`;
    if (!forceRefresh && isCacheValid(cacheKey)) {
      return res.json(reportCache[cacheKey].data);
    }
    const { days = 30, limit = 100 } = req.query;
    const results = await query(`
      SELECT 
        e.id as enrollment_id,
        e.completed_at,
        u.email,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        c.name as course_name,
        c.npcu_value,
        c.is_certification,
        p.account_name as partner_name,
        p.partner_tier
      FROM lms_enrollments e
      INNER JOIN lms_users u ON u.id = e.user_id
      INNER JOIN lms_courses c ON c.id = e.course_id
      LEFT JOIN contacts ct ON ct.lms_user_id = u.id
      LEFT JOIN partners p ON p.id = ct.partner_id
      WHERE e.status = 'completed'
        AND e.completed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY e.completed_at DESC
      LIMIT ?
    `, [parseInt(days), parseInt(limit)]);
    setCache(cacheKey, results);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Expiring Certifications - Certs expiring soon
router.get('/reports/expiring-certifications', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const cacheKey = `expiring-certifications-${req.query.days || 90}`;
    if (!forceRefresh && isCacheValid(cacheKey)) {
      return res.json(reportCache[cacheKey].data);
    }
    const { days = 90 } = req.query;
    const results = await query(`
      SELECT 
        e.id as enrollment_id,
        e.completed_at,
        e.expires_at,
        DATEDIFF(e.expires_at, NOW()) as days_until_expiry,
        u.email,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        c.name as course_name,
        c.npcu_value,
        p.account_name as partner_name,
        p.partner_tier
      FROM lms_enrollments e
      INNER JOIN lms_users u ON u.id = e.user_id
      INNER JOIN lms_courses c ON c.id = e.course_id
      LEFT JOIN contacts ct ON ct.lms_user_id = u.id
      LEFT JOIN partners p ON p.id = ct.partner_id
      WHERE e.status = 'completed'
        AND c.is_certification = 1
        AND e.expires_at IS NOT NULL
        AND e.expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
        AND e.expires_at >= NOW()
      ORDER BY e.expires_at ASC
    `, [parseInt(days)]);
    setCache(cacheKey, results);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inactive Users - LMS users with no recent activity
router.get('/reports/inactive-users', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const cacheKey = `inactive-users-${req.query.days || 180}-${req.query.limit || 200}`;
    if (!forceRefresh && isCacheValid(cacheKey)) {
      return res.json(reportCache[cacheKey].data);
    }
    const { days = 180, limit = 200 } = req.query;
    const results = await query(`
      SELECT 
        u.id as lms_user_id,
        u.email,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.last_active_at,
        DATEDIFF(NOW(), COALESCE(u.last_active_at, u.created_at_lms)) as days_inactive,
        p.account_name as partner_name,
        p.partner_tier,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.id END) as total_completions
      FROM lms_users u
      LEFT JOIN contacts ct ON ct.lms_user_id = u.id
      LEFT JOIN partners p ON p.id = ct.partner_id
      LEFT JOIN lms_enrollments e ON e.user_id = u.id
      WHERE u.status = 'active'
        AND (u.last_active_at IS NULL OR u.last_active_at < DATE_SUB(NOW(), INTERVAL ? DAY))
      GROUP BY u.id
      ORDER BY days_inactive DESC
      LIMIT ?
    `, [parseInt(days), parseInt(limit)]);
    setCache(cacheKey, results);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Overview report - summary by tier and region (OPTIMIZED + CACHED)
// Uses parallel queries, avoids expensive cartesian joins, and caches for 5 minutes
router.get('/reports/overview', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    
    // Check cache first (unless force refresh requested)
    if (!forceRefresh && isCacheValid('overview')) {
      return res.json(reportCache.overview.data);
    }
    
    // Run all queries in parallel for better performance
    const [byTier, byRegion, byOwner, partnerContactTotals, lmsUserCount, lmsGroupCount] = await Promise.all([
      // Summary by tier
      query(`
        SELECT 
          p.partner_tier as tier,
          COUNT(DISTINCT p.id) as partner_count,
          COUNT(DISTINCT c.id) as contact_count,
          COUNT(DISTINCT CASE WHEN c.lms_user_id IS NOT NULL THEN c.id END) as lms_linked_count
        FROM partners p
        LEFT JOIN contacts c ON c.partner_id = p.id
        WHERE p.partner_tier IS NOT NULL AND p.partner_tier != ''
        GROUP BY p.partner_tier
        ORDER BY FIELD(p.partner_tier, 'Premier', 'Select', 'Registered', 'Certified')
      `),
      
      // Summary by region
      query(`
        SELECT 
          p.account_region as region,
          COUNT(DISTINCT p.id) as partner_count,
          COUNT(DISTINCT c.id) as contact_count,
          COUNT(DISTINCT CASE WHEN c.lms_user_id IS NOT NULL THEN c.id END) as lms_linked_count
        FROM partners p
        LEFT JOIN contacts c ON c.partner_id = p.id
        WHERE p.account_region IS NOT NULL AND p.account_region != ''
        GROUP BY p.account_region
        ORDER BY p.account_region
      `),
      
      // Summary by owner (top 20)
      query(`
        SELECT 
          p.account_owner as owner,
          COUNT(DISTINCT p.id) as partner_count,
          COUNT(DISTINCT c.id) as contact_count
        FROM partners p
        LEFT JOIN contacts c ON c.partner_id = p.id
        WHERE p.account_owner IS NOT NULL AND p.account_owner != ''
        GROUP BY p.account_owner
        ORDER BY partner_count DESC
        LIMIT 20
      `),
      
      // Partner and contact totals (single efficient query using subqueries)
      query(`
        SELECT 
          (SELECT COUNT(*) FROM partners) as total_partners,
          (SELECT COUNT(*) FROM contacts) as total_contacts,
          (SELECT COUNT(*) FROM contacts WHERE lms_user_id IS NOT NULL) as lms_linked_contacts
      `),
      
      // LMS user count (separate simple query - avoids cartesian join)
      query(`SELECT COUNT(*) as count FROM lms_users`),
      
      // LMS group count (separate simple query - avoids cartesian join)
      query(`SELECT COUNT(*) as count FROM lms_groups`)
    ]);

    // Combine totals from separate queries
    const totals = {
      total_partners: partnerContactTotals[0]?.total_partners || 0,
      total_contacts: partnerContactTotals[0]?.total_contacts || 0,
      lms_linked_contacts: partnerContactTotals[0]?.lms_linked_contacts || 0,
      total_lms_users: lmsUserCount[0]?.count || 0,
      total_lms_groups: lmsGroupCount[0]?.count || 0
    };

    const result = { byTier, byRegion, byOwner, totals };
    
    // Cache the result
    setCache('overview', result);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User certifications report - who has what (OPTIMIZED)
router.get('/reports/user-certifications', async (req, res) => {
  try {
    const { partnerId, tier, region, search, limit = 1000, offset = 0 } = req.query;
    
    let sql = `
      SELECT 
        c.id as contact_id,
        c.email,
        c.first_name,
        c.last_name,
        c.title,
        p.account_name,
        p.partner_tier,
        p.account_region,
        u.id as lms_user_id,
        u.status as lms_status,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.id END) as completed_courses,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' AND co.is_certification = 1 THEN e.id END) as certifications,
        COALESCE(SUM(CASE WHEN e.status = 'completed' THEN co.npcu_value ELSE 0 END), 0) as total_npcu,
        MAX(e.completed_at) as last_completion
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      LEFT JOIN lms_users u ON u.id = c.lms_user_id
      LEFT JOIN lms_enrollments e ON e.user_id = u.id AND e.status = 'completed'
      LEFT JOIN lms_courses co ON co.id = e.course_id
      WHERE 1=1
    `;
    const params = [];

    if (partnerId) {
      sql += ' AND p.id = ?';
      params.push(partnerId);
    }
    if (tier) {
      sql += ' AND p.partner_tier = ?';
      params.push(tier);
    }
    if (region) {
      sql += ' AND p.account_region = ?';
      params.push(region);
    }
    if (search) {
      sql += ' AND (c.email LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR p.account_name LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    sql += ' GROUP BY c.id, c.email, c.first_name, c.last_name, c.title, p.account_name, p.partner_tier, p.account_region, u.id, u.status';
    sql += ' ORDER BY total_npcu DESC, p.account_name';
    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const results = await query(sql, params);
    res.json(results);
  } catch (error) {
    console.error('User certifications report error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Contacts not in LMS - find gaps (OPTIMIZED)
router.get('/reports/contacts-not-in-lms', async (req, res) => {
  try {
    const { tier, region, owner, excludePersonal, limit = 1000, offset = 0 } = req.query;
    
    let sql = `
      SELECT 
        c.id,
        c.email,
        c.first_name,
        c.last_name,
        c.title,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      WHERE c.lms_user_id IS NULL
    `;
    const params = [];

    if (tier) {
      sql += ' AND p.partner_tier = ?';
      params.push(tier);
    }
    if (region) {
      sql += ' AND p.account_region = ?';
      params.push(region);
    }
    if (owner) {
      sql += ' AND p.account_owner = ?';
      params.push(owner);
    }
    if (excludePersonal === 'true') {
      sql += ` AND c.email NOT LIKE '%@gmail.com'
               AND c.email NOT LIKE '%@hotmail.com'
               AND c.email NOT LIKE '%@yahoo.com'
               AND c.email NOT LIKE '%@outlook.com'`;
    }

    sql += ' ORDER BY p.partner_tier, p.account_name, c.last_name';
    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const results = await query(sql, params);
    res.json(results);
  } catch (error) {
    console.error('Contacts not in LMS report error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Partners without LMS groups
router.get('/reports/partners-without-groups', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCacheValid('partners-without-groups')) {
      return res.json(reportCache['partners-without-groups'].data);
    }
    const results = await query(`
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        COUNT(DISTINCT c.id) as contact_count
      FROM partners p
      LEFT JOIN contacts c ON c.partner_id = p.id
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE g.id IS NULL
      GROUP BY p.id
      ORDER BY p.partner_tier, p.account_name
    `);
    setCache('partners-without-groups', results);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LMS users in partner groups but NOT in CRM contacts
router.get('/reports/lms-users-not-in-crm', async (req, res) => {
  try {
    const { groupId, search, limit = 500, offset = 0 } = req.query;
    const result = await getLmsUsersNotInCrm({
      groupId,
      search,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    res.json(result);
  } catch (error) {
    console.error('LMS users not in CRM report error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all account owners with partner counts (for Account Owner Report dropdown)
router.get('/reports/owners', async (req, res) => {
  try {
    const owners = await query(`
      SELECT 
        p.account_owner,
        COUNT(DISTINCT p.id) as partner_count
      FROM partners p
      WHERE p.account_owner IS NOT NULL 
        AND p.account_owner != ''
      GROUP BY p.account_owner
      ORDER BY p.account_owner
    `);
    res.json(owners);
  } catch (error) {
    console.error('Account owners report error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all partners for a specific account owner with details (for Account Owner Report)
router.get('/reports/owner-accounts', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const cacheKey = `owner-accounts-${req.query.owner || ''}`;
    if (!forceRefresh && isCacheValid(cacheKey)) {
      return res.json(reportCache[cacheKey].data);
    }
    const { owner } = req.query;
    if (!owner) {
      return res.status(400).json({ error: 'Owner parameter is required' });
    }
    
    // Simple query using lms_groups.user_count and partner_npcu_cache
    // LMS group is master for user count
    const results = await query(`
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        (SELECT COUNT(*) FROM contacts c WHERE c.partner_id = p.id) as contact_count,
        COALESCE(g.user_count, 0) as lms_users,
        COALESCE(nc.active_npcu, 0) as total_npcu,
        COALESCE(nc.total_certifications, 0) as active_certifications,
        g.id as group_id,
        g.name as group_name
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      LEFT JOIN partner_npcu_cache nc ON nc.partner_id = p.id
      WHERE p.account_owner = ?
      ORDER BY p.account_name
    `, [owner]);
    
    setCache(cacheKey, results);
    res.json(results);
  } catch (error) {
    console.error('Owner accounts report error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get tiers and regions for filters
router.get('/reports/filters', async (req, res) => {
  try {
    const tiers = await query(`
      SELECT DISTINCT partner_tier as value 
      FROM partners 
      WHERE partner_tier IS NOT NULL AND partner_tier != ''
      ORDER BY FIELD(partner_tier, 'Premier', 'Select', 'Registered', 'Certified')
    `);
    
    const regions = await query(`
      SELECT DISTINCT account_region as value 
      FROM partners 
      WHERE account_region IS NOT NULL AND account_region != ''
      ORDER BY account_region
    `);
    
    const owners = await query(`
      SELECT DISTINCT account_owner as value 
      FROM partners 
      WHERE account_owner IS NOT NULL AND account_owner != ''
      ORDER BY account_owner
    `);

    res.json({ 
      tiers: tiers.map(t => t.value),
      regions: regions.map(r => r.value),
      owners: owners.map(o => o.value)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Trend Analytics Endpoints
// All endpoints support stacked filters: region, owner, tier
// Example: /api/db/trends/kpi-summary?region=Americas&tier=Premier&owner=John%20Doe
// ============================================

// Helper to extract filters from query params
function extractFilters(query) {
  const filters = {};
  if (query.region) filters.region = query.region;
  if (query.owner) filters.owner = query.owner;
  if (query.tier) filters.tier = query.tier;
  return filters;
}

// KPI Summary - current period with MoM/YoY comparisons
router.get('/trends/kpi-summary', async (req, res) => {
  try {
    const filters = extractFilters(req.query);
    const summary = await getKpiSummary(filters);
    res.json(summary);
  } catch (error) {
    console.error('KPI Summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Year-to-Date comparison
router.get('/trends/ytd', async (req, res) => {
  try {
    const filters = extractFilters(req.query);
    const ytd = await getYtdComparison(filters);
    res.json(ytd);
  } catch (error) {
    console.error('YTD comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// User registration trends by month
router.get('/trends/users', async (req, res) => {
  try {
    const { months = 24 } = req.query;
    const filters = extractFilters(req.query);
    const trends = await getUserRegistrationTrends(parseInt(months), filters);
    res.json(trends);
  } catch (error) {
    console.error('User trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enrollment trends by month
router.get('/trends/enrollments', async (req, res) => {
  try {
    const { months = 24 } = req.query;
    const filters = extractFilters(req.query);
    const trends = await getEnrollmentTrends(parseInt(months), filters);
    res.json(trends);
  } catch (error) {
    console.error('Enrollment trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Certification trends (NPCU courses) by month
router.get('/trends/certifications', async (req, res) => {
  try {
    const { months = 24 } = req.query;
    const filters = extractFilters(req.query);
    const trends = await getCertificationTrends(parseInt(months), filters);
    res.json(trends);
  } catch (error) {
    console.error('Certification trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Course popularity trends
router.get('/trends/courses', async (req, res) => {
  try {
    const { months = 12, top = 10 } = req.query;
    const filters = extractFilters(req.query);
    const trends = await getCoursePopularityTrends(parseInt(months), parseInt(top), filters);
    res.json(trends);
  } catch (error) {
    console.error('Course popularity error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compliance by tier (current snapshot)
router.get('/trends/compliance', async (req, res) => {
  try {
    const filters = extractFilters(req.query);
    const compliance = await getComplianceTrends(12, filters);
    res.json(compliance);
  } catch (error) {
    console.error('Compliance trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Regional trends
router.get('/trends/regional', async (req, res) => {
  try {
    const { months = 24 } = req.query;
    const filters = extractFilters(req.query);
    const trends = await getRegionalTrends(parseInt(months), filters);
    res.json(trends);
  } catch (error) {
    console.error('Regional trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Weekly summary
router.get('/trends/weekly', async (req, res) => {
  try {
    const { weeks = 12 } = req.query;
    const filters = extractFilters(req.query);
    const summary = await getWeeklySummary(parseInt(weeks), filters);
    res.json(summary);
  } catch (error) {
    console.error('Weekly summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Owner-specific trends
router.get('/trends/owner', async (req, res) => {
  try {
    const { owner, months = 12 } = req.query;
    if (!owner) {
      return res.status(400).json({ error: 'Owner name required' });
    }
    const filters = extractFilters(req.query);
    const trends = await getOwnerTrends(owner, parseInt(months), filters);
    res.json(trends);
  } catch (error) {
    console.error('Owner trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Full trend report (for export/presentation)
router.get('/trends/full-report', async (req, res) => {
  try {
    const { months = 12 } = req.query;
    const filters = extractFilters(req.query);
    const report = await getFullTrendReport(parseInt(months), filters);
    res.json(report);
  } catch (error) {
    console.error('Full trend report error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Company Dashboard Endpoint (for CompanyWidget)
// ============================================

// Helper function to determine product category from course name
function getProductCategory(courseName) {
  if (!courseName) return 'Other';
  const name = courseName.toLowerCase();
  
  if (name.includes('k2') || name.includes('automation k2')) {
    return 'Nintex K2';
  }
  if (name.includes('salesforce') || name.includes('docgen')) {
    return 'Nintex for Salesforce';
  }
  if (name.includes('automation cloud') || name.includes('workflow') || 
      name.includes('forms') || name.includes('rpa') || name.includes('process') ||
      name.includes('sharepoint') || name.includes('office 365') || name.includes('apps') ||
      name.includes('esign') || name.includes('promapp')) {
    return 'Nintex CE';
  }
  return 'Other';
}

// Get company dashboard data by group name (for CompanyWidget)
router.get('/dashboard/group', async (req, res) => {
  try {
    const { name } = req.query;
    
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    // Find the LMS group by name (case-insensitive)
    const [groups] = await query(
      'SELECT * FROM lms_groups WHERE LOWER(name) = LOWER(?) LIMIT 1',
      [name]
    );
    
    if (!groups || groups.length === 0) {
      return res.status(404).json({ error: `Group "${name}" not found` });
    }
    
    const group = groups;
    
    // Get all users in this group via lms_group_members
    const users = await query(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.last_active_at
      FROM lms_users u
      JOIN lms_group_members gm ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `, [group.id]);
    
    if (users.length === 0) {
      // Return empty dashboard
      return res.json({
        group: {
          id: group.id,
          name: group.name,
          memberCount: 0
        },
        users: [],
        totals: {
          totalNPCU: 0,
          certifiedUsers: 0,
          totalEnrolled: 0,
          totalInProgress: 0,
          totalCompleted: 0,
          totalCertifications: 0
        },
        productBreakdown: {
          'Nintex CE': { count: 0, npcu: 0, courses: [] },
          'Nintex K2': { count: 0, npcu: 0, courses: [] },
          'Nintex for Salesforce': { count: 0, npcu: 0, courses: [] },
          'Other': { count: 0, npcu: 0, courses: [] }
        }
      });
    }
    
    const userIds = users.map(u => u.id);
    const placeholders = userIds.map(() => '?').join(',');
    
    // Get all enrollments for these users with course info
    const enrollments = await query(`
      SELECT 
        e.id as enrollment_id,
        e.user_id,
        e.course_id,
        e.status,
        e.progress_percent,
        e.enrolled_at,
        e.started_at,
        e.completed_at,
        e.expires_at,
        co.name as course_name,
        co.npcu_value,
        co.is_certification,
        co.product_category
      FROM lms_enrollments e
      JOIN lms_courses co ON co.id = e.course_id
      WHERE e.user_id IN (${placeholders})
    `, userIds);
    
    // Build user data with learning stats
    const productBreakdown = {
      'Nintex CE': { count: 0, npcu: 0, courses: [] },
      'Nintex K2': { count: 0, npcu: 0, courses: [] },
      'Nintex for Salesforce': { count: 0, npcu: 0, courses: [] },
      'Other': { count: 0, npcu: 0, courses: [] }
    };
    
    let totalNPCU = 0;
    let certifiedUsers = 0;
    let totalEnrolled = 0;
    let totalInProgress = 0;
    let totalCompleted = 0;
    let totalCertifications = 0;
    
    // Track unique certifications to avoid duplicates
    const countedCertifications = new Set();
    
    const processedUsers = users.map(user => {
      const userEnrollments = enrollments.filter(e => e.user_id === user.id);
      
      let userNPCU = 0;
      let userCertCount = 0;
      const userCertifications = [];
      
      // Count all enrollments (total courses user is enrolled in, regardless of status)
      let totalEnrollments = userEnrollments.length;
      let inProgress = 0;
      let completed = 0;
      
      userEnrollments.forEach(e => {
        if (e.status === 'in_progress') inProgress++;
        else if (e.status === 'completed') {
          completed++;
          
          // Check if this is a valid certification (not expired)
          const isExpired = e.expires_at && new Date(e.expires_at) < new Date();
          
          if (e.is_certification && e.npcu_value > 0 && !isExpired) {
            // Use course_id + user_id as unique key to avoid counting duplicates
            const certKey = `${user.id}-${e.course_id}`;
            if (!countedCertifications.has(certKey)) {
              countedCertifications.add(certKey);
              
              userNPCU += e.npcu_value;
              userCertCount++;
              
              // Add to product breakdown
              const category = e.product_category || getProductCategory(e.course_name);
              if (productBreakdown[category]) {
                productBreakdown[category].count++;
                productBreakdown[category].npcu += e.npcu_value;
                productBreakdown[category].courses.push({
                  id: e.course_id,
                  name: e.course_name,
                  npcu: e.npcu_value,
                  completedAt: e.completed_at,
                  expiresAt: e.expires_at,
                  userId: user.id,
                  userName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email
                });
              }
              
              userCertifications.push({
                id: e.enrollment_id,
                courseId: e.course_id,
                name: e.course_name,
                npcu: e.npcu_value,
                completedAt: e.completed_at,
                expiresAt: e.expires_at,
                status: 'completed',
                isValidCourse: true
              });
            }
          }
        }
      });
      
      // Update totals
      totalNPCU += userNPCU;
      totalEnrolled += totalEnrollments;  // Total courses enrolled (all statuses)
      totalInProgress += inProgress;
      totalCompleted += completed;
      totalCertifications += userCertCount;
      
      if (userNPCU > 0) certifiedUsers++;
      
      return {
        id: user.id,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
        email: user.email,
        lastLoginAt: user.last_active_at,
        totalNPCU: userNPCU,
        certificationCount: userCertCount,
        certifications: userCertifications,
        enrolledCourses: totalEnrollments,  // Total courses this user is enrolled in
        inProgressCourses: inProgress,
        completedCourses: completed,
        totalCourses: userEnrollments.length,
        completionRate: userEnrollments.length > 0 
          ? Math.round((completed / userEnrollments.length) * 100) 
          : 0
      };
    });
    
    // Sort users by NPCU descending
    processedUsers.sort((a, b) => b.totalNPCU - a.totalNPCU);
    
    res.json({
      group: {
        id: group.id,
        name: group.name,
        memberCount: users.length
      },
      users: processedUsers,
      totals: {
        totalNPCU,
        certifiedUsers,
        totalEnrolled,
        totalInProgress,
        totalCompleted,
        totalCertifications
      },
      productBreakdown
    });
    
  } catch (error) {
    console.error('Company dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Scheduled Sync Endpoints
// ============================================

// Get schedule configuration
router.get('/schedule', async (req, res) => {
  try {
    const config = await getScheduleConfig();
    const status = getSchedulerStatus();
    res.json({ ...config, ...status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update schedule configuration
router.put('/schedule', async (req, res) => {
  try {
    const { enabled, interval_hours, sync_types } = req.body;
    const config = await updateScheduleConfig({
      enabled: enabled ?? false,
      interval_hours: interval_hours ?? 24,
      sync_types: sync_types ?? ['users', 'groups', 'courses', 'enrollments']
    });
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Excel Import Endpoints (Partner Data Management)
// ============================================

// Track active import
let activeImport = null;

// Import progress endpoint
router.get('/import/progress', async (req, res) => {
  try {
    const progress = await getImportProgress();
    res.json(progress || { status: 'idle' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import status endpoint
router.get('/import/status', async (req, res) => {
  try {
    if (activeImport) {
      res.json(activeImport);
    } else {
      res.json({ status: 'idle' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Excel import endpoint
router.post('/import/excel', async (req, res) => {
  try {
    // Set active import status
    activeImport = { status: 'processing', startedAt: new Date().toISOString() };
    
    // Extract file data from request body
    const { fileData, fileName, clearExisting = false } = req.body;
    
    if (!fileData) {
      throw new Error('No file data provided');
    }
    
    // Convert base64 to Buffer
    const fileBuffer = Buffer.from(fileData, 'base64');
    console.log(`📥 Received ${fileBuffer.length} bytes for ${fileName || 'unnamed file'}`);
    
    const result = await importContactsFromExcel(fileBuffer, fileName, { clearExisting });
    
    activeImport = { 
      status: 'completed', 
      completedAt: new Date().toISOString(),
      result 
    };
    
    res.json(result);
  } catch (error) {
    console.error('❌ Import failed:', error);
    activeImport = { 
      status: 'error', 
      error: error.message,
      completedAt: new Date().toISOString()
    };
    res.status(500).json({ error: error.message });
  }
});

// Get import statistics
router.get('/import/stats', async (req, res) => {
  try {
    const stats = await getImportStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get partners list for import management
router.get('/import/partners', async (req, res) => {
  try {
    const { limit = 100, search } = req.query;
    if (search) {
      const partners = await searchPartners(search, parseInt(limit));
      res.json(partners);
    } else {
      const partners = await getPartnerList(parseInt(limit));
      res.json(partners);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get contacts for a specific partner
router.get('/import/partners/:id/contacts', async (req, res) => {
  try {
    const contacts = await getPartnerContacts(parseInt(req.params.id));
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search contacts endpoint
router.get('/import/search', async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }
    const contacts = await searchContacts(q, parseInt(limit));
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search contacts (alternate endpoint for export)
router.get('/import/contacts/search', async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    const contacts = await searchContacts(q || '@', parseInt(limit));
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Preview contacts for cleaning
router.get('/import/preview/:type/:value', async (req, res) => {
  try {
    const { type, value } = req.params;
    const { limit = 200 } = req.query;
    const contacts = await getContactsPreview(type, value, parseInt(limit));
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete partner
router.delete('/import/partners/:id', async (req, res) => {
  try {
    const result = await deletePartner(parseInt(req.params.id));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete by region
router.delete('/import/by-region/:region', async (req, res) => {
  try {
    const result = await deleteByRegion(req.params.region);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete by tier
router.delete('/import/by-tier/:tier', async (req, res) => {
  try {
    const result = await deleteByTier(req.params.tier);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete by account pattern
router.delete('/import/by-pattern/:pattern', async (req, res) => {
  try {
    const result = await deleteByAccountPattern(req.params.pattern);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unmatched contacts (not linked to LMS)
router.get('/import/unmatched', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const contacts = await getUnmatchedContacts({
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get match statistics
router.get('/import/match-stats', async (req, res) => {
  try {
    const stats = await getMatchStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all partner/contact data
router.delete('/import/all', async (req, res) => {
  try {
    const result = await clearAllData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Re-link contacts to LMS users
router.post('/import/link', async (req, res) => {
  try {
    const result = await linkContactsToLmsUsers();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Partner-Group Matching Endpoints
// ============================================

// Run auto-matching
router.post('/matching/auto', async (req, res) => {
  try {
    const { minScore = 0.85, dryRun = false } = req.body;
    const result = await autoMatchGroups(minScore, dryRun);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get matching suggestions
router.get('/matching/suggestions', async (req, res) => {
  try {
    const { minScore = 0.5 } = req.query;
    const suggestions = await getMatchingSuggestions(parseFloat(minScore));
    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get matching stats
router.get('/matching/stats', async (req, res) => {
  try {
    const stats = await getMatchingStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Link a group to a partner manually
router.post('/matching/link', async (req, res) => {
  try {
    const { groupId, partnerId } = req.body;
    const result = await linkGroupToPartner(groupId, partnerId);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unlink a group from its partner
router.post('/matching/unlink', async (req, res) => {
  try {
    const { groupId } = req.body;
    const result = await unlinkGroup(groupId);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Account Owner Reporting Endpoints
// ============================================

// Get all account owners with overview stats
router.get('/owner-reports/overview', async (req, res) => {
  try {
    const owners = await getAccountOwnersOverview();
    res.json(owners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get partners for the currently logged-in user (by their email)
// This enables "My Accounts" filtering for Channel Managers
router.get('/owner-reports/my-accounts', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'User email not found in session' });
    }
    
    const partners = await getPartnersByOwnerEmail(userEmail);
    res.json({
      ownerEmail: userEmail,
      partnerCount: partners.length,
      partners
    });
  } catch (error) {
    console.error('Error getting my accounts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get partners by owner email (admin lookup)
router.get('/owner-reports/by-email/:email', authMiddleware, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const partners = await getPartnersByOwnerEmail(email);
    res.json({
      ownerEmail: email,
      partnerCount: partners.length,
      partners
    });
  } catch (error) {
    console.error('Error getting partners by owner email:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get full report for a specific account owner
router.get('/owner-reports/:ownerName', async (req, res) => {
  try {
    const report = await getAccountOwnerReport(decodeURIComponent(req.params.ownerName));
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate email-ready report for an account owner
router.get('/owner-reports/:ownerName/email', async (req, res) => {
  try {
    const report = await generateAccountOwnerEmailReport(decodeURIComponent(req.params.ownerName));
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Regional Reporting Endpoints
// ============================================

// Get regional report
router.get('/regional-reports', async (req, res) => {
  try {
    const { region } = req.query;
    const report = await getRegionalReport(region);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Compliance & Leaderboard Endpoints
// ============================================

// Get compliance gaps (partners not meeting tier requirements)
router.get('/compliance/gaps', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const gaps = await getComplianceGapsReport(parseInt(limit));
    res.json(gaps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get partner leaderboard by NPCU
router.get('/compliance/leaderboard', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const leaderboard = await getPartnerLeaderboard(parseInt(limit));
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get expiring certifications
router.get('/compliance/expiring', async (req, res) => {
  try {
    const { days = 90 } = req.query;
    const expiring = await getExpiringCertificationsReport(parseInt(days));
    res.json(expiring);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get partner certification summary
router.get('/partners/:id/certifications', async (req, res) => {
  try {
    const summary = await getPartnerCertificationSummary(parseInt(req.params.id));
    if (!summary) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Partner Dashboard Endpoints (DB-backed)
// ============================================

// Find partner by name (exact or fuzzy) - for partner dashboard
router.get('/dashboard/partner', async (req, res) => {
  try {
    const { name, tier } = req.query;
    
    if (!name) {
      return res.status(400).json({ error: 'Partner name is required' });
    }
    
    // Try exact match first
    let [partner] = await query(
      'SELECT * FROM partners WHERE account_name = ?',
      [name]
    );
    
    // If no exact match, try case-insensitive
    if (!partner) {
      [partner] = await query(
        'SELECT * FROM partners WHERE LOWER(account_name) = LOWER(?)',
        [name]
      );
    }
    
    // If still no match, try LIKE
    if (!partner) {
      [partner] = await query(
        'SELECT * FROM partners WHERE account_name LIKE ?',
        [`%${name}%`]
      );
    }
    
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found', searchedName: name });
    }
    
    // Get partner's LMS group
    const [group] = await query(
      'SELECT * FROM lms_groups WHERE partner_id = ?',
      [partner.id]
    );
    
    // Get users linked to this partner through contacts
    const users = await query(`
      SELECT DISTINCT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        u.last_active_at,
        c.title
      FROM lms_users u
      INNER JOIN contacts c ON c.lms_user_id = u.id
      WHERE c.partner_id = ?
      ORDER BY u.last_name, u.first_name
    `, [partner.id]);
    
    // Get all enrollments for these users
    const userIds = users.map(u => u.id);
    let enrollments = [];
    
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      enrollments = await query(`
        SELECT 
          e.id,
          e.user_id,
          e.course_id,
          e.status,
          e.progress_percent,
          e.completed_at,
          e.expires_at,
          e.score,
          c.name as course_name,
          c.npcu_value,
          c.is_certification,
          c.product_category
        FROM lms_enrollments e
        INNER JOIN lms_courses c ON c.id = e.course_id
        WHERE e.user_id IN (${placeholders})
        ORDER BY e.completed_at DESC
      `, userIds);
    }
    
    // Calculate NPCU totals
    const now = new Date();
    let totalNpcu = 0;
    let activeCertifications = 0;
    let expiredCertifications = 0;
    
    const certificationsByUser = new Map();
    
    for (const enrollment of enrollments) {
      if (enrollment.status === 'completed' && enrollment.is_certification && enrollment.npcu_value > 0) {
        // Check expiry
        const isExpired = enrollment.expires_at && new Date(enrollment.expires_at) < now;
        
        if (isExpired) {
          expiredCertifications++;
        } else {
          activeCertifications++;
          totalNpcu += enrollment.npcu_value;
        }
        
        // Track by user
        if (!certificationsByUser.has(enrollment.user_id)) {
          certificationsByUser.set(enrollment.user_id, { active: 0, expired: 0, npcu: 0 });
        }
        const userStats = certificationsByUser.get(enrollment.user_id);
        if (isExpired) {
          userStats.expired++;
        } else {
          userStats.active++;
          userStats.npcu += enrollment.npcu_value;
        }
      }
    }
    
    // Build user details with certifications
    const userDetails = users.map(user => {
      const userEnrollments = enrollments.filter(e => e.user_id === user.id);
      const userCertStats = certificationsByUser.get(user.id) || { active: 0, expired: 0, npcu: 0 };
      
      return {
        ...user,
        enrollments: userEnrollments,
        certifications: userCertStats.active,
        expiredCertifications: userCertStats.expired,
        npcu: userCertStats.npcu
      };
    });
    
    // Determine tier requirement from database
    const effectiveTier = tier || partner.partner_tier || 'Certified';
    const tiers = await query('SELECT name, npcu_required FROM partner_tiers WHERE is_active = TRUE');
    const tierRequirements = {};
    tiers.forEach(t => {
      tierRequirements[t.name] = t.npcu_required || 0;
    });
    // Fallback defaults if no tiers in database
    if (Object.keys(tierRequirements).length === 0) {
      tierRequirements['Premier'] = 20;
      tierRequirements['Premier Plus'] = 20;
      tierRequirements['Certified'] = 10;
      tierRequirements['Registered'] = 5;
      tierRequirements['Aggregator'] = 5;
    }
    const requiredNpcu = tierRequirements[effectiveTier] || 2;
    
    // Group certifications by product category
    const certificationsByCategory = {};
    for (const enrollment of enrollments) {
      if (enrollment.status === 'completed' && enrollment.is_certification) {
        const category = enrollment.product_category || 'Other';
        if (!certificationsByCategory[category]) {
          certificationsByCategory[category] = [];
        }
        certificationsByCategory[category].push(enrollment);
      }
    }
    
    res.json({
      partner: {
        id: partner.id,
        name: partner.account_name,
        tier: effectiveTier,
        region: partner.account_region,
        owner: partner.account_owner,
        requiredNpcu,
        currentNpcu: totalNpcu,
        npcuGap: Math.max(0, requiredNpcu - totalNpcu),
        isCompliant: totalNpcu >= requiredNpcu
      },
      group: group ? {
        id: group.id,
        name: group.name,
        userCount: group.user_count
      } : null,
      users: userDetails,
      certificationsByCategory,
      summary: {
        totalUsers: users.length,
        usersWithCertifications: certificationsByUser.size,
        activeCertifications,
        expiredCertifications,
        totalNpcu,
        requiredNpcu,
        compliancePercent: Math.min(100, Math.round((totalNpcu / requiredNpcu) * 100))
      }
    });
  } catch (error) {
    console.error('Dashboard partner lookup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all certification courses with NPCU values
router.get('/dashboard/courses', async (req, res) => {
  try {
    const courses = await query(`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.product_category,
        c.npcu_value,
        c.is_certification,
        c.status
      FROM lms_courses c
      WHERE c.is_certification = 1 AND c.npcu_value > 0
      ORDER BY c.product_category, c.name
    `);
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// Task Scheduler API
// ==========================================

// Get all scheduled tasks
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await taskScheduler.getAllTasks();
    const status = taskScheduler.getSchedulerStatus();
    res.json({ tasks, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single task details
router.get('/tasks/:taskType', async (req, res) => {
  try {
    const task = await taskScheduler.getTask(req.params.taskType);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const history = await taskScheduler.getTaskHistory(req.params.taskType, 10);
    res.json({ task, history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enable/disable a task
router.post('/tasks/:taskType/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    const task = await taskScheduler.setTaskEnabled(req.params.taskType, enabled);
    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task config
router.put('/tasks/:taskType/config', async (req, res) => {
  try {
    const config = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Invalid config object' });
    }
    
    const result = await query(`
      UPDATE scheduled_tasks 
      SET config = ?, 
          updated_at = NOW()
      WHERE task_type = ?
    `, [JSON.stringify(config), req.params.taskType]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = await taskScheduler.getTask(req.params.taskType);
    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task interval
router.put('/tasks/:taskType/interval', async (req, res) => {
  try {
    const { intervalMinutes } = req.body;
    if (!intervalMinutes || intervalMinutes < 1) {
      return res.status(400).json({ error: 'Invalid interval (minimum 1 minute)' });
    }
    
    const result = await query(`
      UPDATE scheduled_tasks 
      SET interval_minutes = ?, 
          next_run_at = DATE_ADD(COALESCE(last_run_at, NOW()), INTERVAL ? MINUTE),
          updated_at = NOW()
      WHERE task_type = ?
    `, [intervalMinutes, intervalMinutes, req.params.taskType]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = await taskScheduler.getTask(req.params.taskType);
    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manually trigger a task
router.post('/tasks/:taskType/run', async (req, res) => {
  try {
    // Start the task but don't wait for it
    taskScheduler.triggerTask(req.params.taskType)
      .then(result => console.log(`Task ${req.params.taskType} completed:`, result))
      .catch(err => console.error(`Task ${req.params.taskType} failed:`, err.message));
    
    res.json({ success: true, message: 'Task started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get task history
router.get('/tasks/:taskType/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const history = await taskScheduler.getTaskHistory(req.params.taskType, limit);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get analysis history
router.get('/analysis/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await taskScheduler.getAnalysisHistory(limit);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get analysis details
router.get('/analysis/:id', async (req, res) => {
  try {
    const details = await taskScheduler.getAnalysisDetails(req.params.id);
    res.json(details);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save manual analysis results
router.post('/analysis/save', async (req, res) => {
  try {
    const analysisId = await taskScheduler.saveManualAnalysis(req.body);
    res.json({ success: true, analysisId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unified sync history (combines task_run_history and sync_logs)
router.get('/sync/unified-history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    
    // Get task run history (scheduled tasks) - extract records from result_summary JSON
    const taskHistory = await query(`
      SELECT 
        id,
        task_type as sync_type,
        status,
        started_at,
        completed_at,
        duration_seconds,
        error_message,
        result_summary as details,
        records_processed,
        COALESCE(JSON_EXTRACT(result_summary, '$.recordsProcessed'), 0) as json_records_processed,
        COALESCE(JSON_EXTRACT(result_summary, '$.updated'), JSON_EXTRACT(result_summary, '$.confirmed'), 0) as records_updated,
        COALESCE(JSON_EXTRACT(result_summary, '$.errors'), JSON_EXTRACT(result_summary, '$.failed'), 0) as records_failed,
        'scheduled_task' as source
      FROM task_run_history 
      ORDER BY started_at DESC 
      LIMIT ?
    `, [limit]);
    
    // Get enrollment sync logs
    const syncLogs = await query(`
      SELECT 
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
        TIMESTAMPDIFF(SECOND, started_at, completed_at) as duration_seconds,
        'enrollment_sync' as source
      FROM sync_logs 
      ORDER BY started_at DESC 
      LIMIT ?
    `, [limit]);
    
    // Merge and sort by started_at DESC
    const taskHistoryArray = Array.isArray(taskHistory) ? taskHistory : [];
    const syncLogsArray = Array.isArray(syncLogs) ? syncLogs : [];
    
    const combined = [
      ...taskHistoryArray.map(h => ({
        ...h,
        // Use records_processed from column or fallback to JSON
        records_processed: h.records_processed || h.json_records_processed || 0,
        records_updated: h.records_updated || 0,
        records_failed: h.records_failed || 0,
        details: typeof h.details === 'string' ? h.details : JSON.stringify(h.details)
      })),
      ...syncLogsArray.map(log => ({
        ...log,
        details: typeof log.details === 'string' ? log.details : JSON.stringify(log.details)
      }))
    ].sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
     .slice(0, limit);
    
    res.json(combined);
  } catch (error) {
    console.error('Failed to get unified history:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Authentication & Authorization Endpoints
// ============================================

/**
 * Middleware to validate auth token
 */
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  
  validateSession(token)
    .then(user => {
      if (!user) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }
      req.user = user;
      next();
    })
    .catch(err => {
      res.status(500).json({ error: 'Authentication error' });
    });
}

/**
 * Check if user has specific permission
 */
function requirePermission(category, action) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const permissions = req.user.permissions || {};
    if (!permissions[category]?.[action]) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    next();
  };
}

// Login
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const result = await login(email, password);
    
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout
router.post('/auth/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    await logout(token);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Validate session / get current user
router.get('/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

// Clean up expired sessions (admin only)
router.post('/auth/cleanup', authMiddleware, requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const deleted = await cleanupExpiredSessions();
    res.json({ success: true, deletedSessions: deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// User Management Endpoints
// ============================================

// Get all users
router.get('/admin/users', authMiddleware, requirePermission('users', 'view'), async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by ID
router.get('/admin/users/:id', authMiddleware, requirePermission('users', 'view'), async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user
router.post('/admin/users', authMiddleware, requirePermission('users', 'create'), async (req, res) => {
  try {
    const { email, password, firstName, lastName, profileId } = req.body;
    
    if (!email || !password || !profileId) {
      return res.status(400).json({ error: 'Email, password, and profile required' });
    }
    
    const result = await createUser({
      email,
      password,
      firstName,
      lastName,
      profileId,
      createdBy: req.user.id
    });
    
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update user
router.put('/admin/users/:id', authMiddleware, requirePermission('users', 'edit'), async (req, res) => {
  try {
    const result = await updateUser(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Change password
router.put('/admin/users/:id/password', authMiddleware, async (req, res) => {
  try {
    // Users can change their own password, admins can change anyone's
    const targetId = parseInt(req.params.id);
    const canEditOthers = req.user.permissions?.users?.edit;
    
    if (targetId !== req.user.id && !canEditOthers) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    const result = await changePassword(targetId, newPassword);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete user
router.delete('/admin/users/:id', authMiddleware, requirePermission('users', 'delete'), async (req, res) => {
  try {
    // Prevent self-deletion
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const result = await deleteUser(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Profile Management Endpoints
// ============================================

// Get all profiles
router.get('/admin/profiles', authMiddleware, requirePermission('profiles', 'view'), async (req, res) => {
  try {
    const profiles = await getProfiles();
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get profiles (for dropdowns - less restrictive)
router.get('/admin/profiles/list', authMiddleware, async (req, res) => {
  try {
    const profiles = await getProfiles();
    res.json(profiles.map(p => ({ id: p.id, name: p.name, description: p.description })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get profile by ID
router.get('/admin/profiles/:id', authMiddleware, requirePermission('profiles', 'view'), async (req, res) => {
  try {
    const profile = await getProfileById(req.params.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create profile
router.post('/admin/profiles', authMiddleware, requirePermission('profiles', 'create'), async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    
    if (!name || !permissions) {
      return res.status(400).json({ error: 'Name and permissions required' });
    }
    
    const result = await createProfile({ name, description, permissions });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update profile
router.put('/admin/profiles/:id', authMiddleware, requirePermission('profiles', 'edit'), async (req, res) => {
  try {
    const result = await updateProfile(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete profile
router.delete('/admin/profiles/:id', authMiddleware, requirePermission('profiles', 'delete'), async (req, res) => {
  try {
    const result = await deleteProfile(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Portal Settings Endpoints
// ============================================

// Get tier requirements (public - used by CompanyWidget)
router.get('/settings/tier-requirements', async (req, res) => {
  try {
    // Primary source: partner_tiers table
    const tiers = await query('SELECT name, npcu_required FROM partner_tiers WHERE is_active = TRUE');
    if (tiers.length > 0) {
      const tierReqs = {};
      tiers.forEach(t => {
        tierReqs[t.name] = t.npcu_required || 0;
      });
      return res.json(tierReqs);
    }
    
    // Fallback to portal_settings (legacy)
    const rows = await query('SELECT tier_requirements FROM portal_settings WHERE id = 1');
    if (rows.length > 0 && rows[0].tier_requirements) {
      const tierReqs = typeof rows[0].tier_requirements === 'string' 
        ? JSON.parse(rows[0].tier_requirements) 
        : rows[0].tier_requirements;
      return res.json(tierReqs);
    }
    
    // Return defaults if nothing configured
    res.json({
      'Registered': 5,
      'Certified': 10,
      'Premier': 20,
      'Premier Plus': 20,
      'Aggregator': 5
    });
  } catch (error) {
    console.error('Error getting tier requirements:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update tier requirements (admin only)
router.put('/settings/tier-requirements', authMiddleware, async (req, res) => {
  try {
    const tierRequirements = req.body;
    
    // Validate the input
    const validTiers = ['Registered', 'Certified', 'Select', 'Premier', 'Premier Plus', 'Aggregator'];
    for (const tier of validTiers) {
      if (tierRequirements[tier] !== undefined && (typeof tierRequirements[tier] !== 'number' || tierRequirements[tier] < 0)) {
        return res.status(400).json({ error: `Invalid value for ${tier}: must be a non-negative number` });
      }
    }
    
    await query(
      'INSERT INTO portal_settings (id, tier_requirements) VALUES (1, ?) ON DUPLICATE KEY UPDATE tier_requirements = VALUES(tier_requirements), updated_at = NOW()',
      [JSON.stringify(tierRequirements)]
    );
    
    res.json({ success: true, tierRequirements });
  } catch (error) {
    console.error('Error updating tier requirements:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all portal settings (admin only)
router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM portal_settings WHERE id = 1');
    if (rows.length === 0) {
      res.json({
        tierRequirements: {
          'Registered': 5,
          'Certified': 10,
          'Select': 15,
          'Premier': 20,
          'Premier Plus': 20,
          'Aggregator': 5
        }
      });
    } else {
      const settings = rows[0];
      res.json({
        tierRequirements: typeof settings.tier_requirements === 'string' 
          ? JSON.parse(settings.tier_requirements) 
          : settings.tier_requirements,
        updatedAt: settings.updated_at
      });
    }
  } catch (error) {
    console.error('Error getting portal settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Partner Tier Management Endpoints
// ============================================

// Get all tiers (public - for dropdowns, badges, etc.)
router.get('/tiers', async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, name, description, npcu_required, color, sort_order, is_active FROM partner_tiers ORDER BY sort_order ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error getting tiers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get active tiers only (for public dropdowns)
router.get('/tiers/active', async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, name, description, npcu_required, color, sort_order FROM partner_tiers WHERE is_active = TRUE ORDER BY sort_order ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error getting active tiers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single tier by ID
router.get('/tiers/:id', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM partner_tiers WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Tier not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error getting tier:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new tier (admin only)
router.post('/tiers', authMiddleware, requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const { name, description, npcu_required, color, sort_order, is_active } = req.body;
    
    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Tier name is required' });
    }
    
    // Check for duplicate name
    const existing = await query('SELECT id FROM partner_tiers WHERE name = ?', [name.trim()]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'A tier with this name already exists' });
    }
    
    // Get next sort order if not provided
    let finalSortOrder = sort_order;
    if (finalSortOrder === undefined || finalSortOrder === null) {
      const maxSort = await query('SELECT MAX(sort_order) as max_sort FROM partner_tiers');
      finalSortOrder = (maxSort[0]?.max_sort || 0) + 1;
    }
    
    const result = await query(
      `INSERT INTO partner_tiers (name, description, npcu_required, color, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        description || '',
        npcu_required || 0,
        color || '#666666',
        finalSortOrder,
        is_active !== false
      ]
    );
    
    // Fetch the created tier
    const newTier = await query('SELECT * FROM partner_tiers WHERE id = ?', [result.insertId]);
    
    res.status(201).json(newTier[0]);
  } catch (error) {
    console.error('Error creating tier:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a tier (admin only)
router.put('/tiers/:id', authMiddleware, requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, npcu_required, color, sort_order, is_active } = req.body;
    
    // Check tier exists
    const existing = await query('SELECT * FROM partner_tiers WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Tier not found' });
    }
    
    // Validate name if changing
    if (name && name.trim() !== existing[0].name) {
      const duplicate = await query('SELECT id FROM partner_tiers WHERE name = ? AND id != ?', [name.trim(), id]);
      if (duplicate.length > 0) {
        return res.status(400).json({ error: 'A tier with this name already exists' });
      }
    }
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    
    if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (npcu_required !== undefined) { updates.push('npcu_required = ?'); values.push(npcu_required); }
    if (color !== undefined) { updates.push('color = ?'); values.push(color); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    await query(`UPDATE partner_tiers SET ${updates.join(', ')} WHERE id = ?`, values);
    
    // If name changed, update partners table too
    if (name && name.trim() !== existing[0].name) {
      await query(
        'UPDATE partners SET partner_tier = ? WHERE partner_tier = ?',
        [name.trim(), existing[0].name]
      );
    }
    
    // Fetch the updated tier
    const updatedTier = await query('SELECT * FROM partner_tiers WHERE id = ?', [id]);
    
    res.json(updatedTier[0]);
  } catch (error) {
    console.error('Error updating tier:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a tier (admin only)
router.delete('/tiers/:id', authMiddleware, requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check tier exists
    const existing = await query('SELECT * FROM partner_tiers WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Tier not found' });
    }
    
    // Check if tier is in use
    const inUse = await query(
      'SELECT COUNT(*) as count FROM partners WHERE partner_tier = ?',
      [existing[0].name]
    );
    
    if (inUse[0].count > 0) {
      return res.status(400).json({ 
        error: `Cannot delete tier "${existing[0].name}" - it is assigned to ${inUse[0].count} partner(s)`,
        partnersCount: inUse[0].count
      });
    }
    
    await query('DELETE FROM partner_tiers WHERE id = ?', [id]);
    
    res.json({ success: true, message: `Tier "${existing[0].name}" deleted successfully` });
  } catch (error) {
    console.error('Error deleting tier:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reorder tiers (admin only)
router.put('/tiers/reorder', authMiddleware, requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const { tierIds } = req.body; // Array of tier IDs in desired order
    
    if (!Array.isArray(tierIds) || tierIds.length === 0) {
      return res.status(400).json({ error: 'tierIds array is required' });
    }
    
    // Update sort_order for each tier
    for (let i = 0; i < tierIds.length; i++) {
      await query('UPDATE partner_tiers SET sort_order = ? WHERE id = ?', [i + 1, tierIds[i]]);
    }
    
    // Return updated tiers
    const tiers = await query('SELECT * FROM partner_tiers ORDER BY sort_order ASC');
    res.json(tiers);
  } catch (error) {
    console.error('Error reordering tiers:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// USER ANALYTICS & ORPHAN DISCOVERY ROUTES
// ============================================

/**
 * Get breakdown of LMS users by association status
 * Partner users = in partner groups OR linked via contacts
 * Unlinked users = not yet linked to a partner (potential orphans to discover)
 */
router.get('/users/breakdown', async (req, res) => {
  try {
    // Total LMS users
    const [totalResult] = await query('SELECT COUNT(*) as count FROM lms_users');
    const totalUsers = totalResult.count;
    
    // Linked partner users (confirmed associations)
    const [linkedResult] = await query(`
      SELECT COUNT(DISTINCT user_id) as count FROM (
        SELECT ct.lms_user_id as user_id
        FROM contacts ct
        WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
        UNION
        SELECT gm.user_id
        FROM lms_group_members gm
        INNER JOIN lms_groups g ON g.id = gm.group_id
        WHERE g.partner_id IS NOT NULL
      ) linked_users
    `);
    const linkedPartnerUsers = linkedResult.count;
    
    // Unlinked users (potential orphans to discover)
    const unlinkedUsers = totalUsers - linkedPartnerUsers;
    
    res.json({
      totalUsers,
      linkedPartnerUsers,
      unlinkedUsers,
      percentageLinked: ((linkedPartnerUsers / totalUsers) * 100).toFixed(1),
      percentageUnlinked: ((unlinkedUsers / totalUsers) * 100).toFixed(1),
      note: 'Analytics only track linkedPartnerUsers. Unlinked users are available for orphan discovery via domain matching.'
    });
  } catch (error) {
    console.error('Error getting user breakdown:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Find orphaned partner users - LMS users whose email domain matches a partner
 * but who are NOT yet linked to that partner
 * These are users who registered directly in Northpass bypassing the CRM automation
 * 
 * IMPORTANT: Only considers domains that represent a significant portion of a partner's
 * contacts (default 20%). This prevents one-off domains (like 1 dentsu.com contact among
 * 22 merkle.com contacts) from causing false matches, while still supporting small partners.
 */
router.get('/users/orphans', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 500;
    const offset = parseInt(req.query.offset) || 0;
    const includeDismissed = req.query.includeDismissed === 'true';
    const minDomainPercentage = parseInt(req.query.minDomainPercentage) || 20; // Domain must represent at least X% of partner's contacts
    
    // Find users whose email domain matches a partner's PRIMARY domain but aren't linked
    // Only considers domains that represent at least minDomainPercentage% of the partner's contacts
    const orphanedUsers = await query(`
      SELECT 
        u.id as user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        u.created_at_lms,
        SUBSTRING_INDEX(u.email, '@', -1) as user_domain,
        p.id as matched_partner_id,
        p.account_name as matched_partner,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        partner_domains.domain_count as domain_contact_count,
        partner_domains.total_contacts as partner_total_contacts,
        partner_domains.domain_percentage
      FROM lms_users u
      INNER JOIN (
        -- Get partner domains that represent at least X% of the partner's contacts
        SELECT 
          domain_counts.partner_id,
          domain_counts.domain,
          domain_counts.domain_count,
          partner_totals.total_contacts,
          ROUND(100.0 * domain_counts.domain_count / partner_totals.total_contacts, 1) as domain_percentage
        FROM (
          SELECT 
            c.partner_id,
            SUBSTRING_INDEX(c.email, '@', -1) as domain,
            COUNT(*) as domain_count
          FROM contacts c
          WHERE c.partner_id IS NOT NULL
          AND c.email LIKE '%@%'
          AND SUBSTRING_INDEX(c.email, '@', -1) NOT IN (
            'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
            'aol.com', 'icloud.com', 'live.com', 'msn.com', 'me.com',
            'sharklasers.com', 'guerrillamail.com', 'mailinator.com'
          )
          GROUP BY c.partner_id, SUBSTRING_INDEX(c.email, '@', -1)
        ) domain_counts
        INNER JOIN (
          SELECT partner_id, COUNT(*) as total_contacts
          FROM contacts
          WHERE partner_id IS NOT NULL AND email LIKE '%@%'
          GROUP BY partner_id
        ) partner_totals ON domain_counts.partner_id = partner_totals.partner_id
        WHERE (100.0 * domain_counts.domain_count / partner_totals.total_contacts) >= ?
      ) partner_domains ON SUBSTRING_INDEX(u.email, '@', -1) = partner_domains.domain
      INNER JOIN partners p ON p.id = partner_domains.partner_id
      WHERE NOT EXISTS (
        -- Not already linked via contacts
        SELECT 1 FROM contacts ct 
        WHERE ct.lms_user_id = u.id AND ct.partner_id IS NOT NULL
      )
      AND NOT EXISTS (
        -- Not already in a partner group
        SELECT 1 FROM lms_group_members gm
        INNER JOIN lms_groups g ON g.id = gm.group_id
        WHERE gm.user_id = u.id AND g.partner_id IS NOT NULL
      )
      ${!includeDismissed ? `
      AND NOT EXISTS (
        -- Not dismissed for this partner
        SELECT 1 FROM dismissed_orphans do
        WHERE do.user_id = u.id AND do.partner_id = p.id
      )
      ` : ''}
      ORDER BY p.account_name, u.created_at_lms DESC
      LIMIT ? OFFSET ?
    `, [minDomainPercentage, limit, offset]);
    
    // Get total count (same filtering logic)
    const [countResult] = await query(`
      SELECT COUNT(*) as count
      FROM lms_users u
      INNER JOIN (
        SELECT 
          domain_counts.partner_id,
          domain_counts.domain
        FROM (
          SELECT 
            c.partner_id,
            SUBSTRING_INDEX(c.email, '@', -1) as domain,
            COUNT(*) as domain_count
          FROM contacts c
          WHERE c.partner_id IS NOT NULL
          AND c.email LIKE '%@%'
          AND SUBSTRING_INDEX(c.email, '@', -1) NOT IN (
            'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
            'aol.com', 'icloud.com', 'live.com', 'msn.com', 'me.com',
            'sharklasers.com', 'guerrillamail.com', 'mailinator.com'
          )
          GROUP BY c.partner_id, SUBSTRING_INDEX(c.email, '@', -1)
        ) domain_counts
        INNER JOIN (
          SELECT partner_id, COUNT(*) as total_contacts
          FROM contacts
          WHERE partner_id IS NOT NULL AND email LIKE '%@%'
          GROUP BY partner_id
        ) partner_totals ON domain_counts.partner_id = partner_totals.partner_id
        WHERE (100.0 * domain_counts.domain_count / partner_totals.total_contacts) >= ?
      ) partner_domains ON SUBSTRING_INDEX(u.email, '@', -1) = partner_domains.domain
      INNER JOIN partners p ON p.id = partner_domains.partner_id
      WHERE NOT EXISTS (
        SELECT 1 FROM contacts ct 
        WHERE ct.lms_user_id = u.id AND ct.partner_id IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM lms_group_members gm
        INNER JOIN lms_groups g ON g.id = gm.group_id
        WHERE gm.user_id = u.id AND g.partner_id IS NOT NULL
      )
      ${!includeDismissed ? `
      AND NOT EXISTS (
        SELECT 1 FROM dismissed_orphans do
        WHERE do.user_id = u.id AND do.partner_id = p.id
      )
      ` : ''}
    `, [minDomainPercentage]);
    
    // Group by partner for summary
    const byPartner = {};
    orphanedUsers.forEach(u => {
      if (!byPartner[u.matched_partner]) {
        byPartner[u.matched_partner] = {
          partnerId: u.matched_partner_id,
          partnerName: u.matched_partner,
          tier: u.partner_tier,
          region: u.account_region,
          owner: u.account_owner,
          orphanCount: 0,
          users: []
        };
      }
      byPartner[u.matched_partner].orphanCount++;
      byPartner[u.matched_partner].users.push({
        userId: u.user_id,
        email: u.email,
        name: `${u.first_name} ${u.last_name}`.trim(),
        status: u.status,
        createdAt: u.created_at_lms
      });
    });
    
    res.json({
      totalOrphans: countResult.count,
      returnedCount: orphanedUsers.length,
      limit,
      offset,
      byPartner: Object.values(byPartner).sort((a, b) => b.orphanCount - a.orphanCount),
      message: countResult.count > 0 
        ? `Found ${countResult.count} potential orphaned partner users (domain matches but not linked)`
        : 'No orphaned partner users found'
    });
  } catch (error) {
    console.error('Error finding orphaned users:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get orphan summary by partner - quick overview without user details
 */
router.get('/users/orphans/summary', async (req, res) => {
  try {
    const includeDismissed = req.query.includeDismissed === 'true';
    const minDomainPercentage = parseInt(req.query.minDomainPercentage) || 20;
    
    const summary = await query(`
      SELECT 
        p.id as partner_id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        COUNT(DISTINCT u.id) as orphan_count
      FROM lms_users u
      INNER JOIN (
        SELECT 
          domain_counts.partner_id,
          domain_counts.domain
        FROM (
          SELECT 
            c.partner_id,
            SUBSTRING_INDEX(c.email, '@', -1) as domain,
            COUNT(*) as domain_count
          FROM contacts c
          WHERE c.partner_id IS NOT NULL
          AND c.email LIKE '%@%'
          AND SUBSTRING_INDEX(c.email, '@', -1) NOT IN (
            'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
            'aol.com', 'icloud.com', 'live.com', 'msn.com', 'me.com',
            'sharklasers.com', 'guerrillamail.com', 'mailinator.com'
          )
          GROUP BY c.partner_id, SUBSTRING_INDEX(c.email, '@', -1)
        ) domain_counts
        INNER JOIN (
          SELECT partner_id, COUNT(*) as total_contacts
          FROM contacts
          WHERE partner_id IS NOT NULL AND email LIKE '%@%'
          GROUP BY partner_id
        ) partner_totals ON domain_counts.partner_id = partner_totals.partner_id
        WHERE (100.0 * domain_counts.domain_count / partner_totals.total_contacts) >= ?
      ) partner_domains ON SUBSTRING_INDEX(u.email, '@', -1) = partner_domains.domain
      INNER JOIN partners p ON p.id = partner_domains.partner_id
      WHERE NOT EXISTS (
        SELECT 1 FROM contacts ct 
        WHERE ct.lms_user_id = u.id AND ct.partner_id IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM lms_group_members gm
        INNER JOIN lms_groups g ON g.id = gm.group_id
        WHERE gm.user_id = u.id AND g.partner_id IS NOT NULL
      )
      ${!includeDismissed ? `
      AND NOT EXISTS (
        SELECT 1 FROM dismissed_orphans do
        WHERE do.user_id = u.id AND do.partner_id = p.id
      )
      ` : ''}
      GROUP BY p.id, p.account_name, p.partner_tier, p.account_region, p.account_owner
      ORDER BY orphan_count DESC
    `, [minDomainPercentage]);
    
    const totalOrphans = summary.reduce((sum, p) => sum + p.orphan_count, 0);
    
    res.json({
      totalOrphans,
      partnersWithOrphans: summary.length,
      minDomainPercentage,
      partners: summary
    });
  } catch (error) {
    console.error('Error getting orphan summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get orphans for a specific partner
 */
router.get('/users/orphans/partner/:partnerId', async (req, res) => {
  try {
    const { partnerId } = req.params;
    const includeDismissed = req.query.includeDismissed === 'true';
    const minDomainPercentage = parseInt(req.query.minDomainPercentage) || 20;
    
    // Get partner info
    const [partner] = await query('SELECT * FROM partners WHERE id = ?', [partnerId]);
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    // Get total contacts for this partner (for percentage calculation)
    const [partnerTotals] = await query(`
      SELECT COUNT(*) as total_contacts 
      FROM contacts 
      WHERE partner_id = ? AND email LIKE '%@%'
    `, [partnerId]);
    
    // Get orphaned users for this partner (only domains representing >= X% of contacts)
    const orphans = await query(`
      SELECT 
        u.id as user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        u.created_at_lms,
        u.last_active_at,
        SUBSTRING_INDEX(u.email, '@', -1) as domain,
        partner_domains.domain_count as domain_contact_count,
        partner_domains.domain_percentage,
        do.id as dismissed_id,
        do.reason as dismissed_reason,
        do.dismissed_at
      FROM lms_users u
      INNER JOIN (
        SELECT 
          SUBSTRING_INDEX(c.email, '@', -1) as domain,
          COUNT(*) as domain_count,
          ROUND(100.0 * COUNT(*) / ?, 1) as domain_percentage
        FROM contacts c
        WHERE c.partner_id = ?
        AND c.email LIKE '%@%'
        AND SUBSTRING_INDEX(c.email, '@', -1) NOT IN (
          'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
          'aol.com', 'icloud.com', 'live.com', 'msn.com', 'me.com',
          'sharklasers.com', 'guerrillamail.com', 'mailinator.com'
        )
        GROUP BY SUBSTRING_INDEX(c.email, '@', -1)
        HAVING (100.0 * COUNT(*) / ?) >= ?
      ) partner_domains ON SUBSTRING_INDEX(u.email, '@', -1) = partner_domains.domain
      LEFT JOIN dismissed_orphans do ON do.user_id = u.id AND do.partner_id = ?
      WHERE NOT EXISTS (
        SELECT 1 FROM contacts ct 
        WHERE ct.lms_user_id = u.id AND ct.partner_id IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM lms_group_members gm
        INNER JOIN lms_groups g ON g.id = gm.group_id
        WHERE gm.user_id = u.id AND g.partner_id IS NOT NULL
      )
      ${!includeDismissed ? 'AND do.id IS NULL' : ''}
      ORDER BY do.id IS NOT NULL, u.created_at_lms DESC
    `, [partnerTotals.total_contacts, partnerId, partnerTotals.total_contacts, minDomainPercentage, partnerId]);
    
    // Get dismissed count for this partner
    const [dismissedCount] = await query(`
      SELECT COUNT(*) as count FROM dismissed_orphans WHERE partner_id = ?
    `, [partnerId]);
    
    res.json({
      partner: {
        id: partner.id,
        name: partner.account_name,
        tier: partner.partner_tier,
        region: partner.account_region,
        owner: partner.account_owner
      },
      orphanCount: orphans.filter(o => !o.dismissed_id).length,
      dismissedCount: dismissedCount.count,
      showingDismissed: includeDismissed,
      orphans: orphans.map(o => ({
        ...o,
        isDismissed: !!o.dismissed_id
      }))
    });
  } catch (error) {
    console.error('Error getting partner orphans:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Dismiss an orphan user - marks them as not belonging to the matched partner
 */
router.post('/users/orphans/dismiss', async (req, res) => {
  try {
    const { userId, partnerId, reason } = req.body;
    
    if (!userId || !partnerId) {
      return res.status(400).json({ error: 'userId and partnerId are required' });
    }
    
    // Insert into dismissed_orphans (ON DUPLICATE KEY UPDATE for idempotency)
    await query(`
      INSERT INTO dismissed_orphans (user_id, partner_id, reason, dismissed_by)
      VALUES (?, ?, ?, 'admin')
      ON DUPLICATE KEY UPDATE reason = VALUES(reason), dismissed_at = CURRENT_TIMESTAMP
    `, [userId, partnerId, reason || 'Not a match']);
    
    res.json({
      success: true,
      message: 'User dismissed from orphan list'
    });
  } catch (error) {
    console.error('Error dismissing orphan:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Bulk dismiss orphans for a partner
 */
router.post('/users/orphans/dismiss-bulk', async (req, res) => {
  try {
    const { userIds, partnerId, reason } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    if (!partnerId) {
      return res.status(400).json({ error: 'partnerId is required' });
    }
    
    let dismissed = 0;
    for (const userId of userIds) {
      try {
        await query(`
          INSERT INTO dismissed_orphans (user_id, partner_id, reason, dismissed_by)
          VALUES (?, ?, ?, 'admin')
          ON DUPLICATE KEY UPDATE reason = VALUES(reason), dismissed_at = CURRENT_TIMESTAMP
        `, [userId, partnerId, reason || 'Bulk dismiss']);
        dismissed++;
      } catch (err) {
        console.error(`Error dismissing user ${userId}:`, err.message);
      }
    }
    
    res.json({
      success: true,
      dismissed,
      message: `Dismissed ${dismissed} users from orphan list`
    });
  } catch (error) {
    console.error('Error bulk dismissing orphans:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Restore a dismissed orphan - removes them from dismissed list
 */
router.post('/users/orphans/restore', async (req, res) => {
  try {
    const { userId, partnerId } = req.body;
    
    if (!userId || !partnerId) {
      return res.status(400).json({ error: 'userId and partnerId are required' });
    }
    
    const result = await query(`
      DELETE FROM dismissed_orphans WHERE user_id = ? AND partner_id = ?
    `, [userId, partnerId]);
    
    res.json({
      success: true,
      restored: result.affectedRows > 0,
      message: result.affectedRows > 0 
        ? 'User restored to orphan list'
        : 'User was not in dismissed list'
    });
  } catch (error) {
    console.error('Error restoring orphan:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get dismissed orphans for a partner
 */
router.get('/users/orphans/dismissed/:partnerId', async (req, res) => {
  try {
    const { partnerId } = req.params;
    
    const dismissed = await query(`
      SELECT 
        do.id,
        do.user_id,
        do.reason,
        do.dismissed_at,
        u.email,
        u.first_name,
        u.last_name,
        SUBSTRING_INDEX(u.email, '@', -1) as domain
      FROM dismissed_orphans do
      INNER JOIN lms_users u ON u.id = do.user_id
      WHERE do.partner_id = ?
      ORDER BY do.dismissed_at DESC
    `, [partnerId]);
    
    res.json({
      partnerId,
      count: dismissed.length,
      dismissed
    });
  } catch (error) {
    console.error('Error getting dismissed orphans:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PAM (Partner Account Manager) MANAGEMENT ROUTES
// ============================================

/**
 * Get all partner managers (PAMs)
 */
router.get('/pams', async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    
    const pams = await query(`
      SELECT 
        pm.*,
        au.email as login_email,
        au.first_name as login_first_name,
        au.last_name as login_last_name,
        au.is_active as login_active,
        au.last_login_at,
        (SELECT COUNT(*) FROM partners p WHERE p.account_owner = pm.owner_name) as partner_count
      FROM partner_managers pm
      LEFT JOIN admin_users au ON au.id = pm.admin_user_id
      ${!includeInactive ? 'WHERE pm.is_active_pam = TRUE' : ''}
      ORDER BY pm.is_active_pam DESC, pm.owner_name
    `);
    
    // Get summary stats
    const [stats] = await query(`
      SELECT 
        COUNT(*) as total_owners,
        SUM(is_active_pam) as active_pams,
        SUM(CASE WHEN admin_user_id IS NOT NULL THEN 1 ELSE 0 END) as with_accounts,
        SUM(CASE WHEN email_reports_enabled THEN 1 ELSE 0 END) as email_enabled
      FROM partner_managers
    `);
    
    res.json({
      pams,
      stats: {
        totalOwners: stats.total_owners || 0,
        activePams: stats.active_pams || 0,
        withAccounts: stats.with_accounts || 0,
        emailEnabled: stats.email_enabled || 0
      }
    });
  } catch (error) {
    console.error('Error getting PAMs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get a single PAM by ID
 */
router.get('/pams/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [pam] = await query(`
      SELECT 
        pm.*,
        au.email as login_email,
        au.first_name as login_first_name,
        au.last_name as login_last_name,
        au.is_active as login_active
      FROM partner_managers pm
      LEFT JOIN admin_users au ON au.id = pm.admin_user_id
      WHERE pm.id = ?
    `, [id]);
    
    if (!pam) {
      return res.status(404).json({ error: 'PAM not found' });
    }
    
    // Get their assigned partners
    const partners = await query(`
      SELECT id, account_name, partner_tier, account_region
      FROM partners
      WHERE account_owner = ?
      ORDER BY account_name
    `, [pam.owner_name]);
    
    res.json({ pam, partners });
  } catch (error) {
    console.error('Error getting PAM:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update PAM status and settings
 */
router.put('/pams/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active_pam, email, notes, email_reports_enabled, report_frequency, region } = req.body;
    
    // Convert undefined to null for MySQL2 compatibility
    const toNull = (v) => v === undefined ? null : v;
    
    await query(`
      UPDATE partner_managers SET
        is_active_pam = COALESCE(?, is_active_pam),
        email = COALESCE(?, email),
        notes = COALESCE(?, notes),
        email_reports_enabled = COALESCE(?, email_reports_enabled),
        report_frequency = COALESCE(?, report_frequency),
        region = COALESCE(?, region)
      WHERE id = ?
    `, [toNull(is_active_pam), toNull(email), toNull(notes), toNull(email_reports_enabled), toNull(report_frequency), toNull(region), id]);
    
    res.json({ success: true, message: 'PAM updated' });
  } catch (error) {
    console.error('Error updating PAM:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Sync PAMs from partner CRM data (owner_name + owner_email)
 * This populates partner_managers from the partners table
 */
router.post('/pams/sync-from-crm', async (req, res) => {
  try {
    const stats = { created: 0, updated: 0, skipped: 0 };
    
    // Get unique owner combinations from partners
    const uniqueOwners = await query(`
      SELECT DISTINCT account_owner, owner_email, account_region 
      FROM partners 
      WHERE account_owner IS NOT NULL AND account_owner != ''
    `);
    
    for (const owner of uniqueOwners) {
      const ownerName = owner.account_owner.trim();
      const ownerEmail = owner.owner_email || null;
      const region = owner.account_region || null;
      
      try {
        // Check if PAM already exists
        const [existing] = await query('SELECT id, email FROM partner_managers WHERE owner_name = ?', [ownerName]);
        
        if (existing) {
          // Update email/region if changed (only if we have new data)
          if (ownerEmail && ownerEmail !== existing.email) {
            await query('UPDATE partner_managers SET email = ?, region = COALESCE(?, region) WHERE id = ?', 
              [ownerEmail, region, existing.id]);
            stats.updated++;
          } else {
            stats.skipped++;
          }
        } else {
          // Create new PAM record
          await query(
            `INSERT INTO partner_managers (owner_name, email, region, is_active_pam, email_reports_enabled, report_frequency)
             VALUES (?, ?, ?, TRUE, TRUE, 'weekly')`,
            [ownerName, ownerEmail, region]
          );
          stats.created++;
        }
      } catch (err) {
        console.error(`Error syncing PAM ${ownerName}:`, err.message);
      }
    }
    
    res.json({
      success: true,
      message: `Synced PAMs from CRM data`,
      stats: {
        ...stats,
        totalOwners: uniqueOwners.length
      }
    });
  } catch (error) {
    console.error('Error syncing PAMs from CRM:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create login account for a PAM
 */
router.post('/pams/:id/create-account', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, password, firstName, lastName } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Get PAM record
    const [pam] = await query('SELECT * FROM partner_managers WHERE id = ?', [id]);
    if (!pam) {
      return res.status(404).json({ error: 'PAM not found' });
    }
    
    // Check if email already exists
    const [existing] = await query('SELECT id FROM admin_users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    
    // Get Channel Manager profile
    const [profile] = await query('SELECT id FROM admin_profiles WHERE name = ?', ['Channel Manager']);
    if (!profile) {
      return res.status(500).json({ error: 'Channel Manager profile not found' });
    }
    
    // Hash password
    const crypto = require('crypto');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    const passwordHash = `${salt}:${hash}`;
    
    // Create admin user
    const result = await query(`
      INSERT INTO admin_users (email, password_hash, first_name, last_name, profile_id, is_active)
      VALUES (?, ?, ?, ?, ?, TRUE)
    `, [email.toLowerCase(), passwordHash, firstName || pam.owner_name.split(' ')[0], lastName || '', profile.id]);
    
    // Link to PAM record
    await query('UPDATE partner_managers SET admin_user_id = ?, email = ? WHERE id = ?', 
      [result.insertId, email.toLowerCase(), id]);
    
    res.json({
      success: true,
      message: 'Account created successfully',
      userId: result.insertId
    });
  } catch (error) {
    console.error('Error creating PAM account:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Link existing admin account to a PAM
 */
router.post('/pams/:id/link-account', async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Get PAM record
    const [pam] = await query('SELECT * FROM partner_managers WHERE id = ?', [id]);
    if (!pam) {
      return res.status(404).json({ error: 'PAM not found' });
    }
    
    // Check if already linked
    if (pam.admin_user_id) {
      return res.status(400).json({ error: 'PAM already has a linked account' });
    }
    
    // Find existing admin user by email
    const [adminUser] = await query('SELECT id, email, first_name, last_name FROM admin_users WHERE email = ?', [email.toLowerCase()]);
    if (!adminUser) {
      return res.status(404).json({ error: 'No admin account found with that email' });
    }
    
    // Link to PAM record
    await query('UPDATE partner_managers SET admin_user_id = ?, email = ? WHERE id = ?', 
      [adminUser.id, email.toLowerCase(), id]);
    
    res.json({
      success: true,
      message: `Account linked successfully (${adminUser.first_name} ${adminUser.last_name})`,
      userId: adminUser.id
    });
  } catch (error) {
    console.error('Error linking PAM account:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Search for existing admin users (for linking)
 */
router.get('/admin-users/search', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || email.length < 3) {
      return res.json([]);
    }
    
    const users = await query(`
      SELECT id, email, first_name, last_name, is_active, 
             (SELECT name FROM admin_profiles WHERE id = profile_id) as profile_name
      FROM admin_users 
      WHERE email LIKE ? AND is_active = TRUE
      ORDER BY email
      LIMIT 10
    `, [`%${email.toLowerCase()}%`]);
    
    res.json(users);
  } catch (error) {
    console.error('Error searching admin users:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Sync account owners from partners table (includes email from CRM)
 */
router.post('/pams/sync-owners', async (req, res) => {
  try {
    // Get all unique account owners from partners (including owner_email from CRM)
    const owners = await query(`
      SELECT DISTINCT account_owner, owner_email, account_region
      FROM partners
      WHERE account_owner IS NOT NULL AND account_owner != ''
    `);
    
    let added = 0;
    let updated = 0;
    
    for (const owner of owners) {
      try {
        const ownerEmail = owner.owner_email || null;
        const result = await query(`
          INSERT INTO partner_managers (owner_name, email, region, is_active_pam, email_reports_enabled, report_frequency)
          VALUES (?, ?, ?, TRUE, TRUE, 'weekly')
          ON DUPLICATE KEY UPDATE 
            email = COALESCE(VALUES(email), email),
            region = COALESCE(VALUES(region), region)
        `, [owner.account_owner, ownerEmail, owner.account_region]);
        
        if (result.insertId) added++;
        else if (result.affectedRows > 0) updated++;
      } catch (err) {
        // Skip duplicates
        console.error(`Error syncing owner ${owner.account_owner}:`, err.message);
      }
    }
    
    res.json({
      success: true,
      message: `Synced ${owners.length} owners: ${added} added, ${updated} updated (with emails)`
    });
  } catch (error) {
    console.error('Error syncing owners:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Notification Templates API
// ============================================================================

/**
 * Get all notification templates
 */
router.get('/notification-templates', async (req, res) => {
  try {
    const { getTemplates } = require('./db/notificationService.cjs');
    const templates = await getTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Error getting templates:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get a specific template
 */
router.get('/notification-templates/:key', async (req, res) => {
  try {
    const { getTemplate } = require('./db/notificationService.cjs');
    const template = await getTemplate(req.params.key);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    console.error('Error getting template:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update a template
 */
router.put('/notification-templates/:id', async (req, res) => {
  try {
    const { updateTemplate } = require('./db/notificationService.cjs');
    const template = await updateTemplate(parseInt(req.params.id), req.body);
    res.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create a new template
 */
router.post('/notification-templates', async (req, res) => {
  try {
    const { createTemplate } = require('./db/notificationService.cjs');
    const template = await createTemplate(req.body);
    res.json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete a template
 */
router.delete('/notification-templates/:id', async (req, res) => {
  try {
    const { deleteTemplate } = require('./db/notificationService.cjs');
    const deleted = await deleteTemplate(parseInt(req.params.id));
    if (!deleted) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Preview a rendered template
 */
router.post('/notification-templates/:key/preview', async (req, res) => {
  try {
    const { renderTemplate } = require('./db/notificationService.cjs');
    const rendered = await renderTemplate(req.params.key, req.body.variables || {});
    res.json(rendered);
  } catch (error) {
    console.error('Error previewing template:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Email Settings & Test
// ============================================================================

/**
 * Get email settings
 */
router.get('/email-settings', async (req, res) => {
  try {
    const [settings] = await query('SELECT * FROM email_settings WHERE id = 1');
    
    // Don't expose password
    if (settings?.smtp_pass) {
      settings.smtp_pass = '••••••••';
    }
    
    res.json(settings || {
      id: 1,
      smtp_host: '',
      smtp_port: 587,
      smtp_user: '',
      from_email: '',
      from_name: 'Nintex Partner Portal',
      enabled: false
    });
  } catch (error) {
    console.error('Error getting email settings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update email settings
 */
router.put('/email-settings', async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, from_email, from_name, enabled } = req.body;
    
    // Only update password if provided (not the masked value)
    const passUpdate = smtp_pass && smtp_pass !== '••••••••' ? ', smtp_pass = ?' : '';
    const params = [smtp_host, smtp_port, smtp_user, from_email, from_name, enabled];
    if (passUpdate) params.push(smtp_pass);
    
    await query(`
      INSERT INTO email_settings (id, smtp_host, smtp_port, smtp_user, from_email, from_name, enabled${passUpdate ? ', smtp_pass' : ''})
      VALUES (1, ?, ?, ?, ?, ?, ?${passUpdate ? ', ?' : ''})
      ON DUPLICATE KEY UPDATE 
        smtp_host = VALUES(smtp_host),
        smtp_port = VALUES(smtp_port),
        smtp_user = VALUES(smtp_user),
        from_email = VALUES(from_email),
        from_name = VALUES(from_name),
        enabled = VALUES(enabled)
        ${passUpdate ? ', smtp_pass = VALUES(smtp_pass)' : ''}
    `, params);
    
    res.json({ success: true, message: 'Email settings updated' });
  } catch (error) {
    console.error('Error updating email settings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Test notification via Nintex Workflow Cloud
 * Supports both email and slack notification types
 */
router.post('/email-settings/test', async (req, res) => {
  try {
    const { testEmail, commType = 'email' } = req.body;
    
    if (commType === 'email' && !testEmail) {
      return res.status(400).json({ error: 'Test email address required' });
    }
    
    // Use Nintex Workflow Cloud for notifications
    const { sendTestNotification } = require('./db/notificationService.cjs');
    
    const result = await sendTestNotification(commType, testEmail);
    
    // Log success
    await query(`
      INSERT INTO email_log (recipient_email, subject, email_type, status, sent_at)
      VALUES (?, 'Test Notification', ?, 'sent', NOW())
    `, [testEmail || 'Slack Channel', commType]);
    
    res.json({ 
      success: true, 
      message: `Test ${commType} notification sent successfully`,
      instanceId: result.instanceId
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    
    // Log failure
    await query(`
      INSERT INTO email_log (recipient_email, subject, email_type, status, error_message)
      VALUES (?, 'Test Notification', ?, 'failed', ?)
    `, [req.body.testEmail || 'Slack Channel', req.body.commType || 'email', error.message]);
    
    res.status(500).json({ error: `Failed to send notification: ${error.message}` });
  }
});

/**
 * Get email log
 */
router.get('/email-log', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    
    const logs = await query(`
      SELECT * FROM email_log
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);
    
    res.json(logs);
  } catch (error) {
    console.error('Error getting email log:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send weekly report to a specific PAM via Nintex Workflow Cloud
 */
router.post('/pams/:id/send-report', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get PAM
    const [pam] = await query('SELECT * FROM partner_managers WHERE id = ?', [id]);
    if (!pam || !pam.email) {
      return res.status(400).json({ error: 'PAM not found or no email configured' });
    }
    
    // NPCU requirements by tier
    const tierRequirements = {
      'Premier': 20,
      'Select': 10,
      'Registered': 5,
      'Certified': 0
    };
    
    // Get their partners with comprehensive stats - LMS Group is the master source
    const partners = await query(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM contacts c WHERE c.partner_id = p.id) as crm_contacts,
        COALESCE(g.user_count, 0) as lms_users,
        (SELECT COUNT(DISTINCT e.user_id) 
         FROM lms_enrollments e 
         JOIN lms_group_members gm ON gm.user_id = e.user_id AND gm.group_id = g.id
         JOIN course_properties cp ON cp.course_id = e.course_id AND cp.npcu_value > 0
         WHERE e.status = 'completed'
         AND (e.expires_at IS NULL OR e.expires_at > NOW())) as certified_users,
        (SELECT COALESCE(SUM(cp.npcu_value), 0)
         FROM lms_enrollments e
         JOIN lms_group_members gm ON gm.user_id = e.user_id AND gm.group_id = g.id
         JOIN course_properties cp ON cp.course_id = e.course_id
         WHERE e.status = 'completed'
         AND (e.expires_at IS NULL OR e.expires_at > NOW())) as total_npcu
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE p.account_owner = ?
      ORDER BY p.account_name
    `, [pam.owner_name]);
    
    // Get NEW certifications this week (last 7 days) - from LMS group members
    const newCertsThisWeek = await query(`
      SELECT 
        u.first_name,
        u.last_name,
        p.account_name as partner_name,
        c.name as course_name,
        cp.npcu_value,
        e.completed_at
      FROM lms_enrollments e
      INNER JOIN lms_users u ON u.id = e.user_id
      INNER JOIN lms_courses c ON c.id = e.course_id
      INNER JOIN course_properties cp ON cp.course_id = e.course_id AND cp.npcu_value > 0
      INNER JOIN lms_groups g ON 1=1
      INNER JOIN lms_group_members gm ON gm.group_id = g.id AND gm.user_id = u.id
      INNER JOIN partners p ON p.id = g.partner_id
      WHERE e.status = 'completed'
        AND e.completed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND p.account_owner = ?
      ORDER BY e.completed_at DESC
      LIMIT 20
    `, [pam.owner_name]);
    
    // Get expiring certifications for this PAM's partners (next 90 days) - from LMS group members
    const expiringCerts = await query(`
      SELECT 
        u.first_name,
        u.last_name,
        u.email,
        p.account_name as partner_name,
        c.name as course_name,
        cp.npcu_value,
        e.expires_at,
        DATEDIFF(e.expires_at, NOW()) as days_until_expiry
      FROM lms_enrollments e
      INNER JOIN lms_users u ON u.id = e.user_id
      INNER JOIN lms_courses c ON c.id = e.course_id
      INNER JOIN course_properties cp ON cp.course_id = e.course_id AND cp.npcu_value > 0
      INNER JOIN lms_groups g ON 1=1
      INNER JOIN lms_group_members gm ON gm.group_id = g.id AND gm.user_id = u.id
      INNER JOIN partners p ON p.id = g.partner_id
      WHERE e.status = 'completed'
        AND e.expires_at IS NOT NULL
        AND e.expires_at > NOW()
        AND e.expires_at <= DATE_ADD(NOW(), INTERVAL 90 DAY)
        AND p.account_owner = ?
      ORDER BY e.expires_at ASC
      LIMIT 25
    `, [pam.owner_name]);
    
    // Calculate summary stats
    const totalPartners = partners.length;
    const totalCrmContacts = partners.reduce((sum, p) => sum + (p.crm_contacts || 0), 0);
    const totalLmsUsers = partners.reduce((sum, p) => sum + (p.lms_users || 0), 0);
    const totalCertifiedUsers = partners.reduce((sum, p) => sum + (p.certified_users || 0), 0);
    const totalNpcu = partners.reduce((sum, p) => sum + (p.total_npcu || 0), 0);
    
    // Partners below tier requirements
    const partnersAtRisk = partners.filter(p => {
      const required = tierRequirements[p.partner_tier] || 0;
      return required > 0 && (p.total_npcu || 0) < required;
    });
    
    // Partners with no LMS users
    const partnersNoLms = partners.filter(p => !p.lms_users || p.lms_users === 0);
    
    const reportDate = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    
    // Build summary cards HTML
    const summaryCardsHtml = `
      <div style="display: flex; flex-wrap: wrap; gap: 15px; margin: 20px 0;">
        <div style="flex: 1; min-width: 140px; background: #e8f5e9; border-radius: 8px; padding: 15px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #2e7d32;">${newCertsThisWeek.length}</div>
          <div style="color: #666; font-size: 12px;">New Certs This Week</div>
        </div>
        <div style="flex: 1; min-width: 140px; background: ${partnersAtRisk.length > 0 ? '#fff3e0' : '#e8f5e9'}; border-radius: 8px; padding: 15px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: ${partnersAtRisk.length > 0 ? '#e65100' : '#2e7d32'};">${partnersAtRisk.length}</div>
          <div style="color: #666; font-size: 12px;">Below Tier Target</div>
        </div>
        <div style="flex: 1; min-width: 140px; background: ${expiringCerts.length > 0 ? '#ffebee' : '#e8f5e9'}; border-radius: 8px; padding: 15px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: ${expiringCerts.length > 0 ? '#c62828' : '#2e7d32'};">${expiringCerts.length}</div>
          <div style="color: #666; font-size: 12px;">Expiring Soon</div>
        </div>
        <div style="flex: 1; min-width: 140px; background: ${partnersNoLms.length > 0 ? '#fff3e0' : '#e8f5e9'}; border-radius: 8px; padding: 15px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: ${partnersNoLms.length > 0 ? '#e65100' : '#2e7d32'};">${partnersNoLms.length}</div>
          <div style="color: #666; font-size: 12px;">No LMS Users</div>
        </div>
      </div>
    `;
    
    // Build new certifications section
    let newCertsSection = '';
    if (newCertsThisWeek.length > 0) {
      const certRows = newCertsThisWeek.map(cert => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${cert.first_name} ${cert.last_name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${cert.partner_name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${cert.course_name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${cert.npcu_value}</td>
        </tr>
      `).join('');
      
      newCertsSection = `
        <h3 style="color: #2e7d32; border-bottom: 2px solid #2e7d32; padding-bottom: 5px; margin-top: 30px;">
          🎉 New Certifications This Week (${newCertsThisWeek.length})
        </h3>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <thead>
            <tr style="background: #e8f5e9;">
              <th style="padding: 10px; text-align: left;">Person</th>
              <th style="padding: 10px; text-align: left;">Partner</th>
              <th style="padding: 10px; text-align: left;">Certification</th>
              <th style="padding: 10px; text-align: center;">NPCU</th>
            </tr>
          </thead>
          <tbody>
            ${certRows}
          </tbody>
        </table>
      `;
    }
    
    // Build partners at risk section
    let atRiskSection = '';
    if (partnersAtRisk.length > 0) {
      const riskRows = partnersAtRisk.map(p => {
        const required = tierRequirements[p.partner_tier] || 0;
        const gap = required - (p.total_npcu || 0);
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${p.account_name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${p.partner_tier}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${p.total_npcu || 0}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${required}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; color: #c62828; font-weight: bold;">-${gap}</td>
          </tr>
        `;
      }).join('');
      
      atRiskSection = `
        <h3 style="color: #e65100; border-bottom: 2px solid #e65100; padding-bottom: 5px; margin-top: 30px;">
          ⚠️ Partners Below Tier Requirements (${partnersAtRisk.length})
        </h3>
        <p style="color: #666; font-size: 13px;">These partners need attention to maintain their tier status:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <thead>
            <tr style="background: #fff3e0;">
              <th style="padding: 10px; text-align: left;">Partner</th>
              <th style="padding: 10px; text-align: center;">Tier</th>
              <th style="padding: 10px; text-align: center;">Current NPCU</th>
              <th style="padding: 10px; text-align: center;">Required</th>
              <th style="padding: 10px; text-align: center;">Gap</th>
            </tr>
          </thead>
          <tbody>
            ${riskRows}
          </tbody>
        </table>
      `;
    }
    
    // Build main partner table with enhanced columns
    let partnerRows = partners.map(p => {
      const required = tierRequirements[p.partner_tier] || 0;
      const npcu = p.total_npcu || 0;
      const npcuColor = required > 0 && npcu < required ? '#c62828' : npcu >= required && required > 0 ? '#2e7d32' : '#333';
      const npcuDisplay = required > 0 ? `${npcu}/${required}` : `${npcu}`;
      
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${p.account_name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${p.partner_tier || '-'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${p.crm_contacts || 0}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${p.lms_users || 0}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${p.certified_users || 0}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; color: ${npcuColor}; font-weight: bold;">${npcuDisplay}</td>
        </tr>
      `;
    }).join('');
    
    // Build expiring certifications section
    let expiringCertsSection = '';
    if (expiringCerts.length > 0) {
      const expiringRows = expiringCerts.map(cert => {
        let urgencyColor = '#2e7d32';
        let urgencyText = `${cert.days_until_expiry} days`;
        if (cert.days_until_expiry <= 30) {
          urgencyColor = '#c62828';
          urgencyText = `⚠️ ${cert.days_until_expiry} days`;
        } else if (cert.days_until_expiry <= 60) {
          urgencyColor = '#e65100';
        }
        
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${cert.first_name} ${cert.last_name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${cert.partner_name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${cert.course_name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${cert.npcu_value}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; color: ${urgencyColor}; font-weight: bold;">${urgencyText}</td>
          </tr>
        `;
      }).join('');
      
      expiringCertsSection = `
        <h3 style="color: #c62828; border-bottom: 2px solid #c62828; padding-bottom: 5px; margin-top: 30px;">
          ⏰ Expiring Certifications (${expiringCerts.length})
        </h3>
        <p style="color: #666; font-size: 13px;">These certifications will expire within the next 90 days:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <thead>
            <tr style="background: #ffebee;">
              <th style="padding: 10px; text-align: left;">Person</th>
              <th style="padding: 10px; text-align: left;">Partner</th>
              <th style="padding: 10px; text-align: left;">Certification</th>
              <th style="padding: 10px; text-align: center;">NPCU</th>
              <th style="padding: 10px; text-align: center;">Expires In</th>
            </tr>
          </thead>
          <tbody>
            ${expiringRows}
          </tbody>
        </table>
      `;
    }
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; background: #fff;">
        <div style="background: linear-gradient(135deg, #6B4C9A, #FF6B35); padding: 25px; color: white;">
          <h1 style="margin: 0; font-size: 24px;">Weekly Partner Report</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">${reportDate}</p>
        </div>
        
        <div style="padding: 25px;">
          <p style="font-size: 15px;">Hi ${pam.owner_name.split(' ')[0]},</p>
          <p style="color: #666;">Here's your weekly summary of partner activity and actionable insights:</p>
          
          ${summaryCardsHtml}
          
          ${newCertsSection}
          
          ${atRiskSection}
          
          <h3 style="color: #6B4C9A; border-bottom: 2px solid #6B4C9A; padding-bottom: 5px; margin-top: 30px;">
            📊 All Partners (${partners.length})
          </h3>
          <p style="color: #666; font-size: 13px;">
            Total: ${totalCrmContacts} CRM contacts | ${totalLmsUsers} LMS users | ${totalCertifiedUsers} certified | ${totalNpcu} NPCU
          </p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 10px; text-align: left;">Partner</th>
                <th style="padding: 10px; text-align: center;">Tier</th>
                <th style="padding: 10px; text-align: center;">CRM<br>Contacts</th>
                <th style="padding: 10px; text-align: center;">LMS<br>Users</th>
                <th style="padding: 10px; text-align: center;">Certified<br>Users</th>
                <th style="padding: 10px; text-align: center;">NPCU</th>
              </tr>
            </thead>
            <tbody>
              ${partnerRows || '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #999;">No partners assigned</td></tr>'}
            </tbody>
          </table>
          
          ${expiringCertsSection}
          
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-top: 30px;">
            <p style="color: #666; font-size: 12px; margin: 0;">
              This report was generated automatically by the Nintex Partner Portal.
              <br>To manage your preferences, contact your administrator.
            </p>
          </div>
        </div>
      </div>
    `;
    
    // Send via Nintex Workflow Cloud
    const { sendEmail } = require('./db/notificationService.cjs');
    const subject = `Weekly Partner Report - ${reportDate}`;
    
    const result = await sendEmail(pam.email, subject, html);
    
    // Update last sent
    await query('UPDATE partner_managers SET last_report_sent = NOW() WHERE id = ?', [id]);
    
    // Log
    await query(`
      INSERT INTO email_log (recipient_email, recipient_name, subject, email_type, status, sent_at)
      VALUES (?, ?, ?, 'weekly_report', 'sent', NOW())
    `, [pam.email, pam.owner_name, subject]);
    
    res.json({ 
      success: true, 
      message: 'Report sent successfully via Nintex Workflow',
      instanceId: result.instanceId,
      expiringCertifications: expiringCerts.length
    });
  } catch (error) {
    console.error('Error sending report:', error);
    
    // Log failure
    try {
      const [pam] = await query('SELECT * FROM partner_managers WHERE id = ?', [req.params.id]);
      if (pam) {
        await query(`
          INSERT INTO email_log (recipient_email, recipient_name, subject, email_type, status, error_message)
          VALUES (?, ?, 'Weekly Partner Report', 'weekly_report', 'failed', ?)
        `, [pam.email, pam.owner_name, error.message]);
      }
    } catch (logError) {
      console.error('Error logging failure:', logError);
    }
    
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, initializeDatabase, authMiddleware, requirePermission };
