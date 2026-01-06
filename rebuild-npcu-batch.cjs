const { query } = require('./server/db/connection.cjs');

async function main() {
  console.log('Building NPCU cache in batches...');
  const start = Date.now();
  
  try {
    // Truncate first
    console.log('1. Truncating partner_npcu_cache table...');
    await query('TRUNCATE TABLE partner_npcu_cache');
    
    // Get all partners with their groups
    console.log('2. Getting partners with LMS groups...');
    const partners = await query(`
      SELECT p.id as partner_id, g.id as group_id 
      FROM partners p 
      LEFT JOIN lms_groups g ON g.partner_id = p.id
    `);
    console.log(`   Found ${partners.length} partners`);
    
    // Process in batches of 50
    const batchSize = 50;
    let processed = 0;
    let partnersWithNpcu = 0;
    
    console.log('3. Processing partners in batches...');
    for (let i = 0; i < partners.length; i += batchSize) {
      const batch = partners.slice(i, i + batchSize);
      
      for (const p of batch) {
        let activeNpcu = 0, expiredNpcu = 0, totalCerts = 0, certifiedUsers = 0;
        
        if (p.group_id) {
          // Get NPCU data for this group's members
          const [result] = await query(`
            SELECT 
              COALESCE(SUM(CASE WHEN e.expires_at IS NULL OR e.expires_at > NOW() THEN c.npcu_value ELSE 0 END), 0) as active_npcu,
              COALESCE(SUM(CASE WHEN e.expires_at IS NOT NULL AND e.expires_at <= NOW() THEN c.npcu_value ELSE 0 END), 0) as expired_npcu,
              COUNT(DISTINCT e.id) as total_certs,
              COUNT(DISTINCT e.user_id) as certified_users
            FROM lms_group_members gm
            JOIN lms_enrollments e ON e.user_id = gm.user_id AND e.status = 'completed'
            JOIN lms_courses c ON c.id = e.course_id AND c.npcu_value > 0
            WHERE gm.group_id = ?
          `, [p.group_id]);
          
          if (result) {
            activeNpcu = result.active_npcu || 0;
            expiredNpcu = result.expired_npcu || 0;
            totalCerts = result.total_certs || 0;
            certifiedUsers = result.certified_users || 0;
          }
        }
        
        // Insert into cache
        await query(`
          INSERT INTO partner_npcu_cache (partner_id, active_npcu, expired_npcu, total_certifications, certified_users)
          VALUES (?, ?, ?, ?, ?)
        `, [p.partner_id, activeNpcu, expiredNpcu, totalCerts, certifiedUsers]);
        
        if (activeNpcu > 0) partnersWithNpcu++;
      }
      
      processed += batch.length;
      process.stdout.write(`\r   Processed ${processed}/${partners.length} partners (${partnersWithNpcu} with NPCU)...`);
    }
    
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n4. Done! Processed ${processed} partners in ${elapsed}s`);
    console.log(`   Partners with active NPCU: ${partnersWithNpcu}`);
    
    // Verify First Technology Digital
    const [ftd] = await query(`
      SELECT nc.*, p.account_name 
      FROM partner_npcu_cache nc 
      JOIN partners p ON p.id = nc.partner_id 
      WHERE p.account_name LIKE '%First Technology Digital%'
    `);
    if (ftd) {
      console.log(`   ✅ First Technology Digital: active_npcu=${ftd.active_npcu}, certified_users=${ftd.certified_users}`);
    }
    
    console.log('✅ NPCU cache rebuilt successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
