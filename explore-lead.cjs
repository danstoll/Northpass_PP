/**
 * Explore Lead object in Impartner
 */
const https = require('https');

const CONFIG = {
  host: 'prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  tenantId: '1'
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
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`Parse error: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function exploreLead() {
  console.log('=== EXPLORING IMPARTNER LEAD OBJECT ===\n');
  
  try {
    // First, get just ID to confirm object is accessible
    let response = await makeRequest('/Lead?take=1');
    if (!response.success) {
      console.log('API Error:', response.message);
      return;
    }
    console.log('Total Lead records:', response.data.count);
    
    // Try field discovery by testing individual fields
    const testFields = [
      'Id', 'FirstName', 'LastName', 'Email', 'Phone', 'Title', 
      'CompanyName', 'AccountId', 'Account', 'AccountName',
      'Status', 'LeadStatus', 'Source', 'LeadSource',
      'Created', 'Updated', 'OwnerId', 'Owner',
      'Description', 'Address', 'City', 'State', 'Country',
      'CrmId', 'PartnerAccountId', 'AssignedPartnerId'
    ];
    
    const validFields = ['Id'];
    
    console.log('\nDiscovering valid fields...');
    for (const field of testFields) {
      if (field === 'Id') continue;
      try {
        const test = await makeRequest(`/Lead?take=1&fields=Id,${field}`);
        if (test.success) {
          validFields.push(field);
          console.log(`  ✅ ${field}`);
        }
      } catch (e) {
        // Field doesn't exist
      }
    }
    
    console.log(`\n=== VALID FIELDS (${validFields.length}) ===`);
    console.log(validFields.join(', '));
    
    // Now fetch with all valid fields
    if (validFields.length > 1) {
      console.log('\n=== SAMPLE LEAD DATA ===');
      const fullResponse = await makeRequest(`/Lead?take=3&fields=${validFields.join(',')}`);
      if (fullResponse.success && fullResponse.data.results) {
        fullResponse.data.results.forEach((lead, i) => {
          console.log(`\n--- Lead ${i + 1} ---`);
          console.log(JSON.stringify(lead, null, 2));
        });
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

exploreLead().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
