require('dotenv').config();
const https = require('https');
const config = require('./server/config.cjs');

const CONFIG = {
  host: 'prod.impartner.live',
  apiKey: config.impartner.apiKey
};

function fetchPage(skip) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.host,
      path: `/api/objects/v1/Account?fields=Id,Name,Partner_Tier__cf&take=1000&skip=${skip}`,
      headers: {
        'Authorization': `prm-key ${CONFIG.apiKey}`,
        'X-PRM-TenantId': '1'
      }
    };
    
    https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.data || json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function search() {
  let skip = 0;
  let allMatches = [];
  let total = 0;
  
  while (true) {
    console.log(`Fetching skip=${skip}...`);
    const page = await fetchPage(skip);
    const results = page.results || [];
    total = page.count || total;
    
    if (results.length === 0) break;
    
    const matches = results.filter(a => a.name && a.name.toLowerCase().includes('impact'));
    allMatches.push(...matches);
    
    skip += results.length;
    if (skip >= total) break;
  }
  
  console.log('\nFound accounts with "Impact":');
  console.log(JSON.stringify(allMatches, null, 2));
  console.log(`\nTotal: ${allMatches.length} matches out of ${total} accounts`);
}

search().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
