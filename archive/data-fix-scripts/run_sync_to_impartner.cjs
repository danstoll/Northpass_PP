const taskScheduler = require('../server/db/taskScheduler.cjs');

(async () => {
  try {
    console.log('Triggering scheduled task: sync_to_impartner');
    const result = await taskScheduler.triggerTask('sync_to_impartner');
    console.log('\nTask result summary:');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error running sync_to_impartner:', err);
    process.exit(2);
  }
})();
