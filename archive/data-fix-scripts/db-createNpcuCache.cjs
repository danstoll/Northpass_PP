const mysql = require('mysql2/promise');
const appConfig = require('../config.cjs');

async function createCache() {
  const conn = await mysql.createConnection({
    host: appConfig.db.host,
    port: appConfig.db.port,
    user: appConfig.db.user,
    password: appConfig.db.password,
    database: appConfig.db.database
  });

  console.log('Creating NPCU cache table...');

  await conn.query('DROP TABLE IF EXISTS partner_npcu_cache');
  
  await conn.query(`
    CREATE TABLE partner_npcu_cache (
      partner_id INT NOT NULL PRIMARY KEY,
      active_npcu INT DEFAULT 0,
      expired_npcu INT DEFAULT 0,
      total_certifications INT DEFAULT 0,
      certified_users INT DEFAULT 0,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_active_npcu (active_npcu DESC),
      FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
    )
  `);
  
  console.log('Cache table created!');
  
  // Populate it
  console.log('Populating cache (this may take a while)...');
  
  const start = Date.now();
  await conn.query(`
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
      -- Only count active (non-expired) certifications (courses with NPCU > 0)
      COUNT(DISTINCT CASE 
        WHEN c.npcu_value > 0 AND (e.expires_at IS NULL OR e.expires_at > NOW()) 
        THEN e.id 
        ELSE NULL 
      END) as total_certifications,
      COUNT(DISTINCT CASE 
        WHEN c.npcu_value > 0 AND (e.expires_at IS NULL OR e.expires_at > NOW()) 
        THEN e.user_id 
        ELSE NULL 
      END) as certified_users
    FROM partners p
    LEFT JOIN contacts ct ON ct.partner_id = p.id AND ct.lms_user_id IS NOT NULL
    LEFT JOIN lms_enrollments e ON e.user_id = ct.lms_user_id AND e.status = 'completed'
    LEFT JOIN lms_courses c ON c.id = e.course_id
    GROUP BY p.id
  `);
  
  console.log('Cache populated in', ((Date.now() - start) / 1000).toFixed(1), 'seconds');
  
  const [count] = await conn.query('SELECT COUNT(*) as c FROM partner_npcu_cache WHERE active_npcu > 0');
  console.log('Partners with NPCU:', count[0].c);
  
  // Test fast query
  console.log('\nTesting fast leaderboard query...');
  const start2 = Date.now();
  const [top] = await conn.query(`
    SELECT p.id, p.account_name, p.partner_tier, c.active_npcu, c.certified_users
    FROM partners p
    JOIN partner_npcu_cache c ON c.partner_id = p.id
    ORDER BY c.active_npcu DESC
    LIMIT 50
  `);
  console.log('Fast query took', Date.now() - start2, 'ms');
  console.log('\nTop 5:');
  top.slice(0, 5).forEach(r => console.log(`  ${r.account_name}: ${r.active_npcu} NPCU`));

  await conn.end();
}

createCache().catch(console.error);
