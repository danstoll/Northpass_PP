/**
 * Trend Analytics Service - PARTNER USERS ONLY
 * Provides month-over-month, year-over-year reporting for KPIs
 * 
 * IMPORTANT: All analytics only include users associated with partners.
 * Partner users are defined as:
 * - Users in groups that have a partner_id set, OR
 * - Users linked to partners via the contacts table
 * 
 * Key Metrics Tracked:
 * - User registrations (new partner LMS users)
 * - Course enrollments (started)
 * - Course completions
 * - Certifications earned (NPCU > 0 courses completed)
 * - Partner compliance rates
 * 
 * FILTER SUPPORT:
 * All trend functions accept an optional filters object:
 * { region: string, owner: string, tier: string }
 * Filters are stacked (AND logic) - all specified filters must match
 */

const { query } = require('./connection.cjs');

/**
 * Build filter clauses for SQL queries
 * @param {Object} filters - { region, owner, tier }
 * @param {string} partnerAlias - alias for partners table (default 'p')
 * @returns {Object} { whereClause, params }
 */
function buildFilterClauses(filters = {}, partnerAlias = 'p') {
  const conditions = [];
  const params = [];
  
  if (filters.region) {
    conditions.push(`${partnerAlias}.account_region = ?`);
    params.push(filters.region);
  }
  
  if (filters.owner) {
    conditions.push(`${partnerAlias}.account_owner = ?`);
    params.push(filters.owner);
  }
  
  if (filters.tier) {
    conditions.push(`${partnerAlias}.partner_tier = ?`);
    params.push(filters.tier);
  }
  
  return {
    whereClause: conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '',
    params
  };
}

/**
 * Get user registration trends by month
 * Shows new user registrations per month with YoY comparison
 * ONLY counts users associated with partners
 * @param {number} months - Number of months to include
 * @param {Object} filters - { region, owner, tier }
 */
async function getUserRegistrationTrends(months = 24, filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters);
  
  // ALWAYS join to partner via contacts OR group membership
  // This ensures we ONLY count partner users
  const results = await query(`
    SELECT 
      DATE_FORMAT(u.created_at_lms, '%Y-%m') as month,
      YEAR(u.created_at_lms) as year,
      MONTH(u.created_at_lms) as month_num,
      COUNT(DISTINCT u.id) as new_users,
      COUNT(DISTINCT CASE WHEN u.status = 'active' THEN u.id END) as active_users
    FROM lms_users u
    INNER JOIN (
      -- Users linked via contacts
      SELECT DISTINCT ct.lms_user_id as user_id, ct.partner_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      -- Users in partner groups
      SELECT DISTINCT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) pu ON pu.user_id = u.id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE u.created_at_lms IS NOT NULL
      AND u.created_at_lms >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      ${whereClause}
    GROUP BY DATE_FORMAT(u.created_at_lms, '%Y-%m'), YEAR(u.created_at_lms), MONTH(u.created_at_lms)
    ORDER BY month ASC
  `, [months, ...params]);

  // Calculate running totals and MoM/YoY changes
  const enriched = [];
  let runningTotal = 0;
  
  for (let i = 0; i < results.length; i++) {
    const current = results[i];
    runningTotal += current.new_users;
    
    // Find same month last year for YoY comparison
    const lastYear = results.find(r => 
      r.year === current.year - 1 && r.month_num === current.month_num
    );
    
    // Find previous month for MoM comparison
    const prevMonth = i > 0 ? results[i - 1] : null;
    
    enriched.push({
      month: current.month,
      newUsers: current.new_users,
      activeUsers: current.active_users,
      runningTotal,
      momChange: prevMonth ? current.new_users - prevMonth.new_users : null,
      momChangePercent: prevMonth && prevMonth.new_users > 0 
        ? ((current.new_users - prevMonth.new_users) / prevMonth.new_users * 100).toFixed(1)
        : null,
      yoyChange: lastYear ? current.new_users - lastYear.new_users : null,
      yoyChangePercent: lastYear && lastYear.new_users > 0
        ? ((current.new_users - lastYear.new_users) / lastYear.new_users * 100).toFixed(1)
        : null
    });
  }

  return enriched;
}

/**
 * Get enrollment trends by month
 * Shows new enrollments and completions per month - PARTNER USERS ONLY
 * @param {number} months - Number of months to include
 * @param {Object} filters - { region, owner, tier }
 */
async function getEnrollmentTrends(months = 24, filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters);
  
  // Partner user subquery
  const partnerUserSubquery = `
    SELECT DISTINCT user_id, partner_id FROM (
      SELECT ct.lms_user_id as user_id, ct.partner_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      SELECT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) x
  `;
  
  // Enrollments started
  const enrollments = await query(`
    SELECT 
      DATE_FORMAT(e.enrolled_at, '%Y-%m') as month,
      YEAR(e.enrolled_at) as year,
      MONTH(e.enrolled_at) as month_num,
      COUNT(*) as enrollments
    FROM lms_enrollments e
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE e.enrolled_at IS NOT NULL
      AND e.enrolled_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      ${whereClause}
    GROUP BY DATE_FORMAT(e.enrolled_at, '%Y-%m'), YEAR(e.enrolled_at), MONTH(e.enrolled_at)
    ORDER BY month ASC
  `, [months, ...params]);

  // Completions
  const completions = await query(`
    SELECT 
      DATE_FORMAT(e.completed_at, '%Y-%m') as month,
      COUNT(*) as completions
    FROM lms_enrollments e
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE e.completed_at IS NOT NULL
      AND e.status = 'completed'
      AND e.completed_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      ${whereClause}
    GROUP BY DATE_FORMAT(e.completed_at, '%Y-%m')
    ORDER BY month ASC
  `, [months, ...params]);

  // Merge data
  const completionMap = new Map(completions.map(c => [c.month, c.completions]));
  
  return enrollments.map((e, i) => {
    const prev = i > 0 ? enrollments[i - 1] : null;
    const lastYear = enrollments.find(r => 
      r.year === e.year - 1 && r.month_num === e.month_num
    );
    
    return {
      month: e.month,
      enrollments: e.enrollments,
      completions: completionMap.get(e.month) || 0,
      completionRate: e.enrollments > 0 
        ? ((completionMap.get(e.month) || 0) / e.enrollments * 100).toFixed(1)
        : 0,
      momEnrollmentChange: prev ? e.enrollments - prev.enrollments : null,
      yoyEnrollmentChange: lastYear ? e.enrollments - lastYear.enrollments : null
    };
  });
}

/**
 * Get certification trends (courses with NPCU > 0) - PARTNER USERS ONLY
 * @param {number} months - Number of months to include
 * @param {Object} filters - { region, owner, tier }
 */
