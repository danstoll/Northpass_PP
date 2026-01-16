/**
 * Get full Account object schema/metadata to find ALL available fields
 */
const https = require('https');

const CONFIG = {
  host: 'prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  tenantId: '1'
};

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.host,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `prm-key ${CONFIG.apiKey}`,
        'X-PRM-TenantId': CONFIG.tenantId,
        'Accept': 'application/json'
      }
    };
    
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function getMetadata() {
  console.log('=== EXPLORING IMPARTNER API METADATA ===\n');
  
  // Try different metadata endpoints
  const endpoints = [
    '/api/objects/v1/$metadata',
    '/api/objects/v1/metadata',
    '/api/objects/v1/Account/$metadata',
    '/api/objects/v1/Account/schema',
    '/api/objects/v1/Account/fields',
    '/api/v1/objects',
    '/api/v1/Account',
    '/api/schema/Account'
  ];
  
  for (const endpoint of endpoints) {
    console.log(`Trying ${endpoint}...`);
    try {
      const res = await makeRequest(endpoint);
      if (res.status === 200) {
        console.log(`  Status: ${res.status}`);
        const preview = res.data.substring(0, 500);
        console.log(`  Response preview: ${preview}...\n`);
      }
    } catch (e) {
      console.log(`  Error: ${e.message}\n`);
    }
  }
  
  // Also get one full Account record to see all returned fields
  console.log('\n=== FULL ACCOUNT RECORD (to see all field names) ===\n');
  try {
    const res = await makeRequest('/api/objects/v1/Account?take=1');
    const json = JSON.parse(res.data);
    if (json.success && json.data.results[0]) {
      const record = json.data.results[0];
      console.log('All fields returned in Account record:');
      const fields = Object.keys(record).sort();
      for (const field of fields) {
        const value = record[field];
        const displayValue = value !== null && value !== undefined ? 
          JSON.stringify(value).substring(0, 60) : '(null)';
        console.log(`  ${field}: ${displayValue}`);
      }
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
  
  // Also try User
  console.log('\n=== FULL USER RECORD (to see all field names) ===\n');
  try {
    const res = await makeRequest('/api/objects/v1/User?take=1');
    const json = JSON.parse(res.data);
    if (json.success && json.data.results[0]) {
      const record = json.data.results[0];
      console.log('All fields returned in User record:');
      const fields = Object.keys(record).sort();
      for (const field of fields) {
        const value = record[field];
        const displayValue = value !== null && value !== undefined ? 
          JSON.stringify(value).substring(0, 60) : '(null)';
        console.log(`  ${field}: ${displayValue}`);
      }
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
  
  process.exit(0);
}

getMetadata().catch(e => { console.error(e); process.exit(1); });
