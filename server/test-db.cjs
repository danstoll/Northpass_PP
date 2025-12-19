/**
 * Test Database Connection
 * Run with: node server/test-db.js
 */

const { initializePool, query, closePool } = require('./db/connection.cjs');
const { initializeSchema, getSchemaVersion } = require('./db/schema.cjs');

async function testConnection() {
  console.log('🔄 Testing MariaDB connection...\n');
  
  try {
    // Initialize connection
    await initializePool();
    console.log('✅ Connection pool initialized\n');
    
    // Initialize schema
    await initializeSchema();
    console.log('✅ Schema initialized\n');
    
    // Get schema version
    const version = await getSchemaVersion();
    console.log(`📊 Schema version: ${version}\n`);
    
    // Test a simple query
    const result = await query('SELECT NOW() as server_time');
    console.log(`⏰ Server time: ${result[0].server_time}\n`);
    
    // List tables
    const tables = await query(`
      SELECT table_name, table_rows 
      FROM information_schema.tables 
      WHERE table_schema = 'northpass_portal'
      ORDER BY table_name
    `);
    
    console.log('📋 Database tables:');
    tables.forEach(t => {
      const tableName = t.TABLE_NAME || t.table_name;
      const rowCount = t.TABLE_ROWS || t.table_rows || 0;
      console.log(`   - ${tableName} (${rowCount} rows)`);
    });
    
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await closePool();
    process.exit(0);
  }
}

testConnection();
