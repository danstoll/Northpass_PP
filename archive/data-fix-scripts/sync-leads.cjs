/**
 * Lead Sync Script
 * Run: node scripts/sync-leads.cjs [mode]
 * 
 * Modes:
 *   full        - Full sync (default)
 *   incremental - Only changes since last sync
 */

const { syncLeads } = require('../server/db/impartnerSyncService.cjs');

const mode = process.argv[2] || 'full';

console.log(`Starting lead sync in ${mode} mode...`);
console.log(`Started at: ${new Date().toISOString()}`);

syncLeads(mode)
  .then(result => {
    console.log('\n✅ Lead sync completed successfully!');
    console.log('Results:', JSON.stringify(result, null, 2));
    console.log(`Finished at: ${new Date().toISOString()}`);
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Lead sync failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
