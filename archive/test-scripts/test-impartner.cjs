/**
 * Impartner PRM API Test - Corrected Format
 * 
 * Based on PRM REST Console observations:
 * - Response: { data: { count, entity, results: [] }, success: true }
 * - Query params: q, fields, filter, orderby, skip, take
 * - Auth: Authorization: prm-key <key> (no tenant header needed)
 * 
 * Usage:
 *   node test-impartner.cjs                    # Get accounts
 *   node test-impartner.cjs Account 10         # Get 10 accounts
 *   node test-impartner.cjs User 5             # Get 5 users
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
function apiRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.host,
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `prm-key ${CONFIG.apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    console.log(`\n📡 GET https://${CONFIG.host}${path}`);
    console.log('─'.repeat(70));

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
            console.log('📄 Raw response:', data.substring(0, 500));
            resolve(data);
          }
        } else if (res.statusCode === 302) {
          console.log('❌ Redirect to:', res.headers.location);
          reject(new Error('Authentication failed - redirected to login'));
        } else {
          console.log('❌ Error:', data.substring(0, 500));
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Get records from an object using Impartner query format
 */
async function getRecords(objectName, options = {}) {
  const { take = 10, skip = 0, fields = '', filter = '', orderby = '' } = options;
  
  // Build query string using Impartner format (not OData)
  const params = new URLSearchParams();
  if (fields) params.append('fields', fields);
  if (filter) params.append('filter', filter);
  if (orderby) params.append('orderby', orderby);
  if (skip) params.append('skip', skip.toString());
  if (take) params.append('take', take.toString());
  
  const queryString = params.toString();
  const path = `/api/objects/v1/${objectName}${queryString ? '?' + queryString : ''}`;
  
  return apiRequest(path);
}

/**
 * Display results
 */
function displayResults(objectName, response) {
  console.log(`\n📊 ${objectName} Results:`);
  console.log('═'.repeat(70));
  
  if (!response) {
    console.log('No response');
    return;
  }

  // Handle Impartner response format: { data: { count, entity, results }, success }
  if (response.success === true && response.data) {
    const { count, entity, results } = response.data;
    console.log(`✅ Success! Entity: ${entity}, Total Count: ${count}`);
    console.log(`   Retrieved: ${results?.length || 0} records\n`);
    
    if (results && results.length > 0) {
      // Show first record structure
      const firstRecord = results[0];
      const fields = Object.keys(firstRecord);
      
      console.log(`📋 Fields available (${fields.length} total):`);
      
      // Group fields: standard vs custom (__cf, __cl)
      const standardFields = fields.filter(f => !f.includes('__'));
      const customFields = fields.filter(f => f.includes('__'));
      
      console.log('\n   Standard fields:');
      standardFields.slice(0, 15).forEach(field => {
        const value = firstRecord[field];
        const preview = value === null ? 'null' : String(value).substring(0, 40);
        console.log(`      • ${field}: ${preview}`);
      });
      if (standardFields.length > 15) {
        console.log(`      ... and ${standardFields.length - 15} more`);
      }
      
      if (customFields.length > 0) {
        console.log('\n   Custom fields (__cf, __cl):');
        customFields.slice(0, 10).forEach(field => {
          const value = firstRecord[field];
          const preview = value === null ? 'null' : String(value).substring(0, 40);
          console.log(`      • ${field}: ${preview}`);
        });
        if (customFields.length > 10) {
          console.log(`      ... and ${customFields.length - 10} more`);
        }
      }
      
      // Show sample records
      console.log('\n📝 Sample Records:');
      results.slice(0, 3).forEach((record, i) => {
        console.log(`\n   --- Record ${i + 1} (ID: ${record.Id || record.id}) ---`);
        
        if (objectName === 'Account') {
          console.log(`      Name: ${record.AccountName || record.Name || 'N/A'}`);
          console.log(`      Status: ${record.Account_Status__cf || record.Status || 'N/A'}`);
          console.log(`      Region: ${record.Account_Country_Region__cf || 'N/A'}`);
          console.log(`      Owner: ${record.Account_Owner__cf || record.AccountManager || 'N/A'}`);
          console.log(`      Compliant: ${record.Account_Is_Compliant__cf || 'N/A'}`);
        } else if (objectName === 'User') {
          console.log(`      Name: ${record.FirstName || ''} ${record.LastName || ''}`);
          console.log(`      Email: ${record.Email || 'N/A'}`);
          console.log(`      Account: ${record.AccountName || 'N/A'}`);
          console.log(`      Account ID: ${record.Account_ID__cf || record.AccountId || 'N/A'}`);
        } else {
          // Generic display
          Object.entries(record).slice(0, 6).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
              console.log(`      ${key}: ${String(value).substring(0, 50)}`);
            }
          });
        }
      });
    }
  } else if (response.success === false) {
    console.log('❌ API returned success: false');
    console.log('   Errors:', JSON.stringify(response.errors || response.message, null, 2));
  } else {
    // Unknown format
    console.log('Response structure:', JSON.stringify(response, null, 2).substring(0, 1000));
  }
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  const objectName = args[0] || 'Account';
  const take = parseInt(args[1]) || 10;
  
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║              IMPARTNER PRM API TEST                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`\n🔧 Configuration:`);
  console.log(`   Host: https://${CONFIG.host}`);
  console.log(`   Object: ${objectName}`);
  console.log(`   Take: ${take}`);
  console.log(`   Auth: prm-key <key>`);
  
  try {
    // Test 1: Get records
    console.log(`\n\n🔍 TEST 1: Fetching ${objectName} records...`);
    const response = await getRecords(objectName, { take });
    displayResults(objectName, response);
    
    // Test 2: If Account, also try User
    if (objectName === 'Account') {
      console.log(`\n\n🔍 TEST 2: Also fetching User records...`);
      const userResponse = await getRecords('User', { take: 3 });
      displayResults('User', userResponse);
    }
    
    console.log('\n\n' + '═'.repeat(70));
    console.log('✅ API tests completed successfully!');
    console.log('\n💡 Query examples:');
    console.log('   • GET /api/objects/v1/Account?take=100');
    console.log('   • GET /api/objects/v1/User?fields=FirstName,LastName,Email');
    console.log('   • GET /api/objects/v1/Account?filter=AccountName eq \'Acme\'');
    console.log('   • GET /api/objects/v1/User?orderby=LastName&skip=0&take=50');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

main();
