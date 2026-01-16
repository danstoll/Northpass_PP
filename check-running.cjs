const { query } = require('./server/db/connection.cjs');

async function checkRunning() {
  try {
    // Check all running syncs
    const running = await query(`SELECT id, sync_type, status, records_processed, started_at, completed_at FROM sync_logs WHERE status = 'running' ORDER BY started_at DESC`);
    console.log('=== Currently Running Syncs ===');
    if (running.length === 0) {
      console.log('None');
    } else {
      running.forEach(r => {
        const age = Math.round((Date.now() - new Date(r.started_at).getTime()) / 60000);
        console.log(`ID ${r.id}: ${r.sync_type} - started ${age} minutes ago`);
      });
    }

    // Check scheduled tasks with running status
    const tasks = await query(`SELECT task_type, last_status, last_run_at FROM scheduled_tasks WHERE last_status = 'running'`);
    console.log('\n=== Tasks with "running" status ===');
    if (tasks.length === 0) {
      console.log('None');
    } else {
      tasks.forEach(t => {
        const age = Math.round((Date.now() - new Date(t.last_run_at).getTime()) / 60000);
        console.log(`${t.task_type} - started ${age} minutes ago`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkRunning();
