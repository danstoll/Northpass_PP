/**
 * Test writing to Total_NPCU__cf field on Account
 * to confirm we can push certification data to Impartner
 */
const https = require('https');

const CONFIG = {
  host: 'prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  tenantId: '1'
};

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.host,
      path: '/api/objects/v1' + path,
      method: method,
      headers: {
        'Authorization': `prm-key ${CONFIG.apiKey}`,
        'X-PRM-TenantId': CONFIG.tenantId,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function testWriteCapability() {
  console.log('=== TESTING IMPARTNER WRITE CAPABILITY ===\n');
  
  // First, find the "Nintex Partner Portal Americas" account
  const searchRes = await makeRequest('GET', '/Account?fields=Id,Name,Total_NPCU__cf&take=5');
  const searchJson = JSON.parse(searchRes.data);
  
  console.log('Search result:', JSON.stringify(searchJson, null, 2));
  
  if (!searchJson.success || !searchJson.data.results[0]) {
    console.log('Account not found');
    process.exit(1);
  }
  
  const account = searchJson.data.results[0];
  console.log(`\nFound account: ${account.name} (ID: ${account.id})`);
  console.log(`Current Total_NPCU__cf: ${account.total_NPCU__cf}`);
  
  // Now try to update it with PATCH
  console.log('\nAttempting to PATCH Total_NPCU__cf...');
  const newValue = 999; // Test value
  
  const patchRes = await makeRequest('PATCH', `/Account/${account.id}`, {
    Id: account.id,
    Total_NPCU__cf: newValue
  });
  
  console.log(`\nPATCH response status: ${patchRes.status}`);
  console.log('PATCH response:', patchRes.data);
  
  // Check if it worked
  const verifyRes = await makeRequest('GET', `/Account/${account.id}?fields=Id,Name,Total_NPCU__cf`);
  const verifyJson = JSON.parse(verifyRes.data);
  
  console.log('\nVerification:', JSON.stringify(verifyJson, null, 2));
  
  // Restore original value
  if (patchRes.status === 200) {
    console.log(`\nRestoring original value (${account.total_NPCU__cf})...`);
    await makeRequest('PATCH', `/Account/${account.id}`, {
      Id: account.id,
      Total_NPCU__cf: account.total_NPCU__cf
    });
    console.log('Restored.');
  }
  
  process.exit(0);
}

testWriteCapability().catch(e => { console.error(e); process.exit(1); });
