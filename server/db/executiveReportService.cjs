/**
 * Executive Report Service
 * Generates global certification rollup reports for executive stakeholders
 */

const { query } = require('./connection.cjs');
const { sendEmail } = require('./notificationService.cjs');

// Tier minimum requirements for compliance calculation
const TIER_REQUIREMENTS = {
  Premier: 24,
  Select: 12,
  Registered: 1,
  Certified: 1,
  Aggregator: 0
};

/**
 * Get executive summary KPIs with period comparisons
 * Optimized: Consolidated from 6 queries to 2 queries
 */
async function getExecutiveSummary() {
  const currentYear = new Date().getFullYear();

  // Query 1: Partner totals and compliance (simple aggregation)
  const [partnerStats] = await query(`
    SELECT
      SUM(p.total_npcu) as total_npcu,
      SUM(COALESCE(p.cert_count_nintex_ce, 0) + COALESCE(p.cert_count_nintex_k2, 0) +
          COALESCE(p.cert_count_nintex_salesforce, 0) + COALESCE(p.cert_count_go_to_market, 0)) as total_certs,
      COUNT(DISTINCT p.id) as total_partners,
      SUM(CASE
        WHEN partner_tier = 'Premier' AND total_npcu >= 24 THEN 1
        WHEN partner_tier = 'Select' AND total_npcu >= 12 THEN 1
        WHEN partner_tier IN ('Registered', 'Certified') AND total_npcu >= 1 THEN 1
        WHEN partner_tier = 'Aggregator' THEN 1
        ELSE 0
      END) as compliant_count,
      SUM(CASE WHEN partner_tier IS NOT NULL THEN 1 ELSE 0 END) as tiered_count
    FROM partners p
    WHERE p.is_active = TRUE
  `);

  // Query 2: All enrollment-based metrics in a single scan
  const [enrollmentStats] = await query(`
    SELECT
      COUNT(DISTINCT CASE WHEN e.expires_at IS NULL OR e.expires_at > NOW() THEN e.user_id END) as certified_users,
      COUNT(CASE WHEN e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as certs_this_week,
      COUNT(CASE WHEN e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
                 AND e.completed_at < DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as certs_last_week,
      SUM(CASE WHEN e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN c.npcu_value ELSE 0 END) as npcu_this_week,
      SUM(CASE WHEN e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
               AND e.completed_at < DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN c.npcu_value ELSE 0 END) as npcu_last_week,
      COUNT(CASE WHEN e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH) THEN 1 END) as certs_this_month,
      COUNT(CASE WHEN e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 2 MONTH)
                 AND e.completed_at < DATE_SUB(CURDATE(), INTERVAL 1 MONTH) THEN 1 END) as certs_last_month,
      COUNT(CASE WHEN YEAR(e.completed_at) = ? THEN 1 END) as certs_ytd,
      COUNT(CASE WHEN YEAR(e.completed_at) = ? - 1
                 AND DAYOFYEAR(e.completed_at) <= DAYOFYEAR(CURDATE()) THEN 1 END) as certs_ytd_last_year
    FROM lms_enrollments e
    JOIN lms_courses c ON c.id = e.course_id
    WHERE e.status = 'completed' AND c.npcu_value > 0
  `, [currentYear, currentYear]);

  const complianceRate = partnerStats.tiered_count > 0
    ? Math.round((partnerStats.compliant_count / partnerStats.tiered_count) * 100)
    : 0;

  return {
    total_npcu: partnerStats.total_npcu || 0,
    total_certs: partnerStats.total_certs || 0,
    total_partners: partnerStats.total_partners || 0,
    certified_users: enrollmentStats.certified_users || 0,
    compliance_rate: complianceRate,
    certs_this_week: enrollmentStats.certs_this_week || 0,
    certs_last_week: enrollmentStats.certs_last_week || 0,
    npcu_this_week: enrollmentStats.npcu_this_week || 0,
    npcu_last_week: enrollmentStats.npcu_last_week || 0,
    certs_this_month: enrollmentStats.certs_this_month || 0,
    certs_last_month: enrollmentStats.certs_last_month || 0,
    certs_ytd: enrollmentStats.certs_ytd || 0,
    certs_ytd_last_year: enrollmentStats.certs_ytd_last_year || 0,
    week_growth: calcGrowth(enrollmentStats.certs_this_week, enrollmentStats.certs_last_week),
    month_growth: calcGrowth(enrollmentStats.certs_this_month, enrollmentStats.certs_last_month),
    ytd_growth: calcGrowth(enrollmentStats.certs_ytd, enrollmentStats.certs_ytd_last_year)
  };
}

