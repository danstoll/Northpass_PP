const { query } = require('./server/db/connection.cjs');
const { offboardPartner } = require('./server/db/offboardingService.cjs');

async function offboardImpact() {
  try {
    const partnerId = 24078; // Impact Networking
    
    console.log('🚪 Offboarding Impact Networking...');
    
    // First, mark as inactive
    await query(`
      UPDATE partners 
      SET is_active = FALSE, account_status = 'Inactive', deleted_at = NOW() 
      WHERE id = ?
    `, [partnerId]);
    console.log('✅ Marked partner as inactive');
    
    // Now offboard from LMS
    const result = await offboardPartner(partnerId);
    console.log('Offboard result:', JSON.stringify(result, null, 2));
    
    // Also mark contacts as inactive
    const contactResult = await query(`
      UPDATE contacts 
      SET is_active = FALSE, updated_at = NOW() 
      WHERE partner_id = ?
    `, [partnerId]);
    console.log(`✅ Marked ${contactResult.affectedRows} contacts as inactive`);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

offboardImpact();
