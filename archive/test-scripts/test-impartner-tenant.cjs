/**
 * Impartner PRM API Test with Tenant ID
 * 
 * The API requires X-PRM-TenantId header
 * Testing to find correct tenant and auth combination
 */

require('dotenv').config();
const config = require('./server/config.cjs');
const https = require('https');

const CONFIG = {
  host: config.impartner.host,
  apiKey: config.impartner.apiKey
};

// Common tenant IDs to try (usually company name or subdomain)
const TENANT_GUESSES = [
  'nintex',
  'Nintex',
  'NINTEX',
  'nintex-prm',
  'nintexpartners',
  'partners.nintex',
  'prm-nintex'
];

function makeRequest(path, headers) {
  return new Promise((resolve) => {
    const options = {
      hostname: CONFIG.host,
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ 
          status: res.statusCode, 
          data,
          headers: res.headers
        });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, error: err.message });
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ status: 0, error: 'timeout' });
    });
    
    req.end();
  });
}

async function testWithTenant(tenant) {
  console.log(`\n🔐 Testing tenant: "${tenant}"`);
  
  const result = await makeRequest('/api/objects/v1/Account?$top=1', {
    'Authorization': `prm-key ${CONFIG.apiKey}`,
    'X-PRM-TenantId': tenant
  });
  
  console.log(`   Status: ${result.status}`);
  
  if (result.status === 200) {
    console.log('   ✅ SUCCESS!');
    try {
      const json = JSON.parse(result.data);
      console.log(`   Records: ${json.value?.length || 'N/A'}`);
      return true;
    } catch (e) {
      console.log(`   Response: ${result.data.substring(0, 200)}`);
    }
  } else if (result.status === 302 || result.status === 301) {
    console.log('   ❌ Redirect (auth/tenant issue)');
  } else {
    const msg = result.data?.substring(0, 150) || result.error || 'Unknown';
    console.log(`   Response: ${msg}`);
  }
  
  return false;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         IMPARTNER API TENANT TEST                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\nAPI requires X-PRM-TenantId header');
  console.log('Testing common tenant ID patterns...\n');
  
  // Test each tenant guess
  for (const tenant of TENANT_GUESSES) {
    const success = await testWithTenant(tenant);
    if (success) {
      console.log(`\n\n🎉 Found working tenant: ${tenant}`);
      return;
    }
  }
  
  // Also try with X-Api-Key instead of Authorization
  console.log('\n\n--- Testing X-Api-Key + X-PRM-TenantId ---');
  for (const tenant of TENANT_GUESSES.slice(0, 3)) {
    console.log(`\n🔐 X-Api-Key + tenant: "${tenant}"`);
    const result = await makeRequest('/api/objects/v1/Account?$top=1', {
      'X-Api-Key': CONFIG.apiKey,
      'X-PRM-TenantId': tenant
    });
    console.log(`   Status: ${result.status}`);
    if (result.status === 200) {
      console.log('   ✅ SUCCESS!');
      return;
    }
    console.log(`   Response: ${result.data?.substring(0, 100) || result.error}`);
  }
  
  console.log('\n\n❌ No working tenant found.');
  console.log('\n💡 To find your tenant ID:');
  console.log('   1. Log into Impartner PRM admin portal');
  console.log('   2. Look at the URL - it usually contains the tenant');
  console.log('   3. Check Settings > API or Integration settings');
  console.log('   4. The tenant might be visible in browser dev tools network tab');
}

main();