/**
 * Get regional breakdown with growth metrics
 */
async function getRegionalBreakdown() {
  const regions = await query(`
    SELECT
      COALESCE(p.account_region, 'Unknown') as region,
      COUNT(DISTINCT p.id) as partner_count,
      SUM(p.total_npcu) as total_npcu,
      SUM(COALESCE(p.cert_count_nintex_ce, 0) + COALESCE(p.cert_count_nintex_k2, 0) +
          COALESCE(p.cert_count_nintex_salesforce, 0) + COALESCE(p.cert_count_go_to_market, 0)) as total_certs,
      SUM(CASE
        WHEN partner_tier = 'Premier' AND total_npcu >= 24 THEN 1
        WHEN partner_tier = 'Select' AND total_npcu >= 12 THEN 1
        WHEN partner_tier IN ('Registered', 'Certified') AND total_npcu >= 1 THEN 1
        WHEN partner_tier = 'Aggregator' THEN 1
        ELSE 0
      END) as compliant_count
    FROM partners p
    WHERE p.is_active = TRUE
    GROUP BY COALESCE(p.account_region, 'Unknown')
    ORDER BY total_npcu DESC
  `);

  // Get weekly cert counts by region
  const weeklyCerts = await query(`
    SELECT
      COALESCE(p.account_region, 'Unknown') as region,
      COUNT(CASE WHEN e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as certs_this_week,
      COUNT(CASE WHEN e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
                 AND e.completed_at < DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as certs_last_week
    FROM lms_enrollments e
    JOIN lms_courses c ON c.id = e.course_id
    JOIN lms_group_members gm ON gm.user_id = e.user_id
    JOIN lms_groups g ON g.id = gm.group_id
    JOIN partners p ON p.id = g.partner_id
    WHERE e.status = 'completed' AND c.npcu_value > 0
    GROUP BY COALESCE(p.account_region, 'Unknown')
  `);

  const weeklyMap = new Map(weeklyCerts.map(r => [r.region, r]));

  return regions.map(r => {
    const weekly = weeklyMap.get(r.region) || { certs_this_week: 0, certs_last_week: 0 };
    return {
      ...r,
      compliance_rate: r.partner_count > 0 ? Math.round((r.compliant_count / r.partner_count) * 100) : 0,
      certs_this_week: weekly.certs_this_week || 0,
      certs_last_week: weekly.certs_last_week || 0,
      week_growth: calcGrowth(weekly.certs_this_week, weekly.certs_last_week)
    };
  });
}

/**
 * Get PAM/Account Owner performance metrics
 */
async function getPamPerformance() {
  const pams = await query(`
    SELECT
      pm.owner_name,
      pm.region,
      COUNT(DISTINCT p.id) as partner_count,
      SUM(p.total_npcu) as total_npcu,
      SUM(COALESCE(p.cert_count_nintex_ce, 0) + COALESCE(p.cert_count_nintex_k2, 0) +
          COALESCE(p.cert_count_nintex_salesforce, 0) + COALESCE(p.cert_count_go_to_market, 0)) as total_certs
    FROM partner_managers pm
    LEFT JOIN partners p ON p.account_owner = pm.owner_name AND p.is_active = TRUE
    WHERE pm.is_active_pam = TRUE
    GROUP BY pm.id, pm.owner_name, pm.region
    HAVING partner_count > 0
    ORDER BY total_npcu DESC
    LIMIT 20
  `);

  // Get weekly certs per PAM
  const weeklyCerts = await query(`
    SELECT
      p.account_owner,
      COUNT(CASE WHEN e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as certs_this_week,
      COUNT(CASE WHEN e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
                 AND e.completed_at < DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as certs_last_week
    FROM lms_enrollments e
    JOIN lms_courses c ON c.id = e.course_id
    JOIN lms_group_members gm ON gm.user_id = e.user_id
    JOIN lms_groups g ON g.id = gm.group_id
    JOIN partners p ON p.id = g.partner_id
    WHERE e.status = 'completed' AND c.npcu_value > 0 AND p.account_owner IS NOT NULL
    GROUP BY p.account_owner
  `);

  const weeklyMap = new Map(weeklyCerts.map(r => [r.account_owner, r]));

  return pams.map(pam => {
    const weekly = weeklyMap.get(pam.owner_name) || { certs_this_week: 0, certs_last_week: 0 };
    return {
      ...pam,
      certs_this_week: weekly.certs_this_week || 0,
      week_growth: calcGrowth(weekly.certs_this_week, weekly.certs_last_week)
    };
  });
}

