/**
 * Get primary user details from Impartner Account
 */
require('dotenv').config();
const https = require('https');
const config = require('./server/config.cjs');

const CONFIG = {
  host: 'prod.impartner.live',
  apiKey: config.impartner.apiKey,
  tenantId: config.impartner.tenantId
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
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function getPrimaryUserDetails() {
  console.log('=== GETTING PRIMARY USER DETAILS ===\n');
  
  // Get accounts with PrimaryUserId
  const accountRes = await makeRequest('/Account?fields=Id,Name,PrimaryUserId,Partner_Tier__cf&take=10');
  const accounts = JSON.parse(accountRes.data);
  
  console.log('Sample accounts with PrimaryUserId:\n');
  
  for (const acc of accounts.data.results) {
    console.log(`Partner: ${acc.name}`);
    console.log(`  Tier: ${acc.partner_Tier__cf || 'N/A'}`);
    console.log(`  PrimaryUserId: ${acc.primaryUserId || 'None'}`);
    
    if (acc.primaryUserId) {
      // Get user details
      const userRes = await makeRequest(`/User/${acc.primaryUserId}?fields=Id,Email,FirstName,LastName,FullName,Title,Phone`);
      const user = JSON.parse(userRes.data);
      
      if (user.success) {
        console.log(`  Primary User: ${user.data.fullName || user.data.firstName + ' ' + user.data.lastName}`);
        console.log(`  Email: ${user.data.email}`);
        console.log(`  Title: ${user.data.title || 'N/A'}`);
      } else {
        console.log(`  User lookup failed:`, user.message);
      }
    }
    console.log('');
  }
  
  // Count how many accounts have primary users
  let totalAccounts = 0;
  let withPrimaryUser = 0;
  let skip = 0;
  const take = 100;
  
  console.log('\n=== COUNTING ACCOUNTS WITH PRIMARY USER ===\n');
  
  while (true) {
    const res = await makeRequest(`/Account?fields=Id,PrimaryUserId&take=${take}&skip=${skip}`);
    const json = JSON.parse(res.data);
    
    if (!json.success || json.data.results.length === 0) break;
    
    for (const acc of json.data.results) {
      totalAccounts++;
      if (acc.primaryUserId) withPrimaryUser++;
    }
    
    skip += take;
    process.stdout.write(`  Checked ${totalAccounts} accounts...\r`);
    
    if (json.data.results.length < take) break;
  }
  
  console.log(`\n\nTotal accounts: ${totalAccounts}`);
  console.log(`With PrimaryUserId: ${withPrimaryUser} (${Math.round(withPrimaryUser/totalAccounts*100)}%)`);
  console.log(`Without: ${totalAccounts - withPrimaryUser}`);
  
  process.exit(0);
}

getPrimaryUserDetails().catch(e => { console.error(e); process.exit(1); });
