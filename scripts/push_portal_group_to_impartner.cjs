/**
 * Push Nintex Partner Portal Americas/EMEA group data to Impartner
 * Usage: node scripts/push_portal_group_to_impartner.cjs <impartner_id> <group_name>
 */

const { query, closePool } = require('../server/db/connection.cjs');

const IMPARTNER_CONFIG = {
  host: 'https://prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  tenantId: '1'
};

(async () => {
  try {
    const impartnerId = process.argv[2] ? parseInt(process.argv[2], 10) : 1294768;
    const groupName = process.argv[3] || 'Nintex Partner Portal Americas';
    
    console.log(`\n=== Pushing ${groupName} to Impartner ID ${impartnerId} ===\n`);
    
    // Get the LMS group
    const [group] = await query('SELECT * FROM lms_groups WHERE name = ?', [groupName]);
    
    if (!group) {
      console.error('Group not found:', groupName);
      await closePool();
      process.exit(1);
    }
    
    console.log('Found LMS Group:');
    console.log('  ID:', group.id);
    console.log('  Name:', group.name);
    
    // Get member count
    const [memberCount] = await query('SELECT COUNT(*) as cnt FROM lms_group_members WHERE group_id = ?', [group.id]);
    console.log('  Members:', memberCount.cnt);
    
    // Calculate certifications by category
    const certStats = await query(`
      SELECT 
        c.certification_category as category,
        COUNT(*) as cert_count,
        SUM(c.npcu_value) as total_npcu
      FROM lms_enrollments e
      JOIN lms_courses c ON c.id = e.course_id
      JOIN lms_group_members gm ON gm.user_id = e.user_id
      WHERE gm.group_id = ?
        AND e.status = 'completed'
        AND c.npcu_value > 0
        AND (e.expires_at IS NULL OR e.expires_at > NOW())
      GROUP BY c.certification_category
    `, [group.id]);
    
    console.log('\nCertification Stats:');
    let totalNpcu = 0;
    let nintexCe = 0, nintexK2 = 0, nintexSf = 0, gtm = 0;
    
    certStats.forEach(s => {
      const npcu = parseInt(s.total_npcu || 0);
      console.log(`  ${s.category || 'uncategorized'}: ${s.cert_count} certs, ${npcu} NPCU`);
      totalNpcu += npcu;
      if (s.category === 'nintex_ce') nintexCe = npcu;
      if (s.category === 'nintex_k2') nintexK2 = npcu;
      if (s.category === 'nintex_salesforce') nintexSf = npcu;
      if (s.category === 'go_to_market') gtm = npcu;
    });
    
    console.log('\n  TOTAL NPCU:', totalNpcu);
    
    // Build portal URL
    const portalUrl = `https://ptrlrndb.prod.ntxgallery.com/?group=${encodeURIComponent(groupName)}&tier=Premier`;
    
    // Build Impartner payload
    const updateObj = {
      Id: impartnerId,
      Nintex_CE_Certifications__cf: nintexCe,
      Nintex_K2_Certifications__cf: nintexK2,
      Nintex_for_Salesforce_Certifications__cf: nintexSf,
      Nintex_GTM_Certifications__cf: gtm,
      Total_NPCU__cf: totalNpcu,
      LMS_Group_Name__cf: groupName,
      LMS_Training_Dashboard__cf: portalUrl,
      LMS_User_Count__cf: memberCount.cnt
    };
    
    console.log('\nPayload to send:');
    console.log(JSON.stringify(updateObj, null, 2));
    
    // Send to Impartner
    console.log('\nSending PATCH to Impartner...');
    const resp = await fetch(`${IMPARTNER_CONFIG.host}/api/objects/v1/Account`, {
      method: 'PATCH',
      headers: {
        'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
        'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify([updateObj])
    });
    
    const respText = await resp.text();
    console.log('Response status:', resp.status);
    
    try {
      const respJson = JSON.parse(respText);
      console.log('Response:', JSON.stringify(respJson, null, 2));
    } catch (e) {
      console.log('Response (raw):', respText);
    }
    
    await closePool();
    process.exit(resp.ok ? 0 : 1);
    
  } catch (err) {
    console.error('Error:', err);
    await closePool();
    process.exit(1);
  }
})();
