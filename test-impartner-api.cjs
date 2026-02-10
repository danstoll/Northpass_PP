/**
 * Impartner PRM API Test Script
 * 
 * Run directly against Impartner API to explore available data
 * Usage: node test-impartner-api.cjs [tenantId] [object] [limit]
 * 
 * Examples:
 *   node test-impartner-api.cjs myTenant              # Test with tenant ID
 *   node test-impartner-api.cjs myTenant Account 5    # Get 5 accounts
 *   node test-impartner-api.cjs myTenant User 10      # Get 10 users
 */

require('dotenv').config();
const config = require('./server/config.cjs');
const https = require('https');

const CONFIG = {
  host: config.impartner.host,
  apiKey: config.impartner.apiKey
};

/**
 * Make API request to Impartner
 */
function apiRequest(path, tenantId, method = 'GET') {
  return new Promise((resolve, reject) => {
    const headers = {
      'Authorization': `prm-key ${CONFIG.apiKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    // Add tenant ID if provided
    if (tenantId) {
      headers['X-PRM-TenantId'] = tenantId;
    }
    
    const options = {
      hostname: CONFIG.host,
      port: 443,
      path: path,
      method: method,
      headers: headers
    };

    console.log(`\n📡 ${method} https://${CONFIG.host}${path}`);
    console.log(`🏢 Tenant: ${tenantId || 'NOT SET'}`);
    console.log('─'.repeat(60));

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`📥 Status: ${res.statusCode}`);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            console.log('📄 Raw response (not JSON):', data.substring(0, 500));
            resolve(data);
          }
        } else {
          console.log('❌ Error response:', data.substring(0, 500));
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Get records from an object
 */
async function getRecords(objectName, tenantId, limit = 5) {
  const path = `/api/objects/v1/${objectName}?$top=${limit}`;
  return apiRequest(path, tenantId);
}

/**
 * Get schema/metadata for an object (if available)
 */
async function getObjectSchema(objectName) {
  // Try common metadata endpoints
  const paths = [
    `/api/objects/v1/${objectName}/$metadata`,
    `/api/metadata/v1/${objectName}`,
    `/api/objects/v1/$metadata`
  ];
  
  for (const path of paths) {
    try {
      return await apiRequest(path);
    } catch (e) {
      // Try next path
    }
  }
  return null;
}

/**
 * Display results in a readable format
 */
function displayResults(objectName, data) {
  console.log(`\n📊 ${objectName} Results:`);
  console.log('═'.repeat(60));
  
  if (!data) {
    console.log('No data returned');
    return;
  }

  // Handle OData response format
  const records = data.value || data.items || data.data || (Array.isArray(data) ? data : [data]);
  
  if (Array.isArray(records) && records.length > 0) {
    console.log(`Found ${records.length} records\n`);
    
    // Show first record structure
    const firstRecord = records[0];
    console.log('📋 Fields available:');
    const fields = Object.keys(firstRecord);
    fields.forEach(field => {
      const value = firstRecord[field];
      const type = typeof value;
      const preview = value === null ? 'null' : 
                     type === 'object' ? '[object]' : 
                     String(value).substring(0, 50);
      console.log(`   • ${field}: ${preview}`);
    });
    
    console.log('\n📝 Sample Records:');
    records.slice(0, 3).forEach((record, i) => {
      console.log(`\n--- Record ${i + 1} ---`);
      // Show key fields based on object type
      if (objectName === 'Account') {
        console.log(`   Name: ${record.AccountName || record.Name || 'N/A'}`);
        console.log(`   ID: ${record.Id || record.AccountId || 'N/A'}`);
        console.log(`   Status: ${record.Account_Status__cf || record.Status || 'N/A'}`);
        console.log(`   Region: ${record.Account_Country_Region__cf || 'N/A'}`);
        console.log(`   Owner: ${record.Account_Owner__cf || 'N/A'}`);
      } else if (objectName === 'User') {
        console.log(`   Name: ${record.FirstName || ''} ${record.LastName || ''}`);
        console.log(`   Email: ${record.Email || 'N/A'}`);
        console.log(`   Account: ${record.AccountName || record.Account || 'N/A'}`);
        console.log(`   Account ID: ${record.Account_ID__cf || 'N/A'}`);
        console.log(`   Status: ${record.Account_Status__cf || record.Status || 'N/A'}`);
      } else {
        // Generic display
        Object.entries(record).slice(0, 8).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            console.log(`   ${key}: ${String(value).substring(0, 60)}`);
          }
        });
      }
    });
  } else {
    console.log('Response structure:', JSON.stringify(data, null, 2).substring(0, 1000));
  }
  
  // Show pagination info if available
  if (data['@odata.count'] !== undefined) {
    console.log(`\n📊 Total count: ${data['@odata.count']}`);
  }
  if (data['@odata.nextLink']) {
    console.log(`📄 Next page available`);
  }
}

/**
 * Main test runner
 */
async function main() {
  const args = process.argv.slice(2);
  const tenantId = args[0] || null;
  const objectName = args[1] || 'Account';
  const limit = parseInt(args[2]) || 5;
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         IMPARTNER PRM API TEST                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n🔧 Configuration:`);
  console.log(`   Host: https://${CONFIG.host}`);
  console.log(`   Tenant: ${tenantId || 'NOT SET (required!)'}`);
  console.log(`   Object: ${objectName}`);
  console.log(`   Limit: ${limit}`);
  
  if (!tenantId) {
    console.log('\n⚠️  WARNING: No tenant ID provided!');
    console.log('   Usage: node test-impartner-api.cjs <tenantId> [object] [limit]');
    console.log('   Example: node test-impartner-api.cjs nintex Account 5');
    console.log('\n   Find your tenant ID in the Impartner admin portal URL');
    console.log('   or in Settings > API Configuration');
    return;
  }
  
  try {
    // Test 1: Get records from the specified object
    console.log(`\n\n🔍 TEST 1: Fetching ${objectName} records...`);
    const records = await getRecords(objectName, tenantId, limit);
    displayResults(objectName, records);
    
    // Test 2: If Account, also try User (and vice versa)
    if (objectName === 'Account') {
      console.log(`\n\n🔍 TEST 2: Also fetching User records...`);
      const users = await getRecords('User', tenantId, 3);
      displayResults('User', users);
    } else if (objectName === 'User') {
      console.log(`\n\n🔍 TEST 2: Also fetching Account records...`);
      const accounts = await getRecords('Account', tenantId, 3);
      displayResults('Account', accounts);
    }
    
    // Test 3: Try to get count
    console.log(`\n\n🔍 TEST 3: Getting total count...`);
    try {
      const countData = await apiRequest(`/api/objects/v1/${objectName}?$count=true&$top=1`, tenantId);
      if (countData['@odata.count'] !== undefined) {
        console.log(`📊 Total ${objectName} records: ${countData['@odata.count']}`);
      }
    } catch (e) {
      console.log('Count not available via $count parameter');
    }
    
    console.log('\n\n✅ API tests completed successfully!');
    console.log('\n💡 Next steps:');
    console.log(`   1. Set tenant in env: set IMPARTNER_TENANT_ID=${tenantId}`);
    console.log('   2. Start the server: node server-with-proxy.cjs');
    console.log(`   3. Access via proxy: http://localhost:3000/api/impartner/v1/Account?tenantId=${tenantId}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

main();
