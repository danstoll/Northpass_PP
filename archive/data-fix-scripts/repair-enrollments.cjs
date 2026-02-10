/**
 * Enrollment Repair Script
 *
 * This script fixes missing enrollments caused by the pagination bug.
 * The original sync only fetched the first page of transcripts per user,
 * missing historical data for users with many courses.
 *
 * Usage:
 *   node repair-enrollments.cjs           # Repair all partner users
 *   node repair-enrollments.cjs --dry-run # Show what would be done without making changes
 *   node repair-enrollments.cjs --user=email@example.com  # Repair specific user
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const https = require('https');
const config = require('./server/config.cjs');

const API_KEY = config.northpass.apiKey;

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const specificUser = args.find(a => a.startsWith('--user='))?.split('=')[1];

// Stats tracking
const stats = {
  usersProcessed: 0,
  usersFixed: 0,
  enrollmentsAdded: 0,
  enrollmentsUpdated: 0,
  errors: 0,
  apiCalls: 0
};

// Fetch from Northpass API
function fetchNorthpass(path) {
  stats.apiCalls++;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.northpass.com',
      path: path,
      method: 'GET',
      headers: {
        'X-Api-Key': API_KEY,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, error: 'Parse error' });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Fetch ALL transcripts for a user with pagination
async function fetchAllTranscripts(userId) {
  const allTranscripts = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 20) {
    const result = await fetchNorthpass(`/v2/transcripts/${userId}?page=${page}&limit=100`);
    if (result.status !== 200 || !result.data?.data) {
      if (page === 1) return { transcripts: [], error: result.error || `HTTP ${result.status}` };
      break;
    }
    const pageData = result.data.data || [];
    if (pageData.length === 0) {
      hasMore = false;
    } else {
      allTranscripts.push(...pageData);
      hasMore = result.data.links?.next ? true : false;
      page++;
    }
    if (hasMore) await new Promise(r => setTimeout(r, 100));
  }

  return { transcripts: allTranscripts, pages: page - 1 };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ENROLLMENT REPAIR SCRIPT                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  if (specificUser) {
    console.log(`📧 Processing specific user: ${specificUser}\n`);
  }

  const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  });

  try {
    // Get partner users to process
    let userQuery = `
      SELECT DISTINCT u.id, u.email
      FROM lms_users u
      WHERE u.status = 'active'
      AND (
        EXISTS (SELECT 1 FROM contacts ct WHERE ct.lms_user_id = u.id AND ct.partner_id IS NOT NULL)
        OR EXISTS (
          SELECT 1 FROM lms_group_members gm
          INNER JOIN lms_groups g ON g.id = gm.group_id
          WHERE gm.user_id = u.id AND g.partner_id IS NOT NULL
        )
      )
    `;

    if (specificUser) {
      userQuery += ` AND u.email = ?`;
    }

    const [users] = await pool.query(userQuery, specificUser ? [specificUser] : []);
    console.log(`Found ${users.length} partner users to check\n`);

    const startTime = Date.now();

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      stats.usersProcessed++;

      try {
        // Get current enrollment count from DB
        const [dbEnrollments] = await pool.query(
          'SELECT id, course_id FROM lms_enrollments WHERE user_id = ?',
          [user.id]
        );
        const dbCourseIds = new Set(dbEnrollments.map(e => e.course_id));

        // Fetch ALL transcripts from API
        const { transcripts, error, pages } = await fetchAllTranscripts(user.id);

        if (error) {
          console.log(`⚠️  ${user.email}: API error - ${error}`);
          stats.errors++;
          continue;
        }

        // Filter to courses only
        const courseTranscripts = transcripts.filter(t => t.attributes.resource_type === 'course');
        const apiCourseIds = new Set(courseTranscripts.map(t => t.attributes.resource_id));

        // Find missing enrollments
        const missingCourseIds = [...apiCourseIds].filter(id => !dbCourseIds.has(id));

        if (missingCourseIds.length === 0) {
          // No missing data, skip
          if ((i + 1) % 100 === 0) {
            console.log(`  Progress: ${i + 1}/${users.length} users checked...`);
          }
          continue;
        }

        stats.usersFixed++;
        const missingTranscripts = courseTranscripts.filter(t => missingCourseIds.includes(t.attributes.resource_id));

        console.log(`\n📧 ${user.email}`);
        console.log(`   DB: ${dbEnrollments.length} | API: ${courseTranscripts.length} | Missing: ${missingCourseIds.length}`);

        // Insert missing enrollments
        for (const transcript of missingTranscripts) {
          const attrs = transcript.attributes || {};
          const courseId = attrs.resource_id;
          const progressStatus = attrs.progress_status || 'enrolled';
          const progressPercent = progressStatus === 'completed' ? 100 :
                                  progressStatus === 'in_progress' ? 50 : 0;

          if (!isDryRun) {
            try {
              const [result] = await pool.query(
                `INSERT INTO lms_enrollments (id, user_id, course_id, status, progress_percent, enrolled_at, started_at, completed_at, expires_at, score, synced_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE
                   status = VALUES(status),
                   progress_percent = VALUES(progress_percent),
                   completed_at = VALUES(completed_at),
                   expires_at = VALUES(expires_at),
                   score = VALUES(score),
                   synced_at = NOW()`,
                [
                  transcript.id,
                  user.id,
                  courseId,
                  progressStatus,
                  progressPercent,
                  attrs.enrolled_at ? new Date(attrs.enrolled_at) : null,
                  attrs.started_at ? new Date(attrs.started_at) : null,
                  attrs.completed_at ? new Date(attrs.completed_at) : null,
                  attrs.expires_at ? new Date(attrs.expires_at) : null,
                  attrs.score || null
                ]
              );

              if (result.insertId) {
                stats.enrollmentsAdded++;
              } else if (result.affectedRows > 0) {
                stats.enrollmentsUpdated++;
              }
            } catch (err) {
              // Foreign key constraint - course doesn't exist in lms_courses
              // This is expected for some old/deleted courses
            }
          } else {
            stats.enrollmentsAdded++;
          }
        }

        // Show some details about what was missing
        const completedMissing = missingTranscripts.filter(t => t.attributes.completed_at);
        if (completedMissing.length > 0) {
          console.log(`   ✅ ${completedMissing.length} completed courses were missing`);
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.log(`❌ ${user.email}: Error - ${err.message}`);
        stats.errors++;
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                      REPAIR SUMMARY                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`  Users processed:     ${stats.usersProcessed}`);
    console.log(`  Users with fixes:    ${stats.usersFixed}`);
    console.log(`  Enrollments added:   ${stats.enrollmentsAdded}`);
    console.log(`  Enrollments updated: ${stats.enrollmentsUpdated}`);
    console.log(`  Errors:              ${stats.errors}`);
    console.log(`  API calls made:      ${stats.apiCalls}`);
    console.log(`  Duration:            ${duration} seconds`);
    console.log('');
    if (isDryRun) {
      console.log('🔍 This was a DRY RUN - no changes were made.');
      console.log('   Run without --dry-run to apply fixes.');
    }

  } finally {
    await pool.end();
  }
}

main().catch(console.error);
