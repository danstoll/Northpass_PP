/**
 * Explore Impartner User object fields in detail
 */
require('dotenv').config();
const config = require('./server/config.cjs');
const https = require('https');

const CONFIG = {
  host: config.impartner.host,
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
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function exploreUser() {
  console.log('=== EXPLORING IMPARTNER USER OBJECT FIELDS ===\n');
  
  // Get a User with ALL fields
  const fields = [
    'Id', 'Email', 'FirstName', 'LastName', 'Title', 'Phone',
    'AccountId', 'AccountName', 'IsActive', 'Created', 'Updated',
    // Common custom field patterns
    'LMS_User_Id__cf', 'Northpass_Id__cf', 'Training_Status__cf',
    'Certifications__cf', 'NPCU__cf', 'Total_NPCU__cf',
    'Courses_Completed__cf', 'Last_Course_Date__cf',
    'Training_URL__cf', 'Portal_URL__cf',
    // Try to get all by using *
    '*'
  ].join(',');
  
  console.log('1. Fetching User with common field names...');
  try {
    const res = await makeRequest(`/User?fields=${fields}&take=3`);
    const json = JSON.parse(res.data);
    if (json.success && json.data?.results?.length > 0) {
      console.log('\nUser fields returned:');
      const user = json.data.results[0];
      console.log(JSON.stringify(user, null, 2));
      console.log('\nAll field names:', Object.keys(user).join(', '));
    } else {
      console.log('Response:', JSON.stringify(json, null, 2));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Try Account fields
  console.log('\n\n2. Exploring Account fields for training data...');
  const accountFields = [
    'Id', 'Name', 'Partner_Tier__cf', 'Account_Status__cf', 'RegionId', 'MailingCountry',
    // Training/LMS related custom fields
    'Total_NPCU__cf', 'NPCU_Count__cf', 'Certified_Users__cf', 'Training_Status__cf',
    'Certifications_Count__cf', 'Active_Learners__cf', 'Last_Training_Date__cf',
    'LMS_Group_Id__cf', 'Northpass_Group__cf', 'Training_Portal_URL__cf'
  ].join(',');
  
  try {
    const res = await makeRequest(`/Account?fields=${accountFields}&take=3`);
    const json = JSON.parse(res.data);
    if (json.success && json.data?.results?.length > 0) {
      console.log('\nAccount fields returned:');
      const account = json.data.results[0];
      console.log(JSON.stringify(account, null, 2));
      console.log('\nAll Account field names:', Object.keys(account).join(', '));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  process.exit(0);
}

exploreUser().catch(e => { console.error(e); process.exit(1); });