async function getCertificationTrends(months = 24, filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters);
  
  const partnerUserSubquery = `
    SELECT DISTINCT user_id, partner_id FROM (
      SELECT ct.lms_user_id as user_id, ct.partner_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      SELECT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) x
  `;
  
  const results = await query(`
    SELECT 
      DATE_FORMAT(e.completed_at, '%Y-%m') as month,
      YEAR(e.completed_at) as year,
      MONTH(e.completed_at) as month_num,
      COUNT(*) as certifications,
      SUM(c.npcu_value) as total_npcu,
      COUNT(DISTINCT e.user_id) as unique_users
    FROM lms_enrollments e
    INNER JOIN lms_courses c ON c.id = e.course_id AND c.npcu_value > 0
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE e.status = 'completed'
      AND e.completed_at IS NOT NULL
      AND e.completed_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      ${whereClause}
    GROUP BY DATE_FORMAT(e.completed_at, '%Y-%m'), YEAR(e.completed_at), MONTH(e.completed_at)
    ORDER BY month ASC
  `, [months, ...params]);

  let runningNpcu = 0;
  
  return results.map((r, i) => {
    runningNpcu += r.total_npcu;
    const prev = i > 0 ? results[i - 1] : null;
    const lastYear = results.find(row => 
      row.year === r.year - 1 && row.month_num === r.month_num
    );
    
    return {
      month: r.month,
      certifications: r.certifications,
      totalNpcu: r.total_npcu,
      uniqueUsers: r.unique_users,
      avgNpcuPerCert: (r.total_npcu / r.certifications).toFixed(1),
      runningNpcu,
      momCertChange: prev ? r.certifications - prev.certifications : null,
      momNpcuChange: prev ? r.total_npcu - prev.total_npcu : null,
      yoyCertChange: lastYear ? r.certifications - lastYear.certifications : null,
      yoyNpcuChange: lastYear ? r.total_npcu - lastYear.total_npcu : null
    };
  });
}

/**
 * Get course popularity trends - PARTNER USERS ONLY
 * Which courses are being completed the most each month
 * @param {number} months - Number of months to include
 * @param {number} topN - Number of top courses to return
 * @param {Object} filters - { region, owner, tier }
 */
async function getCoursePopularityTrends(months = 12, topN = 10, filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters);
  
  const partnerUserSubquery = `
    SELECT DISTINCT user_id, partner_id FROM (
      SELECT ct.lms_user_id as user_id, ct.partner_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      SELECT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) x
  `;
  
  return await query(`
    SELECT 
      c.id as course_id,
      c.name as course_name,
      c.product_category,
      c.npcu_value,
      DATE_FORMAT(e.completed_at, '%Y-%m') as month,
      COUNT(*) as completions
    FROM lms_enrollments e
    INNER JOIN lms_courses c ON c.id = e.course_id
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE e.status = 'completed'
      AND e.completed_at IS NOT NULL
      AND e.completed_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      ${whereClause}
    GROUP BY c.id, c.name, c.product_category, c.npcu_value, DATE_FORMAT(e.completed_at, '%Y-%m')
    ORDER BY month DESC, completions DESC
  `, [months, ...params]);
}

/**
 * Get partner growth trends
 * Track how partner engagement grows over time
 * @param {number} months - Number of months to include
 * @param {Object} filters - { region, owner, tier }
 */
async function getPartnerGrowthTrends(months = 24, filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters, 'p');
  
  // Partners linked to LMS groups over time (using group creation/sync date)
  const partnerLinking = await query(`
    SELECT 
      DATE_FORMAT(g.synced_at, '%Y-%m') as month,
      COUNT(DISTINCT g.partner_id) as partners_linked
    FROM lms_groups g
    INNER JOIN partners p ON p.id = g.partner_id
    WHERE g.partner_id IS NOT NULL
      AND g.synced_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      ${whereClause}
    GROUP BY DATE_FORMAT(g.synced_at, '%Y-%m')
    ORDER BY month ASC
  `, [months, ...params]);

  return partnerLinking;
}

/**
 * Get tier compliance trends over time
 * Track how many partners are compliant each month
 * @param {number} months - Number of months to include (for historical tracking)
 * @param {Object} filters - { region, owner, tier }
 */
async function getComplianceTrends(months = 12, filters = {}) {
  const conditions = [];
  const params = [];
  
  // Add region filter
  if (filters.region) {
    conditions.push(`p.account_region = ?`);
    params.push(filters.region);
  }
  
  // Add owner filter
  if (filters.owner) {
    conditions.push(`p.account_owner = ?`);
    params.push(filters.owner);
  }
  
  // Base tier condition (either specific tier or all tiers)
  let tierCondition = `p.partner_tier IN ('Premier', 'Premier Plus', 'Select', 'Registered', 'Certified', 'Aggregator')`;
  
  // If a specific tier is requested, filter to that tier
  if (filters.tier) {
    tierCondition = `p.partner_tier = ?`;
    params.unshift(filters.tier); // Add tier at the beginning since it's in WHERE
  }
  
  const whereClause = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
  
  // Current compliance by tier (or filtered view)
  const current = await query(`
    SELECT 
      p.partner_tier as tier,
      COUNT(*) as total_partners,
      SUM(CASE 
        WHEN COALESCE(nc.active_npcu, 0) >= 
          CASE p.partner_tier
            WHEN 'Premier' THEN 20
            WHEN 'Premier Plus' THEN 20
            WHEN 'Select' THEN 10
            WHEN 'Registered' THEN 5
            WHEN 'Certified' THEN 2
            WHEN 'Aggregator' THEN 5
            ELSE 0
          END
        THEN 1 ELSE 0 
      END) as compliant_partners
    FROM partners p
    LEFT JOIN partner_npcu_cache nc ON nc.partner_id = p.id
    WHERE ${tierCondition}
      ${whereClause}
    GROUP BY p.partner_tier
    ORDER BY 
      CASE p.partner_tier 
        WHEN 'Premier Plus' THEN 1
        WHEN 'Premier' THEN 2 
        WHEN 'Select' THEN 3 
        WHEN 'Certified' THEN 4
        WHEN 'Registered' THEN 5
        WHEN 'Aggregator' THEN 6
      END
  `, params);

  return current.map(t => ({
    tier: t.tier,
    totalPartners: t.total_partners,
    compliantPartners: t.compliant_partners,
    nonCompliantPartners: t.total_partners - t.compliant_partners,
    complianceRate: t.total_partners > 0 
      ? ((t.compliant_partners / t.total_partners) * 100).toFixed(1) 
      : 0
  }));
}

/**
 * Get region growth trends - PARTNER USERS ONLY
 * @param {number} months - Number of months to include
 * @param {Object} filters - { region, owner, tier }
 */
