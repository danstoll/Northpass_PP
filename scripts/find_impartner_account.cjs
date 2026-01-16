const IMPARTNER_CONFIG = {
  host: 'https://prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  tenantId: '1'
};

(async () => {
  const searchName = process.argv[2] || 'Partner Portal EMEA';
  const filter = encodeURIComponent(`Name LIKE '%${searchName}%'`);
  const url = `${IMPARTNER_CONFIG.host}/api/objects/v1/Account?fields=Id,Name&filter=${filter}`;
  
  console.log('Searching for:', searchName);
  const resp = await fetch(url, {
    headers: {
      'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
      'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId
    }
  });
  const data = await resp.json();
  console.log(JSON.stringify(data, null, 2));
})();
