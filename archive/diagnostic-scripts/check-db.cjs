const { query } = require('./server/db/connection.cjs');

async function main() {
  console.log('Checking database processes...');
  const processes = await query('SHOW FULL PROCESSLIST');
  console.log('Active processes:', JSON.stringify(processes, null, 2));
  
  // Find stuck queries
  const stuckQueries = processes.filter(p => 
    p.Time > 30 && p.Command !== 'Sleep' && p.Info
  );
  
  if (stuckQueries.length > 0) {
    console.log('\n⚠️ Stuck queries found:');
    for (const q of stuckQueries) {
      console.log(`  Process ${q.Id}: ${q.Command} (${q.Time}s) - ${q.Info?.substring(0, 100)}...`);
      // Kill the stuck query
      console.log(`  Killing process ${q.Id}...`);
      await query(`KILL ${q.Id}`);
    }
  } else {
    console.log('\n✅ No stuck queries found');
  }
  
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
