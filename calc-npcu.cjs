const { query } = require('./server/db/connection.cjs');

async function calcNpcu() {
  // Get First Tech's group
  const [partner] = await query(`
    SELECT p.id, p.account_name, g.id as group_id
    FROM partners p
    JOIN lms_groups g ON g.partner_id = p.id
    WHERE p.account_name LIKE '%First Technology Digital%'
  `);
  
  console.log('Partner:', partner.account_name, 'Group:', partner.group_id);
  
  // Calculate NPCU for this partner
  const [npcuResult] = await query(`
    SELECT COALESCE(SUM(c.npcu_value), 0) as total_npcu
    FROM lms_enrollments e
    JOIN lms_courses c ON c.id = e.course_id
    JOIN lms_group_members gm ON gm.user_id = e.user_id
    WHERE gm.group_id = ?
      AND e.status = 'completed'
      AND c.npcu_value > 0
      AND (e.expires_at IS NULL OR e.expires_at > NOW())
  `, [partner.group_id]);
  
  console.log('Calculated Total NPCU:', npcuResult.total_npcu);
  
  // Update partner
  await query('UPDATE partners SET total_npcu = ? WHERE id = ?', [npcuResult.total_npcu, partner.id]);
  console.log('Updated partner total_npcu to', npcuResult.total_npcu);
  
  process.exit(0);
}

calcNpcu().catch(e => { console.error(e); process.exit(1); });
