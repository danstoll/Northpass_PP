const { query } = require('./server/db/connection.cjs');

(async () => {
  // Check enrollments by month
  const enrollments = await query(`
    SELECT 
      DATE_FORMAT(enrolled_at, '%Y-%m') as month,
      COUNT(*) as count
    FROM lms_enrollments 
    WHERE enrolled_at >= '2025-01-01'
    GROUP BY month
    ORDER BY month DESC
    LIMIT 15
  `);
  console.log('\n📊 Enrollments by month:');
  console.table(enrollments);

  // Check completions by month  
  const completions = await query(`
    SELECT 
      DATE_FORMAT(completed_at, '%Y-%m') as month,
      COUNT(*) as count
    FROM lms_enrollments 
    WHERE completed_at IS NOT NULL 
      AND completed_at >= '2025-01-01'
    GROUP BY month
    ORDER BY month DESC
    LIMIT 15
  `);
  console.log('\n✅ Completions by month:');
  console.table(completions);

  // Check latest enrollment dates
  const latest = await query(`
    SELECT MAX(enrolled_at) as latest_enrolled, MAX(completed_at) as latest_completed 
    FROM lms_enrollments
  `);
  console.log('\n📅 Latest dates:');
  console.log('  Latest enrollment:', latest[0].latest_enrolled);
  console.log('  Latest completion:', latest[0].latest_completed);

  // Check Jan 2026 specifically
  const jan2026 = await query(`
    SELECT 
      COUNT(*) as enrollments,
      SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completions
    FROM lms_enrollments 
    WHERE enrolled_at >= '2026-01-01'
  `);
  console.log('\n🗓️ January 2026:');
  console.log('  Enrollments:', jan2026[0].enrollments);
  console.log('  Completions:', jan2026[0].completions);

  // New users by month (based on created_at_lms)
  const newUsers = await query(`
    SELECT 
      DATE_FORMAT(created_at_lms, '%Y-%m') as month,
      COUNT(*) as count
    FROM lms_users 
    WHERE created_at_lms >= '2025-12-01'
    GROUP BY month
    ORDER BY month DESC
    LIMIT 5
  `);
  console.log('\n👤 New LMS users by month (ALL):');
  console.table(newUsers);

  // Partner users only (same query the dashboard uses)
  const partnerUsers = await query(`
    SELECT COUNT(DISTINCT u.id) as count
    FROM lms_users u
    INNER JOIN (
      SELECT DISTINCT ct.lms_user_id as user_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      SELECT DISTINCT gm.user_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) pu ON pu.user_id = u.id
    WHERE u.created_at_lms >= '2026-01-01'
  `);
  console.log('\n👤 Partner users created in Jan 2026:', partnerUsers[0].count);

  process.exit(0);
})();
