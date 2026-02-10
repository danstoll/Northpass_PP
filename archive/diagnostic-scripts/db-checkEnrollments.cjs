const { getPool, closePool } = require('./connection.cjs');

async function check() {
  const pool = await getPool();
  const [count] = await pool.query('SELECT COUNT(*) as c FROM lms_enrollments');
  console.log('Enrollments:', count[0].c);
  const [completed] = await pool.query('SELECT COUNT(*) as c FROM lms_enrollments WHERE status = "completed"');
  console.log('Completed:', completed[0].c);
  await closePool();
}

check();
