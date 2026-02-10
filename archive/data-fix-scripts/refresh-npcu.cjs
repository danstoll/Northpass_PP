const { refreshNpcuCache } = require('./server/db/reportingService.cjs');

console.log('Starting NPCU cache refresh...');
refreshNpcuCache()
  .then(result => {
    console.log('Result:', result);
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
