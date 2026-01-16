const IMPARTNER_CONFIG = {
  host: 'https://prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  tenantId: '1'
};

async function findNotFoundPartners() {
  // Step 1: Get all partners from our database (via API)
  const dbResp = await fetch('https://ptrlrndb.prod.ntxgallery.com/api/db/certifications/sync-to-impartner?dryRun=true&mode=full', { method: 'POST' });
  const dbData = await dbResp.json();
  const dbPartners = dbData.preview || [];
  console.log('Partners in DB:', dbData.totalCount);
  
  // Step 2: Fetch ALL Impartner accounts
  const crmIds = new Set();
  const crmId15s = new Set();
  let skip = 0;
  const pageSize = 500;
  let hasMore = true;
  
  while (hasMore) {
    const url = IMPARTNER_CONFIG.host + '/api/objects/v1/Account?fields=Id,CrmId,Name&take=' + pageSize + '&skip=' + skip;
    const resp = await fetch(url, {
      headers: {
        'Authorization': 'prm-key ' + IMPARTNER_CONFIG.apiKey,
        'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
        'Accept': 'application/json'
      }
    });
    const data = await resp.json();
    const results = data.data?.results || [];
    for (const acc of results) {
      if (acc.crmId) {
        crmIds.add(acc.crmId);
        if (acc.crmId.length === 15) crmId15s.add(acc.crmId);
        else if (acc.crmId.length === 18) crmId15s.add(acc.crmId.substring(0, 15));
      }
    }
    hasMore = results.length === pageSize;
    skip += pageSize;
    process.stdout.write('\rFetched ' + skip + ' Impartner accounts...');
  }
  console.log('\nTotal CrmIds in Impartner:', crmIds.size);
  
  // Step 3: Find partners not in Impartner
  const notFound = [];
  for (const p of dbPartners) {
    let found = false;
    if (crmIds.has(p.CrmId)) found = true;
    else if (p.CrmId?.length === 18 && crmId15s.has(p.CrmId.substring(0, 15))) found = true;
    else if (p.CrmId?.length === 15 && crmId15s.has(p.CrmId)) found = true;
    if (!found) notFound.push(p);
  }
  
  console.log('\n=== Partners NOT FOUND in Impartner (' + notFound.length + ') ===\n');
  notFound.forEach((p, i) => console.log((i+1) + '. ' + p.Name + ' | CrmId: ' + p.CrmId));
}

findNotFoundPartners().catch(console.error);
