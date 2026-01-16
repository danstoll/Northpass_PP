/**
 * Find primary user/contact fields in Impartner Account object
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
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function findPrimaryUserFields() {
  console.log('=== SEARCHING FOR PRIMARY USER/CONTACT FIELDS ===\n');
  
  // Fields that might contain primary user info
  const fieldsToTest = [
    // Standard fields
    'PrimaryUserId', 'PrimaryUserName', 'PrimaryUserEmail',
    'PrimaryContactId', 'PrimaryContactName', 'PrimaryContactEmail',
    'MainContactId', 'MainContactName', 'MainContactEmail',
    'ContactId', 'ContactName', 'ContactEmail',
    'OwnerId', 'OwnerName', 'OwnerEmail',
    'AdminUserId', 'AdminUserName', 'AdminUserEmail',
    // Custom fields
    'Primary_User__cf', 'Primary_User_Name__cf', 'Primary_User_Email__cf',
    'Primary_Contact__cf', 'Primary_Contact_Name__cf', 'Primary_Contact_Email__cf',
    'Main_Contact__cf', 'Main_Contact_Name__cf', 'Main_Contact_Email__cf',
    'Partner_Admin__cf', 'Partner_Admin_Name__cf', 'Partner_Admin_Email__cf',
    'Account_Admin__cf', 'Account_Admin_Name__cf', 'Account_Admin_Email__cf'
  ];
  
  const found = [];
  
  for (const field of fieldsToTest) {
    try {
      const res = await makeRequest(`/Account?fields=Id,Name,${field}&take=5`);
      const json = JSON.parse(res.data);
      if (json.success) {
        // Check if any record has data for this field
        let hasData = false;
        let sampleValue = null;
        for (const record of json.data.results || []) {
          const key = field.charAt(0).toLowerCase() + field.slice(1);
          const value = record[key];
          if (value !== undefined && value !== null && value !== '') {
            hasData = true;
            sampleValue = value;
            break;
          }
        }
        found.push({ field, hasData, sampleValue });
        if (hasData) {
          console.log(`✅ ${field}: ${JSON.stringify(sampleValue).substring(0, 60)}`);
        } else {
          console.log(`  ${field}: (available but empty)`);
        }
      }
    } catch (e) {
      // Field not found
    }
  }
  
  console.log(`\n=== FOUND ${found.length} FIELDS ===`);
  console.log('Fields with data:', found.filter(f => f.hasData).map(f => f.field).join(', '));
  
  // Now check User object for primary user lookup fields
  console.log('\n\n=== CHECKING USER OBJECT FOR ACCOUNT LINK ===\n');
  
  // Get a sample account with users
  const accountRes = await makeRequest('/Account?fields=Id,Name,MemberCount&take=5');
  const accounts = JSON.parse(accountRes.data);
  console.log('Sample accounts with member counts:');
  for (const acc of accounts.data.results) {
    console.log(`  ${acc.name}: ${acc.memberCount} members`);
  }
  
  // Check if User has isPrimary or similar field
  const userFields = [
    'IsPrimary', 'IsPrimaryContact', 'IsAdmin', 'IsAccountAdmin',
    'PrimaryContact', 'AccountAdmin', 'Role', 'Roles', 'UserRole',
    'Is_Primary__cf', 'Is_Admin__cf', 'Primary_Contact__cf'
  ];
  
  console.log('\nSearching User object for primary/admin fields...');
  for (const field of userFields) {
    try {
      const res = await makeRequest(`/User?fields=Id,Email,AccountName,${field}&take=5`);
      const json = JSON.parse(res.data);
      if (json.success) {
        const key = field.charAt(0).toLowerCase() + field.slice(1);
        const sample = json.data.results[0]?.[key];
        if (sample !== undefined) {
          console.log(`✅ ${field}: ${JSON.stringify(sample)}`);
        } else {
          console.log(`  ${field}: (available)`);
        }
      }
    } catch (e) {
      // Not found
    }
  }
  
  process.exit(0);
}

findPrimaryUserFields().catch(e => { console.error(e); process.exit(1); });
