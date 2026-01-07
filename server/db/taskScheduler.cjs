/**
 * Task Scheduler Service
 * A robust task scheduling system with database persistence
 * 
 * Features:
 * - Database-backed task queue (survives restarts)
 * - Mutex locks to prevent overlapping runs
 * - Automatic retry on failure
 * - Detailed execution history
 * - Missed task detection and catch-up
 * - System alerts on task failures (via Nintex Workflow Cloud)
 */

const { query } = require('./connection.cjs');

// Environment check - only run scheduler in production
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.ENABLE_SCHEDULER === 'true';

// In-memory state
let schedulerInterval = null;
let runningTasks = new Map(); // task_type -> { startedAt, progress }

// System alerts enabled by default in production
let systemAlertsEnabled = IS_PRODUCTION;

/**
 * Update task progress (called by task executors)
 */
function updateTaskProgress(taskType, stage, current, total, details = null) {
  const taskInfo = runningTasks.get(taskType);
  if (taskInfo) {
    taskInfo.progress = { stage, current, total, details, updatedAt: new Date() };
  }
}
const CHECK_INTERVAL_MS = 60000; // Check every minute

/**
 * Initialize the scheduler - call on server start
 */
async function initializeScheduler() {
  // Skip scheduler in development (shares production DB)
  if (!IS_PRODUCTION) {
    console.log('⏰ Task scheduler DISABLED (dev mode - set NODE_ENV=production or ENABLE_SCHEDULER=true to enable)');
    return;
  }
  
  console.log('⏰ Initializing task scheduler...');
  
  try {
    // Check for any tasks that were "running" when server crashed
    await query(`
      UPDATE scheduled_tasks 
      SET last_status = 'failed', last_error = 'Server restart during execution'
      WHERE last_status = 'running'
    `);
    
    // Also mark any orphaned task_run_history entries
    await query(`
      UPDATE task_run_history 
      SET status = 'cancelled', 
          completed_at = NOW(),
          error_message = 'Server restart during execution'
      WHERE status = 'running'
    `);
    
    // Start the scheduler loop
    startSchedulerLoop();
    
    // Check immediately for missed tasks
    setTimeout(() => checkAndRunTasks(), 5000);
    
    console.log('✅ Task scheduler initialized');
  } catch (error) {
    console.error('❌ Failed to initialize scheduler:', error.message);
  }
}

/**
 * Start the main scheduler loop
 */
function startSchedulerLoop() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  
  schedulerInterval = setInterval(async () => {
    try {
      await checkAndRunTasks();
    } catch (error) {
      console.error('Scheduler loop error:', error.message);
    }
  }, CHECK_INTERVAL_MS);
  
  console.log(`  📅 Scheduler checking every ${CHECK_INTERVAL_MS / 1000}s`);
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('⏹️ Task scheduler stopped');
  }
}

/**
 * Check for due tasks and run them
 */
async function checkAndRunTasks() {
  const dueTasks = await query(`
    SELECT * FROM scheduled_tasks 
    WHERE enabled = TRUE 
    AND (next_run_at IS NULL OR next_run_at <= NOW())
    ORDER BY next_run_at ASC
  `);
  
  for (const task of dueTasks) {
    // Skip if already running
    if (runningTasks.has(task.task_type)) {
      console.log(`⏭️ Skipping ${task.task_name} - already running`);
      continue;
    }
    
    // Run task in background
    runTask(task).catch(err => {
      console.error(`Task ${task.task_name} error:`, err.message);
    });
  }
}

/**
 * Run a specific task
 */
async function runTask(task) {
  const startTime = Date.now();
  let historyId = null;
  
  console.log(`🚀 Starting task: ${task.task_name}`);
  
  try {
    // Mark as running with progress tracking
    runningTasks.set(task.task_type, { 
      startedAt: new Date(),
      progress: { stage: 'Initializing', current: 0, total: 0 }
    });
    
    await query(`
      UPDATE scheduled_tasks 
      SET last_status = 'running', last_run_at = NOW()
      WHERE id = ?
    `, [task.id]);
    
    // Create history entry
    const historyResult = await query(`
      INSERT INTO task_run_history (task_id, task_type, started_at, status)
      VALUES (?, ?, NOW(), 'running')
    `, [task.id, task.task_type]);
    historyId = historyResult.insertId;
    
    // Execute the task
    const config = typeof task.config === 'string' ? JSON.parse(task.config) : task.config || {};
    const result = await executeTask(task.task_type, config);
    
    // Calculate duration
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    
    // Update success
    await query(`
      UPDATE scheduled_tasks SET
        last_status = 'success',
        last_error = NULL,
        last_duration_seconds = ?,
        run_count = run_count + 1,
        next_run_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
      WHERE id = ?
    `, [durationSeconds, task.interval_minutes, task.id]);
    
    await query(`
      UPDATE task_run_history SET
        status = 'success',
        completed_at = NOW(),
        duration_seconds = ?,
        records_processed = ?,
        result_summary = ?
      WHERE id = ?
    `, [durationSeconds, result.recordsProcessed || 0, JSON.stringify(result), historyId]);
    
    console.log(`✅ Task complete: ${task.task_name} (${durationSeconds}s)`);
    return result;
    
  } catch (error) {
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    
    // Update failure
    await query(`
      UPDATE scheduled_tasks SET
        last_status = 'failed',
        last_error = ?,
        last_duration_seconds = ?,
        fail_count = fail_count + 1,
        next_run_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
      WHERE id = ?
    `, [error.message, durationSeconds, Math.min(task.interval_minutes, 30), task.id]); // Retry sooner on failure
    
    if (historyId) {
      await query(`
        UPDATE task_run_history SET
          status = 'failed',
          completed_at = NOW(),
          duration_seconds = ?,
          error_message = ?
        WHERE id = ?
      `, [durationSeconds, error.message, historyId]);
    }
    
    console.error(`❌ Task failed: ${task.task_name} - ${error.message}`);
    
    // Send system alert for task failure (if enabled)
    if (systemAlertsEnabled) {
      try {
        const { sendSyncErrorAlert } = require('./notificationService.cjs');
        await sendSyncErrorAlert(task.task_name, error.message, durationSeconds);
        console.log(`📤 Sent system alert for failed task: ${task.task_name}`);
      } catch (alertError) {
        console.error(`⚠️ Failed to send system alert: ${alertError.message}`);
      }
    }
    
    throw error;
    
  } finally {
    runningTasks.delete(task.task_type);
  }
}

