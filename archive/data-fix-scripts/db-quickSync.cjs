/**
 * Quick Sync Script - Focused on getting essential data
 * Syncs Users -> Courses -> Enrollments (skips problematic group member sync)
 * Uses INCREMENTAL sync by default for users and courses (only fetches changed data)
 */

const { initializePool, closePool, query } = require('./connection.cjs');
const { initializeSchema } = require('./schema.cjs');
const { 
  syncUsers,
  syncUsersIncremental,
  syncCourses,
  syncCoursesIncremental,
  syncCourseProperties, 
  syncEnrollments,
  linkContactsToLmsUsers 
} = require('./lmsSyncService.cjs');

async function quickSync(options = { incremental: true }) {
  const mode = options.incremental ? 'incremental' : 'full';
  console.log(`🚀 Starting Quick Sync (${mode} mode)...\n`);
  const startTime = Date.now();
  
  try {
    // Initialize
    await initializePool();
    await initializeSchema();
    
    // Progress tracking
    const onProgress = (type, current, total) => {
      process.stdout.write(`  Progress: ${current}/${total} ${type}\r`);
    };
    
    // Step 1: Sync Users (incremental by default - huge performance win!)
    console.log(`\n📌 STEP 1/4: Syncing Users (${mode})...`);
    const syncUsersFn = options.incremental ? syncUsersIncremental : syncUsers;
    const userStats = await syncUsersFn(null, onProgress);
    if (userStats.skipped !== undefined) {
      console.log(`  ✅ Users: ${userStats.processed} synced, ${userStats.skipped} unchanged\n`);
    } else {
      console.log(`  ✅ Users: ${userStats.processed} synced\n`);
    }
    
    // Step 2: Sync Courses (incremental by default)
    console.log(`📌 STEP 2/4: Syncing Courses (${mode})...`);
    const syncCoursesFn = options.incremental ? syncCoursesIncremental : syncCourses;
    const courseStats = await syncCoursesFn(null, onProgress);
    if (courseStats.skipped !== undefined && options.incremental) {
      console.log(`  ✅ Courses: ${courseStats.processed} synced\n`);
    } else {
      console.log(`  ✅ Courses: ${courseStats.processed} synced\n`);
    }
    
    // Step 3: Sync Course Properties (NPCU values)
    console.log('📌 STEP 3/4: Syncing Course Properties...');
    const propStats = await syncCourseProperties(null, onProgress);
    console.log(`  ✅ Properties: ${propStats.processed} synced\n`);
    
    // Step 4: Sync Enrollments (transcripts)
    console.log('📌 STEP 4/4: Syncing Enrollments...');
    const enrollStats = await syncEnrollments(null, onProgress);
    console.log(`  ✅ Enrollments: ${enrollStats.processed} synced\n`);
    
    // Bonus: Link contacts to LMS users
    console.log('🔗 Linking contacts to LMS users...');
    const linkResult = await linkContactsToLmsUsers();
    
    // Summary
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log('\n' + '='.repeat(50));
    console.log('✅ QUICK SYNC COMPLETE');
    console.log('='.repeat(50));
    console.log(`  Users:       ${userStats.processed}`);
    console.log(`  Courses:     ${courseStats.processed}`);
    console.log(`  Properties:  ${propStats.processed}`);
    console.log(`  Enrollments: ${enrollStats.processed}`);
    console.log(`  Duration:    ${duration}s`);
    console.log('='.repeat(50));
    
    // Print table counts
    const [users] = await query('SELECT COUNT(*) as cnt FROM lms_users');
    const [courses] = await query('SELECT COUNT(*) as cnt FROM lms_courses');
    const [enrollments] = await query('SELECT COUNT(*) as cnt FROM lms_enrollments');
    const [certCourses] = await query('SELECT COUNT(*) as cnt FROM lms_courses WHERE is_certification = 1');
    
    console.log('\n📊 DATABASE TOTALS:');
    console.log(`  LMS Users:      ${users[0].cnt}`);
    console.log(`  Courses:        ${courses[0].cnt}`);
    console.log(`  Cert Courses:   ${certCourses[0].cnt} (NPCU > 0)`);
    console.log(`  Enrollments:    ${enrollments[0].cnt}`);
    
    return { success: true, duration };
    
  } catch (error) {
    console.error('❌ Quick sync failed:', error);
    return { success: false, error: error.message };
  } finally {
    await closePool();
  }
}

// Run if called directly
if (require.main === module) {
  quickSync()
    .then(result => process.exit(result.success ? 0 : 1))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { quickSync };
