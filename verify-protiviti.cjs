require('dotenv').config();
const config = require('./server/config.cjs');
const mysql = require('mysql2/promise');

async function verify() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  });

  // Find the group
  const [groups] = await conn.execute(
    "SELECT * FROM lms_groups WHERE name LIKE '%Protiviti%'"
  );
  console.log('\n=== GROUP ===');
  console.log(groups);

  if (groups.length > 0) {
    const groupId = groups[0].id;
    
    // Count users in group
    const [userCount] = await conn.execute(
      'SELECT COUNT(*) as total FROM lms_group_members WHERE group_id = ?',
      [groupId]
    );
    console.log('\n=== TOTAL USERS IN GROUP ===');
    console.log('Total:', userCount[0].total);

    // Get user IDs
    const [members] = await conn.execute(
      'SELECT user_id FROM lms_group_members WHERE group_id = ?',
      [groupId]
    );
    const userIds = members.map(m => m.user_id);
    
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      
      // Enrollment stats
      const [enrollStats] = await conn.execute(
        `SELECT status, COUNT(*) as cnt FROM lms_enrollments WHERE user_id IN (${placeholders}) GROUP BY status`,
        userIds
      );
      console.log('\n=== ENROLLMENT STATUS BREAKDOWN ===');
      enrollStats.forEach(s => console.log(`  ${s.status}: ${s.cnt}`));

      // Certifications (completed + is_certification + npcu > 0 + not expired)
      const [certStats] = await conn.execute(
        `SELECT 
          COUNT(DISTINCT CONCAT(e.user_id, '-', e.course_id)) as cert_count,
          SUM(c.npcu_value) as total_npcu,
          COUNT(DISTINCT e.user_id) as certified_users
        FROM lms_enrollments e
        JOIN lms_courses c ON c.id = e.course_id
        WHERE e.user_id IN (${placeholders})
          AND e.status = 'completed'
          AND c.is_certification = 1
          AND c.npcu_value > 0
          AND (e.expires_at IS NULL OR e.expires_at > NOW())`,
        userIds
      );
      console.log('\n=== CERTIFICATION STATS (valid, not expired) ===');
      console.log('  Cert Count:', certStats[0].cert_count);
      console.log('  Total NPCU:', certStats[0].total_npcu);
      console.log('  Certified Users:', certStats[0].certified_users);

      // Product breakdown
      const [productStats] = await conn.execute(
        `SELECT 
          COALESCE(c.product_category, 'Other') as category,
          COUNT(*) as cert_count,
          SUM(c.npcu_value) as npcu
        FROM lms_enrollments e
        JOIN lms_courses c ON c.id = e.course_id
        WHERE e.user_id IN (${placeholders})
          AND e.status = 'completed'
          AND c.is_certification = 1
          AND c.npcu_value > 0
          AND (e.expires_at IS NULL OR e.expires_at > NOW())
        GROUP BY c.product_category`,
        userIds
      );
      console.log('\n=== PRODUCT BREAKDOWN ===');
      productStats.forEach(p => console.log(`  ${p.category}: ${p.cert_count} certs, ${p.npcu} NPCU`));

      // List actual certifications
      const [certs] = await conn.execute(
        `SELECT 
          u.email,
          c.name as course_name,
          c.npcu_value,
          c.product_category,
          e.completed_at,
          e.expires_at
        FROM lms_enrollments e
        JOIN lms_courses c ON c.id = e.course_id
        JOIN lms_users u ON u.id = e.user_id
        WHERE e.user_id IN (${placeholders})
          AND e.status = 'completed'
          AND c.is_certification = 1
          AND c.npcu_value > 0
          AND (e.expires_at IS NULL OR e.expires_at > NOW())
        ORDER BY c.product_category, c.name`,
        userIds
      );
      console.log('\n=== INDIVIDUAL CERTIFICATIONS ===');
      certs.forEach(c => console.log(`  ${c.email} | ${c.course_name} | ${c.npcu_value} NPCU | ${c.product_category} | expires: ${c.expires_at || 'never'}`));
    }
  }

  await conn.end();
}

verify().catch(console.error);
