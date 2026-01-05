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
  getOwnerTrends
};
