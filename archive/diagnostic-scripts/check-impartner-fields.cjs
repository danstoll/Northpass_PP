/**
 * Quick script to check Impartner Account fields for parent account info
 */

require('dotenv').config();
const https = require('https');
const config = require('./server/config.cjs');

const CONFIG = {
  host: 'prod.impartner.live',
  basePath: '/api/objects/v1',
  apiKey: config.impartner.apiKey,
  tenantId: config.impartner.tenantId
};

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.host,
      path: CONFIG.basePath + path,
      method: 'GET',
      headers: {
        'Authorization': `prm-key ${CONFIG.apiKey}`,
        'X-PRM-TenantId': CONFIG.tenantId,
        'Accept': 'application/json'
      }
    };

    console.log(`\n📡 GET ${CONFIG.host}${options.path}`);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.error(`❌ Status ${res.statusCode}: ${data.substring(0, 300)}`);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         CHECK IMPARTNER ACCOUNT FIELDS                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // Fetch ALL accounts to see parent relationships
    const fields = [
      'Id', 'Name', 'Partner_Tier__cf', 'Account_Status__cf',
      'ParentAccountId',
      'CrmId', 'MailingCountry', 'Region', 'Partner_Type__cf'
    ].join(',');
    
    console.log('📥 Fetching ALL accounts (this may take a moment)...');
    
    let allAccounts = [];
    let skip = 0;
    const take = 100;
    
    while (true) {
      const result = await makeRequest(`/Account?fields=${fields}&take=${take}&skip=${skip}`);
      const accounts = result.data?.results || [];
      if (accounts.length === 0) break;
      allAccounts = allAccounts.concat(accounts);
      console.log(`   Fetched ${allAccounts.length} accounts...`);
      skip += take;
      if (allAccounts.length > 3000) break; // Safety limit
    }
    
    console.log(`\n✅ Total accounts: ${allAccounts.length}`);
    
    // Find accounts with parent relationships
    const withParent = allAccounts.filter(a => a.parentAccountId);
    console.log(`📊 Accounts with parent relationships: ${withParent.length}`);
    
    if (withParent.length > 0) {
      // Group by parent
      const byParent = {};
      for (const acc of withParent) {
        if (!byParent[acc.parentAccountId]) {
          byParent[acc.parentAccountId] = [];
        }
        byParent[acc.parentAccountId].push(acc);
      }
      
      console.log(`\n📋 Parent account groups (${Object.keys(byParent).length} parent accounts):`);
      
      // Look up parent names and show hierarchies
      for (const [parentId, children] of Object.entries(byParent)) {
        // Find parent name (might be in allAccounts)
        const parent = allAccounts.find(a => a.id === parseInt(parentId));
        const parentName = parent ? parent.name : `Unknown (ID: ${parentId})`;
        
        console.log(`\n   🏢 ${parentName}:`);
        children.forEach(child => {
          console.log(`      └─ ${child.name} (${child.mailingCountry || 'Unknown country'})`);
        });
      }
      
      // Also check for "family name" patterns (e.g., multiple Capgemini, Protiviti accounts)
      console.log('\n📊 Detecting partner families by name patterns...');
      const namePrefixes = {};
      for (const acc of allAccounts) {
        // Extract first word (or first two words) as potential family name
        const words = acc.name.split(/[\s,]+/);
        const prefix = words[0];
        if (!namePrefixes[prefix]) {
          namePrefixes[prefix] = [];
        }
        namePrefixes[prefix].push(acc);
      }
      
      // Show families with 3+ members
      const families = Object.entries(namePrefixes)
        .filter(([_, members]) => members.length >= 3)
        .sort((a, b) => b[1].length - a[1].length);
      
      console.log(`\n📋 Potential partner families (3+ accounts with same name prefix):`);
      families.slice(0, 20).forEach(([prefix, members]) => {
        console.log(`\n   🏢 "${prefix}" family (${members.length} accounts):`);
        members.slice(0, 5).forEach(m => {
          const parentNote = m.parentAccountId ? ` [has parent: ${m.parentAccountId}]` : '';
          console.log(`      ${m.name} (${m.mailingCountry || '?'})${parentNote}`);
        });
        if (members.length > 5) {
          console.log(`      ... and ${members.length - 5} more`);
        }
      });
    }
    
    return; // Skip the rest
    
    if (result.success && result.data) {
      // Handle both array and object with results
      const accounts = Array.isArray(result.data) ? result.data : result.data.results || [];
      console.log(`\n✅ Got ${accounts.length} accounts\n`);
      
      if (accounts.length === 0) {
        console.log('❌ No accounts in results');
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      
      // Get all field names from first account
      const fieldNames = Object.keys(accounts[0]);
      console.log('📋 Available fields:');
      fieldNames.sort().forEach(f => {
        const val = accounts[0][f];
        const type = val === null ? 'null' : typeof val;
        console.log(`   ${f} (${type})`);
      });
      
      // Look for parent-related fields
      console.log('\n🔍 Parent-related fields:');
      const parentFields = fieldNames.filter(f => 
        f.toLowerCase().includes('parent') || 
        f.toLowerCase().includes('hierarchy') ||
        f.toLowerCase().includes('global')
      );
      
      if (parentFields.length > 0) {
        parentFields.forEach(f => {
          console.log(`\n   📍 ${f}:`);
          accounts.slice(0, 5).forEach((acc, i) => {
            console.log(`      Account ${i + 1} (${acc.name}): ${JSON.stringify(acc[f])}`);
          });
        });
      } else {
        console.log('   No parent-related fields found in returned fields');
      }
      
      // Show accounts with non-null parent fields
      console.log('\n📄 Looking for accounts with parent data...');
      const withParent = accounts.filter(a => a.parentAccountId);
      
      if (withParent.length > 0) {
        console.log(`Found ${withParent.length} accounts with parent info:`);
        withParent.forEach(acc => {
          console.log(`\n   ${acc.name}:`);
          console.log(`      ID: ${acc.id}`);
          console.log(`      Parent Account ID: ${acc.parentAccountId}`);
          console.log(`      Country: ${acc.mailingCountry}`);
          console.log(`      Tier: ${acc.partner_Tier__cf}`);
        });
        
        // Try to find the parent accounts
        console.log('\n🔗 Looking up parent accounts...');
        const parentIds = [...new Set(withParent.map(a => a.parentAccountId))];
        for (const parentId of parentIds) {
          const parentResult = await makeRequest(`/Account?fields=Id,Name,Partner_Tier__cf,MailingCountry&filter=Id=${parentId}`);
          if (parentResult.success && parentResult.data?.results?.length > 0) {
            const parent = parentResult.data.results[0];
            console.log(`\n   Parent ID ${parentId}: ${parent.name}`);
            console.log(`      Country: ${parent.mailingCountry}`);
            console.log(`      Tier: ${parent.partner_Tier__cf}`);
          }
        }
      } else {
        console.log('   No accounts found with parent data in this sample');
      }
      
      // Show sample account
      console.log('\n📄 Sample account:');
      console.log(JSON.stringify(accounts[0], null, 2));
      
    } else {
      console.log('❌ No data returned');
      console.log(JSON.stringify(result, null, 2));
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

main();
