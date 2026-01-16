const { query } = require('./server/db/connection.cjs');

async function checkSync() {
  try {
    console.log('=== Recent Sync Logs ===');
    const logs = await query(`
      SELECT sync_type, status, records_processed, started_at, completed_at, error_message
      FROM sync_logs 
      ORDER BY completed_at DESC 
      LIMIT 10
    `);
    console.log(JSON.stringify(logs, null, 2));
    
    console.log('\n=== Scheduled Tasks ===');
    const tasks = await query(`SELECT task_type, is_enabled, interval_minutes, last_run, next_run FROM scheduled_tasks`);
    console.log(JSON.stringify(tasks, null, 2));
    
    console.log('\n=== Enrollment Stats ===');
    const stats = await query(`
      SELECT 
        COUNT(*) as total_enrollments,
        SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
        MAX(synced_at) as last_synced,
        MAX(completed_at) as last_completion
      FROM lms_enrollments
    `);
    console.log(JSON.stringify(stats, null, 2));
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

checkSync();
