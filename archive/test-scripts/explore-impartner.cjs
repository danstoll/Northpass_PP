/**
 * Impartner PRM API Explorer
 * 
 * Interactive exploration of the Impartner API
 * Discovers fields, relationships, and data structures
 * 
 * Usage:
 *   node explore-impartner.cjs                    # Full exploration
 *   node explore-impartner.cjs --accounts         # Just accounts
 *   node explore-impartner.cjs --users            # Just users
 *   node explore-impartner.cjs --export           # Export to JSON files
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const config = require('./server/config.cjs');

const CONFIG = {
  host: 'prod.impartner.live',
  apiKey: config.impartner.apiKey
};

/**
 * Make API request
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
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, data: data, raw: true });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Analyze field types from sample data
 */
function analyzeFields(records) {
  const fieldAnalysis = {};
  
  records.forEach(record => {
    Object.entries(record).forEach(([key, value]) => {
      if (!fieldAnalysis[key]) {
        fieldAnalysis[key] = {
          name: key,
          types: new Set(),
          samples: [],
          nullCount: 0,
          valueCount: 0
        };
      }
      
      const analysis = fieldAnalysis[key];
      
      if (value === null || value === undefined) {
        analysis.nullCount++;
      } else {
        analysis.valueCount++;
        analysis.types.add(typeof value);
        
        // Collect unique non-null samples (up to 3)
        if (analysis.samples.length < 3) {
          const sampleStr = typeof value === 'object' ? 
            JSON.stringify(value).substring(0, 100) : 
            String(value).substring(0, 100);
          if (!analysis.samples.includes(sampleStr)) {
            analysis.samples.push(sampleStr);
          }
        }
      }
    });
  });
  
  // Convert Sets to Arrays for output
  Object.values(fieldAnalysis).forEach(field => {
    field.types = Array.from(field.types);
  });
  
  return fieldAnalysis;
}

/**
 * Display field analysis in a table format
 */
function displayFieldAnalysis(objectName, analysis) {
  console.log(`\n📊 ${objectName} Field Analysis`);
  console.log('═'.repeat(100));
  console.log(`${'Field Name'.padEnd(35)} | ${'Type(s)'.padEnd(15)} | ${'Non-null'.padEnd(8)} | Sample Values`);
  console.log('─'.repeat(100));
  
  // Sort fields: custom fields (_cf, _cl) last
  const sortedFields = Object.values(analysis).sort((a, b) => {
    const aCustom = a.name.includes('__');
    const bCustom = b.name.includes('__');
    if (aCustom && !bCustom) return 1;
    if (!aCustom && bCustom) return -1;
    return a.name.localeCompare(b.name);
  });
  
  sortedFields.forEach(field => {
    const name = field.name.substring(0, 34).padEnd(35);
    const types = field.types.join(',').substring(0, 14).padEnd(15);
    const nonNull = `${field.valueCount}`.padEnd(8);
    const samples = field.samples.join(' | ').substring(0, 40);
    console.log(`${name} | ${types} | ${nonNull} | ${samples}`);
  });
}

/**
 * Identify relationships between objects
 */
function identifyRelationships(accountFields, userFields) {
  console.log('\n🔗 Potential Relationships');
  console.log('═'.repeat(60));
  
  // Look for Account references in User
  const accountRefs = Object.keys(userFields).filter(f => 
    f.toLowerCase().includes('account') || 
    f.toLowerCase().includes('company')
  );
  console.log('\nUser → Account relationships:');
  accountRefs.forEach(field => {
    console.log(`   • User.${field}`);
  });
  
  // Look for User references in Account
  const userRefs = Object.keys(accountFields).filter(f => 
    f.toLowerCase().includes('user') || 
    f.toLowerCase().includes('owner') ||
    f.toLowerCase().includes('manager')
  );
  console.log('\nAccount → User relationships:');
  userRefs.forEach(field => {
    console.log(`   • Account.${field}`);
  });
}

/**
 * Map fields to our database schema
 */
function suggestMapping(objectName, fields) {
  console.log(`\n🗺️ Suggested Mapping: ${objectName} → Our Database`);
  console.log('═'.repeat(80));
  
  const mapping = [];
  
  if (objectName === 'Account') {
    // Map Account fields to our partners table
    const mappings = {
      'AccountName': 'account_name',
      'Id': 'prm_account_id',
      'Account_Status__cf': 'status',
      'Account_Country_Region__cf': 'region',
      'Account_Owner__cf': 'owner',
      'AccountManager': 'account_manager',
      'Account_Is_Compliant__cf': 'is_compliant',
      'Account_Last_Login_Date__cf': 'last_login'
    };
    
    Object.entries(mappings).forEach(([prmField, ourField]) => {
      if (fields[prmField]) {
        console.log(`   ${prmField.padEnd(30)} → partners.${ourField}`);
        mapping.push({ prm: prmField, db: `partners.${ourField}` });
      }
    });
  } else if (objectName === 'User') {
    // Map User fields to our contacts table
    const mappings = {
      'FirstName': 'first_name',
      'LastName': 'last_name',
      'Email': 'email',
      'AccountName': 'account_name (FK to partners)',
      'Account_ID__cf': 'prm_account_id (FK to partners)',
      'Id': 'prm_user_id',
      'Account_Status__cf': 'status'
    };
    
    Object.entries(mappings).forEach(([prmField, ourField]) => {
      if (fields[prmField]) {
        console.log(`   ${prmField.padEnd(30)} → contacts.${ourField}`);
        mapping.push({ prm: prmField, db: `contacts.${ourField}` });
      }
    });
  }
  
  return mapping;
}

