/**
 * Robust Enrollment Sync - Saves progress and handles errors gracefully
 * Processes users in smaller batches with logging
 */
const fs = require('fs');
const { getPool, closePool } = require('./connection.cjs');

const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';
const PROGRESS_FILE = 'server/db/sync_progress.json';
const BATCH_SIZE = 200; // Process this many users per run

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

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { lastOffset: 0, totalEnrollments: 0, totalFkErrors: 0 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function fetchTranscripts(userId) {
  const url = `https://api.northpass.com/v2/transcripts/${userId}?limit=100`;
  try {
    const response = await fetch(url, { 
      headers: { 'X-Api-Key': API_KEY },
      timeout: 30000
    });
    if (!response.ok) {
      if (response.status === 429) {
        console.log('  Rate limited, waiting 10s...');
        await new Promise(r => setTimeout(r, 10000));
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
        console.error('  DB error:', err.message);
      }
    }
  }
  
  return { enrollments, fkErrors };
}

async function sync() {
  const progress = loadProgress();
  console.log(`=== Enrollment Sync - Starting from offset ${progress.lastOffset} ===\n`);
  
  let pool, conn;
  try {
    pool = await getPool();
    conn = await pool.getConnection();
    
    // Get all users
    const [users] = await conn.query('SELECT id, email FROM lms_users');
    const totalUsers = users.length;
    
    if (progress.lastOffset >= totalUsers) {
      console.log('✅ All users already processed!');
      const [count] = await conn.query('SELECT COUNT(*) as c FROM lms_enrollments');
      console.log(`Total DB enrollments: ${count[0].c}`);
      conn.release();
      await closePool();
      return;
    }
    
    const endOffset = Math.min(progress.lastOffset + BATCH_SIZE, totalUsers);
    const batchUsers = users.slice(progress.lastOffset, endOffset);
    
    console.log(`Processing users ${progress.lastOffset + 1} to ${endOffset} (of ${totalUsers})`);
    console.log(`Batch size: ${batchUsers.length} users\n`);
    
    let batchEnrollments = 0;
    let batchFkErrors = 0;
    
    for (let i = 0; i < batchUsers.length; i++) {
      const user = batchUsers[i];
      const globalIndex = progress.lastOffset + i;
      
      try {
        const result = await processUser(conn, user);
        batchEnrollments += result.enrollments;
        batchFkErrors += result.fkErrors;
        
        // Log every 25 users
        if ((i + 1) % 25 === 0) {
          console.log(`  [${globalIndex + 1}/${totalUsers}] Batch progress: ${batchEnrollments} enrollments`);
        }
        
        // Delay between users - 100ms
        await new Promise(r => setTimeout(r, 100));
        
      } catch (err) {
        console.error(`  Error on user ${globalIndex + 1}:`, err.message);
      }
    }
    
    // Update progress
    progress.lastOffset = endOffset;
    progress.totalEnrollments += batchEnrollments;
    progress.totalFkErrors += batchFkErrors;
    saveProgress(progress);
    
    // Final status
    const [count] = await conn.query('SELECT COUNT(*) as c FROM lms_enrollments');
    
    console.log('\n=== BATCH COMPLETE ===');
    console.log(`Users processed this batch: ${batchUsers.length}`);
    console.log(`Enrollments synced this batch: ${batchEnrollments}`);
    console.log(`FK errors this batch: ${batchFkErrors}`);
    console.log(`Total DB enrollments: ${count[0].c}`);
    console.log(`Progress: ${endOffset}/${totalUsers} users (${((endOffset/totalUsers)*100).toFixed(1)}%)`);
    
    if (endOffset < totalUsers) {
      console.log(`\nRun again to continue processing remaining ${totalUsers - endOffset} users`);
    } else {
      console.log('\n✅ All users processed!');
    }
    
  } catch (err) {
    console.error('Fatal error:', err);
    throw err;
  } finally {
    if (conn) conn.release();
    if (pool) await closePool();
  }
}

sync().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
