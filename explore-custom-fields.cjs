/**
 * Explore ALL custom fields (with __cf suffix) on Account object
 * to find training/certification fields
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
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function exploreCustomFields() {
  console.log('=== EXPLORING IMPARTNER CUSTOM FIELDS ===\n');
  
  // Common certification/training field name patterns
  const prefixes = [
    'Total', 'Current', 'NPCU', 'Cert', 'Certificate', 'Certification', 
    'Training', 'LMS', 'Learning', 'Course', 'Courses', 'Education',
    'Qualified', 'Skill', 'Skills', 'Badge', 'Badges', 'Credential',
    'Completed', 'Active', 'NAC', 'NPA', 'NWC', 'NWO', 'K2', 'Promapp',
    'Nintex', 'Partner', 'Tier', 'Level', 'Status', 'Expir', 'Valid',
    'Requirement', 'Required', 'Goal', 'Target', 'Users', 'User_Count',
    'Member', 'Members', 'Count', 'Number', 'Num', 'Total_Count',
    'Portal', 'URL', 'Link', 'Group', 'Points', 'Score'
  ];
  
  const suffixes = ['', '_Count', '_Total', '_NPCU', '_Cert', '_Status', '_Date', '_URL'];
  
  const foundFields = new Map();
  
  // Generate permutations
  const fieldsToTest = new Set();
  
  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      fieldsToTest.add(`${prefix}${suffix}__cf`);
      fieldsToTest.add(`${prefix}_${suffix.replace('_', '')}__cf`);
    }
  }
  
  // Add specific Nintex fields
  [
    'Total_NPCU__cf', 'Current_NPCU__cf', 'NPCU_Count__cf', 'Tier_NPCU__cf',
    'Tier_NPCU_Requirement__cf', 'NPCU_Requirement__cf', 'NPCU_Goal__cf',
    'NAC_Count__cf', 'NPA_Count__cf', 'NWC_Count__cf', 'NWO_Count__cf',
    'K2_Count__cf', 'Promapp_Count__cf', 'RPA_Count__cf', 'Forms_Count__cf',
    'NAC_Certified_Users__cf', 'NPA_Certified_Users__cf', 'NWC_Certified_Users__cf',
    'Certified_Users__cf', 'Certified_User_Count__cf', 'Total_Certified__cf',
    'LMS_User_Count__cf', 'LMS_Group_Id__cf', 'Portal_URL__cf', 'Training_URL__cf',
    'Training_Portal_URL__cf', 'Partner_Portal_URL__cf',
    'Last_Sync__cf', 'Last_Training_Sync__cf', 'Sync_Date__cf',
    'Courses_Completed__cf', 'Total_Courses__cf', 'Active_Learners__cf',
    'Partner_Level__cf', 'Partner_Status__cf', 'Qualification_Status__cf',
    'Certification_Status__cf', 'Training_Status__cf', 'Compliance_Status__cf',
    'Expiry_Date__cf', 'Next_Renewal__cf', 'Valid_Until__cf',
    'NAC_Certified__cf', 'NPA_Certified__cf', 'NWC_Certified__cf', 'NWO_Certified__cf'
  ].forEach(f => fieldsToTest.add(f));
  
  console.log(`Testing ${fieldsToTest.size} potential custom fields...\n`);
  
  let tested = 0;
  for (const field of fieldsToTest) {
    try {
      const res = await makeRequest(`/Account?fields=Id,Name,${field}&take=5`);
      const json = JSON.parse(res.data);
      if (json.success && res.status === 200) {
        // Check if field actually has data
        let hasData = false;
        let sampleValue = null;
        for (const record of json.data.results || []) {
          const key = field.charAt(0).toLowerCase() + field.slice(1);
          const altKey = field.replace('__cf', '_Cf').charAt(0).toLowerCase() + field.replace('__cf', '_Cf').slice(1);
          const value = record[key] || record[altKey] || record[field];
          if (value !== undefined && value !== null && value !== '') {
            hasData = true;
            sampleValue = value;
            break;
          }
        }
        foundFields.set(field, { hasData, sampleValue });
      }
    } catch (e) {
      // Field not found, skip
    }
    tested++;
    if (tested % 20 === 0) {
      process.stdout.write(`  Tested ${tested}...\r`);
    }
  }
  
  console.log(`\n\n=== FOUND ${foundFields.size} CUSTOM FIELDS ===\n`);
  
  // Group by has data
  const withData = [];
  const withoutData = [];
  
  for (const [field, info] of foundFields) {
    if (info.hasData) {
      withData.push({ field, value: info.sampleValue });
    } else {
      withoutData.push(field);
    }
  }
  
  console.log('Fields WITH data:');
  for (const item of withData) {
    console.log(`  ✅ ${item.field}: ${JSON.stringify(item.value).substring(0, 50)}`);
  }
  
  console.log(`\nFields without data (${withoutData.length}):`);
  console.log(withoutData.map(f => `  - ${f}`).join('\n'));
  
  process.exit(0);
}

exploreCustomFields().catch(e => { console.error(e); process.exit(1); });