/**
 * Export data to JSON files
 */
function exportToJson(objectName, records, analysis) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Export records
  const recordsFile = `impartner-${objectName.toLowerCase()}-${timestamp}.json`;
  fs.writeFileSync(recordsFile, JSON.stringify(records, null, 2));
  console.log(`   📄 Records exported to: ${recordsFile}`);
  
  // Export analysis
  const analysisFile = `impartner-${objectName.toLowerCase()}-analysis-${timestamp}.json`;
  fs.writeFileSync(analysisFile, JSON.stringify(analysis, null, 2));
  console.log(`   📊 Analysis exported to: ${analysisFile}`);
}

/**
 * Main explorer
 */
async function main() {
  const args = process.argv.slice(2);
  const doAccounts = args.includes('--accounts') || args.length === 0 || args.includes('--export');
  const doUsers = args.includes('--users') || args.length === 0 || args.includes('--export');
  const doExport = args.includes('--export');
  
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    IMPARTNER PRM API EXPLORER                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\n🔧 Host: https://${CONFIG.host}`);
  console.log(`📅 Date: ${new Date().toISOString()}`);
  
  let accountAnalysis = null;
  let userAnalysis = null;
  let accountRecords = [];
  let userRecords = [];
  
  try {
    // Explore Accounts
    if (doAccounts) {
      console.log('\n\n' + '═'.repeat(80));
      console.log('🏢 EXPLORING ACCOUNTS');
      console.log('═'.repeat(80));
      
      // Get count
      console.log('\n📊 Getting total count...');
      try {
        const countResult = await apiRequest('/api/objects/v1/Account?$count=true&$top=1');
        if (countResult.data['@odata.count']) {
          console.log(`   Total Accounts: ${countResult.data['@odata.count']}`);
        }
      } catch (e) {
        console.log('   Count not available');
      }
      
      // Get sample records for analysis
      console.log('\n📥 Fetching sample records...');
      const accountResult = await apiRequest('/api/objects/v1/Account?$top=50');
      accountRecords = accountResult.data.value || accountResult.data || [];
      console.log(`   Retrieved ${accountRecords.length} records`);
      
      // Analyze
      accountAnalysis = analyzeFields(accountRecords);
      displayFieldAnalysis('Account', accountAnalysis);
      suggestMapping('Account', accountAnalysis);
      
      if (doExport) {
        console.log('\n📁 Exporting Account data...');
        exportToJson('Account', accountRecords, accountAnalysis);
      }
    }
    
    // Explore Users
    if (doUsers) {
      console.log('\n\n' + '═'.repeat(80));
      console.log('👤 EXPLORING USERS');
      console.log('═'.repeat(80));
      
      // Get count
      console.log('\n📊 Getting total count...');
      try {
        const countResult = await apiRequest('/api/objects/v1/User?$count=true&$top=1');
        if (countResult.data['@odata.count']) {
          console.log(`   Total Users: ${countResult.data['@odata.count']}`);
        }
      } catch (e) {
        console.log('   Count not available');
      }
      
      // Get sample records
      console.log('\n📥 Fetching sample records...');
      const userResult = await apiRequest('/api/objects/v1/User?$top=50');
      userRecords = userResult.data.value || userResult.data || [];
      console.log(`   Retrieved ${userRecords.length} records`);
      
      // Analyze
      userAnalysis = analyzeFields(userRecords);
      displayFieldAnalysis('User', userAnalysis);
      suggestMapping('User', userAnalysis);
      
      if (doExport) {
        console.log('\n📁 Exporting User data...');
        exportToJson('User', userRecords, userAnalysis);
      }
    }
    
    // Show relationships if we have both
    if (accountAnalysis && userAnalysis) {
      identifyRelationships(accountAnalysis, userAnalysis);
    }
    
    // Summary
    console.log('\n\n' + '═'.repeat(80));
    console.log('📋 SUMMARY');
    console.log('═'.repeat(80));
    console.log('\n✅ API exploration complete!');
    console.log('\n💡 OData Query Examples:');
    console.log('   • Filter: /api/objects/v1/Account?$filter=AccountName eq \'Acme\'');
    console.log('   • Select: /api/objects/v1/User?$select=FirstName,LastName,Email');
    console.log('   • Top/Skip: /api/objects/v1/Account?$top=100&$skip=200');
    console.log('   • Order: /api/objects/v1/User?$orderby=LastName asc');
    console.log('   • Expand: /api/objects/v1/User?$expand=Account');
    
    console.log('\n🔗 Proxy URLs (when server running):');
    console.log('   • http://localhost:3000/api/impartner/health');
    console.log('   • http://localhost:3000/api/impartner/v1/Account');
    console.log('   • http://localhost:3000/api/impartner/v1/User');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
