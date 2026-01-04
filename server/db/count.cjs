// Count enrollments
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: '20.29.25.238',
  port: 31337,
  user: 'root',
  password: 'P6Rof2DQo5wZqa9yM7y6',
  database: 'northpass_portal'
}).then(conn => {
  conn.query('SELECT COUNT(*) as total FROM lms_enrollments').then(([rows]) => {
    console.log('ENROLLMENTS:', rows[0].total);
    conn.end();
    process.exit(0);
  });
});