/**
 * Execute a task by type
 * Supports both individual sync types and composite tasks
 */
async function executeTask(taskType, config) {
  const lmsSyncService = require('./lmsSyncService.cjs');
  
  switch (taskType) {
    // Composite tasks (legacy support)
    case 'lms_sync':
      return await runLmsSync(config);
    
    // Individual sync types (new unified approach)
    case 'sync_users':
      return await runSingleSync(taskType, 'users', lmsSyncService.syncUsersIncremental, config);
    
    case 'sync_users_full':
      return await runSingleSync(taskType, 'users', lmsSyncService.syncUsers, config);
    
    case 'sync_groups':
      return await runSingleSync(taskType, 'groups', lmsSyncService.syncGroupsIncremental, config);
    
    case 'sync_groups_full':
      return await runSingleSync(taskType, 'groups', lmsSyncService.syncGroups, config);
    
    case 'sync_courses':
      return await runSingleSync(taskType, 'courses', lmsSyncService.syncCoursesIncremental, config);
    
    case 'sync_courses_full':
      return await runSingleSync(taskType, 'courses', lmsSyncService.syncCourses, config);
    
    case 'sync_npcu':
    case 'sync_course_properties':
      return await runSingleSync(taskType, 'npcu', lmsSyncService.syncCourseProperties, config);
    
    case 'sync_enrollments':
      return await runSingleSync(taskType, 'enrollments', lmsSyncService.syncEnrollmentsIncremental, config, { maxAgeDays: config.maxAgeDays || 7 });
    
    case 'sync_enrollments_full':
      return await runSingleSync(taskType, 'enrollments', lmsSyncService.syncEnrollments, config);
    
    // Analysis and maintenance tasks
    case 'group_analysis':
      return await runGroupAnalysis(config);
    
    case 'group_members_sync':
      return await runGroupMembersSync(config);
    
    case 'cleanup':
      return await runCleanup(config);
    
    // Impartner CRM sync (replaces manual Excel import)
    case 'impartner_sync':
      return await runImpartnerSync(config);
    
    // Sync LMS data TO Impartner (certification counts, NPCU, training URLs)
    case 'sync_to_impartner':
      return await runSyncToImpartner(config);
    
    default:
      throw new Error(`Unknown task type: ${taskType}`);
  }
}

/**
 * Run a single sync operation with progress tracking
 */
async function runSingleSync(taskType, syncName, syncFn, config, extraOptions = {}) {
  const results = { recordsProcessed: 0, syncType: syncName };
  
  updateTaskProgress(taskType, `Starting ${syncName} sync`, 0, 100);
  
  try {
    const syncResult = await syncFn(null, (type, current, total) => {
      updateTaskProgress(taskType, `Syncing ${syncName}`, current, total, `${current.toLocaleString()} of ${total.toLocaleString()}`);
    }, extraOptions);
    
    results.recordsProcessed = syncResult?.processed || syncResult?.total || syncResult?.synced || 0;
    results.details = syncResult;
    
    updateTaskProgress(taskType, 'Complete', 100, 100);
  } catch (err) {
    results.error = err.message;
    throw err;
  }
  
  return results;
}

/**
 * LMS Sync Task
 */
