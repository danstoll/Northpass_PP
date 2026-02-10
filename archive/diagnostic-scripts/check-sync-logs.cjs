const { query } = require('./server/db/connection.cjs');

async function checkLogs() {
  const logs = await query(`
    SELECT sync_type, status, started_at, completed_at 
    FROM sync_logs 
    WHERE started_at > DATE_SUB(NOW(), INTERVAL 2 HOUR) 
    ORDER BY started_at DESC
    LIMIT 30
  `);
  
  console.log('Recent sync_logs:');
  console.log('=================');
  logs.forEach(log => {
    const time = new Date(log.started_at).toLocaleTimeString();
    console.log(`${time} | ${log.sync_type.padEnd(20)} | ${log.status}`);
  });
  
  process.exit(0);
}

checkLogs().catch(e => { console.error(e); process.exit(1); });
