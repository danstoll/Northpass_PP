const https = require('https');

const CONFIG = {
  host: 'prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw'
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
