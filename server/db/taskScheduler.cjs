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
const { initSyncContext, clearSyncContext, getSyncContext } = require('./syncContext.cjs');
const appConfig = require('../config.cjs');

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

/**
 * Calculate next run time based on schedule_day and schedule_time
 * @param {Object} task - Task with schedule_day (0-6, 0=Sun) and schedule_time (HH:MM:SS)
 * @returns {string|null} SQL expression for next_run_at, or null to use interval_minutes
 */
function calculateNextScheduledRun(task) {
  // If no schedule_day/schedule_time set, use interval-based scheduling
  if (task.schedule_day === null || task.schedule_day === undefined || !task.schedule_time) {
    return null;
  }

  const scheduleDay = parseInt(task.schedule_day); // 0=Sunday, 1=Monday, etc.
  const scheduleTime = task.schedule_time; // HH:MM:SS format

  // Calculate next occurrence of this day/time
  // SQL: Find next occurrence of the specified day at the specified time
  // DAYOFWEEK in MySQL: 1=Sunday, 2=Monday, ..., 7=Saturday
  // We store 0=Sunday, 1=Monday, ..., 6=Saturday, so add 1 for MySQL
  const mysqlDay = scheduleDay + 1;

  // Calculate days until next occurrence
  // If today is the scheduled day but time has passed, go to next week
  return `
    CASE
      WHEN DAYOFWEEK(NOW()) = ${mysqlDay} AND TIME(NOW()) < '${scheduleTime}'
        THEN CONCAT(DATE(NOW()), ' ', '${scheduleTime}')
      WHEN DAYOFWEEK(NOW()) < ${mysqlDay}
        THEN CONCAT(DATE_ADD(DATE(NOW()), INTERVAL ${mysqlDay} - DAYOFWEEK(NOW()) DAY), ' ', '${scheduleTime}')
      ELSE
        CONCAT(DATE_ADD(DATE(NOW()), INTERVAL 7 - DAYOFWEEK(NOW()) + ${mysqlDay} DAY), ' ', '${scheduleTime}')
    END
  `;
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
  let syncLogId = null;
  
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
    
    // Also create sync_logs entry for visibility in sync history
    // Skip for tasks that handle their own sync_logs via routes or services
    // The sync routes (syncRoutes.cjs) create their own sync_log entries
    const selfLoggingTasks = [
      'impartner_sync',      // Handled by impartnerSyncService.cjs
      'impartner_sync_full', // Full daily sync - also uses impartnerSyncService.cjs
      'sync_to_impartner',   // Handled by certificationRoutes.cjs
      'lms_sync',            // Composite task - sub-tasks log themselves
      'sync_users',          // Logged via syncRoutes.cjs when called via API
      'sync_users_full',
      'sync_groups',
      'sync_groups_full', 
      'sync_courses',
      'sync_courses_full',
      'sync_npcu',
      'sync_course_properties',
      'sync_enrollments',
      'sync_enrollments_full',
      'sync_leads',          // Logged via impartnerSyncService.syncLeads
      'sync_leads_full',       // Full daily sync - also uses impartnerSyncService.syncLeads
      'group_analysis',      // Logged via runGroupAnalysis
      'group_members_sync',  // Logged via runGroupMembersSync
      'cleanup'              // Logged via runCleanup
    ];
    if (!selfLoggingTasks.includes(task.task_type)) {
      try {
        const syncLogResult = await query(
          'INSERT INTO sync_logs (sync_type, status, started_at) VALUES (?, ?, NOW())',
          [task.task_type, 'running']
        );
        syncLogId = syncLogResult.insertId;
      } catch (logErr) {
        console.warn(`⚠️ Could not create sync_log entry: ${logErr.message}`);
      }
    }
    
    // Execute the task
    const config = typeof task.config === 'string' ? JSON.parse(task.config) : task.config || {};
    const result = await executeTask(task.task_type, config);
    
    // Calculate duration
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    
    // Update success - use scheduled day/time if configured, otherwise use interval
    const scheduledNextRun = calculateNextScheduledRun(task);
    if (scheduledNextRun) {
      await query(`
        UPDATE scheduled_tasks SET
          last_status = 'success',
          last_error = NULL,
          last_duration_seconds = ?,
          run_count = run_count + 1,
          next_run_at = ${scheduledNextRun}
        WHERE id = ?
      `, [durationSeconds, task.id]);
    } else {
      await query(`
        UPDATE scheduled_tasks SET
          last_status = 'success',
          last_error = NULL,
          last_duration_seconds = ?,
          run_count = run_count + 1,
          next_run_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
        WHERE id = ?
      `, [durationSeconds, task.interval_minutes, task.id]);
    }
    
    await query(`
      UPDATE task_run_history SET
        status = 'success',
        completed_at = NOW(),
        duration_seconds = ?,
        records_processed = ?,
        result_summary = ?
      WHERE id = ?
    `, [durationSeconds, result.recordsProcessed || 0, JSON.stringify(result), historyId]);
    
    // Update sync_logs entry
    if (syncLogId) {
      try {
        await query(
          `UPDATE sync_logs SET 
            status = 'completed', 
            completed_at = NOW(), 
            records_processed = ?,
            records_created = ?,
            records_updated = ?,
            records_deleted = ?,
            records_failed = ?,
            details = ?
          WHERE id = ?`,
          [
            result.recordsProcessed || 0,
            result.details?.created || 0,
            result.details?.updated || 0,
            result.details?.deleted || 0,
            result.details?.failed || 0,
            JSON.stringify(result),
            syncLogId
          ]
        );
      } catch (logErr) {
        console.warn(`⚠️ Could not update sync_log entry: ${logErr.message}`);
      }
    }
    
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
    
    // Update sync_logs on failure
    if (syncLogId) {
      try {
        await query(
          `UPDATE sync_logs SET 
            status = 'failed', 
            completed_at = NOW(), 
            error_message = ?,
            details = ?
          WHERE id = ?`,
          [error.message, JSON.stringify({ error: error.message }), syncLogId]
        );
      } catch (logErr) {
        console.warn(`⚠️ Could not update sync_log entry on failure: ${logErr.message}`);
      }
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
    
    // Impartner CRM full sync - runs daily to detect inactive/deleted partners
    case 'impartner_sync_full':
      return await runImpartnerSync({ ...config, mode: 'full' });
    
    // Sync LMS data TO Impartner (certification counts, NPCU, training URLs)
    case 'sync_to_impartner':
      return await runSyncToImpartner(config);
    
    // Sync leads FROM Impartner
    case 'sync_leads':
      return await runLeadSync(config);
    
    // Sync leads - FULL mode for deletion detection
    case 'sync_leads_full':
      return await runLeadSync({ ...config, mode: 'full' });
    
    // PAM Weekly Report - send reports to enabled PAMs
    case 'pam_weekly_report':
      return await runPamWeeklyReports(config);

    // Executive Weekly Report - send global rollup to configured recipients
    case 'executive_weekly_report':
      return await runExecutiveWeeklyReport(config);

    // Daily Sync Chain - orchestrated full sync of all data
    case 'daily_sync_chain':
      return await runDailySyncChain(config);

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
  const API_KEY = appConfig.northpass.apiKey;
  
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
 * Syncs partners, contacts, and leads from Impartner PRM API to replace manual Excel import
 */
async function runImpartnerSync(config) {
  const impartnerSyncService = require('./impartnerSyncService.cjs');
  const mode = config.mode || 'incremental';
  
  const results = { 
    recordsProcessed: 0, 
    partners: null, 
    contacts: null,
    leads: null
  };
  
  updateTaskProgress('impartner_sync', 'Starting Impartner sync', 0, 100);
  
  try {
    // Step 1: Sync partners
    updateTaskProgress('impartner_sync', 'Syncing partners from Impartner', 10, 100);
    results.partners = await impartnerSyncService.syncPartners(mode);
    
    // Step 2: Sync contacts
    updateTaskProgress('impartner_sync', 'Syncing contacts from Impartner', 40, 100);
    results.contacts = await impartnerSyncService.syncContacts(mode);
    
    // Step 3: Sync leads
    updateTaskProgress('impartner_sync', 'Syncing leads from Impartner', 70, 100);
    results.leads = await impartnerSyncService.syncLeads(mode);
    
    // Calculate totals
    results.recordsProcessed = 
      (results.partners?.processed || 0) + 
      (results.contacts?.processed || 0) +
      (results.leads?.processed || 0);
    
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
  
  // Create sync log entry
  let logId = null;
  try {
    const logResult = await query(
      'INSERT INTO sync_logs (sync_type, status, started_at) VALUES (?, ?, NOW())',
      ['sync_to_impartner', 'running']
    );
    logId = logResult.insertId;
  } catch (err) {
    console.error('[Sync To Impartner] Failed to create sync log:', err.message);
  }
  
  // Valid tiers to sync (exclude Pending, blank)
  const VALID_TIERS = ['Premier', 'Premier Plus', 'Certified', 'Registered', 'Aggregator'];
  
  // Impartner API Configuration
  const IMPARTNER_CONFIG = {
    host: 'https://prod.impartner.live',
    apiKey: appConfig.impartner.apiKey,
    tenantId: appConfig.impartner.tenantId
  };
  
  // Get last sync time for incremental mode
  let lastSyncTime = null;
  if (mode === 'incremental') {
    const [lastSync] = await query(`
      SELECT completed_at FROM sync_logs 
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
    // Use a single consolidated query instead of per-partner queries (N+1 optimization)
    const tierList = VALID_TIERS.map(t => `'${t}'`).join(',');

    // Single query to calculate all partner cert counts and NPCU at once
    const partnerStats = await query(`
      SELECT
        p.id as partner_id,
        COALESCE(SUM(CASE WHEN c.certification_category = 'nintex_ce' THEN 1 ELSE 0 END), 0) as cert_ce,
        COALESCE(SUM(CASE WHEN c.certification_category = 'nintex_k2' THEN 1 ELSE 0 END), 0) as cert_k2,
        COALESCE(SUM(CASE WHEN c.certification_category = 'nintex_salesforce' THEN 1 ELSE 0 END), 0) as cert_sf,
        COALESCE(SUM(CASE WHEN c.certification_category = 'go_to_market' THEN 1 ELSE 0 END), 0) as cert_gtm,
        COALESCE(SUM(c.npcu_value), 0) as total_npcu
      FROM partners p
      INNER JOIN lms_groups g ON g.partner_id = p.id
      INNER JOIN lms_group_members gm ON gm.group_id = g.id
      INNER JOIN lms_enrollments e ON e.user_id = gm.user_id
      INNER JOIN lms_courses c ON c.id = e.course_id
      WHERE p.partner_tier IN (${tierList})
        AND p.is_active = TRUE
        AND e.status = 'completed'
        AND c.npcu_value > 0
        AND (e.expires_at IS NULL OR e.expires_at > NOW())
      GROUP BY p.id
    `);

    // Build a map for quick lookup
    const statsMap = new Map();
    for (const row of partnerStats) {
      statsMap.set(row.partner_id, row);
    }

    // Get all valid partners (including those with zero certs)
    const partners = await query(`
      SELECT p.id
      FROM partners p
      WHERE p.partner_tier IN (${tierList})
        AND p.is_active = TRUE
    `);

    updateTaskProgress('sync_to_impartner', `Updating ${partners.length} partners`, 10, 100);

    // Batch update partners using UPDATE with CASE statements
    // Process in batches of 100 for large partner sets
    const BATCH_SIZE = 100;
    let recalcCount = 0;

    for (let i = 0; i < partners.length; i += BATCH_SIZE) {
      const batch = partners.slice(i, i + BATCH_SIZE);

      // Build CASE statements for batch update
      const ids = batch.map(p => p.id);
      const caseStatements = {
        ce: [], k2: [], sf: [], gtm: [], hasGtm: [], npcu: []
      };

      for (const p of batch) {
        const stats = statsMap.get(p.id) || { cert_ce: 0, cert_k2: 0, cert_sf: 0, cert_gtm: 0, total_npcu: 0 };
        caseStatements.ce.push(`WHEN ${p.id} THEN ${stats.cert_ce}`);
        caseStatements.k2.push(`WHEN ${p.id} THEN ${stats.cert_k2}`);
        caseStatements.sf.push(`WHEN ${p.id} THEN ${stats.cert_sf}`);
        caseStatements.gtm.push(`WHEN ${p.id} THEN ${stats.cert_gtm}`);
        caseStatements.hasGtm.push(`WHEN ${p.id} THEN ${stats.cert_gtm > 0 ? 1 : 0}`);
        caseStatements.npcu.push(`WHEN ${p.id} THEN ${stats.total_npcu}`);
      }

      const idList = ids.join(',');

      await query(`
        UPDATE partners SET
          cert_count_nintex_ce = CASE id ${caseStatements.ce.join(' ')} END,
          cert_count_nintex_k2 = CASE id ${caseStatements.k2.join(' ')} END,
          cert_count_nintex_salesforce = CASE id ${caseStatements.sf.join(' ')} END,
          cert_count_go_to_market = CASE id ${caseStatements.gtm.join(' ')} END,
          has_gtm_certification = CASE id ${caseStatements.hasGtm.join(' ')} END,
          total_npcu = CASE id ${caseStatements.npcu.join(' ')} END,
          cert_counts_updated_at = NOW()
        WHERE id IN (${idList})
      `);

      recalcCount += batch.length;

      // Update progress every batch
      updateTaskProgress('sync_to_impartner', `Recalculating: ${recalcCount}/${partners.length}`,
        Math.round((recalcCount / partners.length) * 30), 100);
    }

    results.recalculated = recalcCount;
    console.log(`[Sync To Impartner] Recalculated ${recalcCount} partners`);
    
    // Step 2: Get partners with Salesforce IDs for Impartner sync
    // Only sync partners with valid tiers and (in incremental mode) changed since last sync
    updateTaskProgress('sync_to_impartner', 'Step 2: Fetching partners for Impartner sync', 30, 100);
    
    let partnersQuery = `
      SELECT
        p.id, p.account_name, p.salesforce_id, p.impartner_id, p.partner_tier,
        p.cert_count_nintex_ce, p.cert_count_nintex_k2,
        p.cert_count_nintex_salesforce, p.cert_count_go_to_market,
        p.total_npcu, p.cert_counts_updated_at,
        g.name as lms_group_name
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE (p.salesforce_id IS NOT NULL OR p.impartner_id IS NOT NULL)
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
      
      // Update sync log even when nothing to sync
      if (logId) {
        try {
          await query(
            `UPDATE sync_logs SET 
              status = 'completed', 
              completed_at = NOW(), 
              records_processed = 0,
              records_created = 0,
              records_updated = 0,
              records_failed = 0,
              records_skipped = ?,
              details = ?
            WHERE id = ?`,
            [
              results.skipped,
              JSON.stringify({ 
                mode, 
                total: 0,
                recalculated: results.recalculated, 
                skipped: results.skipped,
                message: 'No partners changed since last sync'
              }),
              logId
            ]
          );
        } catch (err) {
          console.error('[Sync To Impartner] Failed to update sync log:', err.message);
        }
      }
      
      return results;
    }
    
    // Build LMS user counts map (contacts with lms_user_id IS NOT NULL)
    const partnerIds = partnersToSync.map(p => p.id).filter(Boolean);
    const lmsUserCounts = {};
    if (partnerIds.length > 0) {
      const placeholders = partnerIds.map(() => '?').join(',');
      const rows = await query(
        `SELECT partner_id, COUNT(*) as lms_user_count FROM contacts WHERE partner_id IN (${placeholders}) AND lms_user_id IS NOT NULL GROUP BY partner_id`,
        partnerIds
      );
      for (const r of rows) {
        lmsUserCounts[r.partner_id] = r.lms_user_count || 0;
      }
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
        ImpartnerId: p.impartner_id,  // Direct Impartner ID if available
        Name: p.account_name,
        Nintex_CE_Certifications__cf: p.cert_count_nintex_ce || 0,
        Nintex_K2_Certifications__cf: p.cert_count_nintex_k2 || 0,
        Nintex_for_Salesforce_Certifications__cf: p.cert_count_nintex_salesforce || 0,
        Nintex_GTM_Certifications__cf: p.cert_count_go_to_market || 0,
        Total_NPCU__cf: p.total_npcu || 0,
        LMS_Account_ID__cf: String(p.id),
        LMS_Group_Name__cf: p.lms_group_name || '',
        LMS_Training_Dashboard__cf: portalUrl,
        LMS_User_Count: lmsUserCounts[p.id] || 0
      };
    });

    // Step 3: Lookup Impartner Account IDs (only for those without direct impartner_id)
    updateTaskProgress('sync_to_impartner', 'Step 3: Looking up Impartner accounts', 40, 100);

    const crmIdToImpartnerId = new Map();
    const crmId15ToImpartnerId = new Map(); // For 15-char prefix matching
    const lookupBatchSize = 100;

    // Filter to only partners that need lookup (no direct impartner_id)
    const partnersNeedingLookup = syncPayload.filter(p => !p.ImpartnerId && p.CrmId);
    console.log(`[Sync To Impartner] ${syncPayload.length - partnersNeedingLookup.length} partners have direct Impartner ID, ${partnersNeedingLookup.length} need CrmId lookup`);

    for (let i = 0; i < partnersNeedingLookup.length; i += lookupBatchSize) {
      const batchCrmIds = partnersNeedingLookup.slice(i, i + lookupBatchSize).map(p => p.CrmId).filter(Boolean);
      if (batchCrmIds.length === 0) continue;
      const crmIdFilter = batchCrmIds.map(id => `CrmId = '${id}'`).join(' or ');
      
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
              if (account.CrmId) {
                crmIdToImpartnerId.set(account.CrmId, account.Id);
                // Also index by first 15 chars for matching
                if (account.CrmId.length === 15) {
                  crmId15ToImpartnerId.set(account.CrmId, account.Id);
                } else if (account.CrmId.length === 18) {
                  crmId15ToImpartnerId.set(account.CrmId.substring(0, 15), account.Id);
                }
              }
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
    
    // Step 4: Build update payload with Impartner IDs (handle 15/18-char SF ID matching)
    updateTaskProgress('sync_to_impartner', 'Step 4: Pushing updates to Impartner', 60, 100);
    
    const updatePayload = [];
    let matchedCount = 0;
    let notFoundCount = 0;
    
    for (const p of syncPayload) {
      let impartnerId = null;

      // First check if we have direct Impartner ID
      if (p.ImpartnerId) {
        impartnerId = p.ImpartnerId;
      }
      // Try exact CrmId match
      else if (crmIdToImpartnerId.has(p.CrmId)) {
        impartnerId = crmIdToImpartnerId.get(p.CrmId);
      }
      // If no match and CrmId is 18 chars, try 15-char prefix
      else if (p.CrmId && p.CrmId.length === 18) {
        const prefix15 = p.CrmId.substring(0, 15);
        if (crmId15ToImpartnerId.has(prefix15)) {
          impartnerId = crmId15ToImpartnerId.get(prefix15);
        }
      }
      // If no match and CrmId is 15 chars, check if there's a 18-char match
      else if (p.CrmId && p.CrmId.length === 15) {
        if (crmId15ToImpartnerId.has(p.CrmId)) {
          impartnerId = crmId15ToImpartnerId.get(p.CrmId);
        }
      }

      if (impartnerId) {
        matchedCount++;
        updatePayload.push({
          Id: impartnerId,
          Name: p.Name,
          Nintex_CE_Certifications__cf: p.Nintex_CE_Certifications__cf,
          Nintex_K2_Certifications__cf: p.Nintex_K2_Certifications__cf,
          Nintex_for_Salesforce_Certifications__cf: p.Nintex_for_Salesforce_Certifications__cf,
          Nintex_GTM_Certifications__cf: p.Nintex_GTM_Certifications__cf,
          Total_NPCU__cf: p.Total_NPCU__cf,
          LMS_Account_ID__cf: p.LMS_Account_ID__cf,
          LMS_Group_Name__cf: p.LMS_Group_Name__cf,
          LMS_Training_Dashboard__cf: p.LMS_Training_Dashboard__cf,
          LMS_User_Count: p.LMS_User_Count
        });
      } else {
        notFoundCount++;
      }
    }
    
    results.notFound = notFoundCount;
    console.log(`[Sync To Impartner] Matched ${matchedCount} partners, ${notFoundCount} not found in Impartner`);
    
    // Step 5: Push updates to Impartner
    
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
    
    // Update sync log on success
    if (logId) {
      try {
        await query(
          `UPDATE sync_logs SET 
            status = 'completed', 
            completed_at = NOW(), 
            records_processed = ?,
            records_created = 0,
            records_updated = ?,
            records_failed = ?,
            records_skipped = ?,
            details = ?
          WHERE id = ?`,
          [
            syncPayload.length, // total in scope
            results.synced,      // actually synced to Impartner
            results.failed,
            results.notFound,    // not found = skipped
            JSON.stringify({ 
              mode, 
              total: syncPayload.length,
              matched: matchedCount,
              synced: results.synced, 
              failed: results.failed,
              notFound: results.notFound,
              recalculated: results.recalculated
            }),
            logId
          ]
        );
      } catch (err) {
        console.error('[Sync To Impartner] Failed to update sync log:', err.message);
      }
    }
    
    console.log(`[Sync To Impartner] Complete: ${results.synced} synced, ${results.failed} failed, ${results.notFound} not found`);
    
    return results;
  } catch (err) {
    results.error = err.message;
    
    // Update sync log on failure
    if (logId) {
      try {
        await query(
          `UPDATE sync_logs SET 
            status = 'failed', 
            completed_at = NOW(), 
            error_message = ?,
            details = ?
          WHERE id = ?`,
          [err.message, JSON.stringify({ mode, results }), logId]
        );
      } catch (logErr) {
        console.error('[Sync To Impartner] Failed to update sync log:', logErr.message);
      }
    }
    
    throw err;
  }
}

/**
 * Lead Sync Task
 * Syncs leads from Impartner PRM API
 */
async function runLeadSync(config) {
  const impartnerSyncService = require('./impartnerSyncService.cjs');
  const mode = config.mode || 'incremental';
  
  const results = { 
    recordsProcessed: 0, 
    details: null
  };
  
  updateTaskProgress('sync_leads', 'Starting lead sync from Impartner', 0, 100);
  
  try {
    updateTaskProgress('sync_leads', 'Syncing leads from Impartner', 20, 100);
    results.details = await impartnerSyncService.syncLeads(mode);
    
    results.recordsProcessed = results.details?.processed || 0;
    
    updateTaskProgress('sync_leads', 'Complete', 100, 100);
    
    return results;
  } catch (err) {
    results.error = err.message;
    throw err;
  }
}

/**
 * PAM Weekly Report Task
 * Sends weekly certification reports to enabled PAMs
 */
async function runPamWeeklyReports(config) {
  const { sendEmail, renderTemplate } = require('./notificationService.cjs');
  
  const results = { 
    recordsProcessed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };
  
  updateTaskProgress('pam_weekly_report', 'Finding PAMs to notify', 0, 100);
  
  // Get all PAMs with email reports enabled
  const pams = await query(`
    SELECT id, owner_name, email, report_frequency
    FROM partner_managers 
    WHERE is_active_pam = TRUE 
      AND email_reports_enabled = TRUE 
      AND email IS NOT NULL
  `);
  
  if (pams.length === 0) {
    updateTaskProgress('pam_weekly_report', 'No PAMs to notify', 100, 100);
    return results;
  }
  
  const reportDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  for (let i = 0; i < pams.length; i++) {
    const pam = pams[i];
    updateTaskProgress('pam_weekly_report', `Sending to ${pam.owner_name}`, i + 1, pams.length, `${i + 1} of ${pams.length}`);
    
    try {
      // Get partner stats for this PAM
      const partners = await query(`
        SELECT 
          p.id,
          p.account_name,
          p.partner_tier,
          p.account_region,
          p.total_npcu,
          p.active_certs,
          p.total_users
        FROM partners p
        WHERE p.account_owner = ?
        ORDER BY p.account_name
      `, [pam.owner_name]);
      
      if (partners.length === 0) {
        results.skipped++;
        continue;
      }
      
      // Get expiring certifications (next 90 days)
      const expiringCerts = await query(`
        SELECT 
          u.first_name,
          u.last_name,
          u.email,
          c.name as course_name,
          e.expires_at,
          p.account_name
        FROM lms_enrollments e
        INNER JOIN lms_users u ON u.id = e.user_id
        INNER JOIN lms_courses c ON c.id = e.course_id
        INNER JOIN lms_group_members gm ON gm.user_id = u.id
        INNER JOIN lms_groups g ON g.id = gm.group_id
        INNER JOIN partners p ON p.id = g.partner_id
        WHERE p.account_owner = ?
          AND e.status = 'completed'
          AND c.npcu_value > 0
          AND e.expires_at IS NOT NULL
          AND e.expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 90 DAY)
        ORDER BY e.expires_at
        LIMIT 20
      `, [pam.owner_name]);
      
      // Build partner table
      let partnerTable = `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Partner</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Tier</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">NPCU</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Certs</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Users</th>
            </tr>
          </thead>
          <tbody>
            ${partners.map(p => `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${p.account_name}</td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">
                  <span style="padding: 2px 8px; border-radius: 4px; font-size: 12px; background: #e3f2fd; color: #1565c0;">${p.partner_tier || '-'}</span>
                </td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee; font-weight: 600; color: #FF6B35;">${p.total_npcu || 0}</td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">${p.active_certs || 0}</td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">${p.total_users || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      
      // Build expiring certs section
      let expiringCertsSection = '';
      if (expiringCerts.length > 0) {
        expiringCertsSection = `
          <div style="background: #fff3cd; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #856404;">
            <h3 style="margin: 0 0 15px; color: #856404;">⚠️ Expiring Certifications (Next 90 Days)</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">User</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Partner</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Course</th>
                  <th style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd;">Expires</th>
                </tr>
              </thead>
              <tbody>
                ${expiringCerts.map(c => `
                  <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${c.first_name} ${c.last_name}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${c.account_name}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${c.course_name}</td>
                    <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee; color: #856404;">${new Date(c.expires_at).toLocaleDateString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
      
      // Try to use template, fallback to inline HTML
      let emailHtml;
      let subject;
      try {
        const rendered = await renderTemplate('pam_weekly_report', {
          reportDate,
          pamFirstName: pam.owner_name.split(' ')[0],
          partnerTable,
          expiringCertsSection
        });
        emailHtml = rendered.content;
        subject = rendered.subject;
      } catch (e) {
        // Fallback HTML
        subject = `Partner Certification Report - ${reportDate}`;
        emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #6B4C9A, #FF6B35); padding: 20px; color: white;">
              <h1 style="margin: 0;">Partner Certification Report</h1>
              <p style="margin: 5px 0 0 0; opacity: 0.9;">${reportDate}</p>
            </div>
            <div style="padding: 20px;">
              <p>Hi ${pam.owner_name.split(' ')[0]},</p>
              <p>Here's your partner activity summary:</p>
              <h3>Your Partners (${partners.length})</h3>
              ${partnerTable}
              ${expiringCertsSection}
              <p style="color: #666; font-size: 12px; margin-top: 30px;">
                This report was generated automatically by the Nintex Partner Portal.
              </p>
            </div>
          </div>
        `;
      }
      
      // Send email
      await sendEmail(pam.email, subject, emailHtml);
      
      // Log the email
      try {
        await query(`
          INSERT INTO email_log (recipient_email, recipient_name, subject, email_type, status, pam_id)
          VALUES (?, ?, ?, 'pam_report', 'sent', ?)
        `, [pam.email, pam.owner_name, subject, pam.id]);
      } catch (logErr) {
        // Ignore log errors
      }
      
      results.sent++;
      results.recordsProcessed++;
    } catch (err) {
      results.failed++;
      results.errors.push({ pam: pam.owner_name, error: err.message });
    }
  }
  
  updateTaskProgress('pam_weekly_report', 'Complete', 100, 100, `Sent: ${results.sent}, Failed: ${results.failed}`);
  
  return results;
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
 * Executive Weekly Report Task
 * Sends global certification rollup to configured recipients
 */
async function runExecutiveWeeklyReport(config) {
  const executiveReportService = require('./executiveReportService.cjs');

  const results = {
    recordsProcessed: 0,
    sent: 0,
    failed: 0,
    errors: []
  };

  updateTaskProgress('executive_weekly_report', 'Building executive report', 0, 100);

  try {
    updateTaskProgress('executive_weekly_report', 'Sending to recipients', 50, 100);

    const sendResults = await executiveReportService.sendExecutiveReport();

    results.sent = sendResults.sent;
    results.failed = sendResults.failed;
    results.errors = sendResults.errors;
    results.recordsProcessed = sendResults.sent + sendResults.failed;

    updateTaskProgress('executive_weekly_report', 'Complete', 100, 100);

    console.log(`📊 Executive report sent: ${results.sent} successful, ${results.failed} failed`);
  } catch (err) {
    results.error = err.message;
    updateTaskProgress('executive_weekly_report', `Failed: ${err.message}`, 100, 100);
    throw err;
  }

  return results;
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

/**
 * Orchestrated Daily Sync Chain
 * Runs all sync tasks in dependency order with validation between steps
 *
 * Dependency Chain:
 * 1. sync_courses + impartner_sync (parallel - no dependencies)
 * 2. sync_npcu (depends on courses)
 * 3. sync_users (foundation for enrollments)
 * 4. sync_groups (links users to partners)
 * 5. sync_enrollments (needs users, groups, courses with NPCU)
 * 6. sync_to_impartner (aggregates and pushes cert counts)
 */
async function runDailySyncChain(options = {}) {
  const lmsSyncService = require('./lmsSyncService.cjs');
  const impartnerSyncService = require('./impartnerSyncService.cjs');

  const startTime = Date.now();
  const chainId = `daily_${Date.now()}`;

  // Initialize sync context for cross-operation caching
  const syncContext = initSyncContext(chainId);
  console.log(`📦 Sync context initialized (session: ${chainId})`);

  const results = {
    chainId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'running',
    steps: [],
    totalDurationSeconds: 0,
    error: null
  };

  // Log chain start
  let logId = null;
  try {
    const logResult = await query(
      `INSERT INTO sync_logs (sync_type, status, started_at, details) VALUES (?, ?, NOW(), ?)`,
      ['daily_sync_chain', 'running', JSON.stringify({ chainId, steps: [] })]
    );
    logId = logResult.insertId;
  } catch (err) {
    console.error('[Daily Sync Chain] Failed to create log:', err.message);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔄 DAILY SYNC CHAIN STARTED');
  console.log(`   Chain ID: ${chainId}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // Define the sync chain steps
  // OPTIMIZED: Using incremental mode by default to reduce API calls (~91% reduction)
  // Full sync only runs when explicitly requested or on first-time setup
  const steps = [
    {
      name: 'sync_courses',
      description: 'Sync courses from LMS (incremental)',
      fn: async () => await lmsSyncService.syncCourses({ forceFullSync: false }),
      required: true,
      parallel: 'tier1'
    },
    {
      name: 'impartner_sync',
      description: 'Sync partners and contacts from Impartner (incremental)',
      fn: async () => await impartnerSyncService.syncAll({ mode: 'incremental' }),
      required: true,
      parallel: 'tier1'
    },
    {
      name: 'sync_npcu',
      description: 'Apply NPCU values to courses',
      fn: async () => await lmsSyncService.syncCourseProperties(),
      required: true,
      dependsOn: ['sync_courses']
    },
    {
      name: 'sync_users',
      description: 'Sync users from LMS (incremental)',
      fn: async () => await lmsSyncService.syncUsers({ forceFullSync: false }),
      required: true,
      dependsOn: ['sync_npcu']
    },
    {
      name: 'sync_groups',
      description: 'Sync groups and partner links (incremental)',
      fn: async () => await lmsSyncService.syncGroups({ forceFullSync: false }),
      required: true,
      dependsOn: ['sync_users', 'impartner_sync']
    },
    {
      name: 'sync_enrollments',
      description: 'Sync user enrollments (incremental)',
      fn: async () => await lmsSyncService.syncEnrollments({ forceFullSync: false }),
      required: true,
      dependsOn: ['sync_groups']
    },
    {
      name: 'sync_to_impartner',
      description: 'Push cert counts to Impartner',
      fn: async () => await runSyncToImpartner({ mode: 'full' }),
      required: false, // Non-critical - failures shouldn't stop chain
      dependsOn: ['sync_enrollments']
    }
  ];

  // Track completed steps for dependency checking
  const completedSteps = new Set();
  const stepResults = new Map();

  // Helper to run a step
  async function runStep(step) {
    const stepStart = Date.now();
    const stepResult = {
      name: step.name,
      description: step.description,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: 'running',
      durationSeconds: 0,
      result: null,
      error: null
    };

    console.log(`\n┌─────────────────────────────────────────────────────────────┐`);
    console.log(`│ Step: ${step.name.padEnd(52)} │`);
    console.log(`│ ${step.description.padEnd(59)} │`);
    console.log(`└─────────────────────────────────────────────────────────────┘`);

    try {
      stepResult.result = await step.fn();
      stepResult.status = 'completed';
      completedSteps.add(step.name);
      console.log(`✅ ${step.name} completed successfully`);
    } catch (err) {
      stepResult.status = 'failed';
      stepResult.error = err.message;
      console.error(`❌ ${step.name} failed: ${err.message}`);

      if (step.required) {
        throw new Error(`Required step ${step.name} failed: ${err.message}`);
      }
    }

    stepResult.completedAt = new Date().toISOString();
    stepResult.durationSeconds = Math.round((Date.now() - stepStart) / 1000);
    results.steps.push(stepResult);
    stepResults.set(step.name, stepResult);

    // Update log with progress
    if (logId) {
      try {
        await query(
          `UPDATE sync_logs SET details = ? WHERE id = ?`,
          [JSON.stringify({ chainId, steps: results.steps }), logId]
        );
      } catch (logErr) { /* ignore */ }
    }

    return stepResult;
  }

  try {
    // Run Tier 1 steps in parallel (no dependencies)
    const tier1Steps = steps.filter(s => s.parallel === 'tier1');
    if (tier1Steps.length > 0) {
      console.log('\n📦 Running Tier 1 (parallel): ' + tier1Steps.map(s => s.name).join(', '));
      await Promise.all(tier1Steps.map(step => runStep(step)));
    }

    // Run remaining steps sequentially (respecting dependencies)
    const sequentialSteps = steps.filter(s => !s.parallel);
    for (const step of sequentialSteps) {
      // Check dependencies
      if (step.dependsOn) {
        const missingDeps = step.dependsOn.filter(dep => !completedSteps.has(dep));
        if (missingDeps.length > 0) {
          console.log(`⏭️ Skipping ${step.name} - missing dependencies: ${missingDeps.join(', ')}`);
          results.steps.push({
            name: step.name,
            status: 'skipped',
            error: `Missing dependencies: ${missingDeps.join(', ')}`
          });
          continue;
        }
      }

      await runStep(step);
    }

    results.status = 'completed';
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ DAILY SYNC CHAIN COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (err) {
    results.status = 'failed';
    results.error = err.message;

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.error('❌ DAILY SYNC CHAIN FAILED');
    console.error(`   Error: ${err.message}`);
    console.log('═══════════════════════════════════════════════════════════════');

    // Send alert for chain failure
    if (systemAlertsEnabled) {
      try {
        const { sendSyncErrorAlert } = require('./notificationService.cjs');
        await sendSyncErrorAlert(`Daily sync chain failed: ${err.message}`);
      } catch (alertErr) {
        console.error('Failed to send alert:', alertErr.message);
      }
    }
  }

  results.completedAt = new Date().toISOString();
  results.totalDurationSeconds = Math.round((Date.now() - startTime) / 1000);

  // Update final log
  if (logId) {
    try {
      await query(
        `UPDATE sync_logs SET
          status = ?,
          completed_at = NOW(),
          records_processed = ?,
          details = ?
        WHERE id = ?`,
        [
          results.status,
          results.steps.filter(s => s.status === 'completed').length,
          JSON.stringify(results),
          logId
        ]
      );
    } catch (logErr) {
      console.error('Failed to update sync log:', logErr.message);
    }
  }

  console.log(`\n📊 Chain Summary:`);
  console.log(`   Total Duration: ${results.totalDurationSeconds} seconds`);
  console.log(`   Steps Completed: ${results.steps.filter(s => s.status === 'completed').length}/${steps.length}`);
  console.log(`   Steps Failed: ${results.steps.filter(s => s.status === 'failed').length}`);
  console.log(`   Steps Skipped: ${results.steps.filter(s => s.status === 'skipped').length}`);

  // Log sync context stats and cleanup
  const ctx = getSyncContext();
  if (ctx) {
    const ctxStats = ctx.getStats();
    console.log(`   Cache Hits: ${ctxStats.cacheHits}`);
    console.log(`   API Calls Saved: ${ctxStats.apiCallsSaved}`);
    results.cacheStats = ctxStats;
  }
  clearSyncContext();
  console.log(`📦 Sync context cleared`);

  return results;
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
  runGroupAnalysis, // Export for manual runs
  runDailySyncChain // Export for orchestrated daily sync
};
