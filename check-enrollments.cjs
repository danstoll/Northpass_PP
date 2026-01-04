const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: '20.29.25.238',
    port: 31337,
    user: 'root',
    password: 'P6Rof2DQo5wZqa9yM7y6',
    database: 'northpass_portal'
  });
  
  // Check enrollment statuses
  const [stats] = await conn.query('SELECT status, COUNT(*) as cnt FROM lms_enrollments GROUP BY status ORDER BY cnt DESC');
  console.log('Enrollment Status Distribution:');
  console.table(stats);
  
  // Check Protiviti specifically
  const [protiviti] = await conn.query(`
    SELECT e.status, COUNT(*) as cnt
    FROM lms_enrollments e
    JOIN lms_users u ON u.id = e.user_id
    JOIN contacts c ON c.lms_user_id = u.id
    JOIN partners p ON p.id = c.partner_id
    WHERE p.account_name = 'Protiviti Inc.'
    GROUP BY e.status
    ORDER BY cnt DESC
  `);
  console.log('\nProtiviti Inc. Enrollment Status:');
  console.table(protiviti);
  
  await conn.end();
})().catch(e => console.error(e.message));