async function getRegionalTrends(months = 24, filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters, 'p');
  
  // Use the partner user subquery to ensure we only count partner users
  const partnerUserSubquery = `
    SELECT DISTINCT user_id, partner_id FROM (
      SELECT ct.lms_user_id as user_id, ct.partner_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      SELECT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) x
  `;
  
  return await query(`
    SELECT 
      p.account_region as region,
      DATE_FORMAT(u.created_at_lms, '%Y-%m') as month,
      COUNT(DISTINCT u.id) as new_users,
      COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.id END) as completions
    FROM lms_users u
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = u.id
    INNER JOIN partners p ON p.id = pu.partner_id
    LEFT JOIN lms_enrollments e ON e.user_id = u.id AND e.completed_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
    WHERE u.created_at_lms >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      ${whereClause}
    GROUP BY p.account_region, DATE_FORMAT(u.created_at_lms, '%Y-%m')
    ORDER BY region, month
  `, [months, months, ...params]);
}

/**
 * Get KPI summary for dashboard - PARTNER USERS ONLY
 * Single view of all key metrics with period comparisons
 * @param {Object} filters - { region, owner, tier }
 */
async function getKpiSummary(filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters);
  
  // Current period (this month)
  const thisMonth = new Date().toISOString().slice(0, 7);
  const lastMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
  const thisMonthLastYear = new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().slice(0, 7);

  // Partner user subquery - used consistently across all metrics
  const partnerUserSubquery = `
    SELECT DISTINCT user_id, partner_id FROM (
      SELECT ct.lms_user_id as user_id, ct.partner_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      SELECT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) x
  `;

  // User metrics - PARTNER USERS ONLY
  const userResults = await query(`
    SELECT 
      SUM(CASE WHEN DATE_FORMAT(u.created_at_lms, '%Y-%m') = ? THEN 1 ELSE 0 END) as this_month_users,
      SUM(CASE WHEN DATE_FORMAT(u.created_at_lms, '%Y-%m') = ? THEN 1 ELSE 0 END) as last_month_users,
      SUM(CASE WHEN DATE_FORMAT(u.created_at_lms, '%Y-%m') = ? THEN 1 ELSE 0 END) as last_year_users,
      COUNT(*) as total_users,
      SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END) as active_users
    FROM lms_users u
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = u.id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE 1=1 ${whereClause}
  `, [thisMonth, lastMonth, thisMonthLastYear, ...params]);
  
  const userStats = userResults[0] || {};

  // Enrollment metrics - PARTNER USERS ONLY
  const enrollmentResults = await query(`
    SELECT 
      SUM(CASE WHEN DATE_FORMAT(e.enrolled_at, '%Y-%m') = ? THEN 1 ELSE 0 END) as this_month_enrollments,
      SUM(CASE WHEN DATE_FORMAT(e.enrolled_at, '%Y-%m') = ? THEN 1 ELSE 0 END) as last_month_enrollments,
      SUM(CASE WHEN DATE_FORMAT(e.enrolled_at, '%Y-%m') = ? THEN 1 ELSE 0 END) as last_year_enrollments,
      COUNT(*) as total_enrollments
    FROM lms_enrollments e
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE 1=1 ${whereClause}
  `, [thisMonth, lastMonth, thisMonthLastYear, ...params]);
  
  const enrollmentStats = enrollmentResults[0] || {};

  // Completion metrics - PARTNER USERS ONLY
  const completionResults = await query(`
    SELECT 
      SUM(CASE WHEN e.status = 'completed' AND DATE_FORMAT(e.completed_at, '%Y-%m') = ? THEN 1 ELSE 0 END) as this_month_completions,
      SUM(CASE WHEN e.status = 'completed' AND DATE_FORMAT(e.completed_at, '%Y-%m') = ? THEN 1 ELSE 0 END) as last_month_completions,
      SUM(CASE WHEN e.status = 'completed' AND DATE_FORMAT(e.completed_at, '%Y-%m') = ? THEN 1 ELSE 0 END) as last_year_completions,
      SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) as total_completions
    FROM lms_enrollments e
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE 1=1 ${whereClause}
  `, [thisMonth, lastMonth, thisMonthLastYear, ...params]);
  
  const completionStats = completionResults[0] || {};

  // Certification (NPCU) metrics - PARTNER USERS ONLY
  const npcuResults = await query(`
    SELECT 
      SUM(CASE WHEN e.status = 'completed' AND DATE_FORMAT(e.completed_at, '%Y-%m') = ? THEN c.npcu_value ELSE 0 END) as this_month_npcu,
      SUM(CASE WHEN e.status = 'completed' AND DATE_FORMAT(e.completed_at, '%Y-%m') = ? THEN c.npcu_value ELSE 0 END) as last_month_npcu,
      SUM(CASE WHEN e.status = 'completed' AND DATE_FORMAT(e.completed_at, '%Y-%m') = ? THEN c.npcu_value ELSE 0 END) as last_year_npcu,
      SUM(CASE WHEN e.status = 'completed' THEN c.npcu_value ELSE 0 END) as total_npcu
    FROM lms_enrollments e
    INNER JOIN lms_courses c ON c.id = e.course_id AND c.npcu_value > 0
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE 1=1 ${whereClause}
  `, [thisMonth, lastMonth, thisMonthLastYear, ...params]);
  
  const npcuStats = npcuResults[0] || {};

  // Calculate percentage changes
  const calcChange = (current, previous) => {
    if (!previous || previous === 0) return null;
    return ((current - previous) / previous * 100).toFixed(1);
  };

  return {
    period: {
      current: thisMonth,
      previous: lastMonth,
      lastYear: thisMonthLastYear
    },
    filters: {
      region: filters.region || null,
      owner: filters.owner || null,
      tier: filters.tier || null
    },
    note: 'Analytics include partner users only (users in partner groups or linked via contacts)',
    users: {
      thisMonth: userStats.this_month_users || 0,
      lastMonth: userStats.last_month_users || 0,
      lastYear: userStats.last_year_users || 0,
      total: userStats.total_users || 0,
      active: userStats.active_users || 0,
      momChange: calcChange(userStats.this_month_users, userStats.last_month_users),
      yoyChange: calcChange(userStats.this_month_users, userStats.last_year_users)
    },
    enrollments: {
      thisMonth: enrollmentStats.this_month_enrollments || 0,
      lastMonth: enrollmentStats.last_month_enrollments || 0,
      lastYear: enrollmentStats.last_year_enrollments || 0,
      total: enrollmentStats.total_enrollments || 0,
      momChange: calcChange(enrollmentStats.this_month_enrollments, enrollmentStats.last_month_enrollments),
      yoyChange: calcChange(enrollmentStats.this_month_enrollments, enrollmentStats.last_year_enrollments)
    },
    completions: {
      thisMonth: completionStats.this_month_completions || 0,
      lastMonth: completionStats.last_month_completions || 0,
      lastYear: completionStats.last_year_completions || 0,
      total: completionStats.total_completions || 0,
      momChange: calcChange(completionStats.this_month_completions, completionStats.last_month_completions),
      yoyChange: calcChange(completionStats.this_month_completions, completionStats.last_year_completions)
    },
    npcu: {
      thisMonth: npcuStats.this_month_npcu || 0,
      lastMonth: npcuStats.last_month_npcu || 0,
      lastYear: npcuStats.last_year_npcu || 0,
      total: npcuStats.total_npcu || 0,
      momChange: calcChange(npcuStats.this_month_npcu, npcuStats.last_month_npcu),
      yoyChange: calcChange(npcuStats.this_month_npcu, npcuStats.last_year_npcu)
    }
  };
}

