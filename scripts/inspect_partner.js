import { query } from '../server/db/connection.cjs';

const IMPARTNER_CONFIG = {
  host: 'https://prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  tenantId: '1'
};

async function inspect() {
  const crmId = '0019000000vGdeJAAS';
  const sfAccountId = '0019000000vGdeJ';
  const impartnerId = '1298255';
  const lmsAccountId = 23063;

  console.log('Looking up local DB partner by LMS Account ID:', lmsAccountId);
  const partnerRows = await query('SELECT * FROM partners WHERE id = ?', [lmsAccountId]);
  console.log('partners rows:', partnerRows.length);
  if (partnerRows.length) console.log(partnerRows[0]);

  console.log('\nLooking up partner by salesforce_id (CRM ID):', crmId);
  const bySf = await query('SELECT * FROM partners WHERE salesforce_id = ? OR salesforce_id LIKE ?', [crmId, crmId.slice(0,15) + '%']);
  console.log('matches:', bySf.length);
  bySf.slice(0,5).forEach(r => console.log(r));

  console.log('\nCounting LMS users (contacts.lms_user_id IS NOT NULL) for partner id:', lmsAccountId);
  const countRows = await query('SELECT COUNT(*) as cnt FROM contacts WHERE partner_id = ? AND lms_user_id IS NOT NULL', [lmsAccountId]);
  console.log('LMS user count (contacts):', countRows[0]?.cnt || 0);

  console.log('\nSample contacts for partner:');
  const contactRows = await query('SELECT id, email, first_name, last_name, lms_user_id FROM contacts WHERE partner_id = ? LIMIT 10', [lmsAccountId]);
  console.log(contactRows);

  // Call Impartner API: lookup by CrmId
  console.log('\nImpartner lookup by CrmId:', crmId);
    // Call Impartner API: lookup by CrmId (try different filter syntaxes)
    console.log('\nImpartner lookup by CrmId (using "eq"):', crmId);
    const crmFilterEq = encodeURIComponent(`CrmId eq '${crmId}'`);
    const crmUrlEq = `${IMPARTNER_CONFIG.host}/api/objects/v1/Account?fields=Id,CrmId,Name&filter=${crmFilterEq}&take=10`;
    try {
      const crmRespEq = await fetch(crmUrlEq, { headers: { 'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`, 'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId, 'Accept': 'application/json' } });
      const crmDataEq = await crmRespEq.json();
      console.log('Impartner CrmId response (eq) OK:', crmRespEq.ok);
      console.log(JSON.stringify(crmDataEq?.data?.results || crmDataEq, null, 2));
    } catch (err) {
      console.error('Impartner CrmId lookup (eq) error:', err.message);
    }

    // Try using '=' operator
    try {
      console.log('\nImpartner lookup by CrmId (using "="):', crmId);
      const crmFilterEqSign = encodeURIComponent(`CrmId = '${crmId}'`);
      const crmUrlEqSign = `${IMPARTNER_CONFIG.host}/api/objects/v1/Account?fields=Id,CrmId,Name&filter=${crmFilterEqSign}&take=10`;
      const crmRespEqSign = await fetch(crmUrlEqSign, { headers: { 'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`, 'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId, 'Accept': 'application/json' } });
      const crmDataEqSign = await crmRespEqSign.json();
      console.log('Impartner CrmId response (=) OK:', crmRespEqSign.ok);
      console.log(JSON.stringify(crmDataEqSign?.data?.results || crmDataEqSign, null, 2));
    } catch (err) {
      console.error('Impartner CrmId lookup (=) error:', err.message);
    }

  // Call Impartner API: lookup by Id
  console.log('\nImpartner lookup by Id:', impartnerId);
    // Call Impartner API: lookup by Id (try both eq and =)
    try {
      console.log('\nImpartner lookup by Id (eq):', impartnerId);
      const idFilterEq = encodeURIComponent(`Id eq '${impartnerId}'`);
      const idUrlEq = `${IMPARTNER_CONFIG.host}/api/objects/v1/Account?fields=Id,CrmId,Name&filter=${idFilterEq}&take=10`;
      const idRespEq = await fetch(idUrlEq, { headers: { 'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`, 'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId, 'Accept': 'application/json' } });
      const idDataEq = await idRespEq.json();
      console.log('Impartner Id response (eq) OK:', idRespEq.ok);
      console.log(JSON.stringify(idDataEq?.data?.results || idDataEq, null, 2));
    } catch (err) {
      console.error('Impartner Id lookup (eq) error:', err.message);
    }

    try {
      console.log('\nImpartner lookup by Id (=):', impartnerId);
      const idFilterEqSign = encodeURIComponent(`Id = ${impartnerId}`);
      const idUrlEqSign = `${IMPARTNER_CONFIG.host}/api/objects/v1/Account?fields=Id,CrmId,Name&filter=${idFilterEqSign}&take=10`;
      const idRespEqSign = await fetch(idUrlEqSign, { headers: { 'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`, 'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId, 'Accept': 'application/json' } });
      const idDataEqSign = await idRespEqSign.json();
      console.log('Impartner Id response (=) OK:', idRespEqSign.ok);
      console.log(JSON.stringify(idDataEqSign?.data?.results || idDataEqSign, null, 2));
    } catch (err) {
      console.error('Impartner Id lookup (=) error:', err.message);
    }
}

inspect().then(()=>process.exit(0)).catch(err=>{console.error(err); process.exit(2)});
