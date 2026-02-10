const db = require('./connection.cjs');

async function check() {
  const pool = await db.getPool();
  
  // Find the partner
  const [partners] = await pool.query("SELECT * FROM partners WHERE account_name LIKE '%Core Technology%'");
  console.log('Partner:', partners[0]?.account_name, 'ID:', partners[0]?.id);
  
  if (!partners[0]) {
    console.log('Partner not found!');
    await db.closePool();
    return;
  }
  const partnerId = partners[0].id;
  
  // Count contacts
  const [contacts] = await pool.query('SELECT COUNT(*) as c FROM contacts WHERE partner_id = ?', [partnerId]);
  console.log('Contacts:', contacts[0].c);
  
  // Count contacts in LMS
  const [inLms] = await pool.query('SELECT COUNT(*) as c FROM contacts WHERE partner_id = ? AND lms_user_id IS NOT NULL', [partnerId]);
  console.log('In LMS:', inLms[0].c);
  
  // Get the LMS user IDs for this partner's contacts
  const [lmsUsers] = await pool.query('SELECT c.lms_user_id, u.email FROM contacts c JOIN lms_users u ON u.id = c.lms_user_id WHERE c.partner_id = ?', [partnerId]);
  console.log('LMS Users:', lmsUsers.length);
  
  if (lmsUsers.length > 0) {
    const userIds = lmsUsers.map(u => u.lms_user_id);
    const placeholders = userIds.map(() => '?').join(',');
    
    // Check enrollments for these users
    const [enrollments] = await pool.query(
      `SELECT e.*, co.name as course_name, co.npcu_value, co.is_certification 
       FROM lms_enrollments e 
       JOIN lms_courses co ON co.id = e.course_id 
       WHERE e.user_id IN (${placeholders}) AND e.status = 'completed'`, 
      userIds
    );
    console.log('\nCompleted enrollments:', enrollments.length);
    
    // Count NPCU
    let totalNpcu = 0;
    let certs = 0;
    enrollments.forEach(e => {
      if (e.is_certification && e.npcu_value > 0) {
        totalNpcu += e.npcu_value;
        certs++;
        console.log('  CERT:', e.course_name, '- NPCU:', e.npcu_value);
      }
    });
    console.log('\nTotal NPCU:', totalNpcu);
    console.log('Certifications:', certs);
  }
  
  // Also check if there's a linked LMS group
  const [groups] = await pool.query('SELECT * FROM lms_groups WHERE partner_id = ?', [partnerId]);
  console.log('\nLinked LMS Groups:', groups.length);
  groups.forEach(g => console.log('  -', g.name, 'ID:', g.id));
  
  await db.closePool();
}
check();