/**
 * Get certification category breakdown
 */
async function getCategoryBreakdown() {
  const [categories] = await query(`
    SELECT
      SUM(COALESCE(cert_count_nintex_ce, 0)) as nintex_ce,
      SUM(COALESCE(cert_count_nintex_k2, 0)) as nintex_k2,
      SUM(COALESCE(cert_count_nintex_salesforce, 0)) as nintex_salesforce,
      SUM(COALESCE(cert_count_go_to_market, 0)) as go_to_market,
      SUM(CASE WHEN has_gtm_certification = TRUE THEN 1 ELSE 0 END) as partners_with_gtm
    FROM partners
    WHERE is_active = TRUE
  `);

  // Weekly breakdown by category
  const weeklyByCategory = await query(`
    SELECT
      c.certification_category,
      COUNT(CASE WHEN e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as this_week,
      COUNT(CASE WHEN e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
                 AND e.completed_at < DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as last_week
    FROM lms_enrollments e
    JOIN lms_courses c ON c.id = e.course_id
    WHERE e.status = 'completed' AND c.npcu_value > 0 AND c.certification_category IS NOT NULL
    GROUP BY c.certification_category
  `);

  const weeklyMap = new Map(weeklyByCategory.map(r => [r.certification_category, r]));

  return {
    nintex_ce: categories.nintex_ce || 0,
    nintex_k2: categories.nintex_k2 || 0,
    nintex_salesforce: categories.nintex_salesforce || 0,
    go_to_market: categories.go_to_market || 0,
    partners_with_gtm: categories.partners_with_gtm || 0,
    weekly: {
      nintex_ce: weeklyMap.get('nintex_ce')?.this_week || 0,
      nintex_k2: weeklyMap.get('nintex_k2')?.this_week || 0,
      nintex_salesforce: weeklyMap.get('nintex_salesforce')?.this_week || 0,
      go_to_market: weeklyMap.get('go_to_market')?.this_week || 0
    }
  };
}

/**
 * Get health metrics (expiring certs, non-compliant partners)
 */
async function getHealthMetrics() {
  // Expiring certifications
  const [expiring] = await query(`
    SELECT
      COUNT(CASE WHEN e.expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY) THEN 1 END) as expiring_30_days,
      COUNT(CASE WHEN e.expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 90 DAY) THEN 1 END) as expiring_90_days
    FROM lms_enrollments e
    JOIN lms_courses c ON c.id = e.course_id
    WHERE e.status = 'completed' AND c.npcu_value > 0 AND e.expires_at IS NOT NULL
  `);

  // Non-compliant partners by tier
  const nonCompliant = await query(`
    SELECT
      partner_tier,
      COUNT(*) as count
    FROM partners
    WHERE is_active = TRUE
      AND partner_tier IS NOT NULL
      AND (
        (partner_tier = 'Premier' AND total_npcu < 24) OR
        (partner_tier = 'Select' AND total_npcu < 12) OR
        (partner_tier IN ('Registered', 'Certified') AND total_npcu < 1)
      )
    GROUP BY partner_tier
    ORDER BY
      CASE partner_tier
        WHEN 'Premier' THEN 1
        WHEN 'Select' THEN 2
        WHEN 'Certified' THEN 3
        WHEN 'Registered' THEN 4
        ELSE 5
      END
  `);

  // Inactive partners (no certs in 90 days)
  const [inactive] = await query(`
    SELECT COUNT(DISTINCT p.id) as inactive_count
    FROM partners p
    LEFT JOIN (
      SELECT DISTINCT g.partner_id
      FROM lms_groups g
      JOIN lms_group_members gm ON gm.group_id = g.id
      JOIN lms_enrollments e ON e.user_id = gm.user_id
      JOIN lms_courses c ON c.id = e.course_id
      WHERE e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        AND e.status = 'completed' AND c.npcu_value > 0
    ) active_partners ON active_partners.partner_id = p.id
    WHERE p.is_active = TRUE AND active_partners.partner_id IS NULL
  `);

  return {
    expiring_30_days: expiring.expiring_30_days || 0,
    expiring_90_days: expiring.expiring_90_days || 0,
    non_compliant_by_tier: nonCompliant,
    total_non_compliant: nonCompliant.reduce((sum, t) => sum + t.count, 0),
    inactive_partners: inactive.inactive_count || 0
  };
}

