/**
 * Impartner PRM API Connection Test
 * 
 * Tests different authentication methods to find the correct format
 */

const https = require('https');

const CONFIG = {
  host: 'prod.impartner.live',
  // Raw API key (may contain special characters that need encoding)
  apiKey: 'H4nFg5bITGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWDI4C%E^o2DKypw'
};

function makeRequest(path, authHeader) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.host,
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        ...authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    console.log(`\n📡 Testing: ${Object.keys(authHeader)[0]}: ${Object.values(authHeader)[0].substring(0, 30)}...`);
    console.log(`   Path: ${path}`);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        console.log(`   Location: ${res.headers.location || 'none'}`);
        
        if (res.statusCode === 200) {
          console.log('   ✅ SUCCESS!');
          try {
            const json = JSON.parse(data);
            console.log(`   Records: ${json.value?.length || 'N/A'}`);
          } catch (e) {
            console.log(`   Response: ${data.substring(0, 200)}`);
          }
        } else if (res.statusCode === 302 || res.statusCode === 301) {
          console.log('   ❌ Redirect to login (auth failed)');
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          console.log('   ❌ Auth error');
          console.log(`   Response: ${data.substring(0, 200)}`);
        } else {
          console.log(`   Response: ${data.substring(0, 200)}`);
        }
        
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (err) => {
      console.log(`   ❌ Error: ${err.message}`);
      resolve({ status: 0, error: err.message });
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      console.log('   ❌ Timeout');
      resolve({ status: 0, error: 'timeout' });
    });
    
    req.end();
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         IMPARTNER API AUTH TEST                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  const testPath = '/api/objects/v1/Account?$top=1';
  
  // Test 1: Authorization: prm-key (as shown in docs)
  console.log('\n\n🔐 TEST 1: Authorization: prm-key <key>');
  await makeRequest(testPath, {
    'Authorization': `prm-key ${CONFIG.apiKey}`
  });
  
  // Test 2: Just the key as Authorization header
  console.log('\n\n🔐 TEST 2: Authorization: <key> (direct)');
  await makeRequest(testPath, {
    'Authorization': CONFIG.apiKey
  });
  
  // Test 3: X-Api-Key header
  console.log('\n\n🔐 TEST 3: X-Api-Key header');
  await makeRequest(testPath, {
    'X-Api-Key': CONFIG.apiKey
  });
  
  // Test 4: Api-Key header
  console.log('\n\n🔐 TEST 4: Api-Key header');
  await makeRequest(testPath, {
    'Api-Key': CONFIG.apiKey
  });
  
  // Test 5: Bearer token format
  console.log('\n\n🔐 TEST 5: Authorization: Bearer <key>');
  await makeRequest(testPath, {
    'Authorization': `Bearer ${CONFIG.apiKey}`
  });
  
  // Test 6: URL-encoded key
  const encodedKey = encodeURIComponent(CONFIG.apiKey);
  console.log('\n\n🔐 TEST 6: URL-encoded key');
  await makeRequest(testPath, {
    'Authorization': `prm-key ${encodedKey}`
  });
  
  // Test 7: Check if key needs to be in query string
  console.log('\n\n🔐 TEST 7: Key in query string');
  await makeRequest(`${testPath}&api_key=${encodedKey}`, {
    'Accept': 'application/json'
  });
  
  // Test 8: Try different API paths
  console.log('\n\n🔐 TEST 8: Alternative API paths');
  const altPaths = [
    '/api/v1/objects/Account',
    '/api/Account',
    '/v1/Account',
    '/api/objects/Account'
  ];
  
  for (const path of altPaths) {
    await makeRequest(`${path}?$top=1`, {
      'Authorization': `prm-key ${CONFIG.apiKey}`
    });
  }
  
  console.log('\n\n📋 Done testing auth methods.');
  console.log('\n💡 If all tests fail, the API key may need to be:');
  console.log('   1. Generated/refreshed in the Impartner admin portal');
  console.log('   2. Associated with the correct permissions/profile');
  console.log('   3. Used with a specific IP whitelist');
}

main();
