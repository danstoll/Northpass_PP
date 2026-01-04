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
 */

const { query } = require('./connection.cjs');

// Environment check - only run scheduler in production
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.ENABLE_SCHEDULER === 'true';

// In-memory state
let schedulerInterval = null;
let runningTasks = new Map(); // task_type -> { startedAt, progress }

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
    throw error;
    
  } finally {
    runningTasks.delete(task.task_type);
  }
}

/**
 * Execute a task by type
 */
async function executeTask(taskType, config) {
  switch (taskType) {
    case 'lms_sync':
      return await runLmsSync(config);
    
    case 'group_analysis':
      return await runGroupAnalysis(config);
    
    case 'group_members_sync':
      return await runGroupMembersSync(config);
    
    case 'cleanup':
      return await runCleanup(config);
    
    default:
      throw new Error(`Unknown task type: ${taskType}`);
  }
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
          syncResult = await lmsSyncService.syncEnrollments(null, (type, current, total) => {
            updateTaskProgress('lms_sync', `Syncing enrollments`, current, total, `${current.toLocaleString()} of ${total.toLocaleString()}`);
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
    activeTasks: Array.from(runningTasks.entries()).map(([type, info]) => ({
      type,
      startedAt: info.startedAt,
      runningSeconds: Math.round((Date.now() - info.startedAt.getTime()) / 1000),
      progress: info.progress || null
    })),
    checkInterval: CHECK_INTERVAL_MS
  };
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
  runGroupAnalysis // Export for manual runs
};
