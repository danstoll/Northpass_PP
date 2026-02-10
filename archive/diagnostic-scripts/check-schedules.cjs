/**
 * Check scheduled tasks and notification settings
 */
const { query } = require('./server/db/connection.cjs');

async function main() {
  try {
    console.log('=== SCHEDULED TASKS ===');
    const tasks = await query(`
      SELECT task_type, task_name, enabled, interval_minutes, last_run_at 
      FROM scheduled_tasks 
      ORDER BY task_type
    `);
    tasks.forEach(t => {
      const status = t.enabled ? '✅' : '⏸️';
      console.log(`${status} ${t.task_name} (${t.task_type}): every ${t.interval_minutes} min, last: ${t.last_run_at || 'never'}`);
    });
    
    console.log('\n=== NOTIFICATION TEMPLATES ===');
    const templates = await query(`
      SELECT id, template_key, template_name, comm_type, is_active 
      FROM notification_templates
    `);
    templates.forEach(t => {
      const status = t.is_active ? '✅' : '⏸️';
      console.log(`${status} ${t.template_name} [${t.comm_type}] - key: ${t.template_key}`);
    });
    
    console.log('\n=== ACTIVE PAMs (sample) ===');
    const pams = await query(`
      SELECT id, owner_name, email, email_reports_enabled, report_frequency 
      FROM partner_managers 
      WHERE is_active_pam = TRUE 
      LIMIT 5
    `);
    pams.forEach(p => {
      const emailStatus = p.email_reports_enabled ? '📧' : '🔇';
      console.log(`${emailStatus} ${p.owner_name} - ${p.email || 'no email'} (${p.report_frequency || 'no frequency'})`);
    });
    
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
