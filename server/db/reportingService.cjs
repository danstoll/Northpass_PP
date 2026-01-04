/**
 * Partner Reporting Service
 * Provides reports for account owners, regions, and certification compliance
 * Uses partner_npcu_cache table for fast queries (vs N+1 query pattern)
 */

const { query } = require('./connection.cjs');

/**
 * Refresh the NPCU cache table
 * Should be called after enrollment syncs or periodically
 */
async function refreshNpcuCache() {
  console.log('🔄 Refreshing NPCU cache...');
  const start = Date.now();
  
  try {
    // Delete and repopulate (simpler than complex upsert)
    await query('DELETE FROM partner_npcu_cache');
    
    await query(`
      INSERT INTO partner_npcu_cache (partner_id, active_npcu, expired_npcu, total_certifications, certified_users)
      SELECT 
        p.id,
        COALESCE(SUM(CASE 
          WHEN e.expires_at IS NULL OR e.expires_at > NOW() 
          THEN c.npcu_value 
          ELSE 0 
        END), 0) as active_npcu,
        COALESCE(SUM(CASE 
          WHEN e.expires_at IS NOT NULL AND e.expires_at <= NOW() 
          THEN c.npcu_value 
          ELSE 0 
        END), 0) as expired_npcu,
        COUNT(DISTINCT e.id) as total_certifications,
        COUNT(DISTINCT e.user_id) as certified_users
      FROM partners p
      LEFT JOIN contacts ct ON ct.partner_id = p.id AND ct.lms_user_id IS NOT NULL
      LEFT JOIN lms_enrollments e ON e.user_id = ct.lms_user_id AND e.status = 'completed'
      LEFT JOIN lms_courses c ON c.id = e.course_id AND c.npcu_value > 0
      GROUP BY p.id
    `);
    
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✅ NPCU cache refreshed in ${elapsed}s`);
    return { success: true, elapsed };
  } catch (error) {
    console.error('❌ NPCU cache refresh failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get certification summary for a partner
 */
async function getPartnerCertificationSummary(partnerId) {
  const result = await query(`
    SELECT 
      p.id as partner_id,
      p.account_name,
      p.partner_tier,
      p.account_region,
      p.account_owner,
      g.id as group_id,
      g.name as group_name,
      g.user_count,
      (SELECT COUNT(*) FROM contacts c WHERE c.partner_id = p.id) as total_contacts,
      (SELECT COUNT(*) FROM contacts c WHERE c.partner_id = p.id AND c.lms_user_id IS NOT NULL) as lms_linked_contacts
    FROM partners p
    LEFT JOIN lms_groups g ON g.partner_id = p.id
    WHERE p.id = ?
  `, [partnerId]);
  
  if (!result.length) return null;
  
  // Get certification data for this partner's users
  const certData = await query(`
    SELECT 
      c.id as course_id,
      c.name as course_name,
      c.npcu_value,
      c.product_category,
      COUNT(DISTINCT e.user_id) as certified_users,
      SUM(CASE WHEN e.expires_at IS NULL OR e.expires_at > NOW() THEN 1 ELSE 0 END) as active_certs,
      SUM(CASE WHEN e.expires_at IS NOT NULL AND e.expires_at <= NOW() THEN 1 ELSE 0 END) as expired_certs
    FROM lms_courses c
    INNER JOIN lms_enrollments e ON e.course_id = c.id AND e.status = 'completed'
    INNER JOIN lms_users u ON u.id = e.user_id
    INNER JOIN contacts ct ON ct.lms_user_id = u.id AND ct.partner_id = ?
    WHERE c.npcu_value > 0
    GROUP BY c.id
    ORDER BY c.name
  `, [partnerId]);
  
  // Calculate NPCU totals
  let totalNpcu = 0;
  let activeNpcu = 0;
  for (const cert of certData) {
    totalNpcu += cert.npcu_value * cert.certified_users;
    activeNpcu += cert.npcu_value * cert.active_certs;
  }
  
  return {
    ...result[0],
    certifications: certData,
    total_npcu: totalNpcu,
    active_npcu: activeNpcu,
    tier_requirement: getTierRequirement(result[0].partner_tier),
    compliance_status: activeNpcu >= getTierRequirement(result[0].partner_tier) ? 'compliant' : 'non-compliant'
  };
}

/**
 * Get tier NPCU requirement
 */
function getTierRequirement(tier) {
  const requirements = {
    'Premier': 20,
    'Select': 10,
    'Registered': 5,
    'Certified': 2
  };
  return requirements[tier] || 0;
}

/**
 * Get all partners for an account owner with certification summary
 * Uses cached NPCU values for performance
 */
async function getAccountOwnerReport(ownerName) {
  const partners = await query(`
    SELECT 
      p.id,
      p.account_name,
      p.partner_tier,
      p.account_region,
      p.website,
      g.id as group_id,
      g.name as group_name,
      g.user_count as lms_user_count,
      (SELECT COUNT(*) FROM contacts c WHERE c.partner_id = p.id) as total_contacts,
      (SELECT COUNT(*) FROM contacts c WHERE c.partner_id = p.id AND c.lms_user_id IS NOT NULL) as linked_contacts,
      COALESCE(nc.active_npcu, 0) as active_npcu,
      CASE p.partner_tier
        WHEN 'Premier' THEN 20
        WHEN 'Select' THEN 10
        WHEN 'Registered' THEN 5
        ELSE 2
      END as tier_requirement
    FROM partners p
    LEFT JOIN lms_groups g ON g.partner_id = p.id
    LEFT JOIN partner_npcu_cache nc ON nc.partner_id = p.id
    WHERE p.account_owner = ?
    ORDER BY p.partner_tier DESC, p.account_name
  `, [ownerName]);
  
  // Add computed fields
  for (const partner of partners) {
    partner.compliance_gap = Math.max(0, partner.tier_requirement - partner.active_npcu);
    partner.is_compliant = partner.active_npcu >= partner.tier_requirement;
  }
  
  // Summary stats
  const compliant = partners.filter(p => p.is_compliant).length;
  const totalNpcu = partners.reduce((sum, p) => sum + p.active_npcu, 0);
  
  return {
    owner_name: ownerName,
    total_partners: partners.length,
    compliant_partners: compliant,
    non_compliant_partners: partners.length - compliant,
    compliance_rate: partners.length > 0 ? (compliant / partners.length * 100).toFixed(1) : 0,
    total_active_npcu: totalNpcu,
    partners: partners
  };
}

/**
 * Get regional certification report
 */
async function getRegionalReport(region = null) {
  const whereClause = region ? 'WHERE p.account_region = ?' : '';
  const params = region ? [region] : [];
  
  const summary = await query(`
    SELECT 
      p.account_region as region,
      COUNT(DISTINCT p.id) as partner_count,
      COUNT(DISTINCT c.id) as contact_count,
      COUNT(DISTINCT CASE WHEN c.lms_user_id IS NOT NULL THEN c.id END) as lms_linked_count
    FROM partners p
    LEFT JOIN contacts c ON c.partner_id = p.id
    ${whereClause}
    GROUP BY p.account_region
    ORDER BY partner_count DESC
  `, params);
  
  // Get tier breakdown by region
  const tierBreakdown = await query(`
    SELECT 
      p.account_region as region,
      p.partner_tier as tier,
      COUNT(*) as count
    FROM partners p
    ${whereClause}
    GROUP BY p.account_region, p.partner_tier
    ORDER BY p.account_region, 
      CASE p.partner_tier 
        WHEN 'Premier' THEN 1 
        WHEN 'Select' THEN 2 
        WHEN 'Registered' THEN 3 
        ELSE 4 
      END
  `, params);
  
  return {
    summary,
    tier_breakdown: tierBreakdown
  };
}

/**
 * Get partners with compliance gaps (need attention)
 * Uses cached NPCU values for performance
 */
async function getComplianceGapsReport(limit = 50) {
  const results = await query(`
    SELECT 
      p.id,
      p.account_name,
      p.partner_tier,
      p.account_region,
      p.account_owner,
      g.user_count as lms_user_count,
      CASE p.partner_tier
        WHEN 'Premier' THEN 20
        WHEN 'Select' THEN 10
        WHEN 'Registered' THEN 5
        ELSE 2
      END as tier_requirement,
      COALESCE(nc.active_npcu, 0) as active_npcu,
      CASE p.partner_tier
        WHEN 'Premier' THEN 20
        WHEN 'Select' THEN 10
        WHEN 'Registered' THEN 5
        ELSE 2
      END - COALESCE(nc.active_npcu, 0) as compliance_gap
    FROM partners p
    LEFT JOIN lms_groups g ON g.partner_id = p.id
    LEFT JOIN partner_npcu_cache nc ON nc.partner_id = p.id
    WHERE p.partner_tier IN ('Premier', 'Select', 'Registered', 'Certified')
      AND COALESCE(nc.active_npcu, 0) < CASE p.partner_tier
        WHEN 'Premier' THEN 20
        WHEN 'Select' THEN 10
        WHEN 'Registered' THEN 5
        ELSE 2
      END
    ORDER BY compliance_gap DESC
    LIMIT ?
  `, [limit]);
  
  // Add gap percentage
  return results.map(r => ({
    ...r,
    gap_percentage: ((r.tier_requirement - r.active_npcu) / r.tier_requirement * 100).toFixed(0)
  }));
}

/**
 * Get list of all account owners with stats
 */
async function getAccountOwnersOverview() {
  return await query(`
    SELECT 
      p.account_owner as owner_name,
      MAX(p.owner_email) as owner_email,
      COUNT(*) as partner_count,
      SUM(CASE WHEN p.partner_tier = 'Premier' THEN 1 ELSE 0 END) as premier_count,
      SUM(CASE WHEN p.partner_tier = 'Select' THEN 1 ELSE 0 END) as select_count,
      SUM(CASE WHEN p.partner_tier = 'Registered' THEN 1 ELSE 0 END) as registered_count,
      GROUP_CONCAT(DISTINCT p.account_region) as regions
    FROM partners p
    WHERE p.account_owner IS NOT NULL AND p.account_owner != ''
    GROUP BY p.account_owner
    ORDER BY partner_count DESC
  `);
}

/**
 * Get partners for a specific owner by email
 * Enables "My Accounts" filtering for Channel Managers
 */
async function getPartnersByOwnerEmail(ownerEmail) {
  if (!ownerEmail) return [];
  
  return await query(`
    SELECT 
      p.id,
      p.account_name,
      p.partner_tier,
      p.account_region,
      p.account_owner,
      p.owner_email,
      p.partner_type,
      COALESCE(c.active_npcu, 0) as active_npcu,
      COALESCE(c.certified_users, 0) as certified_users,
      (SELECT COUNT(*) FROM contacts ct WHERE ct.partner_id = p.id) as contact_count,
      (SELECT COUNT(*) FROM contacts ct WHERE ct.partner_id = p.id AND ct.lms_user_id IS NOT NULL) as lms_linked_count
    FROM partners p
    LEFT JOIN partner_npcu_cache c ON c.partner_id = p.id
    WHERE p.owner_email = ?
    ORDER BY p.account_name
  `, [ownerEmail.toLowerCase()]);
}

/**
 * Get users who need to complete certifications soon
 */
async function getExpiringCertificationsReport(daysAhead = 90) {
  return await query(`
    SELECT 
      u.id as user_id,
      u.email,
      CONCAT(u.first_name, ' ', u.last_name) as user_name,
      p.account_name as partner_name,
      p.partner_tier,
      p.account_owner,
      c.name as course_name,
      c.npcu_value,
      e.completed_at,
      e.expires_at,
      DATEDIFF(e.expires_at, NOW()) as days_until_expiry
    FROM lms_enrollments e
    INNER JOIN lms_users u ON u.id = e.user_id
    INNER JOIN lms_courses c ON c.id = e.course_id AND c.npcu_value > 0
    INNER JOIN contacts ct ON ct.lms_user_id = u.id
    INNER JOIN partners p ON p.id = ct.partner_id
    WHERE e.status = 'completed'
      AND e.expires_at IS NOT NULL
      AND e.expires_at > NOW()
      AND e.expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
    ORDER BY e.expires_at ASC
    LIMIT 500
  `, [daysAhead]);
}

/**
 * Get partner leaderboard by NPCU
 * Uses cached NPCU values for performance (139s -> 44ms improvement)
 */
async function getPartnerLeaderboard(limit = 50) {
  // Use the NPCU cache table for fast queries
  const results = await query(`
    SELECT 
      p.id,
      p.account_name,
      p.partner_tier,
      p.account_region,
      p.account_owner,
      g.user_count as lms_user_count,
      COALESCE(nc.active_npcu, 0) as active_npcu,
      COALESCE(nc.total_certifications, 0) as total_certifications,
      COALESCE(nc.certified_users, 0) as certified_users,
      CASE p.partner_tier
        WHEN 'Premier' THEN 20
        WHEN 'Select' THEN 10
        WHEN 'Registered' THEN 5
        ELSE 2
      END as tier_requirement
    FROM partners p
    LEFT JOIN lms_groups g ON g.partner_id = p.id
    LEFT JOIN partner_npcu_cache nc ON nc.partner_id = p.id
    WHERE p.partner_tier IN ('Premier', 'Select', 'Registered', 'Certified')
    ORDER BY nc.active_npcu DESC
    LIMIT ?
  `, [limit]);
  
  return results;
}

/**
 * Generate email-ready report for an account owner
 */
async function generateAccountOwnerEmailReport(ownerName) {
  const report = await getAccountOwnerReport(ownerName);
  
  // Format as simple text/HTML for email
  let text = `Partner Certification Report\n`;
  text += `Account Owner: ${ownerName}\n`;
  text += `Generated: ${new Date().toLocaleDateString()}\n\n`;
  text += `Summary:\n`;
  text += `  Total Partners: ${report.total_partners}\n`;
  text += `  Compliant: ${report.compliant_partners} (${report.compliance_rate}%)\n`;
  text += `  Need Attention: ${report.non_compliant_partners}\n`;
  text += `  Total Active NPCU: ${report.total_active_npcu}\n\n`;
  
  if (report.non_compliant_partners > 0) {
    text += `Partners Needing Attention:\n`;
    text += `-`.repeat(60) + `\n`;
    
    const needAttention = report.partners.filter(p => !p.is_compliant);
    for (const p of needAttention) {
      text += `${p.account_name} (${p.partner_tier})\n`;
      text += `  NPCU: ${p.active_npcu} / ${p.tier_requirement} required\n`;
      text += `  Gap: ${p.compliance_gap} NPCU needed\n`;
      text += `  Region: ${p.account_region || 'N/A'}\n\n`;
    }
  }
  
  return {
    subject: `Partner Certification Report - ${ownerName} - ${report.compliance_rate}% Compliance`,
    text: text,
    data: report
  };
}

/**
 * Get LMS users who are in partner groups but NOT in CRM contacts
 * These are people with LMS access who may need to be added to Salesforce
 */
async function getLmsUsersNotInCrm(options = {}) {
  const { groupId, search, limit = 500, offset = 0 } = options;
  
  let whereClause = '';
  const params = [];
  
  if (groupId) {
    whereClause = ' AND gm.group_id = ?';
    params.push(groupId);
  }
  
  if (search) {
    whereClause += ' AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR g.name LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }
  
  // Get users in groups but not in CRM
  const users = await query(`
    SELECT DISTINCT
      u.id as lms_user_id,
      u.email,
      u.first_name,
      u.last_name,
      u.status as lms_status,
      u.last_active_at,
      u.created_at_lms,
      GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', ') as group_names,
      COUNT(DISTINCT gm.group_id) as group_count,
      (SELECT COUNT(*) FROM lms_enrollments e WHERE e.user_id = u.id AND e.status = 'completed') as completed_courses,
      (SELECT COALESCE(SUM(c.npcu_value), 0) FROM lms_enrollments e 
       INNER JOIN lms_courses c ON c.id = e.course_id 
       WHERE e.user_id = u.id AND e.status = 'completed' AND c.npcu_value > 0) as total_npcu
    FROM lms_users u
    INNER JOIN lms_group_members gm ON u.id = gm.user_id
    INNER JOIN lms_groups g ON gm.group_id = g.id
    WHERE NOT EXISTS (
      SELECT 1 FROM contacts c WHERE LOWER(c.email) = LOWER(u.email)
    )
    ${whereClause}
    GROUP BY u.id
    ORDER BY group_count DESC, u.last_name, u.first_name
    LIMIT ? OFFSET ?
  `, [...params, parseInt(limit), parseInt(offset)]);
  
  // Get total count for pagination
  const [countResult] = await query(`
    SELECT COUNT(DISTINCT u.id) as total
    FROM lms_users u
    INNER JOIN lms_group_members gm ON u.id = gm.user_id
    INNER JOIN lms_groups g ON gm.group_id = g.id
    WHERE NOT EXISTS (
      SELECT 1 FROM contacts c WHERE LOWER(c.email) = LOWER(u.email)
    )
    ${whereClause}
  `, params);
  
  // Get summary stats
  const [stats] = await query(`
    SELECT 
      COUNT(DISTINCT u.id) as total_users,
      COUNT(DISTINCT gm.group_id) as groups_affected,
      COUNT(DISTINCT CASE WHEN u.status = 'active' THEN u.id END) as active_users,
      SUM(
        (SELECT COUNT(*) FROM lms_enrollments e WHERE e.user_id = u.id AND e.status = 'completed')
      ) as total_completions
    FROM lms_users u
    INNER JOIN lms_group_members gm ON u.id = gm.user_id
    WHERE NOT EXISTS (
      SELECT 1 FROM contacts c WHERE LOWER(c.email) = LOWER(u.email)
    )
  `);
  
  return {
    users,
    total: countResult?.total || 0,
    stats: {
      totalUsers: stats?.total_users || 0,
      groupsAffected: stats?.groups_affected || 0,
      activeUsers: stats?.active_users || 0,
      totalCompletions: stats?.total_completions || 0
    }
  };
}

module.exports = {
  getPartnerCertificationSummary,
  getAccountOwnerReport,
  getRegionalReport,
  getComplianceGapsReport,
  getAccountOwnersOverview,
  getPartnersByOwnerEmail,
  getExpiringCertificationsReport,
  getPartnerLeaderboard,
  generateAccountOwnerEmailReport,
  getTierRequirement,
  getLmsUsersNotInCrm,
  refreshNpcuCache
};