/**
 * Get activity heatmap data - PARTNER USERS ONLY
 * Shows which days/weeks have the most activity
 * @param {number} months - Number of months to include
 * @param {Object} filters - { region, owner, tier }
 */
async function getActivityHeatmap(months = 3, filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters);
  
  const partnerUserSubquery = `
    SELECT DISTINCT user_id, partner_id FROM (
      SELECT ct.lms_user_id as user_id, ct.partner_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      SELECT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) x
  `;
  
  return await query(`
    SELECT 
      DATE(e.completed_at) as date,
      DAYOFWEEK(e.completed_at) as day_of_week,
      WEEK(e.completed_at) as week_num,
      COUNT(*) as completions
    FROM lms_enrollments e
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE e.status = 'completed'
      AND e.completed_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      ${whereClause}
    GROUP BY DATE(e.completed_at), DAYOFWEEK(e.completed_at), WEEK(e.completed_at)
    ORDER BY date ASC
  `, [months, ...params]);
}

/**
 * Get weekly summary for quick reports - PARTNER USERS ONLY
 * @param {number} weeks - Number of weeks to include
 * @param {Object} filters - { region, owner, tier }
 */
async function getWeeklySummary(weeks = 12, filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters);
  
  const partnerUserSubquery = `
    SELECT DISTINCT user_id, partner_id FROM (
      SELECT ct.lms_user_id as user_id, ct.partner_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      SELECT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) x
  `;
  
  return await query(`
    SELECT 
      YEARWEEK(e.completed_at, 1) as year_week,
      MIN(DATE(e.completed_at)) as week_start,
      MAX(DATE(e.completed_at)) as week_end,
      COUNT(*) as completions,
      COUNT(DISTINCT e.user_id) as unique_users,
      COALESCE(SUM(c.npcu_value), 0) as npcu_earned,
      COUNT(CASE WHEN c.npcu_value > 0 THEN 1 END) as certifications
    FROM lms_enrollments e
    LEFT JOIN lms_courses c ON c.id = e.course_id
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE e.status = 'completed'
      AND e.completed_at >= DATE_SUB(CURDATE(), INTERVAL ? WEEK)
      ${whereClause}
    GROUP BY YEARWEEK(e.completed_at, 1)
    ORDER BY year_week DESC
  `, [weeks, ...params]);
}

/**
 * Get YTD comparison (this year vs last year) - PARTNER USERS ONLY
 * @param {Object} filters - { region, owner, tier }
 */
async function getYtdComparison(filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters);
  
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;
  const currentDayOfYear = Math.ceil((new Date() - new Date(currentYear, 0, 1)) / 86400000);

  // Partner user subquery
  const partnerUserSubquery = `
    SELECT DISTINCT user_id, partner_id FROM (
      SELECT ct.lms_user_id as user_id, ct.partner_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      SELECT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) x
  `;

  // Get YTD users - PARTNER USERS ONLY
  const userYtd = await query(`
    SELECT 
      SUM(CASE WHEN YEAR(u.created_at_lms) = ? AND DAYOFYEAR(u.created_at_lms) <= ? THEN 1 ELSE 0 END) as this_year,
      SUM(CASE WHEN YEAR(u.created_at_lms) = ? AND DAYOFYEAR(u.created_at_lms) <= ? THEN 1 ELSE 0 END) as last_year
    FROM lms_users u
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = u.id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE 1=1 ${whereClause}
  `, [currentYear, currentDayOfYear, lastYear, currentDayOfYear, ...params]);
  
  // Get YTD enrollments - PARTNER USERS ONLY
  const enrollmentYtd = await query(`
    SELECT 
      SUM(CASE WHEN YEAR(e.enrolled_at) = ? AND DAYOFYEAR(e.enrolled_at) <= ? THEN 1 ELSE 0 END) as this_year,
      SUM(CASE WHEN YEAR(e.enrolled_at) = ? AND DAYOFYEAR(e.enrolled_at) <= ? THEN 1 ELSE 0 END) as last_year
    FROM lms_enrollments e
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE 1=1 ${whereClause}
  `, [currentYear, currentDayOfYear, lastYear, currentDayOfYear, ...params]);
  
  // Get YTD completions - PARTNER USERS ONLY
  const completionYtd = await query(`
    SELECT 
      SUM(CASE WHEN e.status = 'completed' AND YEAR(e.completed_at) = ? AND DAYOFYEAR(e.completed_at) <= ? THEN 1 ELSE 0 END) as this_year,
      SUM(CASE WHEN e.status = 'completed' AND YEAR(e.completed_at) = ? AND DAYOFYEAR(e.completed_at) <= ? THEN 1 ELSE 0 END) as last_year
    FROM lms_enrollments e
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE 1=1 ${whereClause}
  `, [currentYear, currentDayOfYear, lastYear, currentDayOfYear, ...params]);
  
  // Get YTD NPCU - PARTNER USERS ONLY
  const npcuYtd = await query(`
    SELECT 
      SUM(CASE WHEN e.status = 'completed' AND YEAR(e.completed_at) = ? AND DAYOFYEAR(e.completed_at) <= ? THEN c.npcu_value ELSE 0 END) as this_year,
      SUM(CASE WHEN e.status = 'completed' AND YEAR(e.completed_at) = ? AND DAYOFYEAR(e.completed_at) <= ? THEN c.npcu_value ELSE 0 END) as last_year
    FROM lms_enrollments e
    INNER JOIN lms_courses c ON c.id = e.course_id AND c.npcu_value > 0
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE 1=1 ${whereClause}
  `, [currentYear, currentDayOfYear, lastYear, currentDayOfYear, ...params]);

  const calcChange = (current, previous) => {
    if (!previous || previous === 0) return null;
    return ((current - previous) / previous * 100).toFixed(1);
  };

  const users = userYtd[0] || {};
  const enrollments = enrollmentYtd[0] || {};
  const completions = completionYtd[0] || {};
  const npcu = npcuYtd[0] || {};

  return {
    currentYear,
    lastYear,
    dayOfYear: currentDayOfYear,
    filters: {
      region: filters.region || null,
      owner: filters.owner || null,
      tier: filters.tier || null
    },
    note: 'Analytics include partner users only',
    users: {
      thisYear: users.this_year || 0,
      lastYear: users.last_year || 0,
      change: calcChange(users.this_year, users.last_year)
    },
    enrollments: {
      thisYear: enrollments.this_year || 0,
      lastYear: enrollments.last_year || 0,
      change: calcChange(enrollments.this_year, enrollments.last_year)
    },
    completions: {
      thisYear: completions.this_year || 0,
      lastYear: completions.last_year || 0,
      change: calcChange(completions.this_year, completions.last_year)
    },
    npcu: {
      thisYear: npcu.this_year || 0,
      lastYear: npcu.last_year || 0,
      change: calcChange(npcu.this_year, npcu.last_year)
    }
  };
}

