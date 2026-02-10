const { query } = require('./server/db/connection.cjs');

async function cleanup() {
  try {
    // Force clean all stuck lead sync logs
    const result = await query(`UPDATE sync_logs SET status = 'stale', completed_at = NOW() WHERE sync_type = 'sync_leads' AND status = 'running'`);
    console.log('Cleaned up stuck lead syncs:', result.affectedRows);
    
    // Reset scheduled task status to 'failed' (valid enum value)
    const taskResult = await query(`UPDATE scheduled_tasks SET last_status = 'failed' WHERE task_type = 'sync_leads'`);
    console.log('Reset scheduled task:', taskResult.affectedRows);
    
    // Check latest sync log
    const logs = await query(`SELECT id, status, records_processed, records_created, started_at, completed_at FROM sync_logs WHERE sync_type = 'sync_leads' ORDER BY started_at DESC LIMIT 5`);
    console.log('\nLatest sync logs:');
    logs.forEach(l => console.log(l));
    
    // Check task status
    const task = await query(`SELECT task_type, enabled, last_status, last_run_at FROM scheduled_tasks WHERE task_type = 'sync_leads'`);
    console.log('\nTask status:', task[0]);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

cleanup();