async function runLmsSync(config) {
  const lmsSyncService = require('./lmsSyncService.cjs');
  const results = { recordsProcessed: 0, details: {} };
  
  const syncTypes = config.sync_types || ['users', 'groups', 'courses'];
  const totalSteps = syncTypes.length;
  
  for (let i = 0; i < syncTypes.length; i++) {
    const syncType = syncTypes[i];
    updateTaskProgress('lms_sync', `Syncing ${syncType}`, i, totalSteps, `Step ${i + 1} of ${totalSteps}`);
    
    try {
      let syncResult;
      switch (syncType) {
        case 'users':
          // Use incremental sync by default (only fetch users updated since last sync)
          // This reduces API calls from ~32,000 to typically <200
          syncResult = await lmsSyncService.syncUsersIncremental(null, (type, current, total) => {
            updateTaskProgress('lms_sync', `Syncing users (incremental)`, current, total, `${current.toLocaleString()} of ${total.toLocaleString()}`);
          });
          break;
        case 'users_full':
          // Full sync - fetch ALL users (use sparingly)
          syncResult = await lmsSyncService.syncUsers(null, (type, current, total) => {
            updateTaskProgress('lms_sync', `Syncing users (full)`, current, total, `${current.toLocaleString()} of ${total.toLocaleString()}`);
          });
          break;
        case 'groups':
          // Use incremental sync by default (only fetch groups updated since last sync)
          syncResult = await lmsSyncService.syncGroupsIncremental(null, (type, current, total) => {
            updateTaskProgress('lms_sync', `Syncing groups (incremental)`, current, total, `${current.toLocaleString()} of ${total.toLocaleString()}`);
          });
          break;
        case 'groups_full':
          // Full sync - fetch ALL groups (use sparingly)
          syncResult = await lmsSyncService.syncGroups(null, (type, current, total) => {
            updateTaskProgress('lms_sync', `Syncing groups (full)`, current, total, `${current.toLocaleString()} of ${total.toLocaleString()}`);
          });
          break;
        case 'group_members':
          syncResult = await lmsSyncService.syncGroupMembers(null, (type, current, total) => {
            updateTaskProgress('lms_sync', `Syncing group members`, current, total, `${current.toLocaleString()} of ${total.toLocaleString()}`);
          });
          break;
        case 'courses':
          // Use incremental sync by default (only fetch courses updated since last sync)
          syncResult = await lmsSyncService.syncCoursesIncremental(null, (type, current, total) => {
            updateTaskProgress('lms_sync', `Syncing courses (incremental)`, current, total, `${current.toLocaleString()} of ${total.toLocaleString()}`);
          });
          break;
        case 'courses_full':
          // Full sync - fetch ALL courses (use sparingly)
          syncResult = await lmsSyncService.syncCourses(null, (type, current, total) => {
            updateTaskProgress('lms_sync', `Syncing courses (full)`, current, total, `${current.toLocaleString()} of ${total.toLocaleString()}`);
          });
          break;
        case 'course_properties':
        case 'npcu':
          syncResult = await lmsSyncService.syncCourseProperties(null, (type, current, total) => {
            updateTaskProgress('lms_sync', `Syncing NPCU values`, current, total, `${current.toLocaleString()} of ${total.toLocaleString()}`);
          });
          break;
        case 'enrollments':
          // Use incremental enrollment sync by default (only users changed since last sync)
          syncResult = await lmsSyncService.syncEnrollmentsIncremental(null, (type, current, total) => {
            updateTaskProgress('lms_sync', `Syncing enrollments (incremental)`, current, total, `${current.toLocaleString()} of ${total.toLocaleString()}`);
          }, { maxAgeDays: config.enrollment_max_age_days || 7 });
          break;
        case 'enrollments_full':
          // Full enrollment sync - fetch ALL partner users (use sparingly, takes 60+ min)
          syncResult = await lmsSyncService.syncEnrollments(null, (type, current, total) => {
            updateTaskProgress('lms_sync', `Syncing enrollments (full)`, current, total, `${current.toLocaleString()} of ${total.toLocaleString()}`);
          });
          break;
      }
      results.details[syncType] = syncResult;
      results.recordsProcessed += syncResult?.processed || syncResult?.total || 0;
    } catch (err) {
      results.details[syncType] = { error: err.message };
    }
  }
  
  updateTaskProgress('lms_sync', 'Complete', totalSteps, totalSteps);
  return results;
}

/**
 * Group Analysis Task - analyze all groups and save results
 */
