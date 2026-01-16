/**
 * Test the fixed transcript endpoint
 */
const { query } = require('./server/db/connection.cjs');
const https = require('https');

const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';

function northpassRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, 'https://api.northpass.com');
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Api-Key': API_KEY }
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

async function test() {
  // Test with one user
  const userId = '2793f6de-22e3-4b50-bbfe-56c70621416d';
  console.log('Testing enrollment sync with correct endpoint...');
  console.log('Endpoint: /v2/transcripts/' + userId);
  
  const response = await northpassRequest('/v2/transcripts/' + userId);
  console.log('API Status:', response.status);
  console.log('Records found:', response.data?.data?.length || 0);
  
  if (response.data?.data) {
    let courseCount = 0;
    for (const transcript of response.data.data) {
      const attrs = transcript.attributes || {};
      const courseId = attrs.resource_id;
      const resourceType = attrs.resource_type;
      
      if (!courseId || resourceType !== 'course') continue;
      
      courseCount++;
      const progressStatus = attrs.progress_status || 'enrolled';
      const progressPercent = progressStatus === 'completed' ? 100 : progressStatus === 'in_progress' ? 50 : 0;
      
      console.log(`  Course: ${attrs.name}`);
      console.log(`    Status: ${progressStatus}, Progress: ${progressPercent}%`);
      console.log(`    Enrolled: ${attrs.enrolled_at}, Completed: ${attrs.completed_at || 'N/A'}`);
    }
    console.log(`\nTotal course enrollments: ${courseCount}`);
  }
  process.exit(0);
}

test();
