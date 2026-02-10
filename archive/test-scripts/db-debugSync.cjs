/**
 * Debug Enrollment Sync - Test one user thoroughly
 */
const { getPool, closePool } = require('./connection.cjs');
const appConfig = require('../config.cjs');

const API_KEY = appConfig.northpass.apiKey;

async function debug() {
  console.log('Starting debug sync...\n');
  
  const pool = await getPool();
  const conn = await pool.getConnection();
  
  // Get a specific user
  const [users] = await conn.query('SELECT id, email FROM lms_users LIMIT 1 OFFSET 450');
  if (users.length === 0) {
    console.log('No users found!');
    conn.release();
    await closePool();
    return;
  }
  
  const user = users[0];
  console.log('Testing user:', user.id, user.email);
  
  // Fetch transcripts
  const url = `https://api.northpass.com/v2/transcripts/${user.id}?limit=100`;
  console.log('Fetching:', url);
  
  try {
    const response = await fetch(url, { headers: { 'X-Api-Key': API_KEY } });
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const text = await response.text();
      console.log('Error response:', text);
    } else {
      const data = await response.json();
      console.log('Response has data.data:', !!data.data);
      console.log('Number of items:', data.data?.length || 0);
      
      if (data.data && data.data.length > 0) {
        console.log('\nFirst item:', JSON.stringify(data.data[0], null, 2));
      }
    }
  } catch (err) {
    console.error('Fetch failed:', err);
  }
  
  conn.release();
  await closePool();
  console.log('\nDone!');
}

debug();
