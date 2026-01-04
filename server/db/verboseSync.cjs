/**
 * Verbose Enrollment Sync - With detailed logging for debugging
 */
const { getPool, closePool } = require('./connection.cjs');

const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';
const START_OFFSET = 650; // Resume from user 650
const BATCH_SIZE = 100; // Process 100 users at a time

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
    console.error(`  Fetch error for ${userId}:`, err.message);
    return [];
  }
}

async function processUser(conn, user) {
  const items = await fetchTranscripts(user.id);
  let enrollments = 0;
  let fkErrors = 0;
  
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
      enrollments++;
    } catch (err) {
      if (err.message.includes('foreign key')) {
        fkErrors++;
      } else {
        throw err; // Re-throw unexpected errors
      }
    }
  }
  
  return { enrollments, fkErrors, items: items.length };
}

async function sync() {
  console.log(`Starting enrollment sync from offset ${START_OFFSET}...\n`);
  
  let pool, conn;
  try {
    pool = await getPool();
    conn = await pool.getConnection();
    console.log('Got database connection');
    
    // Get all users
    const [users] = await conn.query('SELECT id, email FROM lms_users');
    const totalUsers = users.length;
    console.log(`Total users: ${totalUsers}`);
    
    const remainingUsers = users.slice(START_OFFSET);
    console.log(`Processing ${remainingUsers.length} users starting from index ${START_OFFSET}\n`);
    
    let totalEnrollments = 0;
    let totalFkErrors = 0;
    
    for (let i = 0; i < remainingUsers.length; i++) {
      const user = remainingUsers[i];
      const globalIndex = START_OFFSET + i;
      
      try {
        const result = await processUser(conn, user);
        totalEnrollments += result.enrollments;
        totalFkErrors += result.fkErrors;
        
        // Log every 50 users
        if ((i + 1) % 50 === 0) {
          console.log(`[${globalIndex + 1}/${totalUsers}] Synced ${totalEnrollments} enrollments (${totalFkErrors} FK errors)`);
        }
        
        // Small delay
        await new Promise(r => setTimeout(r, 50));
        
      } catch (err) {
        console.error(`Error on user ${globalIndex + 1} (${user.id}):`, err.message);
        // Continue with next user
      }
    }
    
    console.log('\n=== COMPLETE ===');
    console.log(`Total enrollments synced: ${totalEnrollments}`);
    console.log(`FK errors: ${totalFkErrors}`);
    
    // Final count
    const [count] = await conn.query('SELECT COUNT(*) as c FROM lms_enrollments');
    console.log(`Total DB enrollments: ${count[0].c}`);
    
  } catch (err) {
    console.error('Fatal error:', err);
    throw err;
  } finally {
    if (conn) conn.release();
    if (pool) await closePool();
  }
  
  console.log('\nDone!');
}

// Run with unhandled rejection logging
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

sync().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