async function runGroupAnalysis(config) {
  const startTime = Date.now();
  
  updateTaskProgress('group_analysis', 'Fetching groups', 0, 100);
  
  // Get all groups
  const groups = await query(`
    SELECT 
      g.id,
      g.name,
      g.partner_id,
      p.partner_tier,
      (SELECT COUNT(*) FROM lms_group_members gm WHERE gm.group_id = g.id) as member_count
    FROM lms_groups g
    LEFT JOIN partners p ON g.partner_id = p.id
  `);
  
  const results = {
    totalGroups: groups.length,
    groupsWithPotential: 0,
    totalPotentialUsers: 0,
    groupsPendingSync: 0,
    errors: 0,
    details: []
  };
  
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    
    // Update progress every 10 groups
    if (i % 10 === 0) {
      updateTaskProgress('group_analysis', `Analyzing groups`, i, groups.length, group.name);
    }
    
    try {
      // Get members with pending status
      const pendingMembers = await query(`
        SELECT COUNT(*) as count FROM lms_group_members 
        WHERE group_id = ? AND pending_source = 'local'
      `, [group.id]);
      const pendingCount = pendingMembers[0]?.count || 0;
      
      // Public email domains to exclude (unless CRM match)
      const publicDomains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'aol.com', 'icloud.com', 'live.com', 'msn.com', 'me.com', 'mail.com', 'protonmail.com', 'ymail.com'];
      
      // Get email domains from current members
      const members = await query(`
        SELECT u.email FROM lms_users u
        INNER JOIN lms_group_members gm ON gm.user_id = u.id
        WHERE gm.group_id = ?
      `, [group.id]);
      
      const allDomains = [...new Set(
        members
          .map(m => m.email?.split('@')[1])
          .filter(Boolean)
          .map(d => d.toLowerCase())
      )];
      
      // Filter to corporate domains only
      const corporateDomains = allDomains.filter(d => !publicDomains.includes(d));
      
      // Find potential users (same corporate domain, not in group)
      let potentialCount = 0;
      if (corporateDomains.length > 0) {
        const domainConditions = corporateDomains.map(() => 'u.email LIKE ?').join(' OR ');
        const domainParams = corporateDomains.map(d => `%@${d}`);
        
        const potential = await query(`
          SELECT COUNT(*) as count FROM lms_users u
          WHERE u.id NOT IN (SELECT user_id FROM lms_group_members WHERE group_id = ?)
          AND (${domainConditions})
        `, [group.id, ...domainParams]);
        
        potentialCount = potential[0]?.count || 0;
      }
      
      // Also count CRM-matched users with public domains
      if (group.partner_id) {
        const crmMatches = await query(`
          SELECT COUNT(DISTINCT u.id) as count
          FROM lms_users u
          INNER JOIN contacts c ON LOWER(c.email) = LOWER(u.email)
          WHERE c.partner_id = ?
          AND u.id NOT IN (SELECT user_id FROM lms_group_members WHERE group_id = ?)
        `, [group.partner_id, group.id]);
        potentialCount += crmMatches[0]?.count || 0;
      }
      
      if (potentialCount > 0 || pendingCount > 0) {
        results.details.push({
          groupId: group.id,
          groupName: group.name,
          partnerTier: group.partner_tier,
          memberCount: group.member_count,
          potentialUsers: potentialCount,
          pendingSync: pendingCount
        });
        
        if (potentialCount > 0) {
          results.groupsWithPotential++;
          results.totalPotentialUsers += potentialCount;
        }
        if (pendingCount > 0) {
          results.groupsPendingSync++;
        }
      }
    } catch (err) {
      results.errors++;
    }
  }
  
  const durationSeconds = Math.round((Date.now() - startTime) / 1000);
  
  // Save results to database
  if (config.save_results !== false) {
    const analysisResult = await query(`
      INSERT INTO group_analysis_results 
        (run_type, total_groups, groups_with_potential, total_potential_users, groups_pending_sync, errors, duration_seconds)
      VALUES ('scheduled', ?, ?, ?, ?, ?, ?)
    `, [results.totalGroups, results.groupsWithPotential, results.totalPotentialUsers, results.groupsPendingSync, results.errors, durationSeconds]);
    
    const analysisId = analysisResult.insertId;
    
    // Save details
    for (const detail of results.details) {
      await query(`
        INSERT INTO group_analysis_details 
          (analysis_id, group_id, group_name, partner_tier, member_count, potential_users, pending_sync)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [analysisId, detail.groupId, detail.groupName, detail.partnerTier, detail.memberCount, detail.potentialUsers, detail.pendingSync]);
    }
    
    results.analysisId = analysisId;
  }
  
  results.recordsProcessed = groups.length;
  return results;
}

/**
 * Group Members Sync Task - confirm pending members
 */
async function runGroupMembersSync(config) {
  const results = { confirmed: 0, stillPending: 0, errors: 0 };
  
  updateTaskProgress('group_members_sync', 'Fetching pending members', 0, 100);
  
  // Get all pending members
  const pendingMembers = await query(`
    SELECT gm.group_id, gm.user_id, g.name as group_name
    FROM lms_group_members gm
    INNER JOIN lms_groups g ON g.id = gm.group_id
    WHERE gm.pending_source = 'local'
  `);
  
  if (pendingMembers.length === 0) {
    return { ...results, message: 'No pending members to sync' };
  }
  
  updateTaskProgress('group_members_sync', 'Grouping by group', 10, 100, `${pendingMembers.length} pending`);
  
  // Group by group_id for batch API calls
  const groupedPending = {};
  for (const pm of pendingMembers) {
    if (!groupedPending[pm.group_id]) {
      groupedPending[pm.group_id] = [];
    }
    groupedPending[pm.group_id].push(pm.user_id);
  }
  
  // For each group, check API to see if members now exist
  const https = require('https');
  const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';
  
  const groupIds = Object.keys(groupedPending);
  let processed = 0;
  
  for (const [groupId, userIds] of Object.entries(groupedPending)) {
    processed++;
    updateTaskProgress('group_members_sync', 'Checking groups', processed, groupIds.length);
    
    try {
      // Fetch current group members from API
      const response = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.northpass.com',
          path: `/v2/groups/${groupId}/memberships?limit=500`,
          method: 'GET',
          headers: { 'X-Api-Key': API_KEY, 'Accept': 'application/json' }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.end();
      });
      
      if (response.status === 200) {
        const memberships = JSON.parse(response.body);
        const apiUserIds = new Set(
          (memberships.data || []).map(m => m.attributes?.user_id || m.id)
        );
        
        // Check each pending user
        for (const userId of userIds) {
          if (apiUserIds.has(userId)) {
            // Confirmed - update to 'api'
            await query(`
              UPDATE lms_group_members 
              SET pending_source = 'api' 
              WHERE group_id = ? AND user_id = ?
            `, [groupId, userId]);
            results.confirmed++;
          } else {
            results.stillPending++;
          }
        }
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 200));
      
    } catch (err) {
      results.errors++;
    }
  }
  
  results.recordsProcessed = pendingMembers.length;
  return results;
}

/**
 * Cleanup Task - remove old logs and data
 */
async function runCleanup(config) {
  const keepLogsDays = config.keep_logs_days || 30;
  const keepAnalysisDays = config.keep_analysis_days || 90;
  
  const results = { deleted: {} };
  
  updateTaskProgress('cleanup', 'Cleaning sync logs', 1, 3);
  
  // Clean old sync logs
  const syncLogsResult = await query(`
    DELETE FROM sync_logs 
    WHERE started_at < DATE_SUB(NOW(), INTERVAL ? DAY)
  `, [keepLogsDays]);
  results.deleted.sync_logs = syncLogsResult.affectedRows;
  
  updateTaskProgress('cleanup', 'Cleaning task history', 2, 3);
  
  // Clean old task history
  const taskHistoryResult = await query(`
    DELETE FROM task_run_history 
    WHERE started_at < DATE_SUB(NOW(), INTERVAL ? DAY)
  `, [keepLogsDays]);
  results.deleted.task_run_history = taskHistoryResult.affectedRows;
  
  updateTaskProgress('cleanup', 'Cleaning analysis results', 3, 3);
  
  // Clean old analysis results
  const analysisResult = await query(`
    DELETE FROM group_analysis_results 
    WHERE run_at < DATE_SUB(NOW(), INTERVAL ? DAY)
  `, [keepAnalysisDays]);
  results.deleted.group_analysis_results = analysisResult.affectedRows;
  
  results.recordsProcessed = Object.values(results.deleted).reduce((a, b) => a + b, 0);
  return results;
}

/**
 * Impartner CRM Sync Task
 * Syncs partners and contacts from Impartner PRM API to replace manual Excel import
 */
async function runImpartnerSync(config) {
  const impartnerSyncService = require('./impartnerSyncService.cjs');
  const mode = config.mode || 'incremental';
  
  const results = { 
    recordsProcessed: 0, 
    partners: null, 
    contacts: null 
  };
  
  updateTaskProgress('impartner_sync', 'Starting Impartner sync', 0, 100);
  
  try {
    // Step 1: Sync partners
    updateTaskProgress('impartner_sync', 'Syncing partners from Impartner', 10, 100);
    results.partners = await impartnerSyncService.syncPartners(mode);
    
    // Step 2: Sync contacts
    updateTaskProgress('impartner_sync', 'Syncing contacts from Impartner', 50, 100);
    results.contacts = await impartnerSyncService.syncContacts(mode);
    
    // Calculate totals
    results.recordsProcessed = 
      (results.partners?.processed || 0) + 
      (results.contacts?.processed || 0);
    
    updateTaskProgress('impartner_sync', 'Complete', 100, 100);
    
    return results;
  } catch (err) {
    results.error = err.message;
    throw err;
  }
}

/**
 * Sync LMS Data TO Impartner
 * 1. Recalculates partner certification counts and NPCU
 * 2. Pushes data to Impartner (cert counts, NPCU, training dashboard URLs)
 * 
 * Supports incremental mode - only syncs partners that have changed since last sync
 */
async function runSyncToImpartner(config) {
  const mode = config?.mode || 'incremental';
  const results = { 
    recordsProcessed: 0, 
    recalculated: 0,
    synced: 0,
    skipped: 0,
    failed: 0,
    notFound: 0
  };
  
  // Valid tiers to sync (exclude Pending, blank)
  const VALID_TIERS = ['Premier', 'Premier Plus', 'Certified', 'Registered', 'Aggregator'];
  
  // Impartner API Configuration
  const IMPARTNER_CONFIG = {
    host: 'https://prod.impartner.live',
    apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
    tenantId: '1'
  };
  
  // Get last sync time for incremental mode
  let lastSyncTime = null;
  if (mode === 'incremental') {
    const [lastSync] = await query(`
      SELECT completed_at FROM sync_log 
      WHERE sync_type = 'sync_to_impartner' AND status = 'completed'
      ORDER BY completed_at DESC LIMIT 1
    `);
    lastSyncTime = lastSync?.completed_at;
    if (lastSyncTime) {
      console.log(`[Sync To Impartner] Incremental mode: Only syncing changes since ${lastSyncTime}`);
    } else {
      console.log(`[Sync To Impartner] No previous sync found, running full sync`);
    }
  } else {
    console.log(`[Sync To Impartner] Full sync mode`);
  }
  
  updateTaskProgress('sync_to_impartner', 'Step 1: Recalculating partner cert counts', 0, 100);
  
  try {
    // Step 1: Recalculate partner certification counts and NPCU
    // Only include partners with valid tiers
    const tierList = VALID_TIERS.map(t => `'${t}'`).join(',');
    const partners = await query(`
      SELECT p.id, p.account_name, g.id as group_id, p.cert_counts_updated_at,
             p.cert_count_nintex_ce as prev_ce, p.cert_count_nintex_k2 as prev_k2,
             p.cert_count_nintex_salesforce as prev_sf, p.cert_count_go_to_market as prev_gtm,
             p.total_npcu as prev_npcu
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE p.partner_tier IN (${tierList})
        AND p.is_active = TRUE
    `);
    
    let recalcCount = 0;
    for (const partner of partners) {
      if (!partner.group_id) continue;
      
      try {
        // Count certifications by category
        const counts = await query(`
          SELECT 
            c.certification_category as category,
            COUNT(*) as cert_count
          FROM lms_enrollments e
          JOIN lms_courses c ON c.id = e.course_id
          JOIN lms_group_members gm ON gm.user_id = e.user_id
          WHERE gm.group_id = ?
            AND e.status = 'completed'
            AND c.npcu_value > 0
            AND c.certification_category IS NOT NULL
            AND (e.expires_at IS NULL OR e.expires_at > NOW())
          GROUP BY c.certification_category
        `, [partner.group_id]);
        
        // Calculate total NPCU
        const [npcuResult] = await query(`
          SELECT COALESCE(SUM(c.npcu_value), 0) as total_npcu
          FROM lms_enrollments e
          JOIN lms_courses c ON c.id = e.course_id
          JOIN lms_group_members gm ON gm.user_id = e.user_id
          WHERE gm.group_id = ?
            AND e.status = 'completed'
            AND c.npcu_value > 0
            AND (e.expires_at IS NULL OR e.expires_at > NOW())
        `, [partner.group_id]);
        
        // Build counts object
        const certCounts = { nintex_ce: 0, nintex_k2: 0, nintex_salesforce: 0, go_to_market: 0 };
        for (const row of counts) {
          if (row.category && certCounts.hasOwnProperty(row.category)) {
            certCounts[row.category] = row.cert_count;
          }
        }
        
        // Update partner
        await query(`
          UPDATE partners SET
            cert_count_nintex_ce = ?,
            cert_count_nintex_k2 = ?,
            cert_count_nintex_salesforce = ?,
            cert_count_go_to_market = ?,
            has_gtm_certification = ?,
            total_npcu = ?,
            cert_counts_updated_at = NOW()
          WHERE id = ?
        `, [
          certCounts.nintex_ce, certCounts.nintex_k2, certCounts.nintex_salesforce,
          certCounts.go_to_market, certCounts.go_to_market > 0, npcuResult?.total_npcu || 0,
          partner.id
        ]);
        
        recalcCount++;
      } catch (err) {
        console.error(`[Sync To Impartner] Error recalculating partner ${partner.id}:`, err.message);
      }
      
      // Update progress
      if (recalcCount % 50 === 0) {
        updateTaskProgress('sync_to_impartner', `Recalculating: ${recalcCount}/${partners.length}`, 
          Math.round((recalcCount / partners.length) * 30), 100);
      }
    }
    
    results.recalculated = recalcCount;
    console.log(`[Sync To Impartner] Recalculated ${recalcCount} partners`);
    
    // Step 2: Get partners with Salesforce IDs for Impartner sync
    // Only sync partners with valid tiers and (in incremental mode) changed since last sync
    updateTaskProgress('sync_to_impartner', 'Step 2: Fetching partners for Impartner sync', 30, 100);
    
    let partnersQuery = `
      SELECT 
        p.id, p.account_name, p.salesforce_id, p.partner_tier,
        p.cert_count_nintex_ce, p.cert_count_nintex_k2,
        p.cert_count_nintex_salesforce, p.cert_count_go_to_market,
        p.total_npcu, p.cert_counts_updated_at,
        g.name as lms_group_name
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE p.salesforce_id IS NOT NULL
        AND p.cert_counts_updated_at IS NOT NULL
        AND p.partner_tier IN (${tierList})
        AND p.is_active = TRUE
    `;
    
    const queryParams = [];
    if (mode === 'incremental' && lastSyncTime) {
      partnersQuery += ` AND p.cert_counts_updated_at > ?`;
      queryParams.push(lastSyncTime);
    }
    
    const partnersToSync = await query(partnersQuery, queryParams);
    
    console.log(`[Sync To Impartner] ${mode === 'incremental' ? 'Incremental' : 'Full'} sync: ${partnersToSync.length} partners to push to Impartner`);
    
    if (partnersToSync.length === 0) {
      results.skipped = partners.length;
      console.log(`[Sync To Impartner] No partners changed since last sync, skipping API calls`);
      return results;
    }
    
    // Build sync payload
    const syncPayload = partnersToSync.map(p => {
      // Build portal URL (base64 encoded)
      let portalUrl = '';
      if (p.lms_group_name) {
        const urlData = { company: p.lms_group_name, tier: p.partner_tier || 'Registered' };
        const encodedData = Buffer.from(JSON.stringify(urlData)).toString('base64');
        portalUrl = `https://ptrlrndb.prod.ntxgallery.com/?data=${encodedData}`;
      }
      
      return {
        CrmId: p.salesforce_id,
        Name: p.account_name,
        Nintex_CE_Certifications__cf: p.cert_count_nintex_ce || 0,
        Nintex_K2_Certifications__cf: p.cert_count_nintex_k2 || 0,
        Nintex_for_Salesforce_Certifications__cf: p.cert_count_nintex_salesforce || 0,
        Nintex_GTM_Certifications__cf: p.cert_count_go_to_market || 0,
        Total_NPCU__cf: p.total_npcu || 0,
        LMS_Account_ID__cf: String(p.id),
        LMS_Group_Name__cf: p.lms_group_name || '',
        LMS_Training_Dashboard__cf: portalUrl
      };
    });
    
    // Step 3: Lookup Impartner Account IDs
    updateTaskProgress('sync_to_impartner', 'Step 3: Looking up Impartner accounts', 40, 100);
    
    const crmIdToImpartnerId = new Map();
    const lookupBatchSize = 100;
    
    for (let i = 0; i < syncPayload.length; i += lookupBatchSize) {
      const batchCrmIds = syncPayload.slice(i, i + lookupBatchSize).map(p => p.CrmId);
      const crmIdFilter = batchCrmIds.map(id => `CrmId eq '${id}'`).join(' or ');
      
      try {
        const lookupUrl = `${IMPARTNER_CONFIG.host}/api/objects/v1/Account?fields=Id,CrmId&filter=${encodeURIComponent(crmIdFilter)}&take=${lookupBatchSize}`;
        const lookupResp = await fetch(lookupUrl, {
          headers: {
            'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
            'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
            'Accept': 'application/json'
          }
        });
        
        if (lookupResp.ok) {
          const lookupData = await lookupResp.json();
          if (lookupData.data?.results) {
            for (const account of lookupData.data.results) {
              if (account.CrmId) crmIdToImpartnerId.set(account.CrmId, account.Id);
            }
          }
        }
      } catch (err) {
        console.error(`[Sync To Impartner] Lookup batch failed:`, err.message);
      }
      
      updateTaskProgress('sync_to_impartner', `Looking up accounts: ${Math.min(i + lookupBatchSize, syncPayload.length)}/${syncPayload.length}`,
        40 + Math.round((i / syncPayload.length) * 20), 100);
    }
    
    console.log(`[Sync To Impartner] Found ${crmIdToImpartnerId.size} matching accounts`);
    results.notFound = syncPayload.length - crmIdToImpartnerId.size;
    
    // Step 4: Push updates to Impartner
    updateTaskProgress('sync_to_impartner', 'Step 4: Pushing updates to Impartner', 60, 100);
    
    const updatePayload = syncPayload
      .filter(p => crmIdToImpartnerId.has(p.CrmId))
      .map(p => ({
        Id: crmIdToImpartnerId.get(p.CrmId),
        Name: p.Name,
        Nintex_CE_Certifications__cf: p.Nintex_CE_Certifications__cf,
        Nintex_K2_Certifications__cf: p.Nintex_K2_Certifications__cf,
        Nintex_for_Salesforce_Certifications__cf: p.Nintex_for_Salesforce_Certifications__cf,
        Nintex_GTM_Certifications__cf: p.Nintex_GTM_Certifications__cf,
        Total_NPCU__cf: p.Total_NPCU__cf,
        LMS_Account_ID__cf: p.LMS_Account_ID__cf,
        LMS_Group_Name__cf: p.LMS_Group_Name__cf,
        LMS_Training_Dashboard__cf: p.LMS_Training_Dashboard__cf
      }));
    
    const batchSize = 50;
    for (let i = 0; i < updatePayload.length; i += batchSize) {
      const batch = updatePayload.slice(i, i + batchSize);
      
      try {
        const updateResp = await fetch(`${IMPARTNER_CONFIG.host}/api/objects/v1/Account`, {
          method: 'PATCH',
          headers: {
            'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
            'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(batch)
        });
        
        if (updateResp.ok) {
          const updateData = await updateResp.json();
          if (updateData.results) {
            for (const result of updateData.results) {
              if (result.success) results.synced++;
              else results.failed++;
            }
          } else {
            results.synced += batch.length;
          }
        } else {
          results.failed += batch.length;
        }
      } catch (err) {
        results.failed += batch.length;
        console.error(`[Sync To Impartner] Batch update failed:`, err.message);
      }
      
      updateTaskProgress('sync_to_impartner', `Pushing updates: ${Math.min(i + batchSize, updatePayload.length)}/${updatePayload.length}`,
        60 + Math.round((i / updatePayload.length) * 38), 100);
    }
    
    results.recordsProcessed = results.synced;
    updateTaskProgress('sync_to_impartner', 'Complete', 100, 100);
    
    console.log(`[Sync To Impartner] Complete: ${results.synced} synced, ${results.failed} failed, ${results.notFound} not found`);
    
    return results;
  } catch (err) {
    results.error = err.message;
    throw err;
  }
}

