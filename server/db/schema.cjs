/**
 * Database Schema Setup
 * Creates all required tables for the Northpass Partner Portal
 */

const { query, transaction, getPool } = require('./connection.cjs');
const crypto = require('crypto');

const SCHEMA_VERSION = 33;

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
      last_checked_at TIMESTAMP NULL,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_name (name),
      INDEX idx_partner (partner_id),
      INDEX idx_last_checked (last_checked_at),
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

  // Dismissed Orphans (users dismissed from orphan discovery)
  await query(`
    CREATE TABLE IF NOT EXISTS dismissed_orphans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      partner_id INT NOT NULL,
      reason VARCHAR(255),
      dismissed_by VARCHAR(255),
      dismissed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_partner (user_id, partner_id),
      INDEX idx_user (user_id),
      INDEX idx_partner (partner_id),
      FOREIGN KEY (user_id) REFERENCES lms_users(id) ON DELETE CASCADE,
      FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Partner Account Managers (PAMs) - links admin users to partners/regions
  await query(`
    CREATE TABLE IF NOT EXISTS partner_managers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin_user_id INT,
      owner_name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      is_active_pam BOOLEAN DEFAULT TRUE,
      region VARCHAR(100),
      notes TEXT,
      email_reports_enabled BOOLEAN DEFAULT TRUE,
      report_frequency ENUM('daily', 'weekly', 'monthly') DEFAULT 'weekly',
      last_report_sent TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_owner (owner_name),
      INDEX idx_admin_user (admin_user_id),
      INDEX idx_active (is_active_pam),
      INDEX idx_email (email),
      FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Email configuration settings
  await query(`
    CREATE TABLE IF NOT EXISTS email_settings (
      id INT PRIMARY KEY DEFAULT 1,
      smtp_host VARCHAR(255),
      smtp_port INT DEFAULT 587,
      smtp_user VARCHAR(255),
      smtp_pass VARCHAR(255),
      from_email VARCHAR(255),
      from_name VARCHAR(255) DEFAULT 'Nintex Partner Portal',
      enabled BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Email log (track sent emails)
  await query(`
    CREATE TABLE IF NOT EXISTS email_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      recipient_email VARCHAR(255) NOT NULL,
      recipient_name VARCHAR(255),
      subject VARCHAR(500),
      email_type VARCHAR(50),
      status ENUM('sent', 'failed', 'pending') DEFAULT 'pending',
      error_message TEXT,
      sent_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_recipient (recipient_email),
      INDEX idx_type (email_type),
      INDEX idx_status (status),
      INDEX idx_sent (sent_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Notification templates (email/slack message content)
  await query(`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      template_key VARCHAR(50) NOT NULL UNIQUE,
      template_name VARCHAR(100) NOT NULL,
      comm_type ENUM('email', 'slack', 'system') NOT NULL,
      subject VARCHAR(500),
      content TEXT NOT NULL,
      description TEXT,
      variables JSON,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_key (template_key),
      INDEX idx_comm_type (comm_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
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
          description: 'Full access to all reports, analytics, and dashboards across all regions',
          permissions: JSON.stringify({
            users: { view: true, create: false, edit: false, delete: false },
            profiles: { view: true, create: false, edit: false, delete: false },
            data_management: { view: true, import: false, sync: false },
            reports: { view: true, export: true },
            analytics: { view: true, export: true },
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
    
    // Migration v4 -> v5: Add dismissed_orphans table
    if (currentVersion < 5) {
      console.log('  Migrating to v5 (dismissed orphans table)...');
      
      await query(`
        CREATE TABLE IF NOT EXISTS dismissed_orphans (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(50) NOT NULL,
          partner_id INT NOT NULL,
          reason VARCHAR(255),
          dismissed_by VARCHAR(255),
          dismissed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_partner (user_id, partner_id),
          INDEX idx_user (user_id),
          INDEX idx_partner (partner_id),
          FOREIGN KEY (user_id) REFERENCES lms_users(id) ON DELETE CASCADE,
          FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  ✓ Created dismissed_orphans table');
    }
    
    // Migration v5 -> v6: Add PAM management and email tables
    if (currentVersion < 6) {
      console.log('  Migrating to v6 (PAM management & email)...');
      
      // Partner Account Managers table
      await query(`
        CREATE TABLE IF NOT EXISTS partner_managers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          admin_user_id INT,
          owner_name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          is_active_pam BOOLEAN DEFAULT TRUE,
          region VARCHAR(100),
          notes TEXT,
          email_reports_enabled BOOLEAN DEFAULT TRUE,
          report_frequency ENUM('daily', 'weekly', 'monthly') DEFAULT 'weekly',
          last_report_sent TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_owner (owner_name),
          INDEX idx_admin_user (admin_user_id),
          INDEX idx_active (is_active_pam),
          INDEX idx_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  ✓ Created partner_managers table');
      
      // Email settings table
      await query(`
        CREATE TABLE IF NOT EXISTS email_settings (
          id INT PRIMARY KEY DEFAULT 1,
          smtp_host VARCHAR(255),
          smtp_port INT DEFAULT 587,
          smtp_user VARCHAR(255),
          smtp_pass VARCHAR(255),
          from_email VARCHAR(255),
          from_name VARCHAR(255) DEFAULT 'Nintex Partner Portal',
          enabled BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  ✓ Created email_settings table');
      
      // Email log table
      await query(`
        CREATE TABLE IF NOT EXISTS email_log (
          id INT AUTO_INCREMENT PRIMARY KEY,
          recipient_email VARCHAR(255) NOT NULL,
          recipient_name VARCHAR(255),
          subject VARCHAR(500),
          email_type VARCHAR(50),
          status ENUM('sent', 'failed', 'pending') DEFAULT 'pending',
          error_message TEXT,
          sent_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_recipient (recipient_email),
          INDEX idx_type (email_type),
          INDEX idx_status (status),
          INDEX idx_sent (sent_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  ✓ Created email_log table');
      
      // Import existing account owners as potential PAMs
      try {
        await query(`
          INSERT IGNORE INTO partner_managers (owner_name, region, is_active_pam)
          SELECT DISTINCT account_owner, account_region, FALSE
          FROM partners
          WHERE account_owner IS NOT NULL AND account_owner != ''
        `);
        console.log('  ✓ Imported existing account owners as potential PAMs');
      } catch (err) {
        console.log('  - Owner import note:', err.message);
      }
    }
    
    // Version 7: Add enrollment_synced_at to lms_users for incremental enrollment sync
    if (currentVersion < 7) {
      console.log('📦 Running v7 migration: Add enrollment_synced_at column...');
      
      // Add enrollment_synced_at column to track when each user's enrollments were last synced
      try {
        await query(`
          ALTER TABLE lms_users 
          ADD COLUMN enrollment_synced_at DATETIME NULL DEFAULT NULL
          AFTER synced_at
        `);
        console.log('  ✓ Added enrollment_synced_at column to lms_users');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          throw err;
        }
        console.log('  - enrollment_synced_at column already exists');
      }
      
      // Add index for efficient queries
      try {
        await query(`
          ALTER TABLE lms_users 
          ADD INDEX idx_enrollment_sync (enrollment_synced_at)
        `);
        console.log('  ✓ Added index on enrollment_synced_at');
      } catch (err) {
        if (!err.message.includes('Duplicate key name')) {
          console.log('  - Index note:', err.message);
        }
      }
    }
    
    // Version 8: Add individual sync tasks for unified dashboard
    if (currentVersion < 8) {
      console.log('📦 Running v8 migration: Add individual sync tasks...');
      
      const individualTasks = [
        { type: 'sync_users', name: 'Sync Users', interval: 120, icon: '👥', description: 'Sync LMS users from Northpass (incremental)', config: { mode: 'incremental' } },
        { type: 'sync_groups', name: 'Sync Groups', interval: 120, icon: '🏢', description: 'Sync LMS groups and memberships (incremental)', config: { mode: 'incremental' } },
        { type: 'sync_courses', name: 'Sync Courses', interval: 240, icon: '📚', description: 'Sync course catalog from Northpass (incremental)', config: { mode: 'incremental' } },
        { type: 'sync_npcu', name: 'Sync NPCU', interval: 360, icon: '🎓', description: 'Sync course properties (NPCU values)', config: {} },
        { type: 'sync_enrollments', name: 'Sync Enrollments', interval: 240, icon: '📊', description: 'Sync user enrollments and completions (incremental)', config: { mode: 'incremental', maxAgeDays: 7 } }
      ];
      
      for (const task of individualTasks) {
        try {
          await query(`
            INSERT INTO scheduled_tasks (task_type, task_name, enabled, interval_minutes, config)
            VALUES (?, ?, FALSE, ?, ?)
            ON DUPLICATE KEY UPDATE 
              task_name = VALUES(task_name),
              interval_minutes = VALUES(interval_minutes),
              config = VALUES(config)
          `, [task.type, task.name, task.interval, JSON.stringify(task.config)]);
          console.log(`  ✓ Added ${task.name} task`);
        } catch (err) {
          console.log(`  - ${task.name}: ${err.message}`);
        }
      }
      
      console.log('  ✓ Individual sync tasks created');
    }
    
    // Version 9: Add notification templates table with default templates
    if (currentVersion < 9) {
      console.log('📦 Running v9 migration: Add notification templates...');
      
      // Create notification_templates table
      await query(`
        CREATE TABLE IF NOT EXISTS notification_templates (
          id INT AUTO_INCREMENT PRIMARY KEY,
          template_key VARCHAR(50) NOT NULL UNIQUE,
          template_name VARCHAR(100) NOT NULL,
          comm_type ENUM('email', 'slack', 'system') NOT NULL,
          subject VARCHAR(500),
          content TEXT NOT NULL,
          description TEXT,
          variables JSON,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_key (template_key),
          INDEX idx_comm_type (comm_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  ✓ Created notification_templates table');
      
      // Insert default templates
      const defaultTemplates = [
        {
          key: 'pam_weekly_report',
          name: 'PAM Weekly Report',
          commType: 'email',
          subject: 'Weekly Partner Report - {{reportDate}}',
          content: `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
  <div style="background: linear-gradient(135deg, #6B4C9A, #FF6B35); padding: 20px; color: white;">
    <h1 style="margin: 0;">Weekly Partner Report</h1>
    <p style="margin: 5px 0 0 0; opacity: 0.9;">{{reportDate}}</p>
  </div>
  <div style="padding: 20px;">
    <p>Hi {{pamFirstName}},</p>
    <p>Here's your weekly summary of partner activity:</p>
    {{partnerTable}}
    {{expiringCertsSection}}
    <p style="color: #666; font-size: 12px; margin-top: 30px;">
      This report was generated automatically by the Nintex Partner Portal.
    </p>
  </div>
</div>`,
          description: 'Weekly email report sent to Partner Account Managers',
          variables: JSON.stringify(['reportDate', 'pamFirstName', 'partnerTable', 'expiringCertsSection'])
        },
        {
          key: 'sync_error_alert',
          name: 'Sync Error Alert',
          commType: 'system',
          subject: null,
          content: `🚨 *Sync Task Failed*

*Task:* {{taskName}}
*Error:* {{errorMessage}}
*Time:* {{timestamp}}
*Duration:* {{duration}} seconds

Please check the sync dashboard for details.`,
          description: 'System alert sent to #partnerteam when a sync task fails',
          variables: JSON.stringify(['taskName', 'errorMessage', 'timestamp', 'duration'])
        },
        {
          key: 'sync_success_summary',
          name: 'Daily Sync Summary',
          commType: 'system',
          subject: null,
          content: `✅ *Daily Sync Summary*

{{summaryContent}}

_Generated at {{timestamp}}_`,
          description: 'Daily summary of sync operations (optional)',
          variables: JSON.stringify(['summaryContent', 'timestamp'])
        },
        {
          key: 'user_welcome',
          name: 'User Welcome Message',
          commType: 'slack',
          subject: null,
          content: `👋 *Welcome to the Partner Portal!*

Hi {{userName}}, you've been added to the {{partnerName}} partner group.

Get started by completing your certifications to help your team meet NPCU goals.`,
          description: 'Slack message sent when a new user is added to a partner group',
          variables: JSON.stringify(['userName', 'partnerName'])
        }
      ];
      
      for (const tpl of defaultTemplates) {
        try {
          await query(`
            INSERT INTO notification_templates (template_key, template_name, comm_type, subject, content, description, variables)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE template_name = VALUES(template_name)
          `, [tpl.key, tpl.name, tpl.commType, tpl.subject, tpl.content, tpl.description, tpl.variables]);
        } catch (err) {
          console.log(`  - Template ${tpl.key}: ${err.message}`);
        }
      }
      console.log('  ✓ Added default notification templates');
    }
    
    // Version 10: Add Impartner CRM sync task
    if (currentVersion < 10) {
      console.log('📦 Running v10 migration: Add Impartner sync task...');
      
      try {
        await query(`
          INSERT INTO scheduled_tasks (task_type, task_name, enabled, interval_minutes, config)
          VALUES ('impartner_sync', 'Impartner CRM Sync', FALSE, 360, '{"mode": "incremental"}')
          ON DUPLICATE KEY UPDATE 
            task_name = VALUES(task_name),
            interval_minutes = VALUES(interval_minutes),
            config = VALUES(config)
        `);
        console.log('  ✓ Added Impartner CRM sync task (6-hour interval, disabled by default)');
      } catch (err) {
        console.log(`  - Impartner sync task: ${err.message}`);
      }
    }
    
    // Version 11: Add partner family support for GSIs and multi-location partners
    if (currentVersion < 11) {
      console.log('📦 Running v11 migration: Add partner family support...');
      
      // Add columns for parent/child relationships and family grouping
      const partnerColumns = [
        { name: 'parent_partner_id', def: 'INT NULL AFTER salesforce_id' },
        { name: 'impartner_parent_id', def: 'INT NULL AFTER parent_partner_id' },
        { name: 'partner_family', def: 'VARCHAR(100) NULL AFTER impartner_parent_id' },
        { name: 'is_gsi', def: 'BOOLEAN DEFAULT FALSE AFTER partner_family' },
        { name: 'is_family_head', def: 'BOOLEAN DEFAULT FALSE AFTER is_gsi' }
      ];
      
      for (const col of partnerColumns) {
        try {
          await query(`ALTER TABLE partners ADD COLUMN ${col.name} ${col.def}`);
          console.log(`  ✓ Added partners.${col.name}`);
        } catch (err) {
          if (!err.message.includes('Duplicate column')) {
            console.log(`  - partners.${col.name}: ${err.message}`);
          }
        }
      }
      
      // Add indexes for family lookups
      try {
        await query('ALTER TABLE partners ADD INDEX idx_parent_partner (parent_partner_id)');
        console.log('  ✓ Added index idx_parent_partner');
      } catch (err) {
        if (!err.message.includes('Duplicate key')) {
          console.log(`  - idx_parent_partner: ${err.message}`);
        }
      }
      
      try {
        await query('ALTER TABLE partners ADD INDEX idx_partner_family (partner_family)');
        console.log('  ✓ Added index idx_partner_family');
      } catch (err) {
        if (!err.message.includes('Duplicate key')) {
          console.log(`  - idx_partner_family: ${err.message}`);
        }
      }
      
      try {
        await query('ALTER TABLE partners ADD INDEX idx_is_gsi (is_gsi)');
        console.log('  ✓ Added index idx_is_gsi');
      } catch (err) {
        if (!err.message.includes('Duplicate key')) {
          console.log(`  - idx_is_gsi: ${err.message}`);
        }
      }
      
      // Add foreign key for parent relationship (self-referential)
      try {
        await query('ALTER TABLE partners ADD CONSTRAINT fk_parent_partner FOREIGN KEY (parent_partner_id) REFERENCES partners(id) ON DELETE SET NULL');
        console.log('  ✓ Added foreign key fk_parent_partner');
      } catch (err) {
        if (!err.message.includes('Duplicate')) {
          console.log(`  - fk_parent_partner: ${err.message}`);
        }
      }
      
      // Create partner_families table for managing family configurations
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS partner_families (
            id INT AUTO_INCREMENT PRIMARY KEY,
            family_name VARCHAR(100) NOT NULL UNIQUE,
            display_name VARCHAR(255),
            is_gsi BOOLEAN DEFAULT FALSE,
            allow_cross_group_users BOOLEAN DEFAULT FALSE COMMENT 'Allow users to be in multiple groups within family',
            aggregate_reporting BOOLEAN DEFAULT TRUE COMMENT 'Show roll-up metrics for the family',
            head_partner_id INT NULL COMMENT 'Primary/HQ partner for this family',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_family_name (family_name),
            INDEX idx_is_gsi (is_gsi),
            FOREIGN KEY (head_partner_id) REFERENCES partners(id) ON DELETE SET NULL
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('  ✓ Created partner_families table');
      } catch (err) {
        console.log(`  - partner_families table: ${err.message}`);
      }
      
      // Create shared_users table to track users shared across family members
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS shared_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lms_user_id VARCHAR(50) NOT NULL,
            partner_family VARCHAR(100) NOT NULL,
            is_shared BOOLEAN DEFAULT TRUE COMMENT 'True = shared resource, excluded from individual metrics',
            assigned_partner_id INT NULL COMMENT 'If assigned, which partner they primarily belong to',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_family (lms_user_id, partner_family),
            INDEX idx_partner_family (partner_family),
            INDEX idx_assigned_partner (assigned_partner_id),
            FOREIGN KEY (lms_user_id) REFERENCES lms_users(id) ON DELETE CASCADE,
            FOREIGN KEY (assigned_partner_id) REFERENCES partners(id) ON DELETE SET NULL
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('  ✓ Created shared_users table');
      } catch (err) {
        console.log(`  - shared_users table: ${err.message}`);
      }
      
      console.log('  ✓ Partner family support migration complete');
    }
    
    // Migration v12: Add certification categories
    if (currentVersion < 12) {
      console.log('📦 Running migration v12: Certification categories...');
      
      // Add certification_category column to lms_courses
      const certCatColumns = [
        { name: 'certification_category', type: "VARCHAR(50) DEFAULT NULL COMMENT 'nintex_ce, nintex_k2, nintex_salesforce, go_to_market'" },
      ];
      
      for (const col of certCatColumns) {
        try {
          await query(`ALTER TABLE lms_courses ADD COLUMN ${col.name} ${col.type}`);
          console.log(`  ✓ Added column lms_courses.${col.name}`);
        } catch (err) {
          if (!err.message.includes('Duplicate column')) {
            console.log(`  - lms_courses.${col.name}: ${err.message}`);
          }
        }
      }
      
      // Add index for certification_category
      try {
        await query('ALTER TABLE lms_courses ADD INDEX idx_cert_category (certification_category)');
        console.log('  ✓ Added index idx_cert_category');
      } catch (err) {
        if (!err.message.includes('Duplicate key')) {
          console.log(`  - idx_cert_category: ${err.message}`);
        }
      }
      
      // Create certification_category_rules table for auto-categorization patterns
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS certification_category_rules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            category VARCHAR(50) NOT NULL COMMENT 'nintex_ce, nintex_k2, nintex_salesforce, go_to_market',
            pattern VARCHAR(255) NOT NULL COMMENT 'Pattern to match in course name (case-insensitive)',
            priority INT DEFAULT 0 COMMENT 'Higher priority rules are applied first',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_category (category),
            INDEX idx_priority (priority DESC)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('  ✓ Created certification_category_rules table');
        
        // Insert default categorization rules
        const defaultRules = [
          // K2 rules (highest priority - specific product)
          { category: 'nintex_k2', pattern: 'K2', priority: 100 },
          { category: 'nintex_k2', pattern: 'Automation K2', priority: 100 },
          
          // Salesforce rules (high priority - specific product)
          { category: 'nintex_salesforce', pattern: 'Salesforce', priority: 90 },
          { category: 'nintex_salesforce', pattern: 'DocGen for Salesforce', priority: 90 },
          
          // GTM rules (medium-high priority)
          { category: 'go_to_market', pattern: 'Go to Market', priority: 80 },
          { category: 'go_to_market', pattern: 'GTM', priority: 80 },
          { category: 'go_to_market', pattern: 'Sales Professional', priority: 80 },
          { category: 'go_to_market', pattern: 'Sales Enablement', priority: 80 },
          
          // Nintex CE rules (lower priority - catch remaining)
          { category: 'nintex_ce', pattern: 'Automation Cloud', priority: 50 },
          { category: 'nintex_ce', pattern: 'Process Manager', priority: 50 },
          { category: 'nintex_ce', pattern: 'Promapp', priority: 50 },
          { category: 'nintex_ce', pattern: 'RPA', priority: 50 },
          { category: 'nintex_ce', pattern: 'eSign', priority: 50 },
          { category: 'nintex_ce', pattern: 'Apps', priority: 50 },
          { category: 'nintex_ce', pattern: 'Office 365', priority: 50 },
          { category: 'nintex_ce', pattern: 'SharePoint', priority: 50 },
          { category: 'nintex_ce', pattern: 'Xtensions', priority: 50 },
          { category: 'nintex_ce', pattern: 'Process Discovery', priority: 50 },
        ];
        
        for (const rule of defaultRules) {
          await query(
            'INSERT INTO certification_category_rules (category, pattern, priority) VALUES (?, ?, ?)',
            [rule.category, rule.pattern, rule.priority]
          );
        }
        console.log(`  ✓ Inserted ${defaultRules.length} default categorization rules`);
        
      } catch (err) {
        console.log(`  - certification_category_rules table: ${err.message}`);
      }
      
      // Add certification count columns to partners for Impartner sync
      const partnerCertColumns = [
        { name: 'cert_count_nintex_ce', type: 'INT DEFAULT 0 COMMENT "Count of Nintex CE certifications"' },
        { name: 'cert_count_nintex_k2', type: 'INT DEFAULT 0 COMMENT "Count of Nintex K2 certifications"' },
        { name: 'cert_count_nintex_salesforce', type: 'INT DEFAULT 0 COMMENT "Count of Nintex for Salesforce certifications"' },
        { name: 'cert_count_go_to_market', type: 'INT DEFAULT 0 COMMENT "Count of Go To Market certifications"' },
        { name: 'has_gtm_certification', type: 'BOOLEAN DEFAULT FALSE COMMENT "Partner has at least one GTM certification"' },
        { name: 'cert_counts_updated_at', type: 'TIMESTAMP NULL COMMENT "Last time cert counts were calculated"' },
        { name: 'total_npcu', type: 'INT DEFAULT 0 COMMENT "Total NPCU credits for the partner"' },
      ];
      
      for (const col of partnerCertColumns) {
        try {
          await query(`ALTER TABLE partners ADD COLUMN ${col.name} ${col.type}`);
          console.log(`  ✓ Added column partners.${col.name}`);
        } catch (err) {
          if (!err.message.includes('Duplicate column')) {
            console.log(`  - partners.${col.name}: ${err.message}`);
          }
        }
      }
      
      console.log('  ✓ Certification categories migration complete');
    }
    
    // Version 13: Add Sync to Impartner scheduled task
    if (currentVersion < 13) {
      console.log('📦 Running v13 migration: Add Sync to Impartner task...');
      
      try {
        await query(`
          INSERT INTO scheduled_tasks (task_type, task_name, enabled, interval_minutes, config)
          VALUES ('sync_to_impartner', 'Push to Impartner', FALSE, 360, '{"mode": "incremental"}')
          ON DUPLICATE KEY UPDATE 
            task_name = VALUES(task_name),
            interval_minutes = VALUES(interval_minutes),
            config = VALUES(config)
        `);
        console.log('  ✓ Added Sync to Impartner task (6-hour interval, incremental mode, disabled by default)');
      } catch (err) {
        console.log(`  - Sync to Impartner task: ${err.message}`);
      }
    }
    
    // Version 14: Add deletion tracking for Impartner sync
    if (currentVersion < 14) {
      console.log('📦 Running v14 migration: Add deletion tracking...');
      
      // Add is_active and deleted_at to partners
      const partnerDeleteColumns = [
        { name: 'is_active', def: 'BOOLEAN DEFAULT TRUE' },
        { name: 'deleted_at', def: 'TIMESTAMP NULL' },
        { name: 'impartner_id', def: 'INT NULL COMMENT "Impartner Account ID"' }
      ];
      
      for (const col of partnerDeleteColumns) {
        try {
          await query(`ALTER TABLE partners ADD COLUMN ${col.name} ${col.def}`);
          console.log(`  ✓ Added partners.${col.name}`);
        } catch (err) {
          if (!err.message.includes('Duplicate column')) {
            console.log(`  - partners.${col.name}: ${err.message}`);
          }
        }
      }
      
      // Add is_active and deleted_at to contacts
      const contactDeleteColumns = [
        { name: 'is_active', def: 'BOOLEAN DEFAULT TRUE' },
        { name: 'deleted_at', def: 'TIMESTAMP NULL' },
        { name: 'impartner_id', def: 'INT NULL COMMENT "Impartner User ID"' }
      ];
      
      for (const col of contactDeleteColumns) {
        try {
          await query(`ALTER TABLE contacts ADD COLUMN ${col.name} ${col.def}`);
          console.log(`  ✓ Added contacts.${col.name}`);
        } catch (err) {
          if (!err.message.includes('Duplicate column')) {
            console.log(`  - contacts.${col.name}: ${err.message}`);
          }
        }
      }
      
      // Add records_deleted to sync_logs
      try {
        await query(`ALTER TABLE sync_logs ADD COLUMN records_deleted INT DEFAULT 0 AFTER records_updated`);
        console.log('  ✓ Added sync_logs.records_deleted');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - sync_logs.records_deleted: ${err.message}`);
        }
      }
      
      // Add records_skipped to sync_logs
      try {
        await query(`ALTER TABLE sync_logs ADD COLUMN records_skipped INT DEFAULT 0 AFTER records_deleted`);
        console.log('  ✓ Added sync_logs.records_skipped');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - sync_logs.records_skipped: ${err.message}`);
        }
      }
      
      // Add indexes for deletion tracking
      try {
        await query('ALTER TABLE partners ADD INDEX idx_is_active (is_active)');
        console.log('  ✓ Added index partners.idx_is_active');
      } catch (err) {
        if (!err.message.includes('Duplicate key')) {
          console.log(`  - partners.idx_is_active: ${err.message}`);
        }
      }
      
      try {
        await query('ALTER TABLE contacts ADD INDEX idx_is_active (is_active)');
        console.log('  ✓ Added index contacts.idx_is_active');
      } catch (err) {
        if (!err.message.includes('Duplicate key')) {
          console.log(`  - contacts.idx_is_active: ${err.message}`);
        }
      }
      
      try {
        await query('ALTER TABLE partners ADD INDEX idx_impartner_id (impartner_id)');
        console.log('  ✓ Added index partners.idx_impartner_id');
      } catch (err) {
        if (!err.message.includes('Duplicate key')) {
          console.log(`  - partners.idx_impartner_id: ${err.message}`);
        }
      }
      
      try {
        await query('ALTER TABLE contacts ADD INDEX idx_impartner_id (impartner_id)');
        console.log('  ✓ Added index contacts.idx_impartner_id');
      } catch (err) {
        if (!err.message.includes('Duplicate key')) {
          console.log(`  - contacts.idx_impartner_id: ${err.message}`);
        }
      }
      
      console.log('  ✓ Deletion tracking migration complete');
    }
    
    // Version 15: Add account_status column to track Impartner status
    if (currentVersion < 15) {
      console.log('📦 Running v15 migration: Add account_status tracking...');
      
      // Add account_status to partners table
      try {
        await query(`ALTER TABLE partners ADD COLUMN account_status VARCHAR(50) DEFAULT 'Active' AFTER partner_tier`);
        console.log('  ✓ Added partners.account_status');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - partners.account_status: ${err.message}`);
        }
      }
      
      // Add index for account_status
      try {
        await query('ALTER TABLE partners ADD INDEX idx_account_status (account_status)');
        console.log('  ✓ Added index partners.idx_account_status');
      } catch (err) {
        if (!err.message.includes('Duplicate key')) {
          console.log(`  - partners.idx_account_status: ${err.message}`);
        }
      }
      
      console.log('  ✓ Account status tracking migration complete');
    }
    
    // Version 16: Add performance indexes for analytics queries
    if (currentVersion < 16) {
      console.log('📦 Running v16 migration: Add analytics performance indexes...');
      
      // Composite indexes for common analytics joins
      const indexes = [
        // lms_enrollments indexes for analytics
        { table: 'lms_enrollments', name: 'idx_enrollments_user_status', cols: '(user_id, status)' },
        { table: 'lms_enrollments', name: 'idx_enrollments_status_completed', cols: '(status, completed_at)' },
        { table: 'lms_enrollments', name: 'idx_enrollments_user_completed', cols: '(user_id, completed_at)' },
        { table: 'lms_enrollments', name: 'idx_enrollments_enrolled_at', cols: '(enrolled_at)' },
        
        // lms_users indexes for date-based queries
        { table: 'lms_users', name: 'idx_users_created_at', cols: '(created_at_lms)' },
        { table: 'lms_users', name: 'idx_users_last_active', cols: '(last_active_at)' },
        
        // lms_group_members composite for partner lookups
        { table: 'lms_group_members', name: 'idx_group_members_group_user', cols: '(group_id, user_id)' },
        
        // contacts indexes for LMS linkage
        { table: 'contacts', name: 'idx_contacts_partner_lms', cols: '(partner_id, lms_user_id)' },
        { table: 'contacts', name: 'idx_contacts_active_lms', cols: '(is_active, lms_user_id)' },
        
        // partners indexes for analytics
        { table: 'partners', name: 'idx_partners_active_tier', cols: '(is_active, partner_tier)' },
        { table: 'partners', name: 'idx_partners_active_region', cols: '(is_active, account_region)' },
        { table: 'partners', name: 'idx_partners_active_owner', cols: '(is_active, account_owner)' },
        { table: 'partners', name: 'idx_partners_total_npcu', cols: '(total_npcu)' },
        
        // lms_groups index for partner lookups
        { table: 'lms_groups', name: 'idx_groups_partner', cols: '(partner_id)' }
      ];
      
      for (const idx of indexes) {
        try {
          await query(`ALTER TABLE ${idx.table} ADD INDEX ${idx.name} ${idx.cols}`);
          console.log(`  ✓ Added index ${idx.table}.${idx.name}`);
        } catch (err) {
          if (!err.message.includes('Duplicate key')) {
            console.log(`  - ${idx.table}.${idx.name}: ${err.message}`);
          }
        }
      }
      
      console.log('  ✓ Analytics performance indexes migration complete');
    }
    
    // Version 17: Add country column to partners (account_region should be APAC/EMEA/AMER, country is mailing country)
    if (currentVersion < 17) {
      console.log('📦 Running v17 migration: Add country column and fix region mapping...');
      
      // Add country column to partners table
      try {
        await query(`ALTER TABLE partners ADD COLUMN country VARCHAR(100) AFTER account_region`);
        console.log('  ✓ Added partners.country');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - partners.country: ${err.message}`);
        }
      }
      
      // Add index for country
      try {
        await query('ALTER TABLE partners ADD INDEX idx_country (country)');
        console.log('  ✓ Added index partners.idx_country');
      } catch (err) {
        if (!err.message.includes('Duplicate key')) {
          console.log(`  - partners.idx_country: ${err.message}`);
        }
      }
      
      // Move country names from account_region to country column
      // This query identifies non-region values and moves them
      const validRegions = ['APAC', 'EMEA', 'AMER', 'MENA', 'Americas', 'Europe', 'Asia', 'LATAM'];
      try {
        // First, copy country data where account_region is NOT a standard region code
        await query(`
          UPDATE partners 
          SET country = account_region 
          WHERE account_region IS NOT NULL 
            AND account_region NOT IN ('APAC', 'EMEA', 'AMER', 'MENA', 'Americas', 'Europe', 'Asia', 'LATAM', '')
        `);
        console.log('  ✓ Copied country values from account_region to country');
        
        // Then clear account_region for non-region values (will be repopulated by Impartner sync)
        await query(`
          UPDATE partners 
          SET account_region = NULL 
          WHERE account_region IS NOT NULL 
            AND account_region NOT IN ('APAC', 'EMEA', 'AMER', 'MENA', 'Americas', 'Europe', 'Asia', 'LATAM', '')
        `);
        console.log('  ✓ Cleared non-region values from account_region');
      } catch (err) {
        console.log(`  - Data migration: ${err.message}`);
      }
      
      console.log('  ✓ Country/region mapping migration complete');
    }
    
    // Version 18: Add primary user (partner primary contact) columns
    if (currentVersion < 18) {
      console.log('📦 Running v18 migration: Add primary user columns...');
      
      // Add primary_user_name column to partners table
      try {
        await query(`ALTER TABLE partners ADD COLUMN primary_user_name VARCHAR(255) AFTER owner_email`);
        console.log('  ✓ Added partners.primary_user_name');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - partners.primary_user_name: ${err.message}`);
        }
      }
      
      // Add primary_user_email column to partners table
      try {
        await query(`ALTER TABLE partners ADD COLUMN primary_user_email VARCHAR(255) AFTER primary_user_name`);
        console.log('  ✓ Added partners.primary_user_email');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - partners.primary_user_email: ${err.message}`);
        }
      }
      
      // Add primary_user_id column (Impartner User ID for reference)
      try {
        await query(`ALTER TABLE partners ADD COLUMN primary_user_id INT AFTER primary_user_email`);
        console.log('  ✓ Added partners.primary_user_id');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - partners.primary_user_id: ${err.message}`);
        }
      }
      
      console.log('  ✓ Primary user migration complete');
    }
    
    // Version 19: Add login history tracking
    if (currentVersion < 19) {
      console.log('📦 Running v19 migration: Add login history tracking...');
      
      // Create login_history table
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS login_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL COMMENT 'NULL if login failed with unknown email',
            email VARCHAR(255) NOT NULL COMMENT 'Email used for login attempt',
            success BOOLEAN NOT NULL DEFAULT FALSE,
            failure_reason VARCHAR(100) NULL COMMENT 'wrong_password, invalid_email, account_disabled, etc.',
            ip_address VARCHAR(45) NULL COMMENT 'IPv4 or IPv6 address',
            user_agent TEXT NULL COMMENT 'Browser/client user agent string',
            login_method ENUM('password', 'magic_link', 'sso') DEFAULT 'password',
            session_id INT NULL COMMENT 'Reference to admin_sessions if login successful',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_id (user_id),
            INDEX idx_email (email),
            INDEX idx_success (success),
            INDEX idx_created_at (created_at),
            INDEX idx_ip_address (ip_address),
            FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE SET NULL
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('  ✓ Created login_history table');
      } catch (err) {
        console.log(`  - login_history table: ${err.message}`);
      }
      
      // Add indexes for reporting queries
      try {
        await query('ALTER TABLE login_history ADD INDEX idx_user_created (user_id, created_at)');
        console.log('  ✓ Added composite index idx_user_created');
      } catch (err) {
        if (!err.message.includes('Duplicate key')) {
          console.log(`  - idx_user_created: ${err.message}`);
        }
      }
      
      console.log('  ✓ Login history migration complete');
    }
    
    // Version 20: Add leads table for Impartner lead tracking
    if (currentVersion < 20) {
      console.log('📦 Running v20 migration: Add leads table...');
      
      // Create leads table
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS leads (
            id INT AUTO_INCREMENT PRIMARY KEY,
            impartner_id INT NOT NULL UNIQUE COMMENT 'Impartner Lead ID',
            partner_id INT NULL COMMENT 'Local partner ID (linked via partnerAccountId)',
            impartner_partner_id INT NULL COMMENT 'Impartner partnerAccountId',
            first_name VARCHAR(100),
            last_name VARCHAR(100),
            email VARCHAR(255),
            phone VARCHAR(50),
            title VARCHAR(255),
            company_name VARCHAR(255),
            status_id INT COMMENT 'Impartner status ID',
            status_name VARCHAR(100) COMMENT 'Resolved status name',
            source VARCHAR(255) COMMENT 'Lead source',
            description TEXT,
            crm_id VARCHAR(50) COMMENT 'Salesforce CRM ID if synced',
            lead_created_at TIMESTAMP NULL COMMENT 'When lead was created in Impartner',
            lead_updated_at TIMESTAMP NULL COMMENT 'When lead was last updated in Impartner',
            synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_partner_id (partner_id),
            INDEX idx_impartner_partner (impartner_partner_id),
            INDEX idx_status (status_id),
            INDEX idx_source (source),
            INDEX idx_lead_created (lead_created_at),
            INDEX idx_email (email),
            FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('  ✓ Created leads table');
      } catch (err) {
        console.log(`  - leads table: ${err.message}`);
      }
      
      // Add lead count columns to partners for quick aggregation
      const leadColumns = [
        { name: 'lead_count', type: 'INT DEFAULT 0 COMMENT "Total leads for this partner"' },
        { name: 'leads_last_30_days', type: 'INT DEFAULT 0 COMMENT "Leads in last 30 days"' },
        { name: 'leads_updated_at', type: 'TIMESTAMP NULL COMMENT "When lead counts were last calculated"' }
      ];
      
      for (const col of leadColumns) {
        try {
          await query(`ALTER TABLE partners ADD COLUMN ${col.name} ${col.type}`);
          console.log(`  ✓ Added partners.${col.name}`);
        } catch (err) {
          if (!err.message.includes('Duplicate column')) {
            console.log(`  - partners.${col.name}: ${err.message}`);
          }
        }
      }
      
      // Add sync_leads task to scheduled_tasks
      try {
        await query(`
          INSERT INTO scheduled_tasks (task_type, task_name, enabled, interval_minutes, config)
          VALUES ('sync_leads', 'Sync Leads', FALSE, 360, '{"mode": "incremental"}')
          ON DUPLICATE KEY UPDATE 
            task_name = VALUES(task_name),
            interval_minutes = VALUES(interval_minutes)
        `);
        console.log('  ✓ Added sync_leads scheduled task');
      } catch (err) {
        console.log(`  - sync_leads task: ${err.message}`);
      }
      
      console.log('  ✓ Leads migration complete');
    }
    
    // Version 21: Add email schedule features
    if (currentVersion < 21) {
      console.log('📦 Running v21 migration: Add email schedule features...');
      
      // Add pam_id column to email_log table for tracking which PAM received the email
      try {
        await query(`ALTER TABLE email_log ADD COLUMN pam_id INT NULL AFTER status`);
        await query(`ALTER TABLE email_log ADD INDEX idx_pam_id (pam_id)`);
        console.log('  ✓ Added email_log.pam_id column');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - email_log.pam_id: ${err.message}`);
        }
      }
      
      // Add pam_weekly_report scheduled task
      try {
        await query(`
          INSERT INTO scheduled_tasks (task_type, task_name, enabled, interval_minutes, config)
          VALUES ('pam_weekly_report', 'PAM Weekly Reports', FALSE, 10080, '{}')
          ON DUPLICATE KEY UPDATE 
            task_name = VALUES(task_name),
            interval_minutes = VALUES(interval_minutes)
        `);
        console.log('  ✓ Added pam_weekly_report scheduled task');
      } catch (err) {
        console.log(`  - pam_weekly_report task: ${err.message}`);
      }
      
      console.log('  ✓ Email schedule migration complete');
    }
    
    // Version 22: Add daily full Impartner sync task for detecting inactive partners
    if (currentVersion < 22) {
      console.log('📦 Running v22 migration: Add daily full Impartner sync task...');
      
      try {
        await query(`
          INSERT INTO scheduled_tasks (task_type, task_name, enabled, interval_minutes, config)
          VALUES ('impartner_sync_full', 'Impartner Full Sync (Daily)', TRUE, 1440, '{"mode": "full"}')
          ON DUPLICATE KEY UPDATE 
            task_name = VALUES(task_name),
            interval_minutes = VALUES(interval_minutes),
            config = VALUES(config)
        `);
        console.log('  ✓ Added daily Impartner full sync task (24-hour interval, detects inactive partners)');
      } catch (err) {
        console.log(`  - Impartner full sync task: ${err.message}`);
      }
    }
    
    // Version 23: Add daily full sync tasks for leads (deletion detection)
    if (currentVersion < 23) {
      console.log('📦 Running v23 migration: Add daily full sync tasks for leads...');
      
      try {
        await query(`
          INSERT INTO scheduled_tasks (task_type, task_name, enabled, interval_minutes, config)
          VALUES ('sync_leads_full', 'Leads Full Sync (Daily)', TRUE, 1440, '{"mode": "full"}')
          ON DUPLICATE KEY UPDATE 
            task_name = VALUES(task_name),
            interval_minutes = VALUES(interval_minutes),
            config = VALUES(config)
        `);
        console.log('  ✓ Added daily leads full sync task (detects deleted/converted leads)');
      } catch (err) {
        console.log(`  - Leads full sync task: ${err.message}`);
      }
    }
    
    // Version 24: Add soft-delete and activity tracking for LMS groups and users
    if (currentVersion < 24) {
      console.log('📦 Running v24 migration: Add soft-delete and activity tracking...');
      
      // Add is_active and deleted tracking to lms_groups
      try {
        await query(`ALTER TABLE lms_groups ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER user_count`);
        console.log('  ✓ Added lms_groups.is_active column');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - lms_groups.is_active: ${err.message}`);
        }
      }
      
      try {
        await query(`ALTER TABLE lms_groups ADD COLUMN deleted_at TIMESTAMP NULL AFTER is_active`);
        console.log('  ✓ Added lms_groups.deleted_at column');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - lms_groups.deleted_at: ${err.message}`);
        }
      }
      
      try {
        await query(`ALTER TABLE lms_groups ADD COLUMN deletion_reason VARCHAR(255) NULL AFTER deleted_at`);
        console.log('  ✓ Added lms_groups.deletion_reason column');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - lms_groups.deletion_reason: ${err.message}`);
        }
      }
      
      try {
        await query(`ALTER TABLE lms_groups ADD COLUMN last_api_check TIMESTAMP NULL AFTER deletion_reason`);
        console.log('  ✓ Added lms_groups.last_api_check column');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - lms_groups.last_api_check: ${err.message}`);
        }
      }
      
      try {
        await query(`ALTER TABLE lms_groups ADD INDEX idx_is_active (is_active)`);
        console.log('  ✓ Added lms_groups.is_active index');
      } catch (err) {
        if (!err.message.includes('Duplicate key name')) {
          console.log(`  - lms_groups index: ${err.message}`);
        }
      }
      
      // Add is_active and status tracking to lms_users
      try {
        await query(`ALTER TABLE lms_users ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER synced_at`);
        console.log('  ✓ Added lms_users.is_active column');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - lms_users.is_active: ${err.message}`);
        }
      }
      
      try {
        await query(`ALTER TABLE lms_users ADD COLUMN deactivated_at TIMESTAMP NULL AFTER is_active`);
        console.log('  ✓ Added lms_users.deactivated_at column');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - lms_users.deactivated_at: ${err.message}`);
        }
      }
      
      try {
        await query(`ALTER TABLE lms_users ADD COLUMN deactivation_reason VARCHAR(255) NULL AFTER deactivated_at`);
        console.log('  ✓ Added lms_users.deactivation_reason column');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - lms_users.deactivation_reason: ${err.message}`);
        }
      }
      
      try {
        await query(`ALTER TABLE lms_users ADD COLUMN removed_from_all_partners BOOLEAN DEFAULT FALSE AFTER deactivation_reason`);
        console.log('  ✓ Added lms_users.removed_from_all_partners column');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          console.log(`  - lms_users.removed_from_all_partners: ${err.message}`);
        }
      }
      
      try {
        await query(`ALTER TABLE lms_users ADD INDEX idx_is_active (is_active)`);
        console.log('  ✓ Added lms_users.is_active index');
      } catch (err) {
        if (!err.message.includes('Duplicate key name')) {
          console.log(`  - lms_users index: ${err.message}`);
        }
      }
      
      // Create sync_failures table to track API failures
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS sync_failures (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sync_type VARCHAR(50) NOT NULL,
            entity_type VARCHAR(50) NOT NULL,
            entity_id VARCHAR(100) NOT NULL,
            entity_name VARCHAR(255),
            failure_reason VARCHAR(255) NOT NULL,
            http_status INT,
            error_details TEXT,
            occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP NULL,
            resolution_action VARCHAR(100),
            INDEX idx_sync_type (sync_type),
            INDEX idx_entity (entity_type, entity_id),
            INDEX idx_occurred (occurred_at),
            INDEX idx_unresolved (resolved_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('  ✓ Created sync_failures table');
      } catch (err) {
        console.log(`  - sync_failures table: ${err.message}`);
      }
      
      console.log('  ✓ Soft-delete and activity tracking migration complete');
    }

    // Version 25: Add executive report recipients table and scheduled task
    if (currentVersion < 25) {
      console.log('📦 Running v25 migration: Add executive report recipients...');

      // Executive report recipients table
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS executive_report_recipients (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            name VARCHAR(255),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_email (email),
            INDEX idx_active (is_active)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('  ✓ Created executive_report_recipients table');
      } catch (err) {
        console.log(`  - executive_report_recipients table: ${err.message}`);
      }

      // Add executive weekly report scheduled task
      try {
        await query(`
          INSERT INTO scheduled_tasks (task_type, task_name, enabled, interval_minutes, config)
          VALUES ('executive_weekly_report', 'Executive Weekly Report', FALSE, 10080, '{}')
          ON DUPLICATE KEY UPDATE task_name = task_name
        `);
        console.log('  ✓ Added executive_weekly_report scheduled task');
      } catch (err) {
        console.log(`  - executive_weekly_report task: ${err.message}`);
      }

      console.log('  ✓ Executive report migration complete');
    }

    // Version 26: Add performance indexes for sync and reporting
    if (currentVersion < 26) {
      console.log('📦 Running v26 migration: Add performance indexes for sync/reporting...');

      const perfIndexes = [
        // Critical for reporting queries - consolidates status + course + date lookups
        { table: 'lms_enrollments', name: 'idx_enrollments_reporting', cols: '(status, course_id, completed_at)' },

        // Critical for enrollment sync - expires_at lookups
        { table: 'lms_enrollments', name: 'idx_enrollments_expires', cols: '(expires_at)' },

        // Critical for sync - composite for faster user-group lookups
        { table: 'lms_group_members', name: 'idx_gm_user_group_added', cols: '(user_id, group_id, added_at)' },

        // Contacts composite for LMS linkage queries
        { table: 'contacts', name: 'idx_contacts_lms_partner', cols: '(lms_user_id, partner_id)' },

        // Partners composite for active partner reporting
        { table: 'partners', name: 'idx_partners_active_npcu', cols: '(is_active, total_npcu)' },

        // LMS courses composite for certification queries
        { table: 'lms_courses', name: 'idx_courses_cert_npcu', cols: '(certification_category, npcu_value)' },
      ];

      for (const idx of perfIndexes) {
        try {
          await query(`ALTER TABLE ${idx.table} ADD INDEX ${idx.name} ${idx.cols}`);
          console.log(`  ✓ Added index ${idx.table}.${idx.name}`);
        } catch (err) {
          if (!err.message.includes('Duplicate key')) {
            console.log(`  - ${idx.table}.${idx.name}: ${err.message}`);
          } else {
            console.log(`  - ${idx.table}.${idx.name}: already exists`);
          }
        }
      }

      console.log('  ✓ Performance indexes migration complete');
    }

    // Version 27: Add schedule day/time columns for weekly reports
    if (currentVersion < 27) {
      console.log('📦 Running v27 migration: Add schedule day/time for weekly reports...');

      // Add schedule_day (0=Sunday, 1=Monday, etc.) and schedule_time (HH:MM format)
      const scheduleColumns = [
        { name: 'schedule_day', def: 'TINYINT NULL COMMENT "Day of week: 0=Sun, 1=Mon, ..., 6=Sat"' },
        { name: 'schedule_time', def: 'TIME NULL COMMENT "Time of day in HH:MM:SS format"' }
      ];

      for (const col of scheduleColumns) {
        try {
          await query(`ALTER TABLE scheduled_tasks ADD COLUMN ${col.name} ${col.def}`);
          console.log(`  ✓ Added scheduled_tasks.${col.name}`);
        } catch (err) {
          if (!err.message.includes('Duplicate column')) {
            console.log(`  - scheduled_tasks.${col.name}: ${err.message}`);
          } else {
            console.log(`  - scheduled_tasks.${col.name}: already exists`);
          }
        }
      }

      // Set default schedule for weekly reports: Monday at 8:00 AM
      try {
        await query(`
          UPDATE scheduled_tasks
          SET schedule_day = 1, schedule_time = '08:00:00'
          WHERE task_type IN ('pam_weekly_report', 'executive_weekly_report')
        `);
        console.log('  ✓ Set default schedule for weekly reports (Monday 8:00 AM)');
      } catch (err) {
        console.log(`  - Default schedule: ${err.message}`);
      }

      console.log('  ✓ Schedule day/time migration complete');
    }

    // Version 28: Add daily_sync_chain orchestrated task
    if (currentVersion < 28) {
      console.log('📦 Running v28 migration: Add orchestrated daily sync chain task...');

      try {
        await query(`
          INSERT INTO scheduled_tasks (task_type, task_name, enabled, interval_minutes, schedule_day, schedule_time, config)
          VALUES ('daily_sync_chain', 'Daily Sync Chain (Orchestrated)', FALSE, 1440, 0, '02:00:00', '{"mode": "full"}')
          ON DUPLICATE KEY UPDATE
            task_name = VALUES(task_name),
            interval_minutes = VALUES(interval_minutes)
        `);
        console.log('  ✓ Added daily_sync_chain task (runs daily at 2:00 AM, disabled by default)');
      } catch (err) {
        console.log(`  - daily_sync_chain task: ${err.message}`);
      }

      console.log('  ✓ Daily sync chain migration complete');
    }

    // Version 29: Add page_views tracking table for analytics
    if (currentVersion < 29) {
      console.log('📦 Running v29 migration: Add page_views tracking table...');

      try {
        await query(`
          CREATE TABLE IF NOT EXISTS page_views (
            id INT AUTO_INCREMENT PRIMARY KEY,
            partner_id INT,
            contact_id INT,
            page_type VARCHAR(50) NOT NULL COMMENT 'widget, admin, login, etc.',
            page_path VARCHAR(500),
            session_id VARCHAR(100),
            user_agent VARCHAR(500),
            ip_address VARCHAR(45),
            referrer VARCHAR(500),
            viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_partner (partner_id),
            INDEX idx_contact (contact_id),
            INDEX idx_page_type (page_type),
            INDEX idx_viewed_at (viewed_at),
            INDEX idx_session (session_id),
            FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL,
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('  ✓ Created page_views table');
      } catch (err) {
        console.log(`  - page_views table: ${err.message}`);
      }

      console.log('  ✓ Page views tracking migration complete');
    }

    // Version 30: Add viewer_type column to page_views for Nintex vs Partner tracking
    if (currentVersion < 30) {
      console.log('📦 Running v30 migration: Add viewer_type to page_views...');

      try {
        await query(`
          ALTER TABLE page_views
          ADD COLUMN viewer_type ENUM('nintex', 'partner', 'unknown') DEFAULT 'unknown' AFTER page_type,
          ADD COLUMN viewer_email VARCHAR(255) AFTER viewer_type,
          ADD INDEX idx_viewer_type (viewer_type)
        `);
        console.log('  ✓ Added viewer_type and viewer_email columns to page_views');
      } catch (err) {
        console.log(`  - viewer_type column: ${err.message}`);
      }

      console.log('  ✓ Viewer tracking migration complete');
    }

    // Migration v30 -> v31: Add performance indexes for reporting
    if (currentVersion < 31) {
      console.log('📦 Running v31 migration: Add reporting performance indexes...');

      // Index for completed enrollments ordered by date (recent activity reports)
      try {
        await query('ALTER TABLE lms_enrollments ADD INDEX idx_enrollments_completed_desc (completed_at DESC, status)');
        console.log('  ✓ Added idx_enrollments_completed_desc');
      } catch (err) {
        if (!err.message.includes('Duplicate')) console.log(`  - enrollments completed_desc: ${err.message}`);
      }

      // Index for course-level completion analytics
      try {
        await query('ALTER TABLE lms_enrollments ADD INDEX idx_enrollments_course_completed (course_id, completed_at)');
        console.log('  ✓ Added idx_enrollments_course_completed');
      } catch (err) {
        if (!err.message.includes('Duplicate')) console.log(`  - enrollments course_completed: ${err.message}`);
      }

      // Index for page_views date-based trend analysis
      try {
        await query('ALTER TABLE page_views ADD INDEX idx_pageviews_date_type (viewed_at, page_type)');
        console.log('  ✓ Added idx_pageviews_date_type');
      } catch (err) {
        if (!err.message.includes('Duplicate')) console.log(`  - pageviews date_type: ${err.message}`);
      }

      // Index for partner engagement trends
      try {
        await query('ALTER TABLE page_views ADD INDEX idx_pageviews_partner_date (partner_id, viewed_at)');
        console.log('  ✓ Added idx_pageviews_partner_date');
      } catch (err) {
        if (!err.message.includes('Duplicate')) console.log(`  - pageviews partner_date: ${err.message}`);
      }

      // Index for leads partner acquisition analysis
      try {
        await query('ALTER TABLE leads ADD INDEX idx_leads_partner_created (partner_id, lead_created_at)');
        console.log('  ✓ Added idx_leads_partner_created');
      } catch (err) {
        if (!err.message.includes('Duplicate')) console.log(`  - leads partner_created: ${err.message}`);
      }

      // Index for sync performance tracking
      try {
        await query('ALTER TABLE sync_logs ADD INDEX idx_sync_performance (sync_type, completed_at, records_processed)');
        console.log('  ✓ Added idx_sync_performance');
      } catch (err) {
        if (!err.message.includes('Duplicate')) console.log(`  - sync_logs performance: ${err.message}`);
      }

      // Index for email PAM reporting
      try {
        await query('ALTER TABLE email_log ADD INDEX idx_email_pam_sent (pam_id, sent_at)');
        console.log('  ✓ Added idx_email_pam_sent');
      } catch (err) {
        if (!err.message.includes('Duplicate')) console.log(`  - email_log pam_sent: ${err.message}`);
      }

      // Index for course status filtering
      try {
        await query('ALTER TABLE lms_courses ADD INDEX idx_courses_status (status)');
        console.log('  ✓ Added idx_courses_status');
      } catch (err) {
        if (!err.message.includes('Duplicate')) console.log(`  - courses status: ${err.message}`);
      }

      // Index for partners by country (regional reports)
      try {
        await query('ALTER TABLE partners ADD INDEX idx_partners_region_country (account_region, country)');
        console.log('  ✓ Added idx_partners_region_country');
      } catch (err) {
        if (!err.message.includes('Duplicate')) console.log(`  - partners region_country: ${err.message}`);
      }

      console.log('  ✓ Performance indexes migration complete');
    }

    // Migration v31 -> v32: Sync optimization columns
    if (currentVersion < 32) {
      console.log('📦 Running v32 migration: Add sync optimization columns...');

      // Add last_checked_at to lms_groups for smart group member sync
      try {
        await query('ALTER TABLE lms_groups ADD COLUMN last_checked_at TIMESTAMP NULL AFTER partner_id');
        await query('ALTER TABLE lms_groups ADD INDEX idx_last_checked (last_checked_at)');
        console.log('  ✓ Added last_checked_at to lms_groups');
      } catch (err) {
        if (!err.message.includes('Duplicate')) console.log(`  - lms_groups last_checked_at: ${err.message}`);
      }

      // Add API call tracking columns to sync_logs
      try {
        await query('ALTER TABLE sync_logs ADD COLUMN api_calls_made INT DEFAULT 0 AFTER records_failed');
        await query('ALTER TABLE sync_logs ADD COLUMN api_calls_saved INT DEFAULT 0 AFTER api_calls_made');
        await query('ALTER TABLE sync_logs ADD COLUMN cache_hits INT DEFAULT 0 AFTER api_calls_saved');
        console.log('  ✓ Added API call tracking columns to sync_logs');
      } catch (err) {
        if (!err.message.includes('Duplicate')) console.log(`  - sync_logs api_calls: ${err.message}`);
      }

      console.log('  ✓ Sync optimization migration complete');
    }

    // Migration v32 -> v33: Reduce sync intervals (optimized syncs are faster)
    if (currentVersion < 33) {
      console.log('📦 Running v33 migration: Reduce sync intervals...');

      // Update intervals - since incremental syncs are 91% faster, we can run more frequently
      const intervalUpdates = [
        { type: 'sync_users', interval: 60 },      // Was 120 (2hr) -> Now 60 (1hr)
        { type: 'sync_groups', interval: 60 },     // Was 120 (2hr) -> Now 60 (1hr)
        { type: 'sync_courses', interval: 120 },   // Was 240 (4hr) -> Now 120 (2hr)
        { type: 'sync_npcu', interval: 180 },      // Was 360 (6hr) -> Now 180 (3hr)
        { type: 'sync_enrollments', interval: 120 }, // Was 240 (4hr) -> Now 120 (2hr)
        { type: 'impartner_sync', interval: 120 }, // Was 360 (6hr) -> Now 120 (2hr)
      ];

      for (const update of intervalUpdates) {
        try {
          await query(
            'UPDATE scheduled_tasks SET interval_minutes = ? WHERE task_type = ?',
            [update.interval, update.type]
          );
          console.log(`  ✓ Updated ${update.type} interval to ${update.interval} minutes`);
        } catch (err) {
          console.log(`  - ${update.type}: ${err.message}`);
        }
      }

      console.log('  ✓ Sync intervals updated (more frequent due to optimization)');
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
