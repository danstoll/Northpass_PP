require('dotenv').config();
const config = require('../server/config.cjs');

(async () => {
  try {
    const partnerId = process.argv[2] ? parseInt(process.argv[2], 10) : 23063;
    const { query, closePool } = require('../server/db/connection.cjs');

    console.log(`Starting single-account push for partner id ${partnerId}`);

    const partners = await query(`
      SELECT p.id, p.account_name, p.salesforce_id, p.partner_tier, p.cert_count_nintex_ce,
             p.cert_count_nintex_k2, p.cert_count_nintex_salesforce, p.cert_count_go_to_market,
             p.total_npcu, p.cert_counts_updated_at, p.impartner_id, g.name as lms_group_name
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE p.id = ?
    `, [partnerId]);

    if (!partners || partners.length === 0) {
      console.error('Partner not found');
      await closePool();
      process.exit(2);
    }

    const p = partners[0];

    const [lmsCountRow] = await query('SELECT COUNT(*) as lms_user_count FROM contacts WHERE partner_id = ? AND lms_user_id IS NOT NULL', [partnerId]);
    const lmsUserCount = lmsCountRow?.lms_user_count || 0;

    const portalUrl = (p.lms_group_name)
      ? `https://ptrlrndb.prod.ntxgallery.com/?data=${Buffer.from(JSON.stringify({ company: p.lms_group_name, tier: p.partner_tier || 'Registered' })).toString('base64')}`
      : '';

    const payload = {
      CrmId: p.salesforce_id,
      Name: p.account_name,
      Nintex_CE_Certifications__cf: p.cert_count_nintex_ce || 0,
      Nintex_K2_Certifications__cf: p.cert_count_nintex_k2 || 0,
      Nintex_for_Salesforce_Certifications__cf: p.cert_count_nintex_salesforce || 0,
      Nintex_GTM_Certifications__cf: p.cert_count_go_to_market || 0,
      Total_NPCU__cf: p.total_npcu || 0,
      LMS_Account_ID__cf: String(p.id),
      LMS_Group_Name__cf: p.lms_group_name || '',
      LMS_Training_Dashboard__cf: portalUrl,
      LMS_User_Count: lmsUserCount
    };

    console.log('Built payload:', payload);

    // Impartner config - loaded from centralized config module
    const IMPARTNER_CONFIG = {
      host: config.impartner.hostUrl,
      apiKey: config.impartner.apiKey,
      tenantId: config.impartner.tenantId
    };

    // Lookup by CrmId first
    const crmId = p.salesforce_id;
    let impartnerId = null;

    if (crmId) {
      const crmFilter = `CrmId = '${crmId}'`;
      const lookupUrl = `${IMPARTNER_CONFIG.host}/api/objects/v1/Account?fields=Id,CrmId&filter=${encodeURIComponent(crmFilter)}&take=1`;
      console.log('Looking up Impartner account by CrmId...');
      const resp = await fetch(lookupUrl, {
        headers: {
          'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
          'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
          'Accept': 'application/json'
        }
      });

      if (resp.ok) {
        const data = await resp.json();
        const result = (data.data && data.data.results && data.data.results[0]) || null;
        if (result && result.Id) {
          impartnerId = result.Id;
          console.log(`Found Impartner account Id=${impartnerId} by CrmId`);
        } else {
          console.log('No Impartner account found by CrmId');
        }
      } else {
        console.error('Impartner lookup failed:', resp.status, await resp.text());
      }
    }

    // If not found, try p.impartner_id
    if (!impartnerId && p.impartner_id) {
      console.log('Trying stored impartner_id from DB...');
      impartnerId = p.impartner_id;
    }

    if (!impartnerId) {
      console.error('No Impartner Id available for update; aborting');
      await closePool();
      process.exit(3);
    }

    // Build update body
    const updateObj = {
      Id: impartnerId,
      Name: payload.Name,
      Nintex_CE_Certifications__cf: payload.Nintex_CE_Certifications__cf,
      Nintex_K2_Certifications__cf: payload.Nintex_K2_Certifications__cf,
      Nintex_for_Salesforce_Certifications__cf: payload.Nintex_for_Salesforce_Certifications__cf,
      Nintex_GTM_Certifications__cf: payload.Nintex_GTM_Certifications__cf,
      Total_NPCU__cf: payload.Total_NPCU__cf,
      LMS_Account_ID__cf: payload.LMS_Account_ID__cf,
      LMS_Group_Name__cf: payload.LMS_Group_Name__cf,
      LMS_Training_Dashboard__cf: payload.LMS_Training_Dashboard__cf,
      LMS_User_Count__cf: payload.LMS_User_Count
    };

    console.log('Sending PATCH to Impartner for Id', impartnerId);
    const updateResp = await fetch(`${IMPARTNER_CONFIG.host}/api/objects/v1/Account`, {
      method: 'PATCH',
      headers: {
        'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
        'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify([updateObj])
    });

    const updateText = await updateResp.text();
    console.log('PATCH response status:', updateResp.status);
    console.log('PATCH response body (raw):', updateText);
    try { console.log('PATCH response body (json):', JSON.parse(updateText)); } catch(e) { /* ignore */ }

    await closePool();
    process.exit(updateResp.ok ? 0 : 4);

  } catch (err) {
    console.error('Error in push script:', err);
    process.exit(10);
  }
})();
