const { query } = require('./server/db/connection.cjs');

async function cleanup() {
  try {
    // Mark all running lead syncs as cancelled
    const result = await query(`
      UPDATE sync_logs 
      SET status = 'cancelled', completed_at = NOW() 
      WHERE sync_type = 'sync_leads' AND status = 'running'
    `);
    console.log('Cleaned up running lead syncs:', result.affectedRows);

    // Also reset the scheduled task status
    await query(`
      UPDATE scheduled_tasks 
      SET last_status = 'failed' 
      WHERE task_type = 'sync_leads' AND last_status = 'running'
    `);
    
    // Show current status
    const logs = await query(`
      SELECT id, sync_type, status, started_at, completed_at 
      FROM sync_logs 
      WHERE sync_type = 'sync_leads' 
      ORDER BY started_at DESC 
      LIMIT 10
    `);
    console.log('\nRecent lead sync logs:');
    logs.forEach(l => console.log(`  ${l.id}: ${l.status} - ${l.started_at}`));
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

cleanup();
