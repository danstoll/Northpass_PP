const mysql = require('mysql2/promise');

async function updateSyncMode() {
  const conn = await mysql.createConnection({
    host: '20.29.25.238',
    port: 31337,
    user: 'root',
    password: 'P6Rof2DQo5wZqa9yM7y6',
    database: 'northpass_portal'
  });
  
  console.log('Updating sync_to_impartner task config...');
  
  await conn.execute(
    'UPDATE scheduled_tasks SET config = ? WHERE task_type = ?',
    ['{"mode": "incremental"}', 'sync_to_impartner']
  );
  
  console.log('Updated! Current config:');
  const [rows] = await conn.execute(
    'SELECT task_type, task_name, config, enabled, interval_minutes FROM scheduled_tasks WHERE task_type = ?',
    ['sync_to_impartner']
  );
  
  console.log(JSON.stringify(rows, null, 2));
  
  await conn.end();
}

updateSyncMode().catch(console.error);
