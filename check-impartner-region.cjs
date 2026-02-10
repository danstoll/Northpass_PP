/**
 * Check what fields Impartner returns for Region
 */
require('dotenv').config();
const https = require('https');
const config = require('./server/config.cjs');

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'prod.impartner.live',
      path: '/api/objects/v1' + path,
      method: 'GET',
      headers: {
        'Authorization': `prm-key ${config.impartner.apiKey}`,
        'X-PRM-TenantId': config.impartner.tenantId,
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // Get accounts with RegionId
  console.log('=== FETCHING ACCOUNTS WITH RegionId ===');
  const accRes = await makeRequest('/Account?fields=Id,Name,RegionId,MailingCountry,Partner_Tier__cf&take=10');
  console.log('Status:', accRes.status);
  const json = JSON.parse(accRes.data);
  console.log('Success:', json.success);
  
  if (json.success && json.data?.results) {
    const records = json.data.results;
    console.log('\n=== RegionId VALUES ===');
    const regionIds = [...new Set(records.map(r => r.regionId).filter(Boolean))];
    console.log('Unique RegionIds found:', regionIds);
    
    console.log('\n=== SAMPLE ACCOUNTS ===');
    records.forEach((acc, i) => {
      console.log(`${i + 1}. ${acc.name} | regionId: ${acc.regionId} | country: ${acc.mailingCountry}`);
    });
  } else {
    console.log('Response:', accRes.data.substring(0, 1000));
  }
  
  // Now try to get the Region lookup table with Name field
  console.log('\n=== CHECKING REGION LOOKUP TABLE ===');
  const regionRes = await makeRequest('/Region?fields=Id,Name&take=20');
  console.log('Region response:', regionRes.data);
}

main().catch(console.error);
