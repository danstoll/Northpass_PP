/**
 * Add Partner Account Manager profile to the database
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const config = require('./server/config.cjs');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: 5
});

async function run() {
  const conn = await pool.getConnection();
  try {
    // Check existing profiles
    console.log('=== Current Profiles ===');
    const [profiles] = await conn.query('SELECT id, name, description FROM admin_profiles');
    profiles.forEach(p => {
      console.log(`  [${p.id}] ${p.name}`);
    });
    
    // Check if PAM profile already exists
    const [existing] = await conn.query('SELECT id FROM admin_profiles WHERE name = ?', ['Partner Account Manager']);
    
    if (existing.length > 0) {
      console.log('\n✓ Partner Account Manager profile already exists (ID: ' + existing[0].id + ')');
      
      // Update permissions to ensure all 3 reports access
      const pamPermissions = JSON.stringify({
        users: { view: false, create: false, edit: false, delete: false },
        profiles: { view: false, create: false, edit: false, delete: false },
        data_management: { view: false, import: false, sync: false },
        reports: { view: true, export: true },
        analytics: { view: true, export: true },
        owner_report: { view: true, export: true },
        groups: { view: true, edit: false, match: false },
        user_management: { view: true, add_to_lms: false },
        maintenance: { view: false, execute: false },
        settings: { view: false, edit: false }
      });
      
      await conn.query(
        'UPDATE admin_profiles SET permissions = ?, description = ? WHERE id = ?',
        [pamPermissions, 'Access to all reports (Owner Report, Analytics, DB Reports) for assigned partners', existing[0].id]
      );
      console.log('✓ Updated Partner Account Manager permissions');
    } else {
      // Create new PAM profile
      const pamPermissions = JSON.stringify({
        users: { view: false, create: false, edit: false, delete: false },
        profiles: { view: false, create: false, edit: false, delete: false },
        data_management: { view: false, import: false, sync: false },
        reports: { view: true, export: true },
        analytics: { view: true, export: true },
        owner_report: { view: true, export: true },
        groups: { view: true, edit: false, match: false },
        user_management: { view: true, add_to_lms: false },
        maintenance: { view: false, execute: false },
        settings: { view: false, edit: false }
      });
      
      const result = await conn.query(
        'INSERT INTO admin_profiles (name, description, permissions, is_system) VALUES (?, ?, ?, ?)',
        ['Partner Account Manager', 'Access to all reports (Owner Report, Analytics, DB Reports) for assigned partners', pamPermissions, true]
      );
      console.log('\n✓ Created Partner Account Manager profile (ID: ' + result.insertId + ')');
    }
    
    // Also ensure Channel Leadership has all report permissions
    console.log('\n=== Updating Channel Leadership permissions ===');
    const clPermissions = JSON.stringify({
      users: { view: true, create: false, edit: false, delete: false },
      profiles: { view: true, create: false, edit: false, delete: false },
      data_management: { view: true, import: false, sync: false },
      reports: { view: true, export: true },
      analytics: { view: true, export: true },
      owner_report: { view: true, export: true },
      groups: { view: true, edit: false, match: false },
      user_management: { view: true, add_to_lms: false },
      maintenance: { view: false, execute: false },
      settings: { view: false, edit: false }
    });
    
    await conn.query(
      'UPDATE admin_profiles SET permissions = ? WHERE name = ?',
      [clPermissions, 'Channel Leadership']
    );
    console.log('✓ Updated Channel Leadership permissions');
    
    // Show final state
    console.log('\n=== Final Profiles ===');
    const [finalProfiles] = await conn.query('SELECT id, name, description, permissions FROM admin_profiles');
    finalProfiles.forEach(p => {
      const perms = JSON.parse(p.permissions);
      console.log(`\n[${p.id}] ${p.name}`);
      console.log(`    ${p.description}`);
      console.log(`    Reports: view=${perms.reports?.view}, export=${perms.reports?.export}`);
      console.log(`    Analytics: view=${perms.analytics?.view}, export=${perms.analytics?.export}`);
      console.log(`    Owner Report: view=${perms.owner_report?.view}, export=${perms.owner_report?.export}`);
    });
    
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