/**
 * Get all tasks with their status
 */
async function getAllTasks() {
  return await query(`
    SELECT 
      t.*,
      (SELECT COUNT(*) FROM task_run_history h WHERE h.task_id = t.id) as total_runs,
      (SELECT MAX(started_at) FROM task_run_history h WHERE h.task_id = t.id AND h.status = 'success') as last_success
    FROM scheduled_tasks t
    ORDER BY t.task_name
  `);
}

/**
 * Enable/disable a task
 */
async function setTaskEnabled(taskType, enabled) {
  const nextRun = enabled ? new Date() : null;
  
  await query(`
    UPDATE scheduled_tasks 
    SET enabled = ?, next_run_at = ?
    WHERE task_type = ?
  `, [enabled, nextRun, taskType]);
  
  return await getTask(taskType);
}

/**
 * Get a single task
 */
async function getTask(taskType) {
  const rows = await query('SELECT * FROM scheduled_tasks WHERE task_type = ?', [taskType]);
  return rows[0] || null;
}

/**
 * Get task run history
 */
async function getTaskHistory(taskType, limit = 20) {
  return await query(`
    SELECT * FROM task_run_history 
    WHERE task_type = ?
    ORDER BY started_at DESC
    LIMIT ?
  `, [taskType, limit]);
}

