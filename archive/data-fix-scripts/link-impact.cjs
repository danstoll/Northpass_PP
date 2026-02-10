const { query } = require('./server/db/connection.cjs');

async function linkImpact() {
  try {
    const partnerId = 24078;
    const groupId = '9462dbd1-6771-401a-9841-64560cd70d86';
    
    // Link LMS group to partner
    await query('UPDATE lms_groups SET partner_id = ? WHERE id = ?', [partnerId, groupId]);
    console.log('✅ Linked LMS group to partner');
    
    // Link contacts to partner
    const result = await query(`
      UPDATE contacts 
      SET partner_id = ? 
      WHERE email LIKE '%@impactnetworking.com' AND (partner_id IS NULL OR partner_id != ?)
    `, [partnerId, partnerId]);
    console.log(`✅ Linked ${result.affectedRows} contacts to partner`);
    
    // Verify
    const group = await query('SELECT id, name, partner_id FROM lms_groups WHERE id = ?', [groupId]);
    console.log('LMS Group:', JSON.stringify(group, null, 2));
    
    const contactCount = await query('SELECT COUNT(*) as count FROM contacts WHERE partner_id = ?', [partnerId]);
    console.log('Contacts linked:', contactCount[0].count);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

linkImpact();
