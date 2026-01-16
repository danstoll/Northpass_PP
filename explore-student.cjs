/**
 * Explore Impartner Student object
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
  console.log('=== EXPLORING IMPARTNER STUDENT OBJECT ===\n');
  
  // First, get list of all available objects
  console.log('1. Checking available objects...');
  try {
    const objRes = await makeRequest('');
    const objJson = JSON.parse(objRes.data);
    if (objJson.data) {
      const objects = objJson.data.map(o => o.name || o).filter(Boolean);
      console.log('Available objects:', objects.slice(0, 30).join(', '));
      if (objects.includes('Student')) {
        console.log('✅ Student object exists!');
      }
    }
  } catch (e) {
    console.log('Could not list objects:', e.message);
  }
  
  // Get Student schema/fields
  console.log('\n2. Fetching Student object fields...');
  try {
    const schemaRes = await makeRequest('/Student/$metadata');
    console.log('Schema response:', schemaRes.data.substring(0, 1000));
  } catch (e) {
    console.log('Schema error:', e.message);
  }
  
  // Get sample Student records
  console.log('\n3. Fetching sample Student records...');
  try {
    const studentsRes = await makeRequest('/Student?take=5');
    const json = JSON.parse(studentsRes.data);
    
    if (json.success && json.data?.results?.length > 0) {
      const student = json.data.results[0];
      console.log('\nStudent record fields:');
      console.log(Object.keys(student).join(', '));
      console.log('\nSample Student record:');
      console.log(JSON.stringify(student, null, 2));
      
      console.log(`\nTotal Student records: ${json.data.count}`);
    } else if (json.data?.count === 0) {
      console.log('No Student records found - object exists but is empty');
      // Try to get just the structure
      const emptyRes = await makeRequest('/Student?take=0');
      console.log('Empty response:', emptyRes.data.substring(0, 500));
    } else {
      console.log('Response:', json);
    }
  } catch (e) {
    console.log('Error fetching students:', e.message);
  }
  
  // Check if there's a StudentCourse or similar object for tracking
  console.log('\n4. Looking for related training/course objects...');
  const relatedObjects = ['StudentCourse', 'Training', 'Course', 'Certification', 'Learning', 'Education'];
  for (const obj of relatedObjects) {
    try {
      const res = await makeRequest(`/${obj}?take=1`);
      const json = JSON.parse(res.data);
      if (json.success) {
        console.log(`✅ ${obj}: ${json.data?.count || 0} records`);
        if (json.data?.results?.[0]) {
          console.log(`   Fields: ${Object.keys(json.data.results[0]).join(', ')}`);
        }
      }
    } catch (e) {
      // Object doesn't exist
    }
  }
  
  process.exit(0);
}

explore().catch(e => { console.error(e); process.exit(1); });
