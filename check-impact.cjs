const https = require('https');

const CONFIG = {
  host: 'prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw'
};

function fetchAccount(id) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.host,
      path: `/api/objects/v1/Account/${id}`,
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

async function investigate() {
  console.log('Fetching Impact Networking details from Impartner...\n');
  const account = await fetchAccount(1886359);
  console.log(JSON.stringify(account, null, 2));
}

investigate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