/**
 * Get full trend report for export/presentation - PARTNER USERS ONLY
 * @param {number} months - Number of months to include
 * @param {Object} filters - { region, owner, tier }
 */
async function getFullTrendReport(months = 12, filters = {}) {
  const [
    kpiSummary,
    ytdComparison,
    userTrends,
    enrollmentTrends,
    certificationTrends,
    complianceTrends,
    weeklySummary
  ] = await Promise.all([
    getKpiSummary(filters),
    getYtdComparison(filters),
    getUserRegistrationTrends(months, filters),
    getEnrollmentTrends(months, filters),
    getCertificationTrends(months, filters),
    getComplianceTrends(months, filters),
    getWeeklySummary(12, filters)
  ]);

  return {
    generatedAt: new Date().toISOString(),
    reportPeriod: `Last ${months} months`,
    filters: {
      region: filters.region || null,
      owner: filters.owner || null,
      tier: filters.tier || null
    },
    note: 'Analytics include partner users only (users in partner groups or linked via contacts)',
    kpiSummary,
    ytdComparison,
    trends: {
      users: userTrends,
      enrollments: enrollmentTrends,
      certifications: certificationTrends
    },
    compliance: complianceTrends,
    recentWeeks: weeklySummary
  };
}

/**
 * Get owner-specific trends - PARTNER USERS ONLY
 * For account owners to track their portfolio
 * @param {string} ownerName - Account owner name
 * @param {number} months - Number of months to include
 * @param {Object} filters - { region, tier } - owner is already specified
 */
async function getOwnerTrends(ownerName, months = 12, filters = {}) {
  // For owner trends, owner is the primary filter
  const combinedFilters = { ...filters, owner: ownerName };
  const { whereClause, params } = buildFilterClauses(combinedFilters);
  
  const partnerUserSubquery = `
    SELECT DISTINCT user_id, partner_id FROM (
      SELECT ct.lms_user_id as user_id, ct.partner_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      SELECT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) x
  `;
  
  const results = await query(`
    SELECT 
      DATE_FORMAT(e.completed_at, '%Y-%m') as month,
      COUNT(*) as completions,
      COUNT(DISTINCT e.user_id) as unique_users,
      COALESCE(SUM(c.npcu_value), 0) as npcu_earned
    FROM lms_enrollments e
    INNER JOIN lms_courses c ON c.id = e.course_id
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE e.status = 'completed'
      AND e.completed_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      ${whereClause}
    GROUP BY DATE_FORMAT(e.completed_at, '%Y-%m')
    ORDER BY month ASC
  `, [months, ...params]);

  return results;
}

// ============================================
// DEEP ANALYTICS - Advanced Insights
// ============================================

/**
 * Partner Engagement Score
 * Calculates a composite score based on:
 * - User activation rate (contacts with LMS accounts)
 * - Course completion rate
 * - Certification achievement
 * - Recent activity
 */
async function getPartnerEngagementScores(limit = 50, filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters);
  
  const results = await query(`
    SELECT 
      p.id,
      p.account_name,
      p.partner_tier,
      p.account_region,
      p.account_owner,
      p.total_npcu,
      -- Contact metrics
      (SELECT COUNT(*) FROM contacts c WHERE c.partner_id = p.id AND c.is_active = TRUE) as total_contacts,
      (SELECT COUNT(*) FROM contacts c WHERE c.partner_id = p.id AND c.is_active = TRUE AND c.lms_user_id IS NOT NULL) as contacts_with_lms,
      -- Group metrics  
      g.id as group_id,
      (SELECT COUNT(*) FROM lms_group_members gm WHERE gm.group_id = g.id) as group_members,
      -- Enrollment metrics
      (SELECT COUNT(*) FROM lms_enrollments e 
       JOIN lms_group_members gm ON gm.user_id = e.user_id 
       WHERE gm.group_id = g.id) as total_enrollments,
      (SELECT COUNT(*) FROM lms_enrollments e 
       JOIN lms_group_members gm ON gm.user_id = e.user_id 
       WHERE gm.group_id = g.id AND e.status = 'completed') as completed_enrollments,
      -- Certification metrics (NPCU courses)
      (SELECT COUNT(*) FROM lms_enrollments e 
       JOIN lms_group_members gm ON gm.user_id = e.user_id 
       JOIN lms_courses c ON c.id = e.course_id
       WHERE gm.group_id = g.id AND e.status = 'completed' AND c.npcu_value > 0) as certifications,
      -- Recent activity (30 days)
      (SELECT COUNT(*) FROM lms_enrollments e 
       JOIN lms_group_members gm ON gm.user_id = e.user_id 
       WHERE gm.group_id = g.id AND e.completed_at > DATE_SUB(NOW(), INTERVAL 30 DAY)) as recent_completions
    FROM partners p
    LEFT JOIN lms_groups g ON g.partner_id = p.id
    WHERE p.is_active = TRUE
      ${whereClause}
    ORDER BY p.total_npcu DESC
    LIMIT ?
  `, [...params, limit]);

  // Calculate engagement scores
  return results.map(r => {
    const activationRate = r.total_contacts > 0 
      ? (r.contacts_with_lms / r.total_contacts * 100) : 0;
    const completionRate = r.total_enrollments > 0 
      ? (r.completed_enrollments / r.total_enrollments * 100) : 0;
    const certificationDensity = r.group_members > 0 
      ? (r.certifications / r.group_members) : 0;
    const activityScore = r.recent_completions > 0 ? Math.min(r.recent_completions * 10, 100) : 0;
    
    // Weighted composite score (0-100)
    const engagementScore = Math.round(
      (activationRate * 0.25) +
      (completionRate * 0.25) +
      (certificationDensity * 20 * 0.30) +  // Scale to ~100
      (activityScore * 0.20)
    );

    return {
      ...r,
      activationRate: activationRate.toFixed(1),
      completionRate: completionRate.toFixed(1),
      certificationDensity: certificationDensity.toFixed(2),
      activityScore,
      engagementScore: Math.min(engagementScore, 100)
    };
  });
}

/**
 * Cohort Analysis
 * Analyzes user behavior based on when they joined
 * Shows retention and progression over time
 */
