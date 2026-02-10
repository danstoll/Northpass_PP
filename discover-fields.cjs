/**
 * Discover actual available Impartner Account fields
 */
require('dotenv').config();
const https = require('https');
const config = require('./server/config.cjs');

const CONFIG = {
  host: 'prod.impartner.live',
  apiKey: config.impartner.apiKey,
  tenantId: config.impartner.tenantId
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

async function discoverFields() {
  console.log('=== DISCOVERING IMPARTNER ACCOUNT FIELDS ===\n');
  
  const allPossibleFields = [
    // Standard fields
    'Id', 'Name', 'Created', 'Updated', 'IsActive', 'OwnerId', 'OwnerName',
    'Website', 'Phone', 'Fax', 'Email', 'Industry', 'Type', 'Status',
    'BillingStreet', 'BillingCity', 'BillingState', 'BillingCountry', 'BillingPostalCode',
    'MailingStreet', 'MailingCity', 'MailingState', 'MailingCountry', 'MailingPostalCode',
    'ShippingStreet', 'ShippingCity', 'ShippingState', 'ShippingCountry', 'ShippingPostalCode',
    'ParentAccountId', 'ParentAccountName', 'CrmId', 'SalesforceId', 'ExternalId',
    'RegionId', 'Region', 'TierId', 'Tier', 'MemberCount',
    'Employees', 'AnnualRevenue', 'Description', 'Notes',
    // Custom fields with __cf suffix (Nintex specific)
    'Partner_Tier__cf', 'Account_Status__cf', 'Account_Owner__cf', 'Account_Owner_Email__cf',
    'Partner_Type__cf', 'Region__cf', 'Territory__cf',
    // Training/LMS custom fields
    'Total_NPCU__cf', 'Current_NPCU__cf', 'NPCU_Count__cf', 'NPCU__cf',
    'Certified_Users__cf', 'Certified_Users_Count__cf', 'Total_Certifications__cf',
    'Training_Status__cf', 'Training_URL__cf', 'Portal_URL__cf',
    'LMS_Group_Id__cf', 'Northpass_Group__cf', 'LMS_User_Count__cf',
    'Last_Training_Date__cf', 'Active_Learners__cf',
    'Certifications_Count__cf', 'Courses_Completed__cf'
  ];
  
  const foundFields = [];
  const notFoundFields = []; // eslint-disable-line no-unused-vars
  
  for (const field of allPossibleFields) {
    try {
      const res = await makeRequest(`/Account?fields=Id,${field}&take=1`);
      const json = JSON.parse(res.data);
      if (json.success) {
        foundFields.push(field);
        const sample = json.data.results[0]?.[field.charAt(0).toLowerCase() + field.slice(1)];
        if (sample !== undefined && sample !== null) {
          console.log(`✅ ${field}: ${JSON.stringify(sample).substring(0, 50)}`);
        } else {
          console.log(`✅ ${field}: (available but empty/null)`);
        }
      } else {
        notFoundFields.push(field);
      }
    } catch (e) {
      notFoundFields.push(field);
    }
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`\nFound ${foundFields.length} valid fields:`);
  console.log(foundFields.join(', '));
  
  console.log(`\n${notFoundFields.length} fields not found`);
  
  // Now check User fields
  console.log('\n\n=== DISCOVERING IMPARTNER USER FIELDS ===\n');
  
  const userFields = [
    'Id', 'Email', 'FirstName', 'LastName', 'FullName', 'Title', 'Phone', 'MobilePhone',
    'AccountId', 'AccountName', 'IsActive', 'Created', 'Updated', 'LastLogin',
    'Department', 'Street', 'City', 'State', 'Country', 'PostalCode',
    'TimeZone', 'Locale', 'Language', 'ProfileImage',
    // Custom fields
    'LMS_User_Id__cf', 'Northpass_Id__cf', 'Training_Status__cf',
    'Certifications__cf', 'NPCU__cf', 'Total_NPCU__cf',
    'Courses_Completed__cf', 'Last_Course_Date__cf',
    'Portal_URL__cf', 'Training_URL__cf'
  ];
  
  const foundUserFields = [];
  
  for (const field of userFields) {
    try {
      const res = await makeRequest(`/User?fields=Id,${field}&take=1`);
      const json = JSON.parse(res.data);
      if (json.success) {
        foundUserFields.push(field);
        const key = field.charAt(0).toLowerCase() + field.slice(1);
        const sample = json.data.results[0]?.[key];
        if (sample !== undefined && sample !== null && sample !== '') {
          console.log(`✅ ${field}: ${JSON.stringify(sample).substring(0, 50)}`);
        } else {
          console.log(`✅ ${field}: (available)`);
        }
      }
    } catch (e) {
      // Field not found
    }
  }
  
  console.log(`\nFound ${foundUserFields.length} valid User fields:`);
  console.log(foundUserFields.join(', '));
  
  process.exit(0);
}

discoverFields().catch(e => { console.error(e); process.exit(1); });
