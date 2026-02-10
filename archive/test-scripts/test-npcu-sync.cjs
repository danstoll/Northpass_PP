// Test NPCU sync directly
require('dotenv').config();
const https = require('https');
const mysql = require('mysql2/promise');
const config = require('./server/config.cjs');

const NORTHPASS_API_URL = 'https://api.northpass.com';
const API_KEY = config.northpass.apiKey;

const dbConfig = {
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database
};

function northpassRequest(endpoint, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, NORTHPASS_API_URL);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, error: 'Parse error' });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function testSync() {
  console.log('Testing NPCU sync across multiple pages...\n');
  
  // Fetch all pages
  let allData = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore && page <= 10) {
    const response = await northpassRequest(`/v2/properties/courses?limit=100&page=${page}`);
    console.log(`Page ${page}: status=${response.status}`);
    
    if (response.status !== 200 || !response.data || !response.data.data) {
      console.log('  No data or error');
      hasMore = false;
      break;
    }
    
    const pageData = response.data.data;
    console.log(`  Courses: ${pageData.length}`);
    
    if (pageData.length === 0) {
      hasMore = false;
    } else {
      allData = [...allData, ...pageData];
      page++;
    }
  }
  
  console.log(`\nTotal courses fetched: ${allData.length}`);
  
  // Find courses with NPCU > 0
  const withNpcu = allData.filter(item => {
    const props = item.attributes?.properties || {};
    return parseInt(props.npcu) > 0;
  });
  
  console.log(`Courses with NPCU > 0: ${withNpcu.length}`);
  
  if (withNpcu.length > 0) {
    console.log('\nSample courses with NPCU:');
    withNpcu.slice(0, 5).forEach(sample => {
      console.log(`  ${sample.attributes?.properties?.name}: NPCU=${sample.attributes?.properties?.npcu}`);
    });
  }
  
  // Connect to DB and check current state
  console.log('\n--- Checking database state ---');
  const pool = mysql.createPool(dbConfig);
  
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, npcu_value, is_certification FROM lms_courses WHERE npcu_value > 0 LIMIT 10'
    );
    console.log('\nCourses with NPCU > 0 in database:', rows.length);
    rows.forEach(row => {
      console.log(`  ${row.name}: NPCU=${row.npcu_value}`);
    });
    
    // Check course_properties table
    const [propRows] = await pool.execute(
      'SELECT course_id, npcu_value FROM course_properties WHERE npcu_value > 0 LIMIT 10'
    );
    console.log('\ncourse_properties with NPCU > 0:', propRows.length);
  } catch (err) {
    console.error('DB Error:', err.message);
  }
  
  await pool.end();
}

testSync().catch(console.error);