/**
 * Get top performing partners
 */
async function getTopPerformers() {
  // Top by NPCU
  const topByNpcu = await query(`
    SELECT
      p.account_name,
      p.partner_tier,
      p.account_region,
      p.total_npcu,
      (COALESCE(p.cert_count_nintex_ce, 0) + COALESCE(p.cert_count_nintex_k2, 0) +
       COALESCE(p.cert_count_nintex_salesforce, 0) + COALESCE(p.cert_count_go_to_market, 0)) as total_certs
    FROM partners p
    WHERE p.is_active = TRUE
    ORDER BY p.total_npcu DESC
    LIMIT 10
  `);

  // Fastest growing (most certs this week)
  const fastestGrowing = await query(`
    SELECT
      p.account_name,
      p.partner_tier,
      p.account_region,
      COUNT(*) as certs_this_week
    FROM lms_enrollments e
    JOIN lms_courses c ON c.id = e.course_id
    JOIN lms_group_members gm ON gm.user_id = e.user_id
    JOIN lms_groups g ON g.id = gm.group_id
    JOIN partners p ON p.id = g.partner_id
    WHERE e.status = 'completed'
      AND c.npcu_value > 0
      AND e.completed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      AND p.is_active = TRUE
    GROUP BY p.id, p.account_name, p.partner_tier, p.account_region
    ORDER BY certs_this_week DESC
    LIMIT 10
  `);

  return {
    top_by_npcu: topByNpcu,
    fastest_growing: fastestGrowing
  };
}

/**
 * Calculate growth percentage
 */