async function getCohortAnalysis(cohortMonths = 6, filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters);
  
  const partnerUserSubquery = `
    SELECT DISTINCT user_id, partner_id FROM (
      SELECT ct.lms_user_id as user_id, ct.partner_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      SELECT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) x
  `;
  
  const results = await query(`
    SELECT 
      DATE_FORMAT(u.created_at_lms, '%Y-%m') as cohort_month,
      COUNT(DISTINCT u.id) as cohort_size,
      -- Activity in first 30 days
      COUNT(DISTINCT CASE 
        WHEN e.enrolled_at <= DATE_ADD(u.created_at_lms, INTERVAL 30 DAY) 
        THEN u.id END) as enrolled_30d,
      COUNT(DISTINCT CASE 
        WHEN e.completed_at <= DATE_ADD(u.created_at_lms, INTERVAL 30 DAY) 
        THEN u.id END) as completed_30d,
      -- Activity in first 90 days
      COUNT(DISTINCT CASE 
        WHEN e.enrolled_at <= DATE_ADD(u.created_at_lms, INTERVAL 90 DAY) 
        THEN u.id END) as enrolled_90d,
      COUNT(DISTINCT CASE 
        WHEN e.completed_at <= DATE_ADD(u.created_at_lms, INTERVAL 90 DAY) 
        THEN u.id END) as completed_90d,
      -- Total activity
      COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN u.id END) as ever_enrolled,
      COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN u.id END) as ever_completed,
      -- Certifications
      COUNT(DISTINCT CASE 
        WHEN e.status = 'completed' AND c.npcu_value > 0 
        THEN u.id END) as earned_certification
    FROM lms_users u
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = u.id
    INNER JOIN partners p ON p.id = pu.partner_id
    LEFT JOIN lms_enrollments e ON e.user_id = u.id
    LEFT JOIN lms_courses c ON c.id = e.course_id
    WHERE u.created_at_lms >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      ${whereClause}
    GROUP BY DATE_FORMAT(u.created_at_lms, '%Y-%m')
    ORDER BY cohort_month DESC
  `, [cohortMonths, ...params]);

  return results.map(r => ({
    ...r,
    activation_30d: r.cohort_size > 0 ? ((r.enrolled_30d / r.cohort_size) * 100).toFixed(1) : 0,
    completion_30d: r.cohort_size > 0 ? ((r.completed_30d / r.cohort_size) * 100).toFixed(1) : 0,
    activation_90d: r.cohort_size > 0 ? ((r.enrolled_90d / r.cohort_size) * 100).toFixed(1) : 0,
    completion_90d: r.cohort_size > 0 ? ((r.completed_90d / r.cohort_size) * 100).toFixed(1) : 0,
    total_activation: r.cohort_size > 0 ? ((r.ever_enrolled / r.cohort_size) * 100).toFixed(1) : 0,
    certification_rate: r.cohort_size > 0 ? ((r.earned_certification / r.cohort_size) * 100).toFixed(1) : 0
  }));
}

/**
 * Learning Path Analysis
 * Identifies common course sequences and progression patterns
 */
async function getLearningPathAnalysis(limit = 20) {
  // Find common course pairs (what courses are taken together)
  const coursePairs = await query(`
    SELECT 
      c1.name as first_course,
      c2.name as second_course,
      COUNT(*) as pair_count
    FROM lms_enrollments e1
    JOIN lms_enrollments e2 ON e1.user_id = e2.user_id 
      AND e2.enrolled_at > e1.enrolled_at
      AND e2.enrolled_at <= DATE_ADD(e1.enrolled_at, INTERVAL 30 DAY)
    JOIN lms_courses c1 ON c1.id = e1.course_id
    JOIN lms_courses c2 ON c2.id = e2.course_id
    WHERE e1.status = 'completed'
    GROUP BY c1.name, c2.name
    HAVING COUNT(*) >= 5
    ORDER BY pair_count DESC
    LIMIT ?
  `, [limit]);

  // Find courses that lead to certifications
  const certificationPaths = await query(`
    SELECT 
      c1.name as prerequisite_course,
      c2.name as certification_course,
      c2.npcu_value,
      COUNT(DISTINCT e1.user_id) as users_progressed,
      AVG(DATEDIFF(e2.completed_at, e1.completed_at)) as avg_days_between
    FROM lms_enrollments e1
    JOIN lms_enrollments e2 ON e1.user_id = e2.user_id 
      AND e2.completed_at > e1.completed_at
    JOIN lms_courses c1 ON c1.id = e1.course_id AND c1.npcu_value = 0
    JOIN lms_courses c2 ON c2.id = e2.course_id AND c2.npcu_value > 0
    WHERE e1.status = 'completed' AND e2.status = 'completed'
    GROUP BY c1.name, c2.name, c2.npcu_value
    HAVING COUNT(DISTINCT e1.user_id) >= 3
    ORDER BY users_progressed DESC
    LIMIT ?
  `, [limit]);

  // Average time to first certification
  const timeToFirstCert = await query(`
    SELECT 
      AVG(DATEDIFF(first_cert.completed_at, u.created_at_lms)) as avg_days_to_cert,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY DATEDIFF(first_cert.completed_at, u.created_at_lms)) 
        OVER () as median_days_to_cert
    FROM lms_users u
    JOIN (
      SELECT user_id, MIN(completed_at) as completed_at
      FROM lms_enrollments e
      JOIN lms_courses c ON c.id = e.course_id
      WHERE e.status = 'completed' AND c.npcu_value > 0
      GROUP BY user_id
    ) first_cert ON first_cert.user_id = u.id
    WHERE u.created_at_lms IS NOT NULL
  `);

  return {
    coursePairs,
    certificationPaths,
    timeToFirstCertification: timeToFirstCert[0] || null
  };
}

/**
 * Partner Tier Progression Analysis
 * Shows how partners progress through tiers and what drives advancement
 */
