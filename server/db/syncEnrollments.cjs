/**
 * Enrollment Sync Script
 * Syncs enrollments for all LMS users from Northpass API
 */

const { getPool, closePool } = require('./connection.cjs');

const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';
const API_BASE = 'https://api.northpass.com';

async function fetchTranscripts(userId, page = 1) {
  // Use /v2/transcripts/{userId} endpoint - the correct one!
  const url = `${API_BASE}/v2/transcripts/${userId}?page=${page}&limit=100`;
  try {
    const response = await fetch(url, {
      headers: { 'X-Api-Key': API_KEY }
    });
    if (!response.ok) return { items: [], hasNext: false };
    const data = await response.json();
    return { 
      items: data.data || [], 
      hasNext: !!data.links?.next 
    };
  } catch (err) {
    return { items: [], hasNext: false };
  }
}

async function syncEnrollments() {
  console.log('📊 Starting enrollment sync...');
  
  const pool = await getPool();
  const conn = await pool.getConnection();
  
  try {
    // Get all users
    const [users] = await conn.query('SELECT id, email FROM lms_users');
    console.log(`📥 Syncing enrollments for ${users.length} users`);
    
    let totalEnrollments = 0;
    let processedUsers = 0;
    let errors = 0;
    
    for (const user of users) {
      processedUsers++;
      if (processedUsers % 100 === 0) {
        console.log(`  Processed ${processedUsers}/${users.length} users, enrollments: ${totalEnrollments}`);
      }
      
      try {
        let allItems = [];
        let page = 1;
        
        // Paginate through all transcript items
        while (true) {
          const { items, hasNext } = await fetchTranscripts(user.id, page);
          if (!items || items.length === 0) break;
          allItems = allItems.concat(items);
          if (!hasNext) break;
          page++;
        }
        
        // Insert/update enrollments from transcript items
        for (const item of allItems) {
          try {
            const attrs = item.attributes || {};
            const courseId = attrs.resource_id;
            
            // Only process course items
            if (attrs.resource_type !== 'course' || !courseId) continue;
            
            // Map progress_status to completion percentage
            let percentage = 0;
            if (attrs.progress_status === 'completed') percentage = 100;
            else if (attrs.progress_status === 'in_progress') percentage = 50;
            
            await conn.query(
              `INSERT INTO lms_enrollments (id, user_id, course_id, started_at, completed_at, completion_percentage) 
               VALUES (?, ?, ?, ?, ?, ?) 
               ON DUPLICATE KEY UPDATE 
                 started_at = VALUES(started_at), 
                 completed_at = VALUES(completed_at), 
                 completion_percentage = VALUES(completion_percentage)`,
              [item.id, user.id, courseId, attrs.started_at || attrs.enrolled_at || null, attrs.completed_at || null, percentage]
            );
            totalEnrollments++;
          } catch (insertErr) {
            // Skip FK constraint errors for missing courses
          }
        }
      } catch (err) {
        errors++;
      }
      
      // Rate limit - 30ms between users
      await new Promise(r => setTimeout(r, 30));
    }
    
    console.log('');
    console.log('✅ Enrollment sync complete!');
    console.log(`   Users processed: ${processedUsers}`);
    console.log(`   Enrollments synced: ${totalEnrollments}`);
    console.log(`   Errors: ${errors}`);
    
  } finally {
    conn.release();
  }
}

// Run the sync
syncEnrollments()
  .then(() => {
    console.log('Done!');
    return closePool();
  })
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
