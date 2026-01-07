const { query } = require('./server/db/connection.cjs');

const IMPARTNER_CONFIG = {
  host: 'https://prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  tenantId: '1'
};

const IMPARTNER_ACCOUNT_ID = '1298255';
const PARTNER_NAME = 'First Technology Digital Pty Ltd';

async function test() {
  console.log('=== Testing Impartner Sync ===\n');
  
  // 1. Find partner in our database
  console.log('1. Finding partner in our database...');
  const partners = await query(`
    SELECT p.id, p.account_name, p.salesforce_id, p.partner_tier,
           p.cert_count_nintex_ce, p.cert_count_nintex_k2, 
           p.cert_count_nintex_salesforce, p.cert_count_go_to_market, 
           p.total_npcu,
           g.id as lms_group_id, g.name as lms_group_name
    FROM partners p
    LEFT JOIN lms_groups g ON g.partner_id = p.id
    WHERE p.account_name LIKE ?
  `, [`%First Technology Digital%`]);
  
  if (partners.length === 0) {
    console.log('Partner not found in database');
    process.exit(1);
  }
  
  const partner = partners[0];
  console.log('Found:', {
    id: partner.id,
    name: partner.account_name,
    salesforce_id: partner.salesforce_id,
    partner_tier: partner.partner_tier,
    nintex_ce: partner.cert_count_nintex_ce,
    nintex_k2: partner.cert_count_nintex_k2,
    salesforce_certs: partner.cert_count_nintex_salesforce,
    gtm: partner.cert_count_go_to_market,
    total_npcu: partner.total_npcu,
    lms_group_id: partner.lms_group_id,
    lms_group_name: partner.lms_group_name
  });
  
  // 2. Build the update payload (custom fields need __cf suffix)
  // Build the portal URL (base64 encoded JSON with company and tier)
  let portalUrl = '';
  if (partner.lms_group_name) {
    const urlData = {
      company: partner.lms_group_name,
      tier: partner.partner_tier || 'Registered'
    };
    const encodedData = Buffer.from(JSON.stringify(urlData)).toString('base64');
    portalUrl = `https://ptrlrndb.prod.ntxgallery.com/?data=${encodedData}`;
  }
  
  const updateBody = {
    Id: parseInt(IMPARTNER_ACCOUNT_ID),
    Name: PARTNER_NAME,
    Nintex_CE_Certifications__cf: partner.cert_count_nintex_ce || 0,
    Nintex_K2_Certifications__cf: partner.cert_count_nintex_k2 || 0,
    Nintex_for_Salesforce_Certifications__cf: partner.cert_count_nintex_salesforce || 0,
    Nintex_GTM_Certifications__cf: partner.cert_count_go_to_market || 0,
    Total_NPCU__cf: partner.total_npcu || 0,
    LMS_Account_ID__cf: String(partner.id),
    LMS_Group_Name__cf: partner.lms_group_name || '',
    LMS_Training_Dashboard__cf: portalUrl,
    RevenueGoal: 1157480
  };
  
  console.log('\n2. Update payload:', JSON.stringify(updateBody, null, 2));
  
  // 3. First, get the current account to understand the API structure
  console.log(`\n3. Fetching Impartner Account ID ${IMPARTNER_ACCOUNT_ID} first...`);
  
  // Need to use fields param to get specific fields, and proper filter syntax
  const getUrl = `${IMPARTNER_CONFIG.host}/api/objects/v1/Account?fields=Id,Name,Nintex_CE_Certifications__cf,Total_NPCU__cf,LMS_Account_ID__cf,LMS_Group_Name__cf&filter=Id eq ${IMPARTNER_ACCOUNT_ID}`;
  console.log('GET URL:', getUrl);
  
  const getResponse = await fetch(getUrl, {
    headers: {
      'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
      'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
      'Accept': 'application/json'
    }
  });
  
  console.log('GET Response status:', getResponse.status);
  const getData = await getResponse.json();
  console.log('Account data:', JSON.stringify(getData, null, 2));
  
  if (getData.data?.results?.[0]) {
    const account = getData.data.results[0];
    console.log('\nCurrent LMS fields on account:');
    console.log('- Name:', account.Name);
    console.log('- Nintex_CE_Certifications__cf:', account.Nintex_CE_Certifications__cf);
    console.log('- Total_NPCU__cf:', account.Total_NPCU__cf);
    console.log('- LMS_Account_ID__cf:', account.LMS_Account_ID__cf);
    console.log('- LMS_Group_Name__cf:', account.LMS_Group_Name__cf);
  }
  
  // 4. Now try PATCH update with array (update-many)
  console.log(`\n4. Updating account via PATCH (array)...`);
  
  const updateUrl = `${IMPARTNER_CONFIG.host}/api/objects/v1/Account`;
  
  // Send as array for update-many
  const updateArray = [updateBody];
  
  console.log('PATCH URL:', updateUrl);
  console.log('Payload:', JSON.stringify(updateArray, null, 2));
  
  const response = await fetch(updateUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
      'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(updateArray)
  });
  
  console.log('Response status:', response.status);
  
  const responseText = await response.text();
  console.log('Response:', responseText);
  
  if (response.ok) {
    console.log('\n✅ SUCCESS! Account updated in Impartner');
  } else {
    console.log('\n❌ FAILED to update account');
  }
  
  process.exit(0);
}

test().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
