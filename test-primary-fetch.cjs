/**
 * Test fetching primary user by ID
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
      path: '/api/objects/v1' + path,
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

async function test() {
  console.log('=== TESTING PRIMARY USER FETCH ===\n');
  
  // Test single user fetch by ID
  const testUserId = 2764013; // Nintex Portal Americas primary user
  
  console.log('Method 1: Direct ID in path');
  try {
    const res1 = await makeRequest(`/User/${testUserId}?fields=Id,Email,FirstName,LastName,FullName`);
    console.log('  Status:', res1.status);
    console.log('  Response:', res1.data.substring(0, 300));
  } catch (e) {
    console.log('  Error:', e.message);
  }
  
  console.log('\nMethod 2: Filter with Id eq');
  try {
    const res2 = await makeRequest(`/User?fields=Id,Email,FirstName,LastName,FullName&filter=Id eq ${testUserId}`);
    console.log('  Status:', res2.status);
    console.log('  Response:', res2.data.substring(0, 300));
  } catch (e) {
    console.log('  Error:', e.message);
  }
  
  console.log('\nMethod 3: Filter with Id in list');
  try {
    const ids = [testUserId, 2747471]; // Two IDs
    const filter = `Id in (${ids.join(',')})`;
    const res3 = await makeRequest(`/User?fields=Id,Email,FirstName,LastName,FullName&filter=${encodeURIComponent(filter)}`);
    console.log('  Status:', res3.status);
    console.log('  Response:', res3.data.substring(0, 500));
  } catch (e) {
    console.log('  Error:', e.message);
  }
  
  process.exit(0);
}

test().catch(e => { console.error(e); process.exit(1); });
