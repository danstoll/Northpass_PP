const mysql = require('mysql2/promise');

async function benchmark() {
  const conn = await mysql.createConnection({
    host: '20.29.25.238',
    port: 31337,
    user: 'root',
    password: 'P6Rof2DQo5wZqa9yM7y6',
    database: 'northpass_portal'
  });

  console.log('=== QUERY PERFORMANCE BENCHMARK ===\n');

  // Test 1: Get partners
  console.log('1. Getting partners...');
  let start = Date.now();
  const [partners] = await conn.query(`
    SELECT p.id, p.account_name, p.partner_tier 
    FROM partners p 
    WHERE p.partner_tier IN ('Premier', 'Select', 'Registered', 'Certified')
  `);
  console.log(`   Found ${partners.length} partners in ${Date.now() - start}ms\n`);

  // Test 2: NPCU query for ONE partner
  if (partners.length > 0) {
    console.log('2. NPCU subquery for ONE partner...');
    start = Date.now();
    const [npcu] = await conn.query(`
      SELECT 
        COALESCE(SUM(CASE 
          WHEN e.expires_at IS NULL OR e.expires_at > NOW() 
          THEN c.npcu_value 
          ELSE 0 
        END), 0) as active_npcu,
        COUNT(DISTINCT e.id) as total_certifications
      FROM lms_enrollments e
      INNER JOIN lms_courses c ON c.id = e.course_id AND c.npcu_value > 0
      INNER JOIN lms_users u ON u.id = e.user_id
      INNER JOIN contacts ct ON ct.lms_user_id = u.id AND ct.partner_id = ?
      WHERE e.status = 'completed'
    `, [partners[0].id]);
    const singleTime = Date.now() - start;
    console.log(`   Query took ${singleTime}ms for 1 partner`);
    console.log(`   For ${partners.length} partners: ~${(singleTime * partners.length / 1000).toFixed(0)} seconds!\n`);
  }

  // Test 3: Check indexes
  console.log('3. Checking indexes...');
  const [indexes] = await conn.query(`
    SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME 
    FROM information_schema.STATISTICS 
    WHERE TABLE_SCHEMA = 'northpass_portal' 
    AND TABLE_NAME IN ('contacts', 'lms_enrollments', 'lms_users', 'lms_courses')
    ORDER BY TABLE_NAME, INDEX_NAME
  `);
  
  const byTable = {};
  indexes.forEach(i => {
    if (!byTable[i.TABLE_NAME]) byTable[i.TABLE_NAME] = [];
    byTable[i.TABLE_NAME].push(`${i.INDEX_NAME}(${i.COLUMN_NAME})`);
  });
  
  for (const [table, idxs] of Object.entries(byTable)) {
    console.log(`   ${table}: ${idxs.join(', ')}`);
  }

  // Test 4: Better approach - single query with GROUP BY
  console.log('\n4. Testing optimized single-query approach...');
  start = Date.now();
  const [optimized] = await conn.query(`
    SELECT 
      p.id,
      p.account_name,
      p.partner_tier,
      COALESCE(SUM(CASE 
        WHEN e.expires_at IS NULL OR e.expires_at > NOW() 
        THEN c.npcu_value 
        ELSE 0 
      END), 0) as active_npcu
    FROM partners p
    LEFT JOIN contacts ct ON ct.partner_id = p.id AND ct.lms_user_id IS NOT NULL
    LEFT JOIN lms_users u ON u.id = ct.lms_user_id
    LEFT JOIN lms_enrollments e ON e.user_id = u.id AND e.status = 'completed'
    LEFT JOIN lms_courses c ON c.id = e.course_id AND c.npcu_value > 0
    WHERE p.partner_tier IN ('Premier', 'Select', 'Registered', 'Certified')
    GROUP BY p.id
    ORDER BY active_npcu DESC
    LIMIT 50
  `);
  console.log(`   Optimized query took ${Date.now() - start}ms for TOP 50 partners`);
  console.log(`   Sample results:`);
  optimized.slice(0, 5).forEach(r => console.log(`     ${r.account_name}: ${r.active_npcu} NPCU`));

  await conn.end();
}

benchmark().catch(console.error);
