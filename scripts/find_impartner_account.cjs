require('dotenv').config();
const config = require('../server/config.cjs');

const IMPARTNER_CONFIG = {
  host: config.impartner.hostUrl,
  apiKey: config.impartner.apiKey,
  tenantId: config.impartner.tenantId
};

(async () => {
  const searchName = process.argv[2] || 'Partner Portal EMEA';
  const filter = encodeURIComponent(`Name LIKE '%${searchName}%'`);
  const url = `${IMPARTNER_CONFIG.host}/api/objects/v1/Account?fields=Id,Name&filter=${filter}`;
  
  console.log('Searching for:', searchName);
  const resp = await fetch(url, {
    headers: {
      'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
      'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId
    }
  });
  const data = await resp.json();
  console.log(JSON.stringify(data, null, 2));
})();