function calcGrowth(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Format growth for display
 */
function formatGrowth(value) {
  if (value > 0) return `+${value}%`;
  if (value < 0) return `${value}%`;
  return '0%';
}

/**
 * Build complete executive report data
 */
async function buildExecutiveReport() {
  const [summary, regions, pams, categories, health, performers] = await Promise.all([
    getExecutiveSummary(),
    getRegionalBreakdown(),
    getPamPerformance(),
    getCategoryBreakdown(),
    getHealthMetrics(),
    getTopPerformers()
  ]);

  return {
    generated_at: new Date().toISOString(),
    summary,
    regions,
    pams,
    categories,
    health,
    performers
  };
}

/**
 * Generate HTML email for executive report
 */
async function generateExecutiveReportHtml(data) {
  const reportDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Calculate week range
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 7);
  const weekRange = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const { summary, regions, pams, categories, health, performers } = data;

  // Health status badge
  const healthStatus = health.total_non_compliant > 50 ? 'warning' :
                       health.expiring_30_days > 100 ? 'warning' : 'good';
  const healthBadge = healthStatus === 'good'
    ? '<span style="background: #28a745; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px;">HEALTHY</span>'
    : '<span style="background: #ffc107; color: #212529; padding: 4px 12px; border-radius: 12px; font-size: 12px;">ATTENTION NEEDED</span>';

  // KPI cards
  const kpiCards = `
    <div style="display: flex; flex-wrap: wrap; gap: 15px; margin: 20px 0;">
      <div style="background: linear-gradient(135deg, #FF6B35, #E55A2B); color: white; padding: 20px; border-radius: 8px; flex: 1; min-width: 140px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700;">${summary.total_npcu.toLocaleString()}</div>
        <div style="font-size: 12px; opacity: 0.9;">Total Active NPCU</div>
        <div style="font-size: 11px; margin-top: 4px; opacity: 0.8;">${formatGrowth(summary.week_growth)} WoW</div>
      </div>
      <div style="background: #6B4C9A; color: white; padding: 20px; border-radius: 8px; flex: 1; min-width: 140px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700;">${summary.total_certs.toLocaleString()}</div>
        <div style="font-size: 12px; opacity: 0.9;">Active Certifications</div>
        <div style="font-size: 11px; margin-top: 4px; opacity: 0.8;">${summary.certs_this_week} this week</div>
      </div>
      <div style="background: #00A1E0; color: white; padding: 20px; border-radius: 8px; flex: 1; min-width: 140px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700;">${summary.certified_users.toLocaleString()}</div>
        <div style="font-size: 12px; opacity: 0.9;">Certified Users</div>
      </div>
      <div style="background: ${summary.compliance_rate >= 75 ? '#28a745' : '#ffc107'}; color: ${summary.compliance_rate >= 75 ? 'white' : '#212529'}; padding: 20px; border-radius: 8px; flex: 1; min-width: 140px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700;">${summary.compliance_rate}%</div>
        <div style="font-size: 12px; opacity: 0.9;">Compliance Rate</div>
      </div>
      <div style="background: #17a2b8; color: white; padding: 20px; border-radius: 8px; flex: 1; min-width: 140px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700;">${summary.certs_ytd.toLocaleString()}</div>
        <div style="font-size: 12px; opacity: 0.9;">YTD Certifications</div>
        <div style="font-size: 11px; margin-top: 4px; opacity: 0.8;">${formatGrowth(summary.ytd_growth)} vs last year</div>
      </div>
    </div>
  `;

  // Regional performance table
  const regionRows = regions.map(r => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: 500;">${r.region}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${r.partner_count}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center; font-weight: 600; color: #FF6B35;">${r.total_npcu?.toLocaleString() || 0}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${r.certs_this_week}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center; color: ${r.week_growth >= 0 ? '#28a745' : '#dc3545'};">${formatGrowth(r.week_growth)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${r.compliance_rate}%</td>
    </tr>
  `).join('');

  const regionTable = `
    <h2 style="color: #6B4C9A; border-bottom: 2px solid #FF6B35; padding-bottom: 10px; margin-top: 30px;">Regional Performance</h2>
    <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
      <thead>
        <tr style="background: #f5f5f5;">
          <th style="padding: 12px 10px; text-align: left; border-bottom: 2px solid #ddd;">Region</th>
          <th style="padding: 12px 10px; text-align: center; border-bottom: 2px solid #ddd;">Partners</th>
          <th style="padding: 12px 10px; text-align: center; border-bottom: 2px solid #ddd;">NPCU</th>
          <th style="padding: 12px 10px; text-align: center; border-bottom: 2px solid #ddd;">This Week</th>
          <th style="padding: 12px 10px; text-align: center; border-bottom: 2px solid #ddd;">Growth</th>
          <th style="padding: 12px 10px; text-align: center; border-bottom: 2px solid #ddd;">Compliance</th>
        </tr>
      </thead>
      <tbody>${regionRows}</tbody>
    </table>
  `;

  // PAM performance table (top 10)
  const pamRows = pams.slice(0, 10).map(p => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${p.owner_name}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${p.region || '-'}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${p.partner_count}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center; font-weight: 600; color: #FF6B35;">${p.total_npcu?.toLocaleString() || 0}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${p.certs_this_week}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center; color: ${p.week_growth >= 0 ? '#28a745' : '#dc3545'};">${formatGrowth(p.week_growth)}</td>
    </tr>
  `).join('');

  const pamTable = `
    <h2 style="color: #6B4C9A; border-bottom: 2px solid #FF6B35; padding-bottom: 10px; margin-top: 30px;">Account Owner Performance (Top 10)</h2>
    <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
      <thead>
        <tr style="background: #f5f5f5;">
          <th style="padding: 12px 10px; text-align: left; border-bottom: 2px solid #ddd;">Account Owner</th>
          <th style="padding: 12px 10px; text-align: center; border-bottom: 2px solid #ddd;">Region</th>
          <th style="padding: 12px 10px; text-align: center; border-bottom: 2px solid #ddd;">Partners</th>
          <th style="padding: 12px 10px; text-align: center; border-bottom: 2px solid #ddd;">NPCU</th>
          <th style="padding: 12px 10px; text-align: center; border-bottom: 2px solid #ddd;">This Week</th>
          <th style="padding: 12px 10px; text-align: center; border-bottom: 2px solid #ddd;">Growth</th>
        </tr>
      </thead>
      <tbody>${pamRows}</tbody>
    </table>
  `;

  // Category breakdown
  const categorySection = `
    <h2 style="color: #6B4C9A; border-bottom: 2px solid #FF6B35; padding-bottom: 10px; margin-top: 30px;">Certification Categories</h2>
    <div style="display: flex; flex-wrap: wrap; gap: 15px; margin: 15px 0;">
      <div style="background: #FF6B35; color: white; padding: 15px 20px; border-radius: 8px; flex: 1; min-width: 120px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700;">${categories.nintex_ce.toLocaleString()}</div>
        <div style="font-size: 12px; opacity: 0.9;">Nintex CE</div>
        <div style="font-size: 11px; opacity: 0.8;">+${categories.weekly.nintex_ce} this week</div>
      </div>
      <div style="background: #6B4C9A; color: white; padding: 15px 20px; border-radius: 8px; flex: 1; min-width: 120px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700;">${categories.nintex_k2.toLocaleString()}</div>
        <div style="font-size: 12px; opacity: 0.9;">K2</div>
        <div style="font-size: 11px; opacity: 0.8;">+${categories.weekly.nintex_k2} this week</div>
      </div>
      <div style="background: #00A1E0; color: white; padding: 15px 20px; border-radius: 8px; flex: 1; min-width: 120px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700;">${categories.nintex_salesforce.toLocaleString()}</div>
        <div style="font-size: 12px; opacity: 0.9;">Salesforce</div>
        <div style="font-size: 11px; opacity: 0.8;">+${categories.weekly.nintex_salesforce} this week</div>
      </div>
      <div style="background: #28a745; color: white; padding: 15px 20px; border-radius: 8px; flex: 1; min-width: 120px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700;">${categories.go_to_market.toLocaleString()}</div>
        <div style="font-size: 12px; opacity: 0.9;">Go-to-Market</div>
        <div style="font-size: 11px; opacity: 0.8;">${categories.partners_with_gtm} partners</div>
      </div>
    </div>
  `;

  // Health alerts
  const healthAlerts = `
    <h2 style="color: #6B4C9A; border-bottom: 2px solid #FF6B35; padding-bottom: 10px; margin-top: 30px;">Health Alerts</h2>
    <div style="background: #fff3cd; border-radius: 8px; padding: 20px; margin: 15px 0; border-left: 4px solid #ffc107;">
      <div style="display: flex; flex-wrap: wrap; gap: 30px;">
        <div>
          <div style="font-size: 24px; font-weight: 700; color: #856404;">${health.expiring_30_days}</div>
          <div style="font-size: 12px; color: #856404;">Expiring in 30 days</div>
        </div>
        <div>
          <div style="font-size: 24px; font-weight: 700; color: #856404;">${health.expiring_90_days}</div>
          <div style="font-size: 12px; color: #856404;">Expiring in 90 days</div>
        </div>
        <div>
          <div style="font-size: 24px; font-weight: 700; color: #856404;">${health.total_non_compliant}</div>
          <div style="font-size: 12px; color: #856404;">Non-compliant partners</div>
        </div>
        <div>
          <div style="font-size: 24px; font-weight: 700; color: #856404;">${health.inactive_partners}</div>
          <div style="font-size: 12px; color: #856404;">Inactive (90+ days)</div>
        </div>
      </div>
    </div>
  `;

  // Top performers
  const topPerformersSection = `
    <h2 style="color: #6B4C9A; border-bottom: 2px solid #FF6B35; padding-bottom: 10px; margin-top: 30px;">Top Performers</h2>
    <div style="display: flex; flex-wrap: wrap; gap: 20px;">
      <div style="flex: 1; min-width: 280px;">
        <h3 style="color: #333; font-size: 14px; margin-bottom: 10px;">Top 5 by NPCU</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          ${performers.top_by_npcu.slice(0, 5).map((p, i) => `
            <tr>
              <td style="padding: 6px 0; border-bottom: 1px solid #eee;">${i + 1}. ${p.account_name}</td>
              <td style="padding: 6px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600; color: #FF6B35;">${p.total_npcu}</td>
            </tr>
          `).join('')}
        </table>
      </div>
      <div style="flex: 1; min-width: 280px;">
        <h3 style="color: #333; font-size: 14px; margin-bottom: 10px;">Fastest Growing This Week</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          ${performers.fastest_growing.slice(0, 5).map((p, i) => `
            <tr>
              <td style="padding: 6px 0; border-bottom: 1px solid #eee;">${i + 1}. ${p.account_name}</td>
              <td style="padding: 6px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600; color: #28a745;">+${p.certs_this_week} certs</td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `;

  // Full email HTML
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; background: #fff;">
      <div style="background: linear-gradient(135deg, #6B4C9A, #FF6B35); padding: 30px; color: white; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">Partner Certification Executive Summary</h1>
        <p style="margin: 10px 0 0; opacity: 0.9; font-size: 14px;">${weekRange}</p>
        <div style="margin-top: 15px;">${healthBadge}</div>
      </div>
      <div style="padding: 30px; border: 1px solid #ddd; border-top: none;">
        ${kpiCards}
        ${regionTable}
        ${pamTable}
        ${categorySection}
        ${healthAlerts}
        ${topPerformersSection}
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
          <p>This report was generated automatically by the Nintex Partner Portal on ${reportDate}.</p>
          <p>For detailed analytics, visit the Partner Portal dashboard.</p>
        </div>
      </div>
    </div>
  `;

  return {
    subject: `Partner Certification Executive Summary - ${weekRange}`,
    html
  };
}

