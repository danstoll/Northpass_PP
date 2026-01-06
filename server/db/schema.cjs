/**
 * Database Schema Setup
 * Creates all required tables for the Northpass Partner Portal
 */

const { query, transaction, getPool } = require('./connection.cjs');
const crypto = require('crypto');

const SCHEMA_VERSION = 12;

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
