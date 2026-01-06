const { query } = require('./server/db/connection.cjs');

async function main() {
  console.log('Clearing and rebuilding NPCU cache using LMS group members...');
  const start = Date.now();
  
  try {
    // First, truncate the table (faster than DELETE)
    console.log('1. Truncating partner_npcu_cache table...');
    await query('TRUNCATE TABLE partner_npcu_cache');
    console.log('   Done.');
    
    // Insert using LMS group members (this is the new logic)
    console.log('2. Inserting new cache data from LMS group members...');
    const result = await query(`
      INSERT INTO partner_npcu_cache (partner_id, active_npcu, expired_npcu, total_certifications, certified_users)
      SELECT 
        p.id,
        COALESCE(SUM(CASE 
          WHEN e.expires_at IS NULL OR e.expires_at > NOW() 
          THEN c.npcu_value 
          ELSE 0 
        END), 0) as active_npcu,
        COALESCE(SUM(CASE 
          WHEN e.expires_at IS NOT NULL AND e.expires_at <= NOW() 
          THEN c.npcu_value 
          ELSE 0 
        END), 0) as expired_npcu,
        COUNT(DISTINCT e.id) as total_certifications,
        COUNT(DISTINCT e.user_id) as certified_users
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      LEFT JOIN lms_group_members gm ON gm.group_id = g.id
      LEFT JOIN lms_enrollments e ON e.user_id = gm.user_id AND e.status = 'completed'
      LEFT JOIN lms_courses c ON c.id = e.course_id AND c.npcu_value > 0
      GROUP BY p.id
    `);
    
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`   Inserted ${result.affectedRows} rows in ${elapsed}s`);
    
    // Verify
    console.log('3. Verifying...');
    const [count] = await query('SELECT COUNT(*) as c FROM partner_npcu_cache WHERE active_npcu > 0');
    console.log(`   Partners with active NPCU: ${count.c}`);
    
    // Check First Technology Digital
    const [ftd] = await query(`
      SELECT nc.*, p.account_name 
      FROM partner_npcu_cache nc 
      JOIN partners p ON p.id = nc.partner_id 
      WHERE p.account_name LIKE '%First Technology Digital%'
    `);
    if (ftd) {
      console.log(`   First Technology Digital: active_npcu=${ftd.active_npcu}, certified_users=${ftd.certified_users}`);
    }
    
    console.log('✅ NPCU cache rebuilt successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
