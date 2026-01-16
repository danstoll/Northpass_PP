/**
 * Lead Analytics Routes
 * 
 * Provides endpoints for lead reporting and analytics
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db/connection.cjs');
const { syncLeads, getLeadStats, updatePartnerLeadCounts } = require('../db/impartnerSyncService.cjs');

// ============================================
// Server-side cache for dashboard data
// ============================================
const dashboardCache = {
  data: null,
  timestamp: null,
  TTL: 5 * 60 * 1000, // 5 minutes
  
  isValid() {
    return this.data && this.timestamp && (Date.now() - this.timestamp < this.TTL);
  },
  
  set(data) {
    this.data = data;
    this.timestamp = Date.now();
  },
  
  get() {
    return this.data;
  },
  
  invalidate() {
    this.data = null;
    this.timestamp = null;
  }
};

/**
 * POST /sync - Trigger lead sync from Impartner
 */
router.post('/sync', async (req, res) => {
  try {
    const mode = req.query.mode || 'incremental';
    console.log(`📊 Manual lead sync triggered (mode: ${mode})`);
    
    const stats = await syncLeads(mode);
    
    // Invalidate dashboard cache after sync
    dashboardCache.invalidate();
    
    res.json({ success: true, stats });
  } catch (err) {
    console.error('Lead sync error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /stats - Get overall lead statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getLeadStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('Lead stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /by-partner - Get lead counts by partner
 * Query params: limit, offset, sortBy (lead_count|leads_last_30_days|account_name), sortOrder (asc|desc)
 */
router.get('/by-partner', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const sortBy = ['lead_count', 'leads_last_30_days', 'account_name'].includes(req.query.sortBy) 
      ? req.query.sortBy : 'lead_count';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    // Get partners with lead counts
    const data = await query(`
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        p.lead_count,
        p.leads_last_30_days,
        p.leads_updated_at
      FROM partners p
      WHERE p.is_active = TRUE AND p.lead_count > 0
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    const [total] = await query('SELECT COUNT(*) as count FROM partners WHERE is_active = TRUE AND lead_count > 0');
    
    res.json({ 
      success: true, 
      data,
      pagination: {
        total: total.count,
        limit,
        offset
      }
    });
  } catch (err) {
    console.error('Leads by partner error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /by-month - Get leads generated per month
 * Query params: months (default 0 = all time), region, owner, tier
 */
router.get('/by-month', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 0; // 0 = all time
    const { region, owner, tier } = req.query;
    
    let whereClause = months > 0 ? 'WHERE l.lead_created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)' : 'WHERE 1=1';
    const params = months > 0 ? [months] : [];
    
    // Build filter conditions
    if (region) {
      whereClause += ' AND p.account_region = ?';
      params.push(region);
    }
    if (owner) {
      whereClause += ' AND p.account_owner = ?';
      params.push(owner);
    }
    if (tier) {
      whereClause += ' AND p.partner_tier = ?';
      params.push(tier);
    }
    
    const data = await query(`
      SELECT 
        DATE_FORMAT(l.lead_created_at, '%Y-%m') as month,
        COUNT(*) as lead_count,
        COUNT(DISTINCT l.partner_id) as partner_count
      FROM leads l
      LEFT JOIN partners p ON l.partner_id = p.id
      ${whereClause}
      GROUP BY month
      ORDER BY month ASC
    `, params);
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('Leads by month error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /by-region - Get leads by region
 * Query params: months (default 0 = all time)
 */
router.get('/by-region', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 0; // 0 = all time
    
    const whereClause = months > 0 ? 'WHERE l.lead_created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)' : '';
    const params = months > 0 ? [months] : [];
    
    const data = await query(`
      SELECT 
        COALESCE(p.account_region, 'Unassigned') as region,
        COUNT(*) as lead_count,
        COUNT(DISTINCT l.partner_id) as partner_count,
        SUM(CASE WHEN l.lead_created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as last_30_days
      FROM leads l
      LEFT JOIN partners p ON l.partner_id = p.id
      ${whereClause}
      GROUP BY region
      ORDER BY lead_count DESC
    `, params);
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('Leads by region error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /by-owner - Get leads by account owner
 * Query params: months (default 0 = all time), limit (default 20)
 */
router.get('/by-owner', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 0; // 0 = all time
    const limit = parseInt(req.query.limit) || 20;
    
    const whereClause = months > 0 ? 'WHERE l.lead_created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)' : '';
    const params = months > 0 ? [months, limit] : [limit];
    
    const data = await query(`
      SELECT 
        COALESCE(p.account_owner, 'Unassigned') as owner,
        COUNT(*) as lead_count,
        COUNT(DISTINCT l.partner_id) as partner_count,
        SUM(CASE WHEN l.lead_created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as last_30_days
      FROM leads l
      LEFT JOIN partners p ON l.partner_id = p.id
      ${whereClause}
      GROUP BY owner
      ORDER BY lead_count DESC
      LIMIT ?
    `, params);
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('Leads by owner error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /by-tier - Get leads by partner tier
 * Query params: months (default 0 = all time)
 */
router.get('/by-tier', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 0; // 0 = all time
    
    const whereClause = months > 0 ? 'WHERE l.lead_created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)' : '';
    const params = months > 0 ? [months] : [];
    
    const data = await query(`
      SELECT 
        COALESCE(p.partner_tier, 'Unassigned') as tier,
        COUNT(*) as lead_count,
        COUNT(DISTINCT l.partner_id) as partner_count,
        SUM(CASE WHEN l.lead_created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as last_30_days
      FROM leads l
      LEFT JOIN partners p ON l.partner_id = p.id
      ${whereClause}
      GROUP BY tier
      ORDER BY lead_count DESC
    `, params);
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('Leads by tier error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /by-source - Get leads by source
 * Query params: months (default 0 = all time), limit (default 20)
 */
router.get('/by-source', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 0; // 0 = all time
    const limit = parseInt(req.query.limit) || 20;
    
    const whereClause = months > 0 ? 'WHERE l.lead_created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)' : '';
    const params = months > 0 ? [months, limit] : [limit];
    
    const data = await query(`
      SELECT 
        COALESCE(l.source, 'Unknown') as source,
        COUNT(*) as lead_count,
        COUNT(DISTINCT l.partner_id) as partner_count,
        SUM(CASE WHEN l.lead_created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as last_30_days
      FROM leads l
      ${whereClause}
      GROUP BY source
      ORDER BY lead_count DESC
      LIMIT ?
    `, params);
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('Leads by source error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /by-status - Get leads by status
 * Query params: months (default 0 = all time)
 */
router.get('/by-status', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 0; // 0 = all time
    
    const whereClause = months > 0 ? 'WHERE l.lead_created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)' : '';
    const params = months > 0 ? [months] : [];
    
    const data = await query(`
      SELECT 
        COALESCE(l.status_name, 'Unknown') as status,
        l.status_id,
        COUNT(*) as lead_count,
        SUM(CASE WHEN l.lead_created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as last_30_days
      FROM leads l
      ${whereClause}
      GROUP BY l.status_id, l.status_name
      ORDER BY lead_count DESC
    `, params);
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('Leads by status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /trends - Get lead trends over time
 * Query params: months (default 0 = all time), groupBy (month|week|day), region, owner, tier
 */
router.get('/trends', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 0; // 0 = all time
    const groupBy = ['month', 'week', 'day'].includes(req.query.groupBy) ? req.query.groupBy : 'month';
    const { region, owner, tier } = req.query;
    
    // Determine date format based on groupBy
    const dateFormat = {
      'month': '%Y-%m',
      'week': '%Y-%u',
      'day': '%Y-%m-%d'
    }[groupBy];
    
    let whereClause = months > 0 ? 'WHERE l.lead_created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)' : 'WHERE 1=1';
    const params = months > 0 ? [months] : [];
    
    // Build filter conditions
    if (region) {
      whereClause += ' AND p.account_region = ?';
      params.push(region);
    }
    if (owner) {
      whereClause += ' AND p.account_owner = ?';
      params.push(owner);
    }
    if (tier) {
      whereClause += ' AND p.partner_tier = ?';
      params.push(tier);
    }
    
    // Get trend data
    const trends = await query(`
      SELECT 
        DATE_FORMAT(l.lead_created_at, '${dateFormat}') as period,
        COUNT(*) as lead_count,
        COUNT(DISTINCT l.partner_id) as unique_partners,
        COUNT(DISTINCT l.source) as unique_sources
      FROM leads l
      LEFT JOIN partners p ON l.partner_id = p.id
      ${whereClause}
      GROUP BY period
      ORDER BY period ASC
    `, params);
    
    // Calculate growth metrics
    let prevCount = null;
    const trendsWithGrowth = trends.map(t => {
      const growth = prevCount !== null ? ((t.lead_count - prevCount) / prevCount * 100).toFixed(1) : null;
      prevCount = t.lead_count;
      return {
        ...t,
        growth: growth ? parseFloat(growth) : null
      };
    });
    
    // Get summary stats
    const totalLeads = trends.reduce((sum, t) => sum + t.lead_count, 0);
    const avgPerPeriod = trends.length > 0 ? Math.round(totalLeads / trends.length) : 0;
    
    res.json({ 
      success: true, 
      data: {
        trends: trendsWithGrowth,
        summary: {
          totalLeads,
          avgPerPeriod,
          periods: trends.length,
          groupBy
        }
      }
    });
  } catch (err) {
    console.error('Lead trends error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /partner/:id - Get leads for a specific partner
 * Query params: limit (default 100), offset (default 0)
 */
router.get('/partner/:id', async (req, res) => {
  try {
    const partnerId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    // Get partner info
    const [partner] = await query('SELECT id, account_name, partner_tier, account_region, lead_count FROM partners WHERE id = ?', [partnerId]);
    
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }
    
    // Get leads for this partner
    const leads = await query(`
      SELECT 
        id, first_name, last_name, email, phone, title, company_name,
        status_name, source, lead_created_at, crm_id
      FROM leads
      WHERE partner_id = ?
      ORDER BY lead_created_at DESC
      LIMIT ? OFFSET ?
    `, [partnerId, limit, offset]);
    
    // Get lead stats for this partner
    const [stats] = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN lead_created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as last_30_days,
        SUM(CASE WHEN lead_created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN 1 ELSE 0 END) as last_90_days
      FROM leads
      WHERE partner_id = ?
    `, [partnerId]);
    
    res.json({
      success: true,
      data: {
        partner,
        leads,
        stats,
        pagination: { limit, offset }
      }
    });
  } catch (err) {
    console.error('Partner leads error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /dashboard - Get lead dashboard data
 * Returns combined stats for dashboard display
 * Uses server-side caching (5 min TTL) and parallel queries for performance
 */
router.get('/dashboard', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    
    // Return cached data if valid (unless force refresh)
    if (!forceRefresh && dashboardCache.isValid()) {
      console.log('📊 Lead dashboard: returning cached data');
      return res.json({
        success: true,
        cached: true,
        cacheAge: Math.round((Date.now() - dashboardCache.timestamp) / 1000),
        data: dashboardCache.get()
      });
    }
    
    console.log('📊 Lead dashboard: fetching fresh data...');
    const startTime = Date.now();
    
    // Run ALL queries in parallel for performance
    const [
      [totals],
      byMonthRaw,
      topRegions,
      topPartners,
      topSources,
      [lastSync]
    ] = await Promise.all([
      // Query 1: Overall stats
      query(`
        SELECT 
          COUNT(*) as total_leads,
          COUNT(DISTINCT partner_id) as partners_with_leads,
          SUM(CASE WHEN lead_created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as last_30_days,
          SUM(CASE WHEN lead_created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as last_7_days
        FROM leads
      `),
      
      // Query 2: Leads by month (last 12 months)
      query(`
        SELECT 
          DATE_FORMAT(lead_created_at, '%Y-%m') as month,
          DATE_FORMAT(lead_created_at, '%b %Y') as month_label,
          COUNT(*) as lead_count
        FROM leads
        GROUP BY month, month_label
        ORDER BY month DESC
        LIMIT 12
      `),
      
      // Query 3: Top 5 regions
      query(`
        SELECT 
          COALESCE(p.account_region, 'Unassigned') as region,
          COUNT(*) as lead_count
        FROM leads l
        LEFT JOIN partners p ON l.partner_id = p.id
        GROUP BY region
        ORDER BY lead_count DESC
        LIMIT 5
      `),
      
      // Query 4: Top 5 partners by leads
      query(`
        SELECT 
          p.id,
          p.account_name,
          p.partner_tier,
          p.lead_count
        FROM partners p
        WHERE p.lead_count > 0 AND p.is_active = TRUE
        ORDER BY p.lead_count DESC
        LIMIT 5
      `),
      
      // Query 5: Top 5 sources
      query(`
        SELECT 
          COALESCE(source, 'Unknown') as source,
          COUNT(*) as lead_count
        FROM leads
        GROUP BY source
        ORDER BY lead_count DESC
        LIMIT 5
      `),
      
      // Query 6: Last sync time
      query(`
        SELECT completed_at 
        FROM sync_logs 
        WHERE sync_type = 'sync_leads' AND status = 'success'
        ORDER BY completed_at DESC 
        LIMIT 1
      `)
    ]);
    
    // Reverse byMonth to show chronological order
    const byMonth = byMonthRaw.reverse();
    
    const duration = Date.now() - startTime;
    console.log(`📊 Lead dashboard: queries completed in ${duration}ms`);
    
    // Build response data
    const data = {
      totals,
      byMonth,
      topRegions,
      topPartners,
      topSources,
      lastSync: lastSync?.completed_at || null
    };
    
    // Cache the data
    dashboardCache.set(data);
    
    res.json({
      success: true,
      cached: false,
      queryTime: duration,
      data
    });
  } catch (err) {
    console.error('Lead dashboard error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /recalculate-counts - Recalculate partner lead counts
 */
router.post('/recalculate-counts', async (req, res) => {
  try {
    await updatePartnerLeadCounts();
    // Invalidate dashboard cache after recalculation
    dashboardCache.invalidate();
    res.json({ success: true, message: 'Partner lead counts recalculated' });
  } catch (err) {
    console.error('Recalculate counts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /cache-status - Get cache status for dashboard
 */
router.get('/cache-status', (req, res) => {
  res.json({
    success: true,
    cache: {
      valid: dashboardCache.isValid(),
      timestamp: dashboardCache.timestamp,
      age: dashboardCache.timestamp ? Math.round((Date.now() - dashboardCache.timestamp) / 1000) : null,
      ttl: dashboardCache.TTL / 1000
    }
  });
});

/**
 * POST /invalidate-cache - Manually invalidate dashboard cache
 */
router.post('/invalidate-cache', (req, res) => {
  dashboardCache.invalidate();
  console.log('📊 Lead dashboard cache invalidated');
  res.json({ success: true, message: 'Dashboard cache invalidated' });
});

// ============================================
// COMPARISON & TOP PERFORMER ENDPOINTS
// ============================================

/**
 * GET /comparisons/mom - Month-over-Month comparison
 * Returns current month vs previous months data
 */
router.get('/comparisons/mom', async (req, res) => {
  try {
    const compareMonths = parseInt(req.query.months) || 6; // Compare last N months
    
    // Get monthly data with running comparisons
    const monthlyData = await query(`
      SELECT 
        DATE_FORMAT(lead_created_at, '%Y-%m') as month,
        DATE_FORMAT(lead_created_at, '%b %Y') as month_label,
        COUNT(*) as lead_count,
        COUNT(DISTINCT partner_id) as unique_partners,
        COUNT(DISTINCT source) as unique_sources
      FROM leads
      WHERE lead_created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)
      GROUP BY month, month_label
      ORDER BY month ASC
    `, [compareMonths + 1]); // +1 to calculate first month's change
    
    // Calculate MoM changes
    let prevMonth = null;
    const comparisons = monthlyData.map((m, idx) => {
      const leadChange = prevMonth ? m.lead_count - prevMonth.lead_count : 0;
      const leadChangePercent = prevMonth && prevMonth.lead_count > 0 
        ? ((leadChange / prevMonth.lead_count) * 100).toFixed(1) : 0;
      const partnerChange = prevMonth ? m.unique_partners - prevMonth.unique_partners : 0;
      
      const result = {
        ...m,
        lead_change: leadChange,
        lead_change_percent: parseFloat(leadChangePercent),
        partner_change: partnerChange,
        prev_month_leads: prevMonth?.lead_count || 0
      };
      
      prevMonth = m;
      return result;
    }).slice(1); // Remove first month (no previous to compare)
    
    // Calculate summary stats
    const avgMonthlyLeads = comparisons.length > 0 
      ? Math.round(comparisons.reduce((sum, m) => sum + m.lead_count, 0) / comparisons.length) : 0;
    const avgGrowth = comparisons.length > 0 
      ? (comparisons.reduce((sum, m) => sum + m.lead_change_percent, 0) / comparisons.length).toFixed(1) : 0;
    const currentMonth = comparisons[comparisons.length - 1] || null;
    const bestMonth = comparisons.reduce((best, m) => m.lead_count > (best?.lead_count || 0) ? m : best, null);
    
    res.json({
      success: true,
      data: {
        comparisons,
        summary: {
          avgMonthlyLeads,
          avgGrowthPercent: parseFloat(avgGrowth),
          currentMonth,
          bestMonth,
          totalMonths: comparisons.length
        }
      }
    });
  } catch (err) {
    console.error('MoM comparison error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /comparisons/yoy - Year-over-Year comparison
 * Returns current year vs previous years data
 */
router.get('/comparisons/yoy', async (req, res) => {
  try {
    const compareYears = parseInt(req.query.years) || 3; // Compare last N years
    
    // Get yearly data
    const yearlyData = await query(`
      SELECT 
        YEAR(lead_created_at) as year,
        COUNT(*) as lead_count,
        COUNT(DISTINCT partner_id) as unique_partners,
        COUNT(DISTINCT source) as unique_sources,
        COUNT(DISTINCT MONTH(lead_created_at)) as active_months
      FROM leads
      WHERE lead_created_at >= DATE_SUB(NOW(), INTERVAL ? YEAR)
      GROUP BY year
      ORDER BY year ASC
    `, [compareYears]);
    
    // Calculate YoY changes
    let prevYear = null;
    const comparisons = yearlyData.map(y => {
      const leadChange = prevYear ? y.lead_count - prevYear.lead_count : 0;
      const leadChangePercent = prevYear && prevYear.lead_count > 0 
        ? ((leadChange / prevYear.lead_count) * 100).toFixed(1) : 0;
      const partnerChange = prevYear ? y.unique_partners - prevYear.unique_partners : 0;
      
      const result = {
        ...y,
        lead_change: leadChange,
        lead_change_percent: parseFloat(leadChangePercent),
        partner_change: partnerChange,
        prev_year_leads: prevYear?.lead_count || 0,
        avg_per_month: y.active_months > 0 ? Math.round(y.lead_count / y.active_months) : 0
      };
      
      prevYear = y;
      return result;
    });
    
    // Get monthly breakdown for current year vs last year
    const currentYear = new Date().getFullYear();
    const monthlyComparison = await query(`
      SELECT 
        MONTH(lead_created_at) as month_num,
        DATE_FORMAT(lead_created_at, '%b') as month_name,
        SUM(CASE WHEN YEAR(lead_created_at) = ? THEN 1 ELSE 0 END) as current_year,
        SUM(CASE WHEN YEAR(lead_created_at) = ? THEN 1 ELSE 0 END) as last_year
      FROM leads
      WHERE YEAR(lead_created_at) IN (?, ?)
      GROUP BY month_num, month_name
      ORDER BY month_num
    `, [currentYear, currentYear - 1, currentYear, currentYear - 1]);
    
    // Calculate monthly YoY change
    const monthlyWithChange = monthlyComparison.map(m => ({
      ...m,
      change: m.current_year - m.last_year,
      change_percent: m.last_year > 0 ? parseFloat(((m.current_year - m.last_year) / m.last_year * 100).toFixed(1)) : null
    }));
    
    res.json({
      success: true,
      data: {
        yearlyComparisons: comparisons,
        monthlyComparison: monthlyWithChange,
        currentYear,
        summary: {
          totalYears: comparisons.length,
          currentYearTotal: comparisons.find(y => y.year === currentYear)?.lead_count || 0,
          lastYearTotal: comparisons.find(y => y.year === currentYear - 1)?.lead_count || 0
        }
      }
    });
  } catch (err) {
    console.error('YoY comparison error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /top-performers - Top performing partners by time scale
 * Query params: period (7d|30d|90d|ytd|1y|all), limit, metric (leads|growth|recent)
 */
router.get('/top-performers', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const limit = parseInt(req.query.limit) || 10;
    const metric = req.query.metric || 'leads';
    
    // Build date filter based on period
    let dateFilter = '';
    switch (period) {
      case '7d':
        dateFilter = 'AND l.lead_created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        break;
      case '30d':
        dateFilter = 'AND l.lead_created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        break;
      case '90d':
        dateFilter = 'AND l.lead_created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)';
        break;
      case 'ytd':
        dateFilter = 'AND YEAR(l.lead_created_at) = YEAR(NOW())';
        break;
      case '1y':
        dateFilter = 'AND l.lead_created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
        break;
      default: // 'all'
        dateFilter = '';
    }
    
    // Get top performers with comprehensive metrics
    const topPerformers = await query(`
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        COUNT(l.id) as period_leads,
        p.lead_count as total_leads,
        COUNT(DISTINCT DATE(l.lead_created_at)) as active_days,
        MIN(l.lead_created_at) as first_lead,
        MAX(l.lead_created_at) as last_lead
      FROM partners p
      INNER JOIN leads l ON p.id = l.partner_id
      WHERE p.is_active = TRUE ${dateFilter}
      GROUP BY p.id, p.account_name, p.partner_tier, p.account_region, p.account_owner, p.lead_count
      ORDER BY period_leads DESC
      LIMIT ?
    `, [limit]);
    
    // Calculate velocity (leads per day) for each partner
    const performersWithMetrics = topPerformers.map(p => {
      const daysDiff = p.first_lead && p.last_lead 
        ? Math.max(1, Math.ceil((new Date(p.last_lead) - new Date(p.first_lead)) / (1000 * 60 * 60 * 24)))
        : 1;
      return {
        ...p,
        velocity: (p.period_leads / daysDiff).toFixed(2),
        period_share: null // Will be calculated below
      };
    });
    
    // Calculate period share
    const totalPeriodLeads = performersWithMetrics.reduce((sum, p) => sum + p.period_leads, 0);
    performersWithMetrics.forEach(p => {
      p.period_share = totalPeriodLeads > 0 ? ((p.period_leads / totalPeriodLeads) * 100).toFixed(1) : 0;
    });
    
    // Get period totals for context
    const [periodTotals] = await query(`
      SELECT 
        COUNT(*) as total_leads,
        COUNT(DISTINCT partner_id) as active_partners
      FROM leads l
      WHERE 1=1 ${dateFilter}
    `);
    
    // Get rising stars (fastest growing) - use subquery to avoid HAVING alias issue
    const risingStars = await query(`
      SELECT * FROM (
        SELECT 
          p.id,
          p.account_name,
          p.partner_tier,
          SUM(CASE WHEN l.lead_created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as last_30_days,
          SUM(CASE WHEN l.lead_created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY) 
                     AND l.lead_created_at < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as prev_30_days
        FROM partners p
        INNER JOIN leads l ON p.id = l.partner_id
        WHERE p.is_active = TRUE AND l.lead_created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
        GROUP BY p.id, p.account_name, p.partner_tier
      ) AS subq
      WHERE last_30_days > prev_30_days AND prev_30_days >= 3
      ORDER BY (last_30_days - prev_30_days) DESC
      LIMIT 5
    `);
    
    const risingStarsWithGrowth = risingStars.map(r => ({
      ...r,
      growth: r.last_30_days - r.prev_30_days,
      growth_percent: r.prev_30_days > 0 ? ((r.last_30_days - r.prev_30_days) / r.prev_30_days * 100).toFixed(1) : null
    }));
    
    res.json({
      success: true,
      data: {
        period,
        topPerformers: performersWithMetrics,
        risingStars: risingStarsWithGrowth,
        periodTotals,
        limit
      }
    });
  } catch (err) {
    console.error('Top performers error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /growth-analysis - Linear regression growth analysis with outlier detection
 * Query params: months, normalize (true|false), method (iqr|zscore|winsorize)
 * Returns trend line data with projected growth, outlier detection, and normalized view
 */
router.get('/growth-analysis', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;
    const normalize = req.query.normalize === 'true';
    const method = req.query.method || 'iqr'; // iqr, zscore, winsorize
    const zThresholdParam = parseFloat(req.query.zThreshold) || 1.5; // Configurable z-score threshold
    
    // Get monthly data
    const monthlyData = await query(`
      SELECT 
        DATE_FORMAT(lead_created_at, '%Y-%m') as month,
        DATE_FORMAT(lead_created_at, '%b %Y') as month_label,
        COUNT(*) as lead_count
      FROM leads
      WHERE lead_created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)
      GROUP BY month, month_label
      ORDER BY month ASC
    `, [months]);
    
    const n = monthlyData.length;
    if (n < 2) {
      return res.json({
        success: true,
        data: {
          monthlyData,
          regression: null,
          message: 'Not enough data for regression analysis'
        }
      });
    }
    
    // Extract lead counts for statistical analysis
    const leadCounts = monthlyData.map(m => m.lead_count);
    
    // Calculate statistics for outlier detection
    const sorted = [...leadCounts].sort((a, b) => a - b);
    const q1Index = Math.floor(n * 0.25);
    const q3Index = Math.floor(n * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    // Calculate mean and std for z-score
    const mean = leadCounts.reduce((a, b) => a + b, 0) / n;
    const variance = leadCounts.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    const zThreshold = zThresholdParam; // Use configurable threshold
    
    // Calculate median
    const median = n % 2 === 0 
      ? (sorted[n/2 - 1] + sorted[n/2]) / 2 
      : sorted[Math.floor(n/2)];
    
    // Identify outliers and create normalized values
    const dataWithOutliers = monthlyData.map((m, i) => {
      const count = m.lead_count;
      const zScore = stdDev > 0 ? (count - mean) / stdDev : 0;
      
      // Determine if outlier based on method
      let isOutlier = false;
      let normalizedValue = count;
      let outlierReason = null;
      
      if (method === 'iqr') {
        isOutlier = count < lowerBound || count > upperBound;
        if (isOutlier) {
          normalizedValue = count > upperBound ? upperBound : lowerBound;
          outlierReason = count > upperBound ? 'above_upper_bound' : 'below_lower_bound';
        }
      } else if (method === 'zscore') {
        isOutlier = Math.abs(zScore) > zThreshold;
        if (isOutlier) {
          normalizedValue = mean + (zScore > 0 ? zThreshold : -zThreshold) * stdDev;
          outlierReason = zScore > 0 ? 'high_zscore' : 'low_zscore';
        }
      } else if (method === 'winsorize') {
        // Cap at 5th and 95th percentile
        const p5 = sorted[Math.floor(n * 0.05)];
        const p95 = sorted[Math.floor(n * 0.95)];
        isOutlier = count < p5 || count > p95;
        if (count > p95) {
          normalizedValue = p95;
          outlierReason = 'above_95th_percentile';
        } else if (count < p5) {
          normalizedValue = p5;
          outlierReason = 'below_5th_percentile';
        }
      }
      
      return {
        ...m,
        z_score: parseFloat(zScore.toFixed(2)),
        is_outlier: isOutlier,
        outlier_reason: outlierReason,
        normalized_value: Math.round(normalizedValue),
        deviation_from_median: count - median,
        deviation_percent: median > 0 ? parseFloat(((count - median) / median * 100).toFixed(1)) : 0
      };
    });
    
    // Use normalized or raw values for regression
    const yValues = normalize 
      ? dataWithOutliers.map(m => m.normalized_value)
      : dataWithOutliers.map(m => m.lead_count);
    const xValues = dataWithOutliers.map((_, i) => i);
    
    // Calculate linear regression (y = mx + b)
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((total, x, i) => total + x * yValues[i], 0);
    const sumX2 = xValues.reduce((total, x) => total + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // R-squared calculation
    const yMean = sumY / n;
    const ssTotal = yValues.reduce((total, y) => total + Math.pow(y - yMean, 2), 0);
    const ssResidual = yValues.reduce((total, y, i) => {
      const predicted = slope * i + intercept;
      return total + Math.pow(y - predicted, 2);
    }, 0);
    const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;
    
    // Add trend line values
    const dataWithTrend = dataWithOutliers.map((m, i) => ({
      ...m,
      trend_value: Math.round(slope * i + intercept),
      residual: (normalize ? m.normalized_value : m.lead_count) - Math.round(slope * i + intercept)
    }));
    
    // Project next 3 months
    const projections = [];
    for (let i = 1; i <= 3; i++) {
      const projectedValue = Math.round(slope * (n + i - 1) + intercept);
      const date = new Date();
      date.setMonth(date.getMonth() + i);
      projections.push({
        month: date.toISOString().slice(0, 7),
        month_label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        projected_leads: Math.max(0, projectedValue),
        is_projection: true
      });
    }
    
    // Calculate growth metrics
    const firstValue = yValues[0] || 0;
    const lastValue = yValues[n - 1] || 0;
    const totalGrowth = firstValue > 0 ? ((lastValue - firstValue) / firstValue * 100).toFixed(1) : 0;
    const avgMonthlyGrowth = yMean > 0 ? (slope / yMean * 100).toFixed(2) : 0;
    
    // Count outliers
    const outlierCount = dataWithTrend.filter(m => m.is_outlier).length;
    const outlierMonths = dataWithTrend.filter(m => m.is_outlier).map(m => ({
      month: m.month_label,
      value: m.lead_count,
      normalized: m.normalized_value,
      deviation: m.deviation_percent
    }));
    
    res.json({
      success: true,
      data: {
        monthlyData: dataWithTrend,
        projections,
        regression: {
          slope: slope.toFixed(2),
          intercept: intercept.toFixed(2),
          rSquared: rSquared.toFixed(3),
          equation: `y = ${slope.toFixed(2)}x + ${intercept.toFixed(2)}`,
          normalized: normalize,
          method: method
        },
        statistics: {
          mean: Math.round(mean),
          median: Math.round(median),
          stdDev: Math.round(stdDev),
          q1: Math.round(q1),
          q3: Math.round(q3),
          iqr: Math.round(iqr),
          lowerBound: Math.round(lowerBound),
          upperBound: Math.round(upperBound)
        },
        outliers: {
          count: outlierCount,
          percentage: ((outlierCount / n) * 100).toFixed(1),
          months: outlierMonths,
          method: method
        },
        summary: {
          totalMonths: n,
          totalGrowthPercent: parseFloat(totalGrowth),
          avgMonthlyGrowthPercent: parseFloat(avgMonthlyGrowth),
          trendDirection: slope > 0 ? 'upward' : slope < 0 ? 'downward' : 'flat',
          confidence: rSquared > 0.7 ? 'high' : rSquared > 0.4 ? 'medium' : 'low'
        }
      }
    });
  } catch (err) {
    console.error('Growth analysis error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /comparisons/quarters - Quarterly comparison
 */
router.get('/comparisons/quarters', async (req, res) => {
  try {
    const quarters = parseInt(req.query.quarters) || 8; // Last 8 quarters
    
    const quarterlyData = await query(`
      SELECT 
        CONCAT(YEAR(lead_created_at), ' Q', QUARTER(lead_created_at)) as quarter,
        YEAR(lead_created_at) as year,
        QUARTER(lead_created_at) as quarter_num,
        COUNT(*) as lead_count,
        COUNT(DISTINCT partner_id) as unique_partners,
        COUNT(DISTINCT source) as unique_sources
      FROM leads
      WHERE lead_created_at >= DATE_SUB(NOW(), INTERVAL ? QUARTER)
      GROUP BY quarter, year, quarter_num
      ORDER BY year, quarter_num
    `, [quarters]);
    
    // Calculate QoQ changes
    let prevQ = null;
    const comparisons = quarterlyData.map(q => {
      const leadChange = prevQ ? q.lead_count - prevQ.lead_count : 0;
      const changePercent = prevQ && prevQ.lead_count > 0 
        ? ((leadChange / prevQ.lead_count) * 100).toFixed(1) : 0;
      
      const result = {
        ...q,
        lead_change: leadChange,
        change_percent: parseFloat(changePercent),
        prev_quarter_leads: prevQ?.lead_count || 0
      };
      
      prevQ = q;
      return result;
    });
    
    res.json({
      success: true,
      data: {
        quarters: comparisons,
        summary: {
          totalQuarters: comparisons.length,
          avgQuarterlyLeads: comparisons.length > 0 
            ? Math.round(comparisons.reduce((sum, q) => sum + q.lead_count, 0) / comparisons.length) : 0
        }
      }
    });
  } catch (err) {
    console.error('Quarterly comparison error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
