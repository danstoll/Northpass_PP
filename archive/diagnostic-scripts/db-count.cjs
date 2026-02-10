// Count enrollments
const mysql = require('mysql2/promise');
const appConfig = require('../config.cjs');
mysql.createConnection({
  host: appConfig.db.host,
  port: appConfig.db.port,
  user: appConfig.db.user,
  password: appConfig.db.password,
  database: appConfig.db.database
}).then(conn => {
  conn.query('SELECT COUNT(*) as total FROM lms_enrollments').then(([rows]) => {
    console.log('ENROLLMENTS:', rows[0].total);
    conn.end();
    process.exit(0);
  });
});
