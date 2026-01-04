/**
 * Migration 004: Add group analysis results and task queue tables
 * 
 * Run with: node server/db/migrations/004_add_analysis_tables.cjs
 */

const { query, getPool, closePool } = require('../connection.cjs');

async function migrate() {
  console.log('🔄 Running migration 004: Add analysis tables...\n');
  
  try {
    await getPool();
    
    // 1. Group Analysis Results table - stores bulk analysis snapshots
    console.log('Creating group_analysis_results table...');
    await query(`
      CREATE TABLE IF NOT EXISTS group_analysis_results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        run_type ENUM('manual', 'scheduled') DEFAULT 'manual',
        total_groups INT DEFAULT 0,
        groups_with_potential INT DEFAULT 0,
        total_potential_users INT DEFAULT 0,
        groups_pending_sync INT DEFAULT 0,
        errors INT DEFAULT 0,
        duration_seconds INT DEFAULT 0,
        INDEX idx_run_at (run_at),
        INDEX idx_run_type (run_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✓ group_analysis_results table created');
    
    // 2. Group Analysis Details - individual group results per run
    console.log('Creating group_analysis_details table...');
    await query(`
      CREATE TABLE IF NOT EXISTS group_analysis_details (
        id INT AUTO_INCREMENT PRIMARY KEY,
        analysis_id INT NOT NULL,
        group_id VARCHAR(50) NOT NULL,
        group_name VARCHAR(255),
        partner_tier VARCHAR(50),
        member_count INT DEFAULT 0,
        potential_users INT DEFAULT 0,
        pending_sync INT DEFAULT 0,
        INDEX idx_analysis (analysis_id),
        INDEX idx_group (group_id),
        INDEX idx_potential (potential_users),
        FOREIGN KEY (analysis_id) REFERENCES group_analysis_results(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✓ group_analysis_details table created');
    
    // 3. Scheduled Tasks table - robust task queue
    console.log('Creating scheduled_tasks table...');
    await query(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_type VARCHAR(50) NOT NULL,
        task_name VARCHAR(100) NOT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        cron_expression VARCHAR(50),
        interval_minutes INT,
        last_run_at TIMESTAMP NULL,
        next_run_at TIMESTAMP NULL,
        last_status ENUM('success', 'failed', 'running', 'skipped') DEFAULT NULL,
        last_error TEXT,
        last_duration_seconds INT,
        run_count INT DEFAULT 0,
        fail_count INT DEFAULT 0,
        config JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_task (task_type),
        INDEX idx_enabled (enabled),
        INDEX idx_next_run (next_run_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✓ scheduled_tasks table created');
    
    // 4. Task Run History - detailed execution log
    console.log('Creating task_run_history table...');
    await query(`
      CREATE TABLE IF NOT EXISTS task_run_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        task_type VARCHAR(50) NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        status ENUM('running', 'success', 'failed', 'cancelled') DEFAULT 'running',
        duration_seconds INT,
        records_processed INT DEFAULT 0,
        result_summary JSON,
        error_message TEXT,
        INDEX idx_task (task_id),
        INDEX idx_type (task_type),
        INDEX idx_started (started_at),
        INDEX idx_status (status),
        FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✓ task_run_history table created');
    
    // 5. Insert default scheduled tasks
    console.log('\nInserting default scheduled tasks...');
    
    const defaultTasks = [
      {
        task_type: 'lms_sync',
        task_name: 'LMS Data Sync',
        interval_minutes: 120, // Every 2 hours
        config: JSON.stringify({
          sync_types: ['users', 'groups', 'courses', 'enrollments'],
          mode: 'incremental'
        })
      },
      {
        task_type: 'group_analysis',
        task_name: 'Group Analysis',
        interval_minutes: 360, // Every 6 hours
        config: JSON.stringify({
          save_results: true,
          notify_on_issues: false
        })
      },
      {
        task_type: 'group_members_sync',
        task_name: 'Group Members Sync',
        interval_minutes: 60, // Every hour
        config: JSON.stringify({
          confirm_pending: true
        })
      },
      {
        task_type: 'cleanup',
        task_name: 'Database Cleanup',
        interval_minutes: 1440, // Daily
        config: JSON.stringify({
          keep_logs_days: 30,
          keep_analysis_days: 90
        })
      }
    ];
    
    for (const task of defaultTasks) {
      try {
        await query(`
          INSERT INTO scheduled_tasks (task_type, task_name, enabled, interval_minutes, config)
          VALUES (?, ?, FALSE, ?, ?)
          ON DUPLICATE KEY UPDATE 
            task_name = VALUES(task_name),
            interval_minutes = VALUES(interval_minutes),
            config = VALUES(config)
        `, [task.task_type, task.task_name, task.interval_minutes, task.config]);
        console.log(`  ✓ ${task.task_name}`);
      } catch (err) {
        console.log(`  - ${task.task_name}: ${err.message}`);
      }
    }
    
    // 6. Update schema version
    console.log('\nUpdating schema version...');
    await query(`
      UPDATE schema_info SET version = 4 WHERE id = 1
    `);
    
    console.log('\n✅ Migration 004 complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run if called directly
if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { migrate };
