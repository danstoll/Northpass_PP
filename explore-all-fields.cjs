/**
 * Explore Impartner User and Account fields
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
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function explore() {
  console.log('=== EXPLORING IMPARTNER USER FIELDS ===\n');
  
  // First get basic User
  console.log('1. Fetching User with default fields...');
  try {
    const res = await makeRequest(`/User?take=1`);
    const json = JSON.parse(res.data);
    if (json.success && json.data?.results?.length > 0) {
      console.log('Default User fields:', Object.keys(json.data.results[0]).join(', '));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Now get User with ALL available fields by requesting many
  console.log('\n2. Fetching User with extended fields...');
  const userFields = 'Id,Email,FirstName,LastName,Title,Phone,AccountId,AccountName,IsActive,Created,Updated,FullName,PortalUrl,ProfileImageUrl,LastLogin,MobilePhone,Department,Street,City,State,Country,PostalCode,TimeZone,Locale';
  try {
    const res = await makeRequest(`/User?fields=${userFields}&take=1`);
    const json = JSON.parse(res.data);
    if (json.success && json.data?.results?.length > 0) {
      const user = json.data.results[0];
      console.log('User record:');
      Object.entries(user).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          console.log(`  ${key}: ${value}`);
        }
      });
    } else {
      console.log('Error:', json.message || json);
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Check Account fields
  console.log('\n\n=== EXPLORING IMPARTNER ACCOUNT FIELDS ===\n');
  
  // Get Account with default fields
  console.log('3. Fetching Account with default fields...');
  try {
    const res = await makeRequest(`/Account?take=1`);
    const json = JSON.parse(res.data);
    if (json.success && json.data?.results?.length > 0) {
      console.log('Default Account fields:', Object.keys(json.data.results[0]).join(', '));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Get Account with extended fields including known custom fields
  console.log('\n4. Fetching Account with many fields...');
  const accountFields = 'Id,Name,Partner_Tier__cf,Account_Status__cf,RegionId,MailingCountry,Website,Phone,Account_Owner__cf,Account_Owner_Email__cf,Partner_Type__cf,CrmId,MemberCount,Updated,ParentAccountId,Created,Description,Industry,BillingStreet,BillingCity,BillingState,BillingCountry,BillingPostalCode,ShippingStreet,ShippingCity,ShippingState,ShippingCountry,ShippingPostalCode,Employees,AnnualRevenue,Tier_NPCU_Requirement__cf,Current_NPCU__cf,Certified_Users_Count__cf,Total_Certifications__cf,Training_URL__cf';
  try {
    const res = await makeRequest(`/Account?fields=${accountFields}&take=1`);
    const json = JSON.parse(res.data);
    if (json.success && json.data?.results?.length > 0) {
      const account = json.data.results[0];
      console.log('Account record with extended fields:');
      Object.entries(account).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          console.log(`  ${key}: ${value}`);
        }
      });
    } else {
      console.log('Error:', json.message || json);
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Check what fields exist that start with common prefixes
  console.log('\n\n5. Checking for custom fields with various prefixes...');
  const customFieldPrefixes = [
    'LMS', 'Northpass', 'Training', 'Certification', 'NPCU', 'Course', 'Learning', 'Portal'
  ];
  
  for (const prefix of customFieldPrefixes) {
    const testFields = `Id,Name,${prefix}__cf,${prefix}_Count__cf,${prefix}_Total__cf,${prefix}_Status__cf`;
    try {
      const res = await makeRequest(`/Account?fields=${testFields}&take=1`);
      const json = JSON.parse(res.data);
      if (json.success && json.data?.results?.length > 0) {
        const fields = Object.keys(json.data.results[0]).filter(f => f.toLowerCase().includes(prefix.toLowerCase()));
        if (fields.length > 0) {
          console.log(`✅ Found ${prefix}-related fields:`, fields.join(', '));
        }
      }
    } catch (e) {
      // Field doesn't exist
    }
  }
  
  process.exit(0);
}

explore().catch(e => { console.error(e); process.exit(1); });
