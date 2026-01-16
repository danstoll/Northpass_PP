const { query } = require('./server/db/connection.cjs');

async function checkLeadStatus() {
  try {
    // Total leads
    const [totalLeads] = await query('SELECT COUNT(*) as total FROM leads');
    console.log('=== Lead Sync Status ===');
    console.log('Total leads in DB:', totalLeads.total);

    // Partners with leads
    const [partnersWithLeads] = await query('SELECT COUNT(*) as count FROM partners WHERE lead_count > 0');
    console.log('Partners with leads:', partnersWithLeads.count);

    // Date range
    const [dateRange] = await query('SELECT MIN(lead_created_at) as earliest, MAX(lead_created_at) as latest FROM leads');
    console.log('Lead date range:', dateRange.earliest, 'to', dateRange.latest);

    // Top partners by leads
    console.log('\n=== Top 10 Partners by Lead Count ===');
    const topPartners = await query(`
      SELECT account_name, partner_tier, lead_count, leads_last_30_days 
      FROM partners 
      WHERE lead_count > 0 
      ORDER BY lead_count DESC 
      LIMIT 10
    `);
    topPartners.forEach((p, i) => {
      console.log(`${i + 1}. ${p.account_name} (${p.partner_tier}): ${p.lead_count} leads`);
    });

    // Recent sync logs
    console.log('\n=== Recent Lead Sync Logs ===');
    const syncLogs = await query(`
      SELECT sync_type, status, records_processed, records_created, records_updated, 
             started_at, completed_at, error_message 
      FROM sync_logs 
      WHERE sync_type LIKE '%lead%' 
      ORDER BY started_at DESC 
      LIMIT 5
    `);
    
    if (syncLogs.length === 0) {
      console.log('No lead sync logs found');
    } else {
      syncLogs.forEach(log => {
        console.log(`\n${log.sync_type} - ${log.status}`);
        console.log(`  Started: ${log.started_at}`);
        console.log(`  Completed: ${log.completed_at || 'N/A'}`);
        console.log(`  Processed: ${log.records_processed}, Created: ${log.records_created}, Updated: ${log.records_updated}`);
        if (log.error_message) console.log(`  Error: ${log.error_message}`);
      });
    }

    // Check scheduled task status
    console.log('\n=== Scheduled Task Status ===');
    const taskStatus = await query(`
      SELECT task_type, enabled, interval_minutes, last_run_at, last_status, next_run_at
      FROM scheduled_tasks 
      WHERE task_type LIKE '%lead%'
    `);
    
    if (taskStatus.length === 0) {
      console.log('No lead sync task found in scheduled_tasks');
    } else {
      taskStatus.forEach(t => {
        console.log(`Task: ${t.task_type}`);
        console.log(`  Enabled: ${t.enabled ? 'Yes' : 'No'}`);
        console.log(`  Interval: ${t.interval_minutes} minutes`);
        console.log(`  Last run: ${t.last_run_at || 'Never'}`);
        console.log(`  Last status: ${t.last_status || 'N/A'}`);
        console.log(`  Next run: ${t.next_run_at || 'N/A'}`);
      });
    }
    
    // Clean up stuck sync logs
    const stuckResult = await query(`
      UPDATE sync_logs 
      SET status = 'stale', completed_at = NOW() 
      WHERE sync_type = 'sync_leads' 
      AND status = 'running' 
      AND started_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
    `);
    if (stuckResult.affectedRows > 0) {
      console.log(`\nCleaned up ${stuckResult.affectedRows} stuck sync logs`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkLeadStatus();
