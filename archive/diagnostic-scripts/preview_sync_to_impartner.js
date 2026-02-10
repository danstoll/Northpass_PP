import { query } from '../server/db/connection.cjs';

(async function preview() {
  try {
    const VALID_TIERS = ['Premier', 'Premier Plus', 'Certified', 'Registered', 'Aggregator'];
    const tierList = VALID_TIERS.map(t => `'${t}'`).join(',');

    const partnersQuery = `
      SELECT 
        p.id,
        p.account_name,
        p.salesforce_id,
        p.partner_tier,
        p.cert_count_nintex_ce,
        p.cert_count_nintex_k2,
        p.cert_count_nintex_salesforce,
        p.cert_count_go_to_market,
        p.has_gtm_certification,
        p.total_npcu,
        p.cert_counts_updated_at,
        g.id as lms_group_id,
        g.name as lms_group_name
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE p.salesforce_id IS NOT NULL
        AND p.cert_counts_updated_at IS NOT NULL
        AND p.partner_tier IN (${tierList})
        AND p.is_active = TRUE
      ORDER BY p.account_name
    `;

    const partners = await query(partnersQuery);
    console.log(`Found ${partners.length} partners for Impartner sync`);

    const partnerIds = partners.map(p => p.id).filter(Boolean);
    const lmsUserCounts = {};
    if (partnerIds.length > 0) {
      const placeholders = partnerIds.map(() => '?').join(',');
      const rows = await query(
        `SELECT partner_id, COUNT(*) as lms_user_count FROM contacts WHERE partner_id IN (${placeholders}) AND lms_user_id IS NOT NULL GROUP BY partner_id`,
        partnerIds
      );
      for (const r of rows) {
        lmsUserCounts[r.partner_id] = r.lms_user_count || 0;
      }
    }

    const syncPayload = partners.map(p => {
      let portalUrl = '';
      if (p.lms_group_name) {
        const urlData = { company: p.lms_group_name, tier: p.partner_tier || 'Registered' };
        const encodedData = Buffer.from(JSON.stringify(urlData)).toString('base64');
        portalUrl = `https://ptrlrndb.prod.ntxgallery.com/?data=${encodedData}`;
      }
      return {
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
        LMS_User_Count: lmsUserCounts[p.id] || 0
      };
    });

    console.log('\nSample payload (first 20):\n');
    console.log(JSON.stringify(syncPayload.slice(0, 20), null, 2));
    console.log(`\nTotal partners in payload: ${syncPayload.length}`);

    process.exit(0);
  } catch (err) {
    console.error('Preview failed:', err);
    process.exit(2);
  }
})();
