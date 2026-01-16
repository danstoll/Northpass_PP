/**
 * List all available Impartner objects
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

async function listObjects() {
  console.log('=== LISTING IMPARTNER API OBJECTS ===\n');
  
  // Common Impartner object names to check
  const objectsToCheck = [
    'Account', 'User', 'Contact', 'Lead', 'Opportunity', 'Deal', 'DealRegistration',
    'Student', 'StudentCourse', 'Training', 'Course', 'Certification', 'Learning',
    'Region', 'Territory', 'Program', 'Tier', 'Partner', 'PartnerUser',
    'Asset', 'Document', 'File', 'ContentItem', 'News', 'Announcement',
    'Task', 'Activity', 'Event', 'Campaign', 'CampaignMember',
    'MDF', 'MDFRequest', 'MDFClaim', 'Rebate', 'Incentive',
    'Order', 'OrderItem', 'Quote', 'QuoteItem', 'Product', 'PriceBook',
    'Case', 'Ticket', 'Support', 'Knowledge', 'KnowledgeArticle',
    'Report', 'Dashboard', 'Notification', 'Email', 'EmailTemplate',
    'CustomObject', 'Integration', 'Webhook', 'APILog',
    'Enrollment', 'Completion', 'Badge', 'Skill', 'Competency',
    'LMS', 'LMSUser', 'LMSCourse', 'LMSEnrollment', 'LMSCompletion'
  ];
  
  const foundObjects = [];
  
  for (const obj of objectsToCheck) {
    try {
      const res = await makeRequest(`/${obj}?take=1`);
      const json = JSON.parse(res.data);
      if (json.success) {
        const count = json.data?.count || 0;
        const fields = json.data?.results?.[0] ? Object.keys(json.data.results[0]) : [];
        foundObjects.push({ name: obj, count, fields });
        console.log(`✅ ${obj}: ${count} records`);
        if (fields.length > 0) {
          console.log(`   Fields: ${fields.slice(0, 10).join(', ')}${fields.length > 10 ? '...' : ''}`);
        }
      }
    } catch (e) {
      // Object doesn't exist or error
    }
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Found ${foundObjects.length} accessible objects:`);
  foundObjects.forEach(o => console.log(`  - ${o.name} (${o.count} records)`));
  
  // Look specifically for anything with "student", "training", "course", "learn" in the name
  console.log(`\n=== TRAINING/LEARNING RELATED OBJECTS ===`);
  const trainingRelated = foundObjects.filter(o => 
    /student|train|course|learn|certif|lms|enroll|complet|badge|skill/i.test(o.name)
  );
  if (trainingRelated.length > 0) {
    trainingRelated.forEach(o => {
      console.log(`\n${o.name}:`);
      console.log(`  Count: ${o.count}`);
      console.log(`  Fields: ${o.fields.join(', ')}`);
    });
  } else {
    console.log('No training/learning related objects found');
  }
  
  process.exit(0);
}

listObjects().catch(e => { console.error(e); process.exit(1); });
