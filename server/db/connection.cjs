/**
 * MariaDB Connection Pool
 * Provides connection management for the Northpass Partner Portal database
 */

const mysql = require('mysql2/promise');

// Load config (triggers dotenv if not already loaded)
const config = require('../config.cjs');

// Database configuration
const DB_CONFIG = {
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
};

let pool = null;

/**
 * Initialize the connection pool
 */
async function initializePool() {
  if (pool) return pool;
  
  try {
    // First connect without database to create it if needed
    const tempPool = mysql.createPool({
      ...DB_CONFIG,
      database: undefined
    });
    
    // Create database if it doesn't exist
    await tempPool.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tempPool.end();
    
    // Now create the main pool with the database
    pool = mysql.createPool(DB_CONFIG);
    
    // Test the connection
    const connection = await pool.getConnection();
    console.log('✅ MariaDB connected successfully');
    connection.release();
    
    return pool;
  } catch (error) {
    console.error('❌ MariaDB connection failed:', error.message);
    throw error;
  }
}

/**
 * Get the connection pool (initializes if needed)
 */
async function getPool() {
  if (!pool) {
    await initializePool();
  }
  return pool;
}

/**
 * Execute a query with parameters
 */
async function query(sql, params = []) {
  const pool = await getPool();
  const [results] = await pool.execute(sql, params);
  return results;
}

/**
 * Execute multiple queries in a transaction
 */
async function transaction(callback) {
  const pool = await getPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Close the pool
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('MariaDB pool closed');
  }
}

module.exports = {
  initializePool,
  getPool,
  query,
  transaction,
  closePool,
  DB_CONFIG
};