/**
 * Get executive report recipients
 */
async function getRecipients() {
  return await query(`
    SELECT id, email, name, is_active, created_at
    FROM executive_report_recipients
    WHERE is_active = TRUE
    ORDER BY name, email
  `);
}

/**
 * Add a recipient
 */
async function addRecipient(email, name) {
  const result = await query(`
    INSERT INTO executive_report_recipients (email, name)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = TRUE
  `, [email.toLowerCase(), name || null]);
  return result;
}

/**
 * Remove a recipient
 */
async function removeRecipient(id) {
  const result = await query(`
    UPDATE executive_report_recipients SET is_active = FALSE WHERE id = ?
  `, [id]);
  return result.affectedRows > 0;
}

/**
 * Send executive report to all recipients
 */
async function sendExecutiveReport() {
  const recipients = await getRecipients();

  if (recipients.length === 0) {
    console.log('No executive report recipients configured');
    return { sent: 0, failed: 0, errors: [] };
  }

  const reportData = await buildExecutiveReport();
  const { subject, html } = await generateExecutiveReportHtml(reportData);

  const results = { sent: 0, failed: 0, errors: [] };

  for (const recipient of recipients) {
    try {
      await sendEmail(recipient.email, subject, html);

      // Log success
      await query(`
        INSERT INTO email_log (recipient_email, recipient_name, subject, email_type, status, sent_at)
        VALUES (?, ?, ?, 'executive_report', 'sent', NOW())
      `, [recipient.email, recipient.name, subject]);

      results.sent++;
      console.log(`✅ Executive report sent to ${recipient.email}`);
    } catch (err) {
      results.failed++;
      results.errors.push({ email: recipient.email, error: err.message });

      // Log failure
      await query(`
        INSERT INTO email_log (recipient_email, recipient_name, subject, email_type, status, error_message, sent_at)
        VALUES (?, ?, ?, 'executive_report', 'failed', ?, NOW())
      `, [recipient.email, recipient.name, subject, err.message]).catch(() => {});

      console.error(`❌ Failed to send executive report to ${recipient.email}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Send test executive report to a specific email
 */
async function sendTestExecutiveReport(email) {
  const reportData = await buildExecutiveReport();
  const { subject, html } = await generateExecutiveReportHtml(reportData);

  const testSubject = `[TEST] ${subject}`;
  const testHtml = `
    <div style="background: #fff3cd; padding: 10px 20px; border-radius: 4px; margin-bottom: 20px; border: 1px solid #856404;">
      <strong>TEST EMAIL</strong> - This is a test of the Executive Weekly Report sent to ${email}
    </div>
    ${html}
  `;

  await sendEmail(email, testSubject, testHtml);

  // Log test email
  await query(`
    INSERT INTO email_log (recipient_email, recipient_name, subject, email_type, status, sent_at)
    VALUES (?, ?, ?, 'executive_report_test', 'sent', NOW())
  `, [email, 'Test Recipient', testSubject]);

  return { success: true, message: `Test executive report sent to ${email}` };
}

module.exports = {
  getExecutiveSummary,
  getRegionalBreakdown,
  getPamPerformance,
  getCategoryBreakdown,
  getHealthMetrics,
  getTopPerformers,
  buildExecutiveReport,
  generateExecutiveReportHtml,
  getRecipients,
  addRecipient,
  removeRecipient,
  sendExecutiveReport,
  sendTestExecutiveReport
};
