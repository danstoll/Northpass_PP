const IMPARTNER_CONFIG = {
  host: 'https://prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  tenantId: '1'
};

async function testCreateUser() {
  console.log('Testing Impartner User API (PUT for create)...\n');
  
  try {
    // Test PUT create
    const testEmail = 'test.delete.portal.' + Date.now() + '@test-domain.com';
    console.log('Creating test user:', testEmail);
    
    const createResponse = await fetch(`${IMPARTNER_CONFIG.host}/api/objects/v1/User`, {
      method: 'PUT',  // PUT is the create method in Impartner
      headers: {
        'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
        'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        Email: testEmail,
        UserName: testEmail,  // Required - use email as username
        FirstName: 'Test',
        LastName: 'DeleteMe',
        AccountId: 1295686, // Impartner Dev Testing account
        IsActive: true
      })
    });
    
    console.log('PUT Status:', createResponse.status);
    const responseText = await createResponse.text();
    console.log('Raw response:', responseText.substring(0, 800));
    
    try {
      const data = JSON.parse(responseText);
      console.log('\nParsed response keys:', Object.keys(data));
      if (data.data) {
        console.log('data keys:', Object.keys(data.data));
        console.log('data.data:', JSON.stringify(data.data, null, 2).substring(0, 500));
      }
    } catch (e) {
      console.log('Could not parse as JSON');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testCreateUser();
