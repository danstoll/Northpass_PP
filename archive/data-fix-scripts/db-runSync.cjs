/**
 * Robust LMS Sync Script
 * Run with: node server/db/runSync.cjs
 */

const lmsSync = require('./lmsSyncService.cjs');
const db = require('./connection.cjs');

async function runSync() {
  console.log('========================================');
  console.log('   NORTHPASS LMS FULL SYNC');
  console.log('   Started:', new Date().toISOString());
  console.log('========================================\n');

  try {
    await db.initializePool();
    console.log('✅ Database connected\n');

    // Run sync step by step with progress
    const results = {};

    console.log('STEP 1/6: Syncing Users...');
    results.users = await lmsSync.syncUsers(null, (type, current, total) => {
      process.stdout.write(`\r  Progress: ${current}/${total} users`);
    });
    console.log(`\n  ✅ Users: ${results.users.processed} synced\n`);

    console.log('STEP 2/6: Syncing Groups...');
    results.groups = await lmsSync.syncGroups(null, (type, current, total) => {
      process.stdout.write(`\r  Progress: ${current}/${total} groups`);
    });
    console.log(`\n  ✅ Groups: ${results.groups.processed} synced\n`);

    console.log('STEP 3/6: Syncing Group Members...');
    results.groupMembers = await lmsSync.syncGroupMembers(null, (type, current, total) => {
      process.stdout.write(`\r  Progress: ${current}/${total} groups`);
    });
    console.log(`\n  ✅ Group Members: ${results.groupMembers.processed} synced\n`);

    console.log('STEP 4/6: Syncing Courses...');
    results.courses = await lmsSync.syncCourses(null);
    console.log(`  ✅ Courses: ${results.courses.processed} synced\n`);

    console.log('STEP 5/6: Syncing Course Properties (NPCU)...');
    results.courseProperties = await lmsSync.syncCourseProperties(null);
    console.log(`  ✅ Course Properties synced\n`);

    console.log('STEP 6/6: Syncing Enrollments (this takes a while)...');
    results.enrollments = await lmsSync.syncEnrollments(null, (type, current, total) => {
      process.stdout.write(`\r  Progress: ${current}/${total} users`);
    });
    console.log(`\n  ✅ Enrollments: ${results.enrollments.processed} synced\n`);

    // Link contacts to LMS users
    console.log('Linking contacts to LMS users...');
    results.contactsLinked = await lmsSync.linkContactsToLmsUsers();
    console.log(`  ✅ Linked ${results.contactsLinked.linked} contacts\n`);

    console.log('========================================');
    console.log('   SYNC COMPLETE!');
    console.log('   Finished:', new Date().toISOString());
    console.log('========================================');
    console.log('\nSummary:');
    console.log(JSON.stringify(results, null, 2));

  } catch (error) {
    console.error('\n❌ SYNC FAILED:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

runSync();
