// Check new completions synced today
const { query } = require('./server/db/connection.cjs');

(async () => {
  // Count new completions since Dec 24 that were synced today
  const newCompletions = await query(`
    SELECT COUNT(*) as count 
    FROM lms_enrollments 
    WHERE status = 'completed' 
    AND completed_at > '2025-12-24' 
    AND synced_at >= CURDATE()
  `);
  console.log('New completions since Dec 24 (synced today):', newCompletions[0].count);
  
  // Get sample of recent completions
  const samples = await query(`
    SELECT 
      e.completed_at,
      c.name as course_name,
      u.email
    FROM lms_enrollments e
    JOIN lms_courses c ON c.id = e.course_id
    JOIN lms_users u ON u.id = e.user_id
    WHERE e.status = 'completed' 
    AND e.completed_at > '2025-12-24'
    AND e.synced_at >= CURDATE()
    ORDER BY e.completed_at DESC
    LIMIT 10
  `);
  console.log('\nRecent completions:');
  samples.forEach(s => {
    console.log(`  ${s.completed_at?.toISOString().slice(0,10)} - ${s.course_name} - ${s.email}`);
  });
  
  process.exit(0);
})();
