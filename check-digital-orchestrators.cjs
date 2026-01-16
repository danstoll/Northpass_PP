const { query } = require('./server/db/connection.cjs');

async function checkDigitalOrchestrators() {
  try {
    // Find the group
    console.log('=== Finding Digital Orchestrators Group ===');
    const groups = await query(`
      SELECT * FROM lms_groups 
      WHERE name LIKE '%Digital Orchestrators%' 
         OR name LIKE '%ptr_Digital%'
    `);
    console.log('Groups found:', groups.length);
    groups.forEach(g => console.log(`  - ID: ${g.id}, Name: ${g.name}, Partner ID: ${g.partner_id}`));
    
    if (groups.length === 0) {
      console.log('No groups found!');
      process.exit(0);
    }
    
    const groupId = groups[0].id;
    const groupName = groups[0].name;
    
    // Count members in lms_group_members
    console.log('\n=== Group Membership ===');
    const memberCount = await query(`
      SELECT COUNT(*) as count FROM lms_group_members WHERE group_id = ?
    `, [groupId]);
    console.log(`Members in lms_group_members for ${groupName}: ${memberCount[0].count}`);
    
    // Get all members with their details
    const members = await query(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name
      FROM lms_users u
      JOIN lms_group_members gm ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `, [groupId]);
    console.log(`Users found via JOIN: ${members.length}`);
    
    // List all members
    console.log('\n=== Members ===');
    members.forEach(m => {
      console.log(`  - ${m.email} (${m.first_name} ${m.last_name})`);
    });
    
    // Check Desmond specifically
    console.log('\n=== Checking Desmond Makhura ===');
    const desmond = await query(`
      SELECT * FROM lms_users WHERE email LIKE '%desmond%' OR email LIKE '%makhura%'
    `);
    console.log('Desmond in lms_users:', desmond.length);
    desmond.forEach(d => {
      console.log(`  - ID: ${d.id}, Email: ${d.email}`);
    });
    
    // Check if Desmond is in the group
    if (desmond.length > 0) {
      const desmondGroups = await query(`
        SELECT g.id, g.name 
        FROM lms_groups g
        JOIN lms_group_members gm ON gm.group_id = g.id
        WHERE gm.user_id = ?
      `, [desmond[0].id]);
      console.log(`Desmond's groups (${desmondGroups.length}):`);
      desmondGroups.forEach(g => console.log(`  - ${g.name}`));
    }
    
    // Check certifications for Desmond
    if (desmond.length > 0) {
      console.log('\n=== Desmond\'s Enrollments ===');
      const enrollments = await query(`
        SELECT 
          e.course_id,
          e.status,
          e.completed_at,
          c.name as course_name,
          c.npcu_value,
          c.is_certification
        FROM lms_enrollments e
        JOIN lms_courses c ON c.id = e.course_id
        WHERE e.user_id = ?
      `, [desmond[0].id]);
      console.log(`Total enrollments: ${enrollments.length}`);
      enrollments.forEach(e => {
        console.log(`  - ${e.course_name}: ${e.status}, NPCU: ${e.npcu_value}, Cert: ${e.is_certification}`);
      });
    }
    
    // Check all certified users with their groups
    console.log('\n=== All users with certifications for Digital Orchestrators ===');
    const certifiedInGroup = await query(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' AND c.is_certification = 1 AND c.npcu_value > 0 THEN e.course_id END) as cert_count,
        SUM(CASE WHEN e.status = 'completed' AND c.is_certification = 1 AND c.npcu_value > 0 THEN c.npcu_value ELSE 0 END) as total_npcu
      FROM lms_users u
      JOIN lms_group_members gm ON gm.user_id = u.id
      LEFT JOIN lms_enrollments e ON e.user_id = u.id
      LEFT JOIN lms_courses c ON c.id = e.course_id
      WHERE gm.group_id = ?
      GROUP BY u.id
      HAVING cert_count > 0
      ORDER BY total_npcu DESC
    `, [groupId]);
    console.log(`Certified users in group: ${certifiedInGroup.length}`);
    certifiedInGroup.forEach(u => {
      console.log(`  - ${u.email}: ${u.cert_count} certs, ${u.total_npcu} NPCU`);
    });
    
    // Check the partner and contacts
    console.log('\n=== Partner and Contacts ===');
    const partner = await query(`
      SELECT * FROM partners WHERE account_name LIKE '%Digital Orchestrators%'
    `);
    console.log('Partners found:', partner.length);
    partner.forEach(p => console.log(`  - ID: ${p.id}, Name: ${p.account_name}`));
    
    if (partner.length > 0) {
      const contacts = await query(`
        SELECT email, first_name, last_name, lms_user_id FROM contacts WHERE partner_id = ?
      `, [partner[0].id]);
      console.log(`Contacts for partner: ${contacts.length}`);
      contacts.forEach(c => {
        console.log(`  - ${c.email} (LMS ID: ${c.lms_user_id || 'NOT LINKED'})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkDigitalOrchestrators();
