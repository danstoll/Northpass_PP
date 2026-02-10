const { query } = require('./server/db/connection.cjs');

async function checkAndCleanup() {
  console.log('=== Checking history data structure ===\n');
  
  // Check task_run_history samples
  const tasks = await query(`
    SELECT task_type, status, records_processed, result_summary 
    FROM task_run_history 
    ORDER BY started_at DESC LIMIT 5
  `);
  console.log('task_run_history samples:');
  tasks.forEach(t => {
    console.log(`  ${t.task_type}: records=${t.records_processed}`);
    if (t.result_summary) {
      try {
        const summary = JSON.parse(t.result_summary);
        console.log(`    Keys: ${Object.keys(summary).join(', ')}`);
      } catch (e) {
        console.log(`    Raw: ${t.result_summary?.substring(0, 100)}`);
      }
    }
  });
  
  // Check sync_logs samples
  const logs = await query(`
    SELECT sync_type, status, records_processed, records_created, records_updated, records_deleted, records_failed, details 
    FROM sync_logs 
    ORDER BY started_at DESC LIMIT 5
  `);
  console.log('\nsync_logs samples:');
  logs.forEach(l => {
    console.log(`  ${l.sync_type}: proc=${l.records_processed} created=${l.records_created} updated=${l.records_updated} deleted=${l.records_deleted} failed=${l.records_failed}`);
  });
  
  // Count duplicates (same sync_type within 5 seconds)
  const duplicates = await query(`
    SELECT COUNT(*) as dup_count FROM sync_logs s1
    WHERE EXISTS (
      SELECT 1 FROM task_run_history t 
      WHERE t.task_type = s1.sync_type 
      AND ABS(TIMESTAMPDIFF(SECOND, t.started_at, s1.started_at)) < 10
    )
  `);
  console.log(`\nPotential duplicate entries: ${duplicates[0].dup_count}`);
  
  // Clean up - delete sync_logs entries that have matching task_run_history entries
  console.log('\n=== Cleaning up duplicate sync_logs ===');
  const deleteResult = await query(`
    DELETE s FROM sync_logs s
    WHERE EXISTS (
      SELECT 1 FROM task_run_history t 
      WHERE t.task_type = s.sync_type 
      AND ABS(TIMESTAMPDIFF(SECOND, t.started_at, s.started_at)) < 10
    )
    AND s.sync_type IN ('sync_users', 'sync_groups', 'sync_courses', 'sync_npcu', 'sync_enrollments', 
                        'lms_sync', 'group_analysis', 'group_members_sync', 'cleanup')
  `);
  console.log(`Deleted ${deleteResult.affectedRows} duplicate sync_logs entries`);
  
  // Verify cleanup
  const remaining = await query('SELECT COUNT(*) as count FROM sync_logs');
  const taskHistory = await query('SELECT COUNT(*) as count FROM task_run_history');
  console.log(`\nRemaining: ${remaining[0].count} sync_logs, ${taskHistory[0].count} task_run_history`);
  
  process.exit(0);
}

checkAndCleanup().catch(e => { console.error(e); process.exit(1); });
