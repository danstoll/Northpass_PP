require('dotenv').config();
const config = require('./server/config.cjs');
const API_KEY = config.northpass.apiKey;

async function checkTranscripts() {
  // Get a sample user
  const userResponse = await fetch('https://api.northpass.com/v2/people?per_page=1', {
    headers: { 'X-Api-Key': API_KEY }
  });
  const userData = await userResponse.json();
  const userId = userData.data[0].id;
  console.log('Checking transcripts for user:', userId);
  
  // Get their transcripts
  const response = await fetch(`https://api.northpass.com/v2/transcripts?filter[person_id]=${userId}&per_page=100`, {
    headers: { 'X-Api-Key': API_KEY }
  });
  const data = await response.json();
  
  console.log('\nTotal transcript items:', data.data?.length);
  
  const statuses = {};
  data.data?.forEach(item => {
    const status = item.attributes?.progress_status;
    statuses[status] = (statuses[status] || 0) + 1;
  });
  console.log('\nStatus distribution for this user:', statuses);
  
  // Show a sample of each status
  console.log('\n--- Sample items by status ---');
  const seen = {};
  data.data?.forEach(item => {
    const status = item.attributes?.progress_status;
    if (!seen[status]) {
      seen[status] = true;
      const attrs = item.attributes;
      console.log(`\n${status}:`);
      console.log('  resource_type:', attrs.resource_type);
      console.log('  enrolled_at:', attrs.enrolled_at);
      console.log('  started_at:', attrs.started_at);
      console.log('  completed_at:', attrs.completed_at);
      console.log('  progress_percent:', attrs.progress_percent);
    }
  });
}

checkTranscripts().catch(console.error);
