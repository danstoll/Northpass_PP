require('dotenv').config();
const mysql = require('mysql2/promise');
const config = require('./server/config.cjs');

(async () => {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
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