async function getTierProgressionInsights(filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters);
  
  // NPCU requirements by tier
  const tierRequirements = {
    'Registered': 5,
    'Certified': 10,
    'Premier': 20,
    'Premier Plus': 30
  };

  // Get tier distribution with NPCU stats
  const tierStats = await query(`
    SELECT 
      COALESCE(partner_tier, 'Unknown') as tier,
      COUNT(*) as partner_count,
      AVG(total_npcu) as avg_npcu,
      MIN(total_npcu) as min_npcu,
      MAX(total_npcu) as max_npcu,
      SUM(total_npcu) as total_npcu,
      AVG(cert_count_nintex_ce + cert_count_nintex_k2 + cert_count_nintex_salesforce + cert_count_go_to_market) as avg_certs
    FROM partners 
    WHERE is_active = TRUE
      ${whereClause}
    GROUP BY partner_tier
    ORDER BY FIELD(partner_tier, 'Premier Plus', 'Premier', 'Certified', 'Registered', 'Aggregator')
  `, params);

  // Partners close to next tier
  const closeToUpgrade = await query(`
    SELECT 
      p.account_name,
      p.partner_tier as current_tier,
      p.total_npcu,
      p.account_owner,
      CASE 
        WHEN p.partner_tier = 'Registered' THEN 10 - p.total_npcu
        WHEN p.partner_tier = 'Certified' THEN 20 - p.total_npcu
        WHEN p.partner_tier = 'Premier' THEN 30 - p.total_npcu
        ELSE 999
      END as npcu_to_next_tier,
      CASE 
        WHEN p.partner_tier = 'Registered' THEN 'Certified'
        WHEN p.partner_tier = 'Certified' THEN 'Premier'
        WHEN p.partner_tier = 'Premier' THEN 'Premier Plus'
        ELSE NULL
      END as next_tier
    FROM partners p
    WHERE p.is_active = TRUE
      AND p.partner_tier IN ('Registered', 'Certified', 'Premier')
      ${whereClause}
    HAVING npcu_to_next_tier > 0 AND npcu_to_next_tier <= 5
    ORDER BY npcu_to_next_tier ASC
    LIMIT 25
  `, params);

  // Partners at risk (below tier threshold)
  const atRiskPartners = await query(`
    SELECT 
      p.account_name,
      p.partner_tier,
      p.total_npcu,
      p.account_owner,
      CASE 
        WHEN p.partner_tier = 'Certified' AND p.total_npcu < 10 THEN 10 - p.total_npcu
        WHEN p.partner_tier = 'Premier' AND p.total_npcu < 20 THEN 20 - p.total_npcu
        WHEN p.partner_tier = 'Premier Plus' AND p.total_npcu < 30 THEN 30 - p.total_npcu
        ELSE 0
      END as npcu_deficit
    FROM partners p
    WHERE p.is_active = TRUE
      ${whereClause}
    HAVING npcu_deficit > 0
    ORDER BY npcu_deficit DESC
    LIMIT 25
  `, params);

  return {
    tierRequirements,
    tierStats,
    closeToUpgrade,
    atRiskPartners
  };
}

/**
 * Account Owner Performance Dashboard
 * Detailed metrics for each account owner's portfolio
 */
async function getOwnerPerformanceDashboard(filters = {}) {
  const owners = await query(`
    SELECT 
      p.account_owner,
      COUNT(*) as partner_count,
      -- Tier breakdown
      SUM(CASE WHEN p.partner_tier = 'Premier Plus' THEN 1 ELSE 0 END) as premier_plus,
      SUM(CASE WHEN p.partner_tier = 'Premier' THEN 1 ELSE 0 END) as premier,
      SUM(CASE WHEN p.partner_tier = 'Certified' THEN 1 ELSE 0 END) as certified,
      SUM(CASE WHEN p.partner_tier = 'Registered' THEN 1 ELSE 0 END) as registered,
      -- NPCU metrics
      SUM(p.total_npcu) as total_npcu,
      AVG(p.total_npcu) as avg_npcu_per_partner,
      -- Certification metrics
      SUM(p.cert_count_nintex_ce) as total_ce_certs,
      SUM(p.cert_count_nintex_k2) as total_k2_certs,
      SUM(p.cert_count_nintex_salesforce) as total_sf_certs,
      SUM(p.cert_count_go_to_market) as total_gtm_certs,
      -- Contact/User metrics
      (SELECT COUNT(*) FROM contacts c WHERE c.partner_id IN (SELECT id FROM partners WHERE account_owner = p.account_owner AND is_active = TRUE) AND c.is_active = TRUE) as total_contacts,
      (SELECT COUNT(*) FROM contacts c WHERE c.partner_id IN (SELECT id FROM partners WHERE account_owner = p.account_owner AND is_active = TRUE) AND c.is_active = TRUE AND c.lms_user_id IS NOT NULL) as contacts_in_lms
    FROM partners p
    WHERE p.is_active = TRUE
      AND p.account_owner IS NOT NULL
    GROUP BY p.account_owner
    ORDER BY total_npcu DESC
  `);

  return owners.map(o => ({
    ...o,
    lms_adoption_rate: o.total_contacts > 0 ? ((o.contacts_in_lms / o.total_contacts) * 100).toFixed(1) : 0,
    avg_npcu_per_partner: parseFloat(o.avg_npcu_per_partner || 0).toFixed(1)
  }));
}

/**
 * Course Effectiveness Analysis
 * Analyzes course completion rates, time to complete, and user engagement
 */
async function getCourseEffectivenessAnalysis(limit = 30) {
  const courses = await query(`
    SELECT 
      c.id,
      c.name,
      c.npcu_value,
      c.duration_minutes,
      -- Enrollment metrics
      COUNT(e.id) as total_enrollments,
      COUNT(CASE WHEN e.status = 'completed' THEN 1 END) as completions,
      COUNT(CASE WHEN e.status = 'in_progress' THEN 1 END) as in_progress,
      COUNT(DISTINCT e.user_id) as unique_users,
      -- Completion rate
      ROUND(COUNT(CASE WHEN e.status = 'completed' THEN 1 END) * 100.0 / NULLIF(COUNT(e.id), 0), 1) as completion_rate,
      -- Time metrics
      AVG(CASE WHEN e.status = 'completed' AND e.started_at IS NOT NULL 
          THEN TIMESTAMPDIFF(HOUR, e.started_at, e.completed_at) END) as avg_hours_to_complete,
      -- Score metrics
      AVG(CASE WHEN e.status = 'completed' THEN e.score END) as avg_score,
      MIN(CASE WHEN e.status = 'completed' THEN e.score END) as min_score,
      MAX(CASE WHEN e.status = 'completed' THEN e.score END) as max_score,
      -- Recent activity
      COUNT(CASE WHEN e.enrolled_at > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as enrollments_last_30d,
      COUNT(CASE WHEN e.completed_at > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as completions_last_30d
    FROM lms_courses c
    LEFT JOIN lms_enrollments e ON e.course_id = c.id
    GROUP BY c.id, c.name, c.npcu_value, c.duration_minutes
    HAVING total_enrollments >= 5
    ORDER BY total_enrollments DESC
    LIMIT ?
  `, [limit]);

  // Identify courses with low completion rates
  const lowCompletionCourses = courses.filter(c => c.completion_rate < 50 && c.in_progress > 10);
  
  // Identify popular certification courses
  const popularCertifications = courses.filter(c => c.npcu_value > 0).sort((a, b) => b.completions - a.completions);

  return {
    courses,
    lowCompletionCourses,
    popularCertifications: popularCertifications.slice(0, 10),
    summary: {
      totalCourses: courses.length,
      avgCompletionRate: (courses.reduce((sum, c) => sum + (c.completion_rate || 0), 0) / courses.length).toFixed(1),
      totalEnrollments: courses.reduce((sum, c) => sum + c.total_enrollments, 0),
      totalCompletions: courses.reduce((sum, c) => sum + c.completions, 0)
    }
  };
}