/**
 * Manually trigger a task to run now
 */
async function triggerTask(taskType) {
  const task = await getTask(taskType);
  if (!task) {
    throw new Error(`Task not found: ${taskType}`);
  }
  
  if (runningTasks.has(taskType)) {
    throw new Error(`Task already running: ${taskType}`);
  }
  
  // Run immediately
  return await runTask(task);
}

/**
 * Get analysis history
 */
async function getAnalysisHistory(limit = 10) {
  return await query(`
    SELECT * FROM group_analysis_results
    ORDER BY run_at DESC
    LIMIT ?
  `, [limit]);
}

/**
 * Get analysis details for a specific run
 */
async function getAnalysisDetails(analysisId) {
  return await query(`
    SELECT * FROM group_analysis_details
    WHERE analysis_id = ?
    ORDER BY potential_users DESC, pending_sync DESC
  `, [analysisId]);
}

/**
 * Save manual analysis results
 */
async function saveManualAnalysis(results) {
  const analysisResult = await query(`
    INSERT INTO group_analysis_results 
      (run_type, total_groups, groups_with_potential, total_potential_users, groups_pending_sync, errors, duration_seconds)
    VALUES ('manual', ?, ?, ?, ?, ?, ?)
  `, [
    results.totalGroups || 0, 
    results.groupsWithPotentialUsers || 0, 
    results.totalPotentialUsers || 0, 
    results.groupsNeedingSync || 0, 
    results.errors || 0, 
    results.durationSeconds || 0
  ]);
  
  const analysisId = analysisResult.insertId;
  
  // Save details
  if (results.details && results.details.length > 0) {
    for (const detail of results.details) {
      await query(`
        INSERT INTO group_analysis_details 
          (analysis_id, group_id, group_name, partner_tier, member_count, potential_users, pending_sync)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [analysisId, detail.groupId, detail.groupName, detail.tier, detail.memberCount, detail.potentialUsers, detail.pendingSync]);
    }
  }
  
  return analysisId;
}

/**
 * Get scheduler status
 */
function getSchedulerStatus() {
  // Check if any tasks are enabled - if so, scheduler should be "running" in production
  const hasEnabledTasks = IS_PRODUCTION; // In production, scheduler is always active if env is set
  
  return {
    running: schedulerInterval !== null || (IS_PRODUCTION && hasEnabledTasks),
    isProduction: IS_PRODUCTION,
    systemAlertsEnabled: systemAlertsEnabled,
    activeTasks: Array.from(runningTasks.entries()).map(([type, info]) => ({
      type,
      startedAt: info.startedAt,
      runningSeconds: Math.round((Date.now() - info.startedAt.getTime()) / 1000),
      progress: info.progress || null
    })),
    checkInterval: CHECK_INTERVAL_MS
  };
}

/**
 * Enable or disable system alerts for task failures
 * @param {boolean} enabled - Whether to enable alerts
 */
function setSystemAlertsEnabled(enabled) {
  systemAlertsEnabled = enabled;
  console.log(`📢 System alerts ${enabled ? 'enabled' : 'disabled'}`);
  return systemAlertsEnabled;
}

module.exports = {
  initializeScheduler,
  stopScheduler,
  getAllTasks,
  getTask,
  setTaskEnabled,
  getTaskHistory,
  triggerTask,
  getAnalysisHistory,
  getAnalysisDetails,
  saveManualAnalysis,
  getSchedulerStatus,
  setSystemAlertsEnabled,
  runGroupAnalysis // Export for manual runs
};
