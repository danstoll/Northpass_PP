/**
 * Database Schema Setup
 * Creates all required tables for the Northpass Partner Portal
 */

const { query, transaction, getPool } = require('./connection.cjs');
const crypto = require('crypto');

const SCHEMA_VERSION = 4;

/**
 * Create all database tables
 */
async function createTables() {
  console.log('📦 Creating database tables...');
  
  // Schema version tracking
  await query(`
    CREATE TABLE IF NOT EXISTS schema_info (
      id INT PRIMARY KEY DEFAULT 1,
      version INT NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Partners (Accounts from Salesforce)
  await query(`
    CREATE TABLE IF NOT EXISTS partners (
      id INT AUTO_INCREMENT PRIMARY KEY,
      account_name VARCHAR(255) NOT NULL,
      partner_tier VARCHAR(50),
      account_region VARCHAR(100),
      account_owner VARCHAR(255),
      partner_type VARCHAR(100),
      website VARCHAR(500),
      salesforce_id VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_account (account_name),
      INDEX idx_tier (partner_tier),
      INDEX idx_region (account_region),
      INDEX idx_owner (account_owner),
      INDEX idx_salesforce (salesforce_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Contacts (from Salesforce)
  await query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      partner_id INT,
      email VARCHAR(255) NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      title VARCHAR(255),
      phone VARCHAR(50),
      is_primary BOOLEAN DEFAULT FALSE,
      lms_user_id VARCHAR(50),
      crm_last_modified TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_email (email),
      INDEX idx_partner (partner_id),
      INDEX idx_lms_user (lms_user_id),
      INDEX idx_crm_modified (crm_last_modified),
      FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // LMS Users (from Northpass)
  await query(`
    CREATE TABLE IF NOT EXISTS lms_users (
      id VARCHAR(50) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      created_at_lms TIMESTAMP NULL,
      last_active_at TIMESTAMP NULL,
      deactivated_at TIMESTAMP NULL,
      status VARCHAR(20) DEFAULT 'active',
      contact_id INT,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_email (email),
      INDEX idx_status (status),
      INDEX idx_contact (contact_id),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // LMS Groups (from Northpass)
  await query(`
    CREATE TABLE IF NOT EXISTS lms_groups (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      user_count INT DEFAULT 0,
      partner_id INT,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_name (name),
      INDEX idx_partner (partner_id),
      FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // LMS Group Members (many-to-many relationship)
  // pending_source: 'api' = confirmed from API sync, 'local' = added locally, pending API confirmation
  await query(`
    CREATE TABLE IF NOT EXISTS lms_group_members (
      group_id VARCHAR(50) NOT NULL,
      user_id VARCHAR(50) NOT NULL,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      pending_source VARCHAR(10) DEFAULT 'api',
      PRIMARY KEY (group_id, user_id),
      INDEX idx_user (user_id),
      INDEX idx_pending (pending_source),
      FOREIGN KEY (group_id) REFERENCES lms_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES lms_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // LMS Courses (from Northpass)
  await query(`
    CREATE TABLE IF NOT EXISTS lms_courses (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      product_category VARCHAR(100),
      npcu_value INT DEFAULT 0,
      duration_minutes INT,
      is_certification BOOLEAN DEFAULT FALSE,
      status VARCHAR(20) DEFAULT 'active',
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_category (product_category),
      INDEX idx_npcu (npcu_value),
      INDEX idx_certification (is_certification)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // LMS Enrollments (course progress/completions)
  await query(`
    CREATE TABLE IF NOT EXISTS lms_enrollments (
      id VARCHAR(50) PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      course_id VARCHAR(50) NOT NULL,
      status VARCHAR(20) DEFAULT 'enrolled',
      progress_percent INT DEFAULT 0,
      enrolled_at TIMESTAMP NULL,
      started_at TIMESTAMP NULL,
      completed_at TIMESTAMP NULL,
      expires_at TIMESTAMP NULL,
      score DECIMAL(5,2),
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_course (course_id),
      INDEX idx_status (status),
      INDEX idx_completed (completed_at),
      FOREIGN KEY (user_id) REFERENCES lms_users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES lms_courses(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Sync Logs (track sync operations)
  await query(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sync_type VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL,
      records_processed INT DEFAULT 0,
      records_created INT DEFAULT 0,
      records_updated INT DEFAULT 0,
      records_failed INT DEFAULT 0,
      error_message TEXT,
      details JSON,
      INDEX idx_type (sync_type),
      INDEX idx_status (status),
      INDEX idx_started (started_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Course Properties Cache (NPCU values)
  await query(`
    CREATE TABLE IF NOT EXISTS course_properties (
      course_id VARCHAR(50) PRIMARY KEY,
      npcu_value INT DEFAULT 0,
      property_data JSON,
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES lms_courses(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Admin Profiles (roles with permissions)
  await query(`
    CREATE TABLE IF NOT EXISTS admin_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      permissions JSON NOT NULL DEFAULT '{}',
      is_system BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Admin Users (authenticated users with profile assignments)
  await query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      profile_id INT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      last_login_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_by INT,
      INDEX idx_email (email),
      INDEX idx_profile (profile_id),
      INDEX idx_active (is_active),
      FOREIGN KEY (profile_id) REFERENCES admin_profiles(id) ON DELETE RESTRICT,
      FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Admin User Sessions (for token-based auth)
  await query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_token (token),
      INDEX idx_user (user_id),
      INDEX idx_expires (expires_at),
      FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Scheduled Sync Configuration
  await query(`
    CREATE TABLE IF NOT EXISTS sync_schedule (
      id INT PRIMARY KEY DEFAULT 1,
      enabled BOOLEAN DEFAULT FALSE,
      interval_hours INT DEFAULT 24,
      sync_types JSON DEFAULT '["users", "groups", "courses", "enrollments"]',
      sync_mode VARCHAR(20) DEFAULT 'incremental',
      last_scheduled_run TIMESTAMP NULL,
      next_scheduled_run TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Portal Settings (including tier NPCU requirements)
  await query(`
    CREATE TABLE IF NOT EXISTS portal_settings (
      id INT PRIMARY KEY DEFAULT 1,
      tier_requirements JSON DEFAULT '{"Registered": 5, "Certified": 10, "Select": 15, "Premier": 20, "Premier Plus": 20, "Aggregator": 5}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  
  // Initialize default portal settings if not exists
  await query(`
    INSERT IGNORE INTO portal_settings (id, tier_requirements) 
    VALUES (1, '{"Registered": 5, "Certified": 10, "Select": 15, "Premier": 20, "Premier Plus": 20, "Aggregator": 5}')
  `);

  console.log('✅ All tables created successfully');
}

/**
 * Initialize schema version
 */
async function initSchemaVersion() {
  const [rows] = await query('SELECT version FROM schema_info WHERE id = 1');
  if (!rows || rows.length === 0) {
    await query('INSERT INTO schema_info (id, version) VALUES (1, ?)', [SCHEMA_VERSION]);
  }
}

/**
 * Get current schema version
 */
async function getSchemaVersion() {
  try {
    const rows = await query('SELECT version FROM schema_info WHERE id = 1');
    return rows[0]?.version || 0;
  } catch {
    return 0;
  }
}

/**
 * Run all migrations
 */
async function runMigrations() {
  const currentVersion = await getSchemaVersion();
  
  if (currentVersion < SCHEMA_VERSION) {
    console.log(`📈 Running migrations from v${currentVersion} to v${SCHEMA_VERSION}...`);
    
    // Migration v1 -> v2: Add salesforce_id to partners and sync_schedule table
    if (currentVersion < 2) {
      console.log('  Migrating to v2...');
      
      // Add salesforce_id column if it doesn't exist
      try {
        await query(`ALTER TABLE partners ADD COLUMN salesforce_id VARCHAR(50) AFTER website`);
        await query(`ALTER TABLE partners ADD INDEX idx_salesforce (salesforce_id)`);
        console.log('  ✓ Added salesforce_id to partners');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log('  - salesforce_id already exists or error:', err.message);
        }
      }
      
      // Create sync_schedule table
      await query(`
        CREATE TABLE IF NOT EXISTS sync_schedule (
          id INT PRIMARY KEY DEFAULT 1,
          enabled BOOLEAN DEFAULT FALSE,
          interval_hours INT DEFAULT 24,
          sync_types JSON DEFAULT '["users", "groups", "courses", "enrollments"]',
          sync_mode VARCHAR(20) DEFAULT 'incremental',
          last_scheduled_run TIMESTAMP NULL,
          next_scheduled_run TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  ✓ Created sync_schedule table');
    }
    
    // Migration v2 -> v3: Add sync_mode column to sync_schedule
    if (currentVersion < 3) {
      console.log('  Migrating to v3...');
      
      // Add sync_mode column if it doesn't exist
      try {
        await query(`ALTER TABLE sync_schedule ADD COLUMN sync_mode VARCHAR(20) DEFAULT 'incremental' AFTER sync_types`);
        console.log('  ✓ Added sync_mode to sync_schedule');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log('  - sync_mode already exists or error:', err.message);
        }
      }
    }
    
    // Migration v3 -> v4: Add admin profiles and users tables with default data
    if (currentVersion < 4) {
      console.log('  Migrating to v4 (Admin users & profiles)...');
      
      // Insert default profiles
      const defaultProfiles = [
        {
          name: 'Admin',
          description: 'Full system access - can manage users, profiles, and all features',
          permissions: JSON.stringify({
            users: { view: true, create: true, edit: true, delete: true },
            profiles: { view: true, create: true, edit: true, delete: true },
            data_management: { view: true, import: true, sync: true },
            reports: { view: true, export: true },
            groups: { view: true, edit: true, match: true },
            user_management: { view: true, add_to_lms: true },
            maintenance: { view: true, execute: true },
            settings: { view: true, edit: true }
          }),
          is_system: true
        },
        {
          name: 'Channel Leadership',
          description: 'View reports and dashboards across all regions',
          permissions: JSON.stringify({
            users: { view: true, create: false, edit: false, delete: false },
            profiles: { view: true, create: false, edit: false, delete: false },
            data_management: { view: true, import: false, sync: false },
            reports: { view: true, export: true },
            groups: { view: true, edit: false, match: false },
            user_management: { view: true, add_to_lms: false },
            maintenance: { view: false, execute: false },
            settings: { view: false, edit: false }
          }),
          is_system: true
        },
        {
          name: 'Channel Manager',
          description: 'View and manage assigned partners and regions',
          permissions: JSON.stringify({
            users: { view: false, create: false, edit: false, delete: false },
            profiles: { view: false, create: false, edit: false, delete: false },
            data_management: { view: false, import: false, sync: false },
            reports: { view: true, export: false },
            groups: { view: true, edit: false, match: false },
            user_management: { view: true, add_to_lms: false },
            maintenance: { view: false, execute: false },
            settings: { view: false, edit: false }
          }),
          is_system: true
        }
      ];
      
      for (const profile of defaultProfiles) {
        try {
          await query(
            `INSERT INTO admin_profiles (name, description, permissions, is_system) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE description = VALUES(description), permissions = VALUES(permissions)`,
            [profile.name, profile.description, profile.permissions, profile.is_system]
          );
        } catch (err) {
          console.log(`  - Profile ${profile.name} error:`, err.message);
        }
      }
      console.log('  ✓ Created default profiles (Admin, Channel Leadership, Channel Manager)');
      
      // Create default admin user (password: Nintex2025!)
      const adminPassword = 'Nintex2025!';
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(adminPassword, salt, 10000, 64, 'sha512').toString('hex');
      const passwordHash = `${salt}:${hash}`;
      
      try {
        // Get Admin profile ID
        const [adminProfile] = await query('SELECT id FROM admin_profiles WHERE name = ?', ['Admin']);
        if (adminProfile) {
          await query(
            `INSERT INTO admin_users (email, password_hash, first_name, last_name, profile_id, is_active)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
            ['admin@nintex.com', passwordHash, 'System', 'Admin', adminProfile.id, true]
          );
          console.log('  ✓ Created default admin user (admin@nintex.com / Nintex2025!)');
        }
      } catch (err) {
        console.log('  - Admin user error:', err.message);
      }
    }
    
    await query('UPDATE schema_info SET version = ? WHERE id = 1', [SCHEMA_VERSION]);
    console.log(`✅ Migrations complete, now at v${SCHEMA_VERSION}`);
  }
}

/**
 * Initialize the database schema
 */
async function initializeSchema() {
  try {
    await createTables();
    await initSchemaVersion();
    await runMigrations();
    console.log('✅ Database schema initialized');
    return true;
  } catch (error) {
    console.error('❌ Schema initialization failed:', error);
    throw error;
  }
}

/**
 * Drop all tables (use with caution!)
 */
async function dropAllTables() {
  console.log('⚠️ Dropping all tables...');
  await query('SET FOREIGN_KEY_CHECKS = 0');
  await query('DROP TABLE IF EXISTS admin_sessions');
  await query('DROP TABLE IF EXISTS admin_users');
  await query('DROP TABLE IF EXISTS admin_profiles');
  await query('DROP TABLE IF EXISTS course_properties');
  await query('DROP TABLE IF EXISTS sync_logs');
  await query('DROP TABLE IF EXISTS sync_schedule');
  await query('DROP TABLE IF EXISTS lms_enrollments');
  await query('DROP TABLE IF EXISTS lms_group_members');
  await query('DROP TABLE IF EXISTS lms_groups');
  await query('DROP TABLE IF EXISTS lms_courses');
  await query('DROP TABLE IF EXISTS lms_users');
  await query('DROP TABLE IF EXISTS contacts');
  await query('DROP TABLE IF EXISTS partners');
  await query('DROP TABLE IF EXISTS schema_info');
  await query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('✅ All tables dropped');
}

module.exports = {
  initializeSchema,
  createTables,
  getSchemaVersion,
  dropAllTables,
  SCHEMA_VERSION
};