/**
 * Regional Performance Comparison
 * Compare metrics across different regions
 */
async function getRegionalComparison(filters = {}) {
  const results = await query(`
    SELECT 
      COALESCE(p.account_region, 'Unknown') as region,
      COUNT(DISTINCT p.id) as partner_count,
      -- Tier breakdown
      SUM(CASE WHEN p.partner_tier IN ('Premier', 'Premier Plus') THEN 1 ELSE 0 END) as top_tier_partners,
      -- NPCU metrics
      SUM(p.total_npcu) as total_npcu,
      AVG(p.total_npcu) as avg_npcu_per_partner,
      -- Contact metrics
      COUNT(DISTINCT c.id) as total_contacts,
      COUNT(DISTINCT CASE WHEN c.lms_user_id IS NOT NULL THEN c.id END) as contacts_in_lms,
      -- Group metrics
      COUNT(DISTINCT g.id) as partner_groups,
      COUNT(DISTINCT gm.user_id) as total_group_members
    FROM partners p
    LEFT JOIN contacts c ON c.partner_id = p.id AND c.is_active = TRUE
    LEFT JOIN lms_groups g ON g.partner_id = p.id
    LEFT JOIN lms_group_members gm ON gm.group_id = g.id
    WHERE p.is_active = TRUE
    GROUP BY p.account_region
    HAVING partner_count >= 3
    ORDER BY total_npcu DESC
  `);

  return results.map(r => ({
    ...r,
    avg_npcu_per_partner: parseFloat(r.avg_npcu_per_partner || 0).toFixed(1),
    lms_adoption_rate: r.total_contacts > 0 ? ((r.contacts_in_lms / r.total_contacts) * 100).toFixed(1) : 0,
    top_tier_percentage: r.partner_count > 0 ? ((r.top_tier_partners / r.partner_count) * 100).toFixed(1) : 0
  }));
}

/**
 * User Activity Segments
 * Segment users by their activity level
 */
async function getUserActivitySegments(filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters);
  
  const partnerUserSubquery = `
    SELECT DISTINCT user_id, partner_id FROM (
      SELECT ct.lms_user_id as user_id, ct.partner_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      SELECT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) x
  `;

  const segments = await query(`
    SELECT 
      CASE 
        WHEN last_activity IS NULL THEN 'Never Active'
        WHEN last_activity > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 'Active (7d)'
        WHEN last_activity > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 'Recent (30d)'
        WHEN last_activity > DATE_SUB(NOW(), INTERVAL 90 DAY) THEN 'Moderate (90d)'
        WHEN last_activity > DATE_SUB(NOW(), INTERVAL 180 DAY) THEN 'Lapsed (180d)'
        ELSE 'Dormant (180d+)'
      END as segment,
      COUNT(*) as user_count,
      SUM(total_completions) as total_completions,
      SUM(certifications) as total_certifications,
      AVG(total_completions) as avg_completions
    FROM (
      SELECT 
        u.id,
        MAX(e.completed_at) as last_activity,
        COUNT(CASE WHEN e.status = 'completed' THEN 1 END) as total_completions,
        COUNT(CASE WHEN e.status = 'completed' AND c.npcu_value > 0 THEN 1 END) as certifications
      FROM lms_users u
      INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = u.id
      INNER JOIN partners p ON p.id = pu.partner_id
      LEFT JOIN lms_enrollments e ON e.user_id = u.id
      LEFT JOIN lms_courses c ON c.id = e.course_id
      WHERE 1=1 ${whereClause}
      GROUP BY u.id
    ) user_activity
    GROUP BY segment
    ORDER BY FIELD(segment, 'Active (7d)', 'Recent (30d)', 'Moderate (90d)', 'Lapsed (180d)', 'Dormant (180d+)', 'Never Active')
  `, params);

  const total = segments.reduce((sum, s) => sum + s.user_count, 0);
  
  return segments.map(s => ({
    ...s,
    percentage: total > 0 ? ((s.user_count / total) * 100).toFixed(1) : 0,
    avg_completions: parseFloat(s.avg_completions || 0).toFixed(1)
  }));
}

/**
 * Certification Velocity Report
 * Shows the speed at which certifications are being earned
 */
async function getCertificationVelocity(months = 12, filters = {}) {
  const { whereClause, params } = buildFilterClauses(filters);
  
  const partnerUserSubquery = `
    SELECT DISTINCT user_id, partner_id FROM (
      SELECT ct.lms_user_id as user_id, ct.partner_id
      FROM contacts ct
      WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
      UNION
      SELECT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    ) x
  `;

  const monthly = await query(`
    SELECT 
      DATE_FORMAT(e.completed_at, '%Y-%m') as month,
      COUNT(*) as certifications,
      SUM(c.npcu_value) as npcu_earned,
      COUNT(DISTINCT e.user_id) as unique_certifiers,
      COUNT(DISTINCT pu.partner_id) as unique_partners
    FROM lms_enrollments e
    INNER JOIN lms_courses c ON c.id = e.course_id AND c.npcu_value > 0
    INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
    INNER JOIN partners p ON p.id = pu.partner_id
    WHERE e.status = 'completed'
      AND e.completed_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      ${whereClause}
    GROUP BY DATE_FORMAT(e.completed_at, '%Y-%m')
    ORDER BY month ASC
  `, [months, ...params]);

  // Calculate velocity metrics
  let runningTotal = 0;
  return monthly.map((m, i) => {
    runningTotal += m.npcu_earned;
    const prev = i > 0 ? monthly[i - 1] : null;
    
    return {
      ...m,
      running_npcu: runningTotal,
      npcu_per_partner: m.unique_partners > 0 ? (m.npcu_earned / m.unique_partners).toFixed(1) : 0,
      certs_per_user: m.unique_certifiers > 0 ? (m.certifications / m.unique_certifiers).toFixed(1) : 0,
      mom_growth: prev ? ((m.certifications - prev.certifications) / prev.certifications * 100).toFixed(1) : null
    };
  });
}

module.exports = {
  getUserRegistrationTrends,
  getEnrollmentTrends,
  getCertificationTrends,
  getCoursePopularityTrends,
  getPartnerGrowthTrends,
  getComplianceTrends,
  getRegionalTrends,
  getKpiSummary,
  getActivityHeatmap,
  getWeeklySummary,
  getYtdComparison,
  getFullTrendReport,
  getOwnerTrends,
  // Deep Analytics
  getPartnerEngagementScores,
  getCohortAnalysis,
  getLearningPathAnalysis,
  getTierProgressionInsights,
  getOwnerPerformanceDashboard,
  getCourseEffectivenessAnalysis,
  getRegionalComparison,
  getUserActivitySegments,
  getCertificationVelocity
};
