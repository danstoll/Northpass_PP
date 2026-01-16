// Script to find partners in our DB that don't exist in Impartner

const IMPARTNER_CONFIG = {
  host: 'https://prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE\\\\$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR\\@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  tenantId: '1'
};

async function findNotFoundPartners() {
  // Get the same payload as sync-to-impartner uses (partners with active status and valid tiers)
  const dbResp = await fetch('https://ptrlrndb.prod.ntxgallery.com/api/db/certifications/sync-to-impartner?dryRun=true&mode=full', { method: 'POST' });
  const dbData = await dbResp.json();
  const dbPartners = dbData.preview || [];
  
  console.log('Partners to check:', dbData.totalCount);
  console.log('Sample from DB:', dbPartners.slice(0, 3).map(p => ({name: p.Name, crmId: p.CrmId})));
  
  // Build Impartner CrmId lookup maps
  const crmIdToName = new Map();
  const crmId15ToName = new Map();
  let skip = 0;
  const pageSize = 500;
  let hasMore = true;
  let totalFetched = 0;
  
  while (hasMore) {
    const url = IMPARTNER_CONFIG.host + '/api/objects/v1/Account?fields=Id,CrmId,Name&take=' + pageSize + '&skip=' + skip;
    try {
      const resp = await fetch(url, {
        headers: {
          'Authorization': 'prm-key ' + IMPARTNER_CONFIG.apiKey,
          'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
          'Accept': 'application/json'
        }
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const results = data.data?.results || [];
      totalFetched += results.length;
      
      for (const acc of results) {
        if (acc.crmId) {
          crmIdToName.set(acc.crmId, acc.name);
          // Build 15-char prefix map
          if (acc.crmId.length === 15) crmId15ToName.set(acc.crmId, acc.name);
          else if (acc.crmId.length === 18) crmId15ToName.set(acc.crmId.substring(0, 15), acc.name);
        }
      }
      
      hasMore = results.length === pageSize;
      skip += pageSize;
      process.stdout.write('\rFetched ' + totalFetched + ' Impartner accounts...');
    } catch (err) {
      console.error('Error fetching:', err.message);
      hasMore = false;
    }
  }
  
  console.log('\nTotal Impartner accounts with CrmId:', crmIdToName.size);
  
  // Find partners not in Impartner using SAME logic as sync
  const notFoundPartners = [];
  
  for (const p of dbPartners) {
    let found = false;
    
    // Try exact match first
    if (crmIdToName.has(p.CrmId)) {
      found = true;
    }
    // If 18 chars, try 15-char prefix
    else if (p.CrmId && p.CrmId.length === 18) {
      const prefix15 = p.CrmId.substring(0, 15);
      if (crmId15ToName.has(prefix15)) {
        found = true;
      }
    }
    // If 15 chars, check 15-char map
    else if (p.CrmId && p.CrmId.length === 15) {
      if (crmId15ToName.has(p.CrmId)) {
        found = true;
      }
    }
    
    if (!found) {
      notFoundPartners.push({ name: p.Name, crmId: p.CrmId, npcu: p.Total_NPCU__cf });
    }
  }
  
  console.log('\n========================================');
  console.log('PARTNERS NOT FOUND IN IMPARTNER (' + notFoundPartners.length + ')');
  console.log('========================================\n');
  
  notFoundPartners.forEach((p, i) => {
    console.log((i+1) + '. ' + p.name);
    console.log('   CrmId: ' + (p.crmId || '(none)'));
    console.log('   NPCU: ' + p.npcu);
  });
}

findNotFoundPartners().catch(console.error);
