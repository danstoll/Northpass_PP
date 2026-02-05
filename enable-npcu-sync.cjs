const { query } = require('./server/db/connection.cjs');

async function enableNpcuSync() {
  console.log('Enabling sync_npcu task...');
  
  await query(`UPDATE scheduled_tasks SET enabled = 1 WHERE task_type = 'sync_npcu'`);
  
  const result = await query(`
    SELECT task_type, task_name, enabled, interval_minutes, last_run_at 
    FROM scheduled_tasks 
    WHERE task_type = 'sync_npcu'
  `);
  
  console.log('Updated task:');
  console.table(result);
  
  process.exit(0);
}

enableNpcuSync().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
