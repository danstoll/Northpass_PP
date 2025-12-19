/**
 * Scheduled Sync Service
 * Handles periodic syncing of Northpass data
 */

const { query } = require('./connection.cjs');
const lmsSyncService = require('./lmsSyncService.cjs');

let syncTimer = null;
let isRunning = false;

/**
 * Get the current schedule configuration
 */
async function getScheduleConfig() {
  const rows = await query('SELECT * FROM sync_schedule WHERE id = 1');
  if (rows.length === 0) {
    // Initialize default config
    await query(`
      INSERT INTO sync_schedule (id, enabled, interval_hours, sync_types) 
      VALUES (1, FALSE, 24, '["users", "groups", "courses", "enrollments"]')
    `);
    return {
      enabled: false,
      interval_hours: 24,
      sync_types: ['users', 'groups', 'courses', 'enrollments'],
      last_scheduled_run: null,
      next_scheduled_run: null
    };
  }
  
  const config = rows[0];
  return {
    enabled: Boolean(config.enabled),
    interval_hours: config.interval_hours,
    sync_types: typeof config.sync_types === 'string' 
      ? JSON.parse(config.sync_types) 
      : config.sync_types,
    last_scheduled_run: config.last_scheduled_run,
    next_scheduled_run: config.next_scheduled_run
  };
}

/**
 * Update the schedule configuration
 */
async function updateScheduleConfig(config) {
  const { enabled, interval_hours, sync_types } = config;
  
  // Calculate next run time if enabling
  let next_run = null;
  if (enabled) {
    next_run = new Date(Date.now() + (interval_hours * 60 * 60 * 1000));
  }
  
  await query(`
    UPDATE sync_schedule SET 
      enabled = ?,
      interval_hours = ?,
      sync_types = ?,
      next_scheduled_run = ?,
      updated_at = NOW()
    WHERE id = 1
  `, [
    enabled,
    interval_hours,
    JSON.stringify(sync_types),
    next_run
  ]);
  
  // Restart the timer with new settings
  if (enabled) {
    startScheduler(interval_hours);
  } else {
    stopScheduler();
  }
  
  return await getScheduleConfig();
}

/**
 * Run the scheduled sync
 */
async function runScheduledSync() {
  if (isRunning) {
    console.log('⏭️ Scheduled sync skipped - already running');
    return;
  }
  
  isRunning = true;
  console.log('🔄 Starting scheduled sync...');
  
  try {
    const config = await getScheduleConfig();
    if (!config.enabled) {
      console.log('⏸️ Scheduled sync disabled');
      return;
    }
    
    // Update last run time
    await query(`
      UPDATE sync_schedule SET 
        last_scheduled_run = NOW(),
        next_scheduled_run = DATE_ADD(NOW(), INTERVAL ? HOUR)
      WHERE id = 1
    `, [config.interval_hours]);
    
    // Run each sync type
    const results = {};
    for (const syncType of config.sync_types) {
      console.log(`  Syncing ${syncType}...`);
      try {
        switch (syncType) {
          case 'users':
            results.users = await lmsSyncService.syncUsers();
            break;
          case 'groups':
            results.groups = await lmsSyncService.syncGroups();
            break;
          case 'courses':
            results.courses = await lmsSyncService.syncCourses();
            break;
          case 'enrollments':
            results.enrollments = await lmsSyncService.syncEnrollments();
            break;
        }
        console.log(`  ✓ ${syncType} complete`);
      } catch (err) {
        console.error(`  ✗ ${syncType} failed:`, err.message);
        results[syncType] = { error: err.message };
      }
    }
    
    console.log('✅ Scheduled sync complete');
    return results;
    
  } catch (error) {
    console.error('❌ Scheduled sync failed:', error.message);
    throw error;
  } finally {
    isRunning = false;
  }
}

/**
 * Start the scheduler
 */
function startScheduler(intervalHours = 24) {
  stopScheduler(); // Clear any existing timer
  
  const intervalMs = intervalHours * 60 * 60 * 1000;
  console.log(`⏰ Starting sync scheduler: every ${intervalHours} hours`);
  
  syncTimer = setInterval(async () => {
    try {
      await runScheduledSync();
    } catch (err) {
      console.error('Scheduled sync error:', err.message);
    }
  }, intervalMs);
  
  return true;
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('⏹️ Sync scheduler stopped');
  }
}

/**
 * Initialize the scheduler on server start
 */
async function initializeScheduler() {
  try {
    const config = await getScheduleConfig();
    if (config.enabled) {
      startScheduler(config.interval_hours);
      
      // Check if we missed a scheduled run
      if (config.next_scheduled_run && new Date(config.next_scheduled_run) < new Date()) {
        console.log('🔄 Missed scheduled sync, running now...');
        setTimeout(() => runScheduledSync(), 5000); // Run after 5s
      }
    }
  } catch (err) {
    console.error('Failed to initialize scheduler:', err.message);
  }
}

/**
 * Get scheduler status
 */
function getSchedulerStatus() {
  return {
    running: syncTimer !== null,
    syncing: isRunning
  };
}

module.exports = {
  getScheduleConfig,
  updateScheduleConfig,
  runScheduledSync,
  startScheduler,
  stopScheduler,
  initializeScheduler,
  getSchedulerStatus
};
