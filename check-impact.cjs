require('dotenv').config();
const https = require('https');
const config = require('./server/config.cjs');

const CONFIG = {
  host: 'prod.impartner.live',
  apiKey: config.impartner.apiKey
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
