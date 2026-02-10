/**
 * Simple Enrollment Sync - with more debug output
 */
const { getPool, closePool } = require('./connection.cjs');
const appConfig = require('../config.cjs');

const API_KEY = appConfig.northpass.apiKey;

// Convert ISO 8601 date to MySQL datetime format
function toMySQLDate(isoDate) {
  if (!isoDate) return null;
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return null;
  }
}

async function fetchTranscripts(userId) {
  const url = `https://api.northpass.com/v2/transcripts/${userId}?limit=100`;
  try {
    const response = await fetch(url, { headers: { 'X-Api-Key': API_KEY } });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return data.data || [];
  } catch (err) {
    console.error('Fetch error:', err.message);
    return [];
  }
}

async function sync() {
  console.log('Starting enrollment sync...');
  
  const pool = await getPool();
  const conn = await pool.getConnection();
  
  // Get all users
  const [users] = await conn.query('SELECT id, email FROM lms_users');
  console.log(`Processing ${users.length} users...`);
  
  let totalEnrollments = 0;
  let usersWithData = 0;
  let fkErrors = 0;
  
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    
    if ((i + 1) % 200 === 0) {
      console.log(`  Progress: ${i + 1}/${users.length} users, ${totalEnrollments} enrollments`);
    }
    
    const items = await fetchTranscripts(user.id);
    
    if (items.length > 0) {
      usersWithData++;
    }
    
    for (const item of items) {
      const attrs = item.attributes || {};
      
      // Only courses
      if (attrs.resource_type !== 'course' || !attrs.resource_id) continue;
      
      const status = attrs.progress_status || 'enrolled';
      const progress = status === 'completed' ? 100 : (status === 'in_progress' ? 50 : 0);
      
      // Convert dates to MySQL format
      const enrolledAt = toMySQLDate(attrs.enrolled_at);
      const startedAt = toMySQLDate(attrs.started_at);
      const completedAt = toMySQLDate(attrs.completed_at);
      
      try {
        await conn.query(
          `INSERT INTO lms_enrollments (id, user_id, course_id, status, progress_percent, enrolled_at, started_at, completed_at, synced_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW()) 
           ON DUPLICATE KEY UPDATE 
             status = VALUES(status), 
             progress_percent = VALUES(progress_percent), 
             completed_at = VALUES(completed_at), 
             synced_at = NOW()`,
          [item.id, user.id, attrs.resource_id, status, progress, enrolledAt, startedAt, completedAt]
        );
        totalEnrollments++;
      } catch (err) {
        if (err.message.includes('foreign key')) {
          fkErrors++;
        }
      }
    }
    
    // Small delay
    await new Promise(r => setTimeout(r, 30));
  }
  
  console.log('\n=== RESULTS ===');
  console.log(`Users processed: ${users.length}`);
  console.log(`Users with enrollments: ${usersWithData}`);
  console.log(`Total enrollments synced: ${totalEnrollments}`);
  console.log(`FK errors (missing courses): ${fkErrors}`);
  
  // Verify
  const [count] = await conn.query('SELECT COUNT(*) as c FROM lms_enrollments');
  console.log(`DB enrollment count: ${count[0].c}`);
  
  const [completed] = await conn.query('SELECT COUNT(*) as c FROM lms_enrollments WHERE status = "completed"');
  console.log(`Completed enrollments: ${completed[0].c}`);
  
  conn.release();
  await closePool();
}

sync().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
