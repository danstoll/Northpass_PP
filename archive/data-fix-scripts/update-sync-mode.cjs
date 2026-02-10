require('dotenv').config();
const mysql = require('mysql2/promise');
const config = require('./server/config.cjs');

async function updateSyncMode() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
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
