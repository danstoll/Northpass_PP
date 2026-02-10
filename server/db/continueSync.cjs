/**
 * Continue Enrollment Sync - Resume from a specific user offset
 */
const { getPool, closePool } = require('./connection.cjs');
const appConfig = require('../config.cjs');

const API_KEY = appConfig.northpass.apiKey;
const START_OFFSET = 400; // Resume from user 400

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
      if (response.status === 429) {
        console.log('  Rate limited, waiting 5s...');
        await new Promise(r => setTimeout(r, 5000));
        return fetchTranscripts(userId);
      }
      return [];
    }
    const data = await response.json();
    return data.data || [];
  } catch (err) {
    console.error(`Fetch error for ${userId}:`, err.message);
    return [];
  }
}

async function sync() {
  console.log(`Continuing enrollment sync from user ${START_OFFSET}...`);
  
  const pool = await getPool();
  const conn = await pool.getConnection();
  
  // Get all users
  const [users] = await conn.query('SELECT id, email FROM lms_users');
  const totalUsers = users.length;
  const remainingUsers = users.slice(START_OFFSET);
  console.log(`Processing ${remainingUsers.length} remaining users (${START_OFFSET} to ${totalUsers})...`);
  
  let totalEnrollments = 0;
  let usersWithData = 0;
  let fkErrors = 0;
  let errors = [];
  
  for (let i = 0; i < remainingUsers.length; i++) {
    const user = remainingUsers[i];
    const globalIndex = START_OFFSET + i;
    
    if ((i + 1) % 100 === 0) {
      console.log(`  Progress: ${globalIndex + 1}/${totalUsers} users, ${totalEnrollments} enrollments synced this run`);
    }
    
    try {
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
          } else {
            errors.push({ user: user.id, error: err.message });
          }
        }
      }
    } catch (err) {
      console.error(`Error processing user ${user.id}:`, err.message);
      errors.push({ user: user.id, error: err.message });
    }
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 50));
  }
  
  console.log('\n=== RESULTS ===');
  console.log(`Users processed this run: ${remainingUsers.length}`);
  console.log(`Users with enrollments: ${usersWithData}`);
  console.log(`Total enrollments synced: ${totalEnrollments}`);
  console.log(`FK errors (missing courses): ${fkErrors}`);
  console.log(`Other errors: ${errors.length}`);
  
  if (errors.length > 0 && errors.length <= 10) {
    console.log('Errors:', errors);
  }
  
  // Verify total
  const [count] = await conn.query('SELECT COUNT(*) as c FROM lms_enrollments');
  console.log(`\nTotal DB enrollment count: ${count[0].c}`);
  
  const [completed] = await conn.query('SELECT COUNT(*) as c FROM lms_enrollments WHERE status = "completed"');
  console.log(`Total completed enrollments: ${completed[0].c}`);
  
  conn.release();
  await closePool();
  console.log('\nDone!');
}

sync().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
