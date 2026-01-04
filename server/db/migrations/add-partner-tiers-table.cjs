/**
 * Migration: Add partner_tiers table
 * This creates a dedicated table for managing partner tier definitions
 */

const { query } = require('../connection.cjs');

async function up() {
  console.log('Running migration: add-partner-tiers-table');
  
  // Create partner_tiers table
  await query(`
    CREATE TABLE IF NOT EXISTS partner_tiers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      npcu_required INT DEFAULT 0,
      color VARCHAR(20) DEFAULT '#666666',
      sort_order INT DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_name (name),
      INDEX idx_sort (sort_order),
      INDEX idx_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✅ Created partner_tiers table');
  
  // Insert default tiers
  const defaultTiers = [
    { name: 'Registered', description: 'Entry-level partners with basic certification requirements', npcu_required: 5, color: '#42A5F5', sort_order: 1 },
    { name: 'Certified', description: 'Partners with demonstrated product knowledge', npcu_required: 10, color: '#1565C0', sort_order: 2 },
    { name: 'Select', description: 'Mid-tier partners with advanced capabilities', npcu_required: 15, color: '#FF6B35', sort_order: 3 },
    { name: 'Premier', description: 'Top-tier partners with comprehensive expertise', npcu_required: 20, color: '#FFD700', sort_order: 4 },
    { name: 'Premier Plus', description: 'Elite partners with extended capabilities', npcu_required: 20, color: '#FFA500', sort_order: 5 },
    { name: 'Aggregator', description: 'Partners focused on aggregation services', npcu_required: 5, color: '#9C27B0', sort_order: 6 }
  ];
  
  for (const tier of defaultTiers) {
    try {
      await query(
        `INSERT INTO partner_tiers (name, description, npcu_required, color, sort_order) 
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           description = VALUES(description),
           npcu_required = VALUES(npcu_required),
           color = VALUES(color),
           sort_order = VALUES(sort_order)`,
        [tier.name, tier.description, tier.npcu_required, tier.color, tier.sort_order]
      );
    } catch (err) {
      console.log(`  - Tier ${tier.name}:`, err.message);
    }
  }
  console.log('✅ Inserted default tiers');
  
  return true;
}

async function down() {
  console.log('Rolling back migration: add-partner-tiers-table');
  await query('DROP TABLE IF EXISTS partner_tiers');
  console.log('✅ Dropped partner_tiers table');
  return true;
}

// Run migration if called directly
if (require.main === module) {
  const { getPool } = require('../connection.cjs');
  
  up()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { up, down };
