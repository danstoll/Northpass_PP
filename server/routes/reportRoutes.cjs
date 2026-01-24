/**
 * Report Routes
 * Database reporting endpoints for partners, users, certifications
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db/connection.cjs');

// Simple in-memory cache for report endpoints (5 min TTL)
const reportCache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function isCacheValid(cacheKey) {
  const cache = reportCache[cacheKey];
  return cache && cache.data && (Date.now() - cache.timestamp) < CACHE_TTL;
}

function setCache(cacheKey, data) {
  reportCache[cacheKey] = { data, timestamp: Date.now() };
}

// ============================================
// Report Endpoints
// ============================================

router.get('/partner-npcu', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCacheValid('partner-npcu')) {
      return res.json(reportCache['partner-npcu'].data);
    }
    // OPTIMIZED: Use partner_npcu_cache instead of expensive 5-table JOIN
    const report = await query(`
      SELECT
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        (SELECT COUNT(*) FROM contacts ct WHERE ct.partner_id = p.id) as contact_count,
        COALESCE(g.user_count, 0) as lms_users,
        COALESCE(nc.active_npcu, 0) as total_npcu,
        COALESCE(nc.total_certifications, 0) as certifications,
        COALESCE(nc.certified_users, 0) as certified_users
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      LEFT JOIN partner_npcu_cache nc ON nc.partner_id = p.id
      WHERE p.is_active = TRUE
      ORDER BY total_npcu DESC
    `);
    setCache('partner-npcu', report);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/certification-gaps', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const { tier } = req.query;
    const cacheKey = `certification-gaps-${tier || 'all'}`;
    if (!forceRefresh && isCacheValid(cacheKey)) {
      return res.json(reportCache[cacheKey].data);
    }

    // Fetch tier requirements from database
    const tiers = await query('SELECT name, npcu_required FROM partner_tiers WHERE is_active = TRUE');
    const tierRequirements = {};
    tiers.forEach(t => {
      tierRequirements[t.name] = t.npcu_required || 0;
    });
    // Fallback defaults
    if (Object.keys(tierRequirements).length === 0) {
      tierRequirements['Premier'] = 20;
      tierRequirements['Premier Plus'] = 20;
      tierRequirements['Certified'] = 10;
      tierRequirements['Registered'] = 5;
      tierRequirements['Aggregator'] = 5;
    }

    // OPTIMIZED: Use partner_npcu_cache instead of expensive 5-table JOIN
    let sql = `
      SELECT
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        COALESCE(nc.active_npcu, 0) as current_npcu
      FROM partners p
      LEFT JOIN partner_npcu_cache nc ON nc.partner_id = p.id
      WHERE p.is_active = TRUE
    `;
    const params = [];

    if (tier) {
      sql += ' AND p.partner_tier = ?';
      params.push(tier);
    }

    sql += ' ORDER BY p.partner_tier, current_npcu';

    const results = await query(sql, params);
    const report = results.map(r => ({
      ...r,
      required_npcu: tierRequirements[r.partner_tier] || 0,
      npcu_gap: Math.max(0, (tierRequirements[r.partner_tier] || 0) - r.current_npcu)
    }));
    setCache(cacheKey, report);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/partner-leaderboard', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const { tier, region, limit = 50 } = req.query;
    // Cache key must include filters to avoid returning wrong cached data
    const cacheKey = `partner-leaderboard-${tier || 'all'}-${region || 'all'}-${limit}`;
    if (!forceRefresh && isCacheValid(cacheKey)) {
      return res.json(reportCache[cacheKey].data);
    }
    
    let sql = `
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        (SELECT COUNT(*) FROM contacts ct WHERE ct.partner_id = p.id) as total_contacts,
        COALESCE(g.user_count, 0) as lms_users,
        COALESCE(nc.total_certifications, 0) as total_certifications,
        COALESCE(nc.active_npcu, 0) as total_npcu,
        COALESCE(nc.certified_users, 0) as certified_users
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      LEFT JOIN partner_npcu_cache nc ON nc.partner_id = p.id
      WHERE p.is_active = TRUE
    `;
    const params = [];
    if (tier) {
      sql += ' AND p.partner_tier = ?';
      params.push(tier);
    }
    if (region) {
      sql += ' AND p.account_region = ?';
      params.push(region);
    }
    sql += ' ORDER BY total_npcu DESC, total_certifications DESC';
    sql += ' LIMIT ?';
    params.push(parseInt(limit));
    
    const results = await query(sql, params);
    setCache(cacheKey, results);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/course-popularity', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCacheValid('course-popularity')) {
      return res.json(reportCache['course-popularity'].data);
    }
    const { limit = 20 } = req.query;
    const results = await query(`
      SELECT 
        c.id,
        c.name,
        c.product_category,
        c.npcu_value,
        c.is_certification,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.id END) as completion_count,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.user_id END) as unique_users,
        AVG(CASE WHEN e.status = 'completed' THEN e.score END) as avg_score
      FROM lms_courses c
      LEFT JOIN lms_enrollments e ON e.course_id = c.id
      GROUP BY c.id
      HAVING completion_count > 0
      ORDER BY completion_count DESC
      LIMIT ?
    `, [parseInt(limit)]);
    setCache('course-popularity', results);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/recent-activity', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const cacheKey = `recent-activity-${req.query.days || 30}-${req.query.limit || 100}`;
    if (!forceRefresh && isCacheValid(cacheKey)) {
      return res.json(reportCache[cacheKey].data);
    }
    const { days = 30, limit = 100 } = req.query;
    const results = await query(`
      SELECT 
        e.id as enrollment_id,
        e.completed_at,
        u.email,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        c.name as course_name,
        c.npcu_value,
        c.is_certification,
        p.account_name as partner_name,
        p.partner_tier
      FROM lms_enrollments e
      INNER JOIN lms_users u ON u.id = e.user_id
      INNER JOIN lms_courses c ON c.id = e.course_id
      LEFT JOIN contacts ct ON ct.lms_user_id = u.id
      LEFT JOIN partners p ON p.id = ct.partner_id
      WHERE e.status = 'completed'
        AND e.completed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY e.completed_at DESC
      LIMIT ?
    `, [parseInt(days), parseInt(limit)]);
    setCache(cacheKey, results);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Recent certifications (NPCU courses completed) with partner info - PARTNER USERS ONLY
router.get('/recent-certifications', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const cacheKey = `recent-certifications-${req.query.days || 30}-${req.query.limit || 10}`;
    if (!forceRefresh && isCacheValid(cacheKey)) {
      return res.json(reportCache[cacheKey].data);
    }
    const { days = 30, limit = 10 } = req.query;
    const results = await query(`
      SELECT 
        e.id as enrollment_id,
        e.completed_at,
        u.email,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        c.name as course_name,
        c.npcu_value,
        p.id as partner_id,
        p.account_name as partner_name,
        p.partner_tier
      FROM lms_enrollments e
      INNER JOIN lms_users u ON u.id = e.user_id
      INNER JOIN lms_courses c ON c.id = e.course_id AND c.npcu_value > 0
      INNER JOIN contacts ct ON ct.lms_user_id = u.id AND ct.partner_id IS NOT NULL
      INNER JOIN partners p ON p.id = ct.partner_id
      WHERE e.status = 'completed'
        AND e.completed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY e.completed_at DESC
      LIMIT ?
    `, [parseInt(days), parseInt(limit)]);
    setCache(cacheKey, results);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/expiring-certifications', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const cacheKey = `expiring-certifications-${req.query.days || 90}`;
    if (!forceRefresh && isCacheValid(cacheKey)) {
      return res.json(reportCache[cacheKey].data);
    }
    const { days = 90 } = req.query;
    const results = await query(`
      SELECT 
        e.id as enrollment_id,
        e.completed_at,
        e.expires_at,
        DATEDIFF(e.expires_at, NOW()) as days_until_expiry,
        u.email,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        c.name as course_name,
        c.npcu_value,
        p.account_name as partner_name,
        p.partner_tier
      FROM lms_enrollments e
      INNER JOIN lms_users u ON u.id = e.user_id
      INNER JOIN lms_courses c ON c.id = e.course_id
      LEFT JOIN contacts ct ON ct.lms_user_id = u.id
      LEFT JOIN partners p ON p.id = ct.partner_id
      WHERE e.status = 'completed'
        AND c.is_certification = 1
        AND e.expires_at IS NOT NULL
        AND e.expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
        AND e.expires_at >= NOW()
      ORDER BY e.expires_at ASC
    `, [parseInt(days)]);
    setCache(cacheKey, results);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/inactive-users', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const cacheKey = `inactive-users-${req.query.days || 180}-${req.query.limit || 200}`;
    if (!forceRefresh && isCacheValid(cacheKey)) {
      return res.json(reportCache[cacheKey].data);
    }
    const { days = 180, limit = 200 } = req.query;
    const results = await query(`
      SELECT 
        u.id as lms_user_id,
        u.email,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.last_active_at,
        DATEDIFF(NOW(), COALESCE(u.last_active_at, u.created_at_lms)) as days_inactive,
        p.account_name as partner_name,
        p.partner_tier,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.id END) as total_completions
      FROM lms_users u
      LEFT JOIN contacts ct ON ct.lms_user_id = u.id
      LEFT JOIN partners p ON p.id = ct.partner_id
      LEFT JOIN lms_enrollments e ON e.user_id = u.id
      WHERE u.status = 'active'
        AND (u.last_active_at IS NULL OR u.last_active_at < DATE_SUB(NOW(), INTERVAL ? DAY))
      GROUP BY u.id
      ORDER BY days_inactive DESC
      LIMIT ?
    `, [parseInt(days), parseInt(limit)]);
    setCache(cacheKey, results);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/overview', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    
    if (!forceRefresh && isCacheValid('overview')) {
      return res.json(reportCache['overview'].data);
    }
    
    const [byTier, byRegion, byOwner, partnerContactTotals, lmsUserCount, lmsGroupCount] = await Promise.all([
      query(`
        SELECT 
          p.partner_tier as tier,
          COUNT(DISTINCT p.id) as partner_count,
          COUNT(DISTINCT c.id) as contact_count,
          COUNT(DISTINCT CASE WHEN c.lms_user_id IS NOT NULL THEN c.id END) as lms_linked_count
        FROM partners p
        LEFT JOIN contacts c ON c.partner_id = p.id
        WHERE p.partner_tier IS NOT NULL AND p.partner_tier != ''
        GROUP BY p.partner_tier
        ORDER BY FIELD(p.partner_tier, 'Premier', 'Select', 'Registered', 'Certified')
      `),
      
      query(`
        SELECT 
          p.account_region as region,
          COUNT(DISTINCT p.id) as partner_count,
          COUNT(DISTINCT c.id) as contact_count,
          COUNT(DISTINCT CASE WHEN c.lms_user_id IS NOT NULL THEN c.id END) as lms_linked_count
        FROM partners p
        LEFT JOIN contacts c ON c.partner_id = p.id
        WHERE p.account_region IS NOT NULL AND p.account_region != ''
        GROUP BY p.account_region
        ORDER BY p.account_region
      `),
      
      query(`
        SELECT 
          p.account_owner as owner,
          COUNT(DISTINCT p.id) as partner_count,
          COUNT(DISTINCT c.id) as contact_count
        FROM partners p
        LEFT JOIN contacts c ON c.partner_id = p.id
        WHERE p.account_owner IS NOT NULL AND p.account_owner != ''
        GROUP BY p.account_owner
        ORDER BY partner_count DESC
        LIMIT 20
      `),
      
      query(`
        SELECT 
          (SELECT COUNT(*) FROM partners) as total_partners,
          (SELECT COUNT(*) FROM contacts) as total_contacts,
          (SELECT COUNT(*) FROM contacts WHERE lms_user_id IS NOT NULL) as lms_linked_contacts
      `),
      
      query(`SELECT COUNT(*) as count FROM lms_users`),
      
      query(`SELECT COUNT(*) as count FROM lms_groups`)
    ]);

    const totals = {
      total_partners: partnerContactTotals[0]?.total_partners || 0,
      total_contacts: partnerContactTotals[0]?.total_contacts || 0,
      lms_linked_contacts: partnerContactTotals[0]?.lms_linked_contacts || 0,
      total_lms_users: lmsUserCount[0]?.count || 0,
      total_lms_groups: lmsGroupCount[0]?.count || 0
    };

    const result = { byTier, byRegion, byOwner, totals };
    setCache('overview', result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/user-certifications', async (req, res) => {
  try {
    const { partnerId, tier, region, search, limit = 1000, offset = 0 } = req.query;
    
    let sql = `
      SELECT
        c.id as contact_id,
        c.email,
        c.first_name,
        c.last_name,
        c.title,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.is_active as partner_is_active,
        u.id as lms_user_id,
        u.status as lms_status,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.id END) as completed_courses,
        -- Only count non-expired certifications
        COUNT(DISTINCT CASE
          WHEN e.status = 'completed' AND co.is_certification = 1
               AND (e.expires_at IS NULL OR e.expires_at > NOW())
          THEN e.id
        END) as certifications,
        -- Only count NPCU from non-expired certifications
        COALESCE(SUM(CASE
          WHEN e.status = 'completed' AND co.npcu_value > 0
               AND (e.expires_at IS NULL OR e.expires_at > NOW())
          THEN co.npcu_value
          ELSE 0
        END), 0) as total_npcu,
        MAX(e.completed_at) as last_completion
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      LEFT JOIN lms_users u ON u.id = c.lms_user_id
      LEFT JOIN lms_enrollments e ON e.user_id = u.id AND e.status = 'completed'
      LEFT JOIN lms_courses co ON co.id = e.course_id
      WHERE 1=1
    `;
    const params = [];

    if (partnerId) {
      sql += ' AND p.id = ?';
      params.push(partnerId);
    }
    if (tier) {
      sql += ' AND p.partner_tier = ?';
      params.push(tier);
    }
    if (region) {
      sql += ' AND p.account_region = ?';
      params.push(region);
    }
    if (search) {
      sql += ' AND (c.email LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR p.account_name LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    sql += ' GROUP BY c.id, c.email, c.first_name, c.last_name, c.title, p.account_name, p.partner_tier, p.account_region, p.is_active, u.id, u.status';
    sql += ' ORDER BY p.is_active DESC, total_npcu DESC, p.account_name';
    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const results = await query(sql, params);
    res.json(results);
  } catch (error) {
    console.error('User certifications report error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/contacts-not-in-lms', async (req, res) => {
  try {
    const { tier, region, owner, excludePersonal, limit = 1000, offset = 0 } = req.query;
    
    let sql = `
      SELECT
        c.id,
        c.email,
        c.first_name,
        c.last_name,
        c.title,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        p.is_active as partner_is_active
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      WHERE c.lms_user_id IS NULL
    `;
    const params = [];

    if (tier) {
      sql += ' AND p.partner_tier = ?';
      params.push(tier);
    }
    if (region) {
      sql += ' AND p.account_region = ?';
      params.push(region);
    }
    if (owner) {
      sql += ' AND p.account_owner = ?';
      params.push(owner);
    }
    if (excludePersonal === 'true') {
      sql += ` AND c.email NOT LIKE '%@gmail.com'
               AND c.email NOT LIKE '%@hotmail.com'
               AND c.email NOT LIKE '%@yahoo.com'
               AND c.email NOT LIKE '%@outlook.com'`;
    }

    sql += ' ORDER BY p.is_active DESC, p.partner_tier, p.account_name, c.last_name';
    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const results = await query(sql, params);
    res.json(results);
  } catch (error) {
    console.error('Contacts not in LMS report error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/partners-without-groups', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCacheValid('partners-without-groups')) {
      return res.json(reportCache['partners-without-groups'].data);
    }
    const results = await query(`
      SELECT
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        p.is_active,
        COUNT(DISTINCT c.id) as contact_count
      FROM partners p
      LEFT JOIN contacts c ON c.partner_id = p.id
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE g.id IS NULL
      GROUP BY p.id
      ORDER BY p.is_active DESC, p.partner_tier, p.account_name
    `);
    setCache('partners-without-groups', results);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/lms-users-not-in-crm', async (req, res) => {
  try {
    const { groupId, search, limit = 500, offset = 0 } = req.query;
    
    let sql = `
      SELECT 
        u.id as lms_user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.created_at_lms,
        g.name as group_name,
        p.account_name as partner_name
      FROM lms_users u
      INNER JOIN lms_group_members gm ON gm.user_id = u.id
      INNER JOIN lms_groups g ON g.id = gm.group_id
      LEFT JOIN partners p ON p.id = g.partner_id
      LEFT JOIN contacts c ON c.lms_user_id = u.id
      WHERE c.id IS NULL
        AND g.partner_id IS NOT NULL
    `;
    const params = [];

    if (groupId) {
      sql += ' AND g.id = ?';
      params.push(groupId);
    }
    if (search) {
      sql += ' AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY g.name, u.email';
    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const results = await query(sql, params);
    res.json(results);
  } catch (error) {
    console.error('LMS users not in CRM report error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/owners', async (req, res) => {
  try {
    // Only return owners that are active PAMs in the partner_managers table
    const owners = await query(`
      SELECT 
        p.account_owner,
        COUNT(DISTINCT p.id) as partner_count
      FROM partners p
      INNER JOIN partner_managers pm ON pm.owner_name = p.account_owner AND pm.is_active_pam = TRUE
      WHERE p.account_owner IS NOT NULL 
        AND p.account_owner != ''
      GROUP BY p.account_owner
      ORDER BY p.account_owner
    `);
    res.json(owners);
  } catch (error) {
    console.error('Account owners report error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/owner-accounts', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const cacheKey = `owner-accounts-${req.query.owner || ''}`;
    if (!forceRefresh && isCacheValid(cacheKey)) {
      return res.json(reportCache[cacheKey].data);
    }
    const { owner } = req.query;
    if (!owner) {
      return res.status(400).json({ error: 'Owner parameter is required' });
    }
    
    const results = await query(`
      SELECT
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        p.is_active,
        p.primary_user_name,
        p.primary_user_email,
        p.salesforce_id,
        p.impartner_id,
        (SELECT COUNT(*) FROM contacts c WHERE c.partner_id = p.id) as contact_count,
        (SELECT COUNT(*) FROM contacts c WHERE c.partner_id = p.id AND c.lms_user_id IS NOT NULL) as contacts_in_lms,
        COALESCE(g.user_count, 0) as lms_users,
        COALESCE(nc.active_npcu, 0) as total_npcu,
        COALESCE(nc.total_certifications, 0) as active_certifications,
        g.id as group_id,
        g.name as group_name
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      LEFT JOIN partner_npcu_cache nc ON nc.partner_id = p.id
      WHERE p.account_owner = ?
      ORDER BY p.is_active DESC, p.account_name
    `, [owner]);
    
    setCache(cacheKey, results);
    res.json(results);
  } catch (error) {
    console.error('Owner accounts report error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/filters', async (req, res) => {
  try {
    const tiers = await query(`
      SELECT DISTINCT partner_tier as value 
      FROM partners 
      WHERE partner_tier IS NOT NULL AND partner_tier != ''
      ORDER BY FIELD(partner_tier, 'Premier', 'Select', 'Registered', 'Certified')
    `);
    
    const regions = await query(`
      SELECT DISTINCT account_region as value 
      FROM partners 
      WHERE account_region IS NOT NULL AND account_region != ''
      ORDER BY account_region
    `);

    const countries = await query(`
      SELECT DISTINCT country as value 
      FROM partners 
      WHERE country IS NOT NULL AND country != ''
      ORDER BY country
    `);
    
    const owners = await query(`
      SELECT DISTINCT account_owner as value 
      FROM partners 
      WHERE account_owner IS NOT NULL AND account_owner != ''
      ORDER BY account_owner
    `);

    const partners = await query(`
      SELECT id as value, account_name as label 
      FROM partners 
      WHERE is_active = TRUE AND account_name IS NOT NULL AND account_name != ''
      ORDER BY account_name
    `);

    res.json({ 
      tiers: tiers.map(t => t.value),
      regions: regions.map(r => r.value),
      countries: countries.map(c => c.value),
      owners: owners.map(o => o.value),
      partners: partners.map(p => ({ value: p.value, label: p.label }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Activity Timeline Report
// Time-series data for enrollments/certifications with anomaly detection
// Use case: Identify leading indicators like activity drops or spikes
// ============================================

router.get('/activity-timeline', async (req, res) => {
  try {
    const { 
      partnerId, tier, region, country, owner, 
      months = 12, 
      granularity = 'month' // month, week
    } = req.query;

    // Build filter conditions
    let filterConditions = ['p.is_active = TRUE'];
    const filterParams = [];

    if (partnerId) {
      filterConditions.push('p.id = ?');
      filterParams.push(partnerId);
    }
    if (tier) {
      filterConditions.push('p.partner_tier = ?');
      filterParams.push(tier);
    }
    if (region) {
      filterConditions.push('p.account_region = ?');
      filterParams.push(region);
    }
    if (country) {
      filterConditions.push('p.country = ?');
      filterParams.push(country);
    }
    if (owner) {
      filterConditions.push('p.account_owner = ?');
      filterParams.push(owner);
    }

    const filterClause = filterConditions.join(' AND ');

    // Date format based on granularity
    const dateFormat = granularity === 'week' ? '%Y-W%v' : '%Y-%m';
    const dateLabel = granularity === 'week' ? 'week' : 'month';
    const interval = granularity === 'week' ? `${months * 4} WEEK` : `${months} MONTH`;

    // Partner users subquery
    const partnerUserSubquery = `
      SELECT DISTINCT gm.user_id, g.partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    `;

    // Get enrollment activity timeline
    const enrollmentSql = `
      SELECT 
        DATE_FORMAT(e.enrolled_at, '${dateFormat}') as period,
        COUNT(*) as enrollments,
        COUNT(DISTINCT e.user_id) as unique_users,
        COUNT(DISTINCT pu.partner_id) as partners_active
      FROM lms_enrollments e
      INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
      INNER JOIN partners p ON p.id = pu.partner_id
      WHERE e.enrolled_at >= DATE_SUB(CURDATE(), INTERVAL ${interval})
        AND e.enrolled_at IS NOT NULL
        AND ${filterClause}
      GROUP BY DATE_FORMAT(e.enrolled_at, '${dateFormat}')
      ORDER BY period ASC
    `;

    // Get completion/certification activity timeline  
    const completionSql = `
      SELECT 
        DATE_FORMAT(e.completed_at, '${dateFormat}') as period,
        COUNT(*) as completions,
        COUNT(DISTINCT CASE WHEN co.npcu_value > 0 THEN e.id END) as certifications,
        SUM(CASE WHEN co.npcu_value > 0 THEN co.npcu_value ELSE 0 END) as npcu_earned,
        COUNT(DISTINCT e.user_id) as unique_completers,
        COUNT(DISTINCT pu.partner_id) as partners_completing
      FROM lms_enrollments e
      INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
      INNER JOIN partners p ON p.id = pu.partner_id
      LEFT JOIN lms_courses co ON co.id = e.course_id
      WHERE e.completed_at >= DATE_SUB(CURDATE(), INTERVAL ${interval})
        AND e.completed_at IS NOT NULL
        AND e.status = 'completed'
        AND ${filterClause}
      GROUP BY DATE_FORMAT(e.completed_at, '${dateFormat}')
      ORDER BY period ASC
    `;

    // Get partner-level activity for anomaly detection
    const partnerActivitySql = `
      SELECT 
        p.id as partner_id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.country,
        p.account_owner,
        DATE_FORMAT(e.completed_at, '${dateFormat}') as period,
        COUNT(*) as completions,
        COUNT(DISTINCT CASE WHEN co.npcu_value > 0 THEN e.id END) as certifications
      FROM lms_enrollments e
      INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
      INNER JOIN partners p ON p.id = pu.partner_id
      LEFT JOIN lms_courses co ON co.id = e.course_id
      WHERE e.completed_at >= DATE_SUB(CURDATE(), INTERVAL ${interval})
        AND e.completed_at IS NOT NULL
        AND e.status = 'completed'
        AND ${filterClause}
      GROUP BY p.id, p.account_name, p.partner_tier, p.account_region, p.country, p.account_owner,
               DATE_FORMAT(e.completed_at, '${dateFormat}')
      ORDER BY period ASC, completions DESC
    `;

    const [enrollments, completions, partnerActivity] = await Promise.all([
      query(enrollmentSql, [...filterParams]),
      query(completionSql, [...filterParams]),
      query(partnerActivitySql, [...filterParams])
    ]);

    // Merge enrollment and completion data by period
    const periodMap = new Map();
    
    enrollments.forEach(e => {
      periodMap.set(e.period, {
        period: e.period,
        enrollments: e.enrollments,
        unique_enrollers: e.unique_users,
        partners_enrolling: e.partners_active,
        completions: 0,
        certifications: 0,
        npcu_earned: 0,
        unique_completers: 0,
        partners_completing: 0
      });
    });

    completions.forEach(c => {
      if (periodMap.has(c.period)) {
        const existing = periodMap.get(c.period);
        existing.completions = c.completions;
        existing.certifications = c.certifications;
        existing.npcu_earned = parseInt(c.npcu_earned) || 0;
        existing.unique_completers = c.unique_completers;
        existing.partners_completing = c.partners_completing;
      } else {
        periodMap.set(c.period, {
          period: c.period,
          enrollments: 0,
          unique_enrollers: 0,
          partners_enrolling: 0,
          completions: c.completions,
          certifications: c.certifications,
          npcu_earned: parseInt(c.npcu_earned) || 0,
          unique_completers: c.unique_completers,
          partners_completing: c.partners_completing
        });
      }
    });

    // Convert to sorted array and calculate trends
    const timeline = Array.from(periodMap.values()).sort((a, b) => a.period.localeCompare(b.period));
    
    // Calculate moving averages and anomaly scores
    for (let i = 0; i < timeline.length; i++) {
      const current = timeline[i];
      
      // Calculate 3-period moving average
      if (i >= 2) {
        const prev3 = timeline.slice(i - 2, i + 1);
        current.enrollments_ma3 = Math.round(prev3.reduce((sum, p) => sum + p.enrollments, 0) / 3);
        current.completions_ma3 = Math.round(prev3.reduce((sum, p) => sum + p.completions, 0) / 3);
        current.certifications_ma3 = Math.round(prev3.reduce((sum, p) => sum + p.certifications, 0) / 3);
      }
      
      // Calculate period-over-period change
      if (i > 0) {
        const prev = timeline[i - 1];
        current.enrollments_change = current.enrollments - prev.enrollments;
        current.completions_change = current.completions - prev.completions;
        current.certifications_change = current.certifications - prev.certifications;
        
        // Calculate percentage change
        current.enrollments_pct = prev.enrollments > 0 
          ? Math.round((current.enrollments_change / prev.enrollments) * 100) 
          : null;
        current.completions_pct = prev.completions > 0 
          ? Math.round((current.completions_change / prev.completions) * 100) 
          : null;
        current.certifications_pct = prev.certifications > 0 
          ? Math.round((current.certifications_change / prev.certifications) * 100) 
          : null;
      }
    }

    // Calculate anomalies (significant deviations from average)
    const avgEnrollments = timeline.reduce((sum, p) => sum + p.enrollments, 0) / timeline.length;
    const avgCompletions = timeline.reduce((sum, p) => sum + p.completions, 0) / timeline.length;
    const avgCertifications = timeline.reduce((sum, p) => sum + p.certifications, 0) / timeline.length;

    // Standard deviation
    const stdEnrollments = Math.sqrt(timeline.reduce((sum, p) => sum + Math.pow(p.enrollments - avgEnrollments, 2), 0) / timeline.length);
    const stdCompletions = Math.sqrt(timeline.reduce((sum, p) => sum + Math.pow(p.completions - avgCompletions, 2), 0) / timeline.length);
    const stdCertifications = Math.sqrt(timeline.reduce((sum, p) => sum + Math.pow(p.certifications - avgCertifications, 2), 0) / timeline.length);

    // Mark anomalies (> 1.5 std from mean)
    const anomalies = [];
    timeline.forEach(p => {
      p.isAnomalyEnrollments = stdEnrollments > 0 && Math.abs(p.enrollments - avgEnrollments) > 1.5 * stdEnrollments;
      p.isAnomalyCompletions = stdCompletions > 0 && Math.abs(p.completions - avgCompletions) > 1.5 * stdCompletions;
      p.isAnomalyCertifications = stdCertifications > 0 && Math.abs(p.certifications - avgCertifications) > 1.5 * stdCertifications;
      
      if (p.isAnomalyEnrollments || p.isAnomalyCompletions || p.isAnomalyCertifications) {
        anomalies.push({
          period: p.period,
          type: p.isAnomalyEnrollments ? 'enrollments' : p.isAnomalyCompletions ? 'completions' : 'certifications',
          direction: (p.isAnomalyEnrollments && p.enrollments > avgEnrollments) ||
                     (p.isAnomalyCompletions && p.completions > avgCompletions) ||
                     (p.isAnomalyCertifications && p.certifications > avgCertifications) ? 'spike' : 'drop',
          value: p.isAnomalyEnrollments ? p.enrollments : p.isAnomalyCompletions ? p.completions : p.certifications
        });
      }
    });

    // Aggregate partner activity to find most/least active
    const partnerTotals = new Map();
    partnerActivity.forEach(pa => {
      if (!partnerTotals.has(pa.partner_id)) {
        partnerTotals.set(pa.partner_id, {
          partner_id: pa.partner_id,
          account_name: pa.account_name,
          partner_tier: pa.partner_tier,
          account_region: pa.account_region,
          country: pa.country,
          account_owner: pa.account_owner,
          total_completions: 0,
          total_certifications: 0,
          active_periods: 0,
          last_active: null,
          periods: []
        });
      }
      const partner = partnerTotals.get(pa.partner_id);
      partner.total_completions += pa.completions;
      partner.total_certifications += pa.certifications;
      partner.active_periods++;
      partner.periods.push({ period: pa.period, completions: pa.completions, certifications: pa.certifications });
      if (!partner.last_active || pa.period > partner.last_active) {
        partner.last_active = pa.period;
      }
    });

    const partnerSummary = Array.from(partnerTotals.values());
    
    // Find partners with declining activity (recent periods lower than earlier)
    const decliningPartners = partnerSummary.filter(p => {
      if (p.periods.length < 3) return false;
      const sorted = [...p.periods].sort((a, b) => a.period.localeCompare(b.period));
      const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
      const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
      const firstAvg = firstHalf.reduce((sum, x) => sum + x.completions, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, x) => sum + x.completions, 0) / secondHalf.length;
      return secondAvg < firstAvg * 0.5; // 50% decline
    }).sort((a, b) => b.total_completions - a.total_completions).slice(0, 10);

    // Find partners with surging activity
    const surgingPartners = partnerSummary.filter(p => {
      if (p.periods.length < 3) return false;
      const sorted = [...p.periods].sort((a, b) => a.period.localeCompare(b.period));
      const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
      const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
      const firstAvg = firstHalf.reduce((sum, x) => sum + x.completions, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, x) => sum + x.completions, 0) / secondHalf.length;
      return secondAvg > firstAvg * 1.5; // 50% increase
    }).sort((a, b) => b.total_completions - a.total_completions).slice(0, 10);

    // Regional activity breakdown
    const regionalActivity = new Map();
    partnerActivity.forEach(pa => {
      const key = pa.account_region || 'Unknown';
      if (!regionalActivity.has(key)) {
        regionalActivity.set(key, { 
          region: key, 
          completions: 0, 
          certifications: 0, 
          partners: new Set(),
          topPartners: []
        });
      }
      const region = regionalActivity.get(key);
      region.completions += pa.completions;
      region.certifications += pa.certifications;
      region.partners.add(pa.partner_id);
    });

    // Calculate additional regional metrics and top partners per region
    const regionalSummary = Array.from(regionalActivity.values())
      .map(r => {
        const partnerCount = r.partners.size;
        return {
          region: r.region,
          partners: partnerCount,
          completions: r.completions,
          certifications: r.certifications,
          avgCompletionsPerPartner: partnerCount > 0 ? Math.round(r.completions / partnerCount * 10) / 10 : 0,
          avgCertsPerPartner: partnerCount > 0 ? Math.round(r.certifications / partnerCount * 10) / 10 : 0,
          certificationRate: r.completions > 0 ? Math.round((r.certifications / r.completions) * 100) : 0
        };
      })
      .sort((a, b) => b.completions - a.completions);

    // Get top partners by region
    const topPartnersByRegion = {};
    partnerSummary.forEach(p => {
      const region = p.account_region || 'Unknown';
      if (!topPartnersByRegion[region]) {
        topPartnersByRegion[region] = [];
      }
      topPartnersByRegion[region].push({
        partner_id: p.partner_id,
        account_name: p.account_name,
        partner_tier: p.partner_tier,
        total_completions: p.total_completions,
        total_certifications: p.total_certifications
      });
    });
    // Sort and limit to top 5 per region
    Object.keys(topPartnersByRegion).forEach(region => {
      topPartnersByRegion[region] = topPartnersByRegion[region]
        .sort((a, b) => b.total_certifications - a.total_certifications)
        .slice(0, 5);
    });

    // Get NPCU by region from completion data (must be before regionalNpcuTotals calculation)
    const regionalNpcuSql = `
      SELECT 
        p.account_region as region,
        DATE_FORMAT(e.completed_at, '${dateFormat}') as period,
        SUM(CASE WHEN co.npcu_value > 0 THEN co.npcu_value ELSE 0 END) as npcu_earned
      FROM lms_enrollments e
      INNER JOIN (${partnerUserSubquery}) pu ON pu.user_id = e.user_id
      INNER JOIN partners p ON p.id = pu.partner_id
      LEFT JOIN lms_courses co ON co.id = e.course_id
      WHERE e.completed_at >= DATE_SUB(CURDATE(), INTERVAL ${interval})
        AND e.completed_at IS NOT NULL
        AND e.status = 'completed'
        AND ${filterClause}
      GROUP BY p.account_region, DATE_FORMAT(e.completed_at, '${dateFormat}')
      ORDER BY period ASC
    `;
    const regionalNpcu = await query(regionalNpcuSql, [...filterParams]);

    // Calculate regional NPCU totals
    const regionalNpcuTotals = {};
    regionalNpcu.forEach(rn => {
      const region = rn.region || 'Unknown';
      if (!regionalNpcuTotals[region]) {
        regionalNpcuTotals[region] = 0;
      }
      regionalNpcuTotals[region] += parseInt(rn.npcu_earned) || 0;
    });

    // Add NPCU to regional summary
    regionalSummary.forEach(r => {
      r.npcu = regionalNpcuTotals[r.region] || 0;
      r.avgNpcuPerPartner = r.partners > 0 ? Math.round(r.npcu / r.partners * 10) / 10 : 0;
    });

    // Build regional timeline for trend lines (certifications and NPCU by region over time)
    const regionalTimelineMap = new Map();
    partnerActivity.forEach(pa => {
      const regionKey = pa.account_region || 'Unknown';
      if (!regionalTimelineMap.has(regionKey)) {
        regionalTimelineMap.set(regionKey, new Map());
      }
      const regionPeriods = regionalTimelineMap.get(regionKey);
      if (!regionPeriods.has(pa.period)) {
        regionPeriods.set(pa.period, { period: pa.period, certifications: 0, completions: 0, npcu_earned: 0 });
      }
      const periodData = regionPeriods.get(pa.period);
      periodData.certifications += pa.certifications || 0;
      periodData.completions += pa.completions || 0;
    });

    // Merge NPCU into regional timeline
    regionalNpcu.forEach(rn => {
      const regionKey = rn.region || 'Unknown';
      if (!regionalTimelineMap.has(regionKey)) {
        regionalTimelineMap.set(regionKey, new Map());
      }
      const regionPeriods = regionalTimelineMap.get(regionKey);
      if (!regionPeriods.has(rn.period)) {
        regionPeriods.set(rn.period, { period: rn.period, certifications: 0, completions: 0, npcu_earned: 0 });
      }
      const periodData = regionPeriods.get(rn.period);
      periodData.npcu_earned = parseInt(rn.npcu_earned) || 0;
    });

    // Convert to final regional timeline structure
    const regionalTimeline = {};
    regionalTimelineMap.forEach((periods, regionKey) => {
      regionalTimeline[regionKey] = Array.from(periods.values()).sort((a, b) => a.period.localeCompare(b.period));
    });

    // Merge regional data into main timeline for proper chart alignment
    timeline.forEach(t => {
      // Add regional certifications
      Object.keys(regionalTimeline).forEach(regionKey => {
        const regionData = regionalTimeline[regionKey].find(r => r.period === t.period);
        const safeKey = regionKey.replace(/\s+/g, '_'); // Replace spaces with underscores
        t[`cert_${safeKey}`] = regionData?.certifications || 0;
        t[`npcu_${safeKey}`] = regionData?.npcu_earned || 0;
      });
    });

    // Calculate linear trend lines for certifications and NPCU
    const calcTrendLine = (data, field) => {
      const n = data.length;
      if (n < 2) return data.map(() => null);
      
      const values = data.map(d => d[field] || 0);
      const sumX = (n * (n - 1)) / 2;
      const sumY = values.reduce((a, b) => a + b, 0);
      const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
      const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      return data.map((_, i) => Math.round(intercept + slope * i));
    };

    const certTrend = calcTrendLine(timeline, 'certifications');
    const npcuTrend = calcTrendLine(timeline, 'npcu_earned');
    
    timeline.forEach((t, i) => {
      t.certifications_trend = certTrend[i];
      t.npcu_trend = npcuTrend[i];
    });

    // Summary stats
    const totalEnrollments = timeline.reduce((sum, p) => sum + p.enrollments, 0);
    const totalCompletions = timeline.reduce((sum, p) => sum + p.completions, 0);
    const totalCertifications = timeline.reduce((sum, p) => sum + p.certifications, 0);
    const totalNpcu = timeline.reduce((sum, p) => sum + (p.npcu_earned || 0), 0);

    res.json({
      summary: {
        totalEnrollments,
        totalCompletions,
        totalCertifications,
        totalNpcu,
        avgEnrollments: Math.round(avgEnrollments),
        avgCompletions: Math.round(avgCompletions),
        avgCertifications: Math.round(avgCertifications),
        periodsAnalyzed: timeline.length,
        granularity,
        dateLabel
      },
      timeline,
      regionalTimeline,
      anomalies,
      insights: {
        decliningPartners,
        surgingPartners,
        regionalSummary,
        topPartnersByRegion
      }
    });
  } catch (error) {
    console.error('Activity timeline error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Partner Users Report with Detailed Stats
// ============================================

router.get('/partner-users', async (req, res) => {
  try {
    const { partnerId, tier, region, owner, search, sortBy = 'total_npcu', sortDir = 'DESC', limit = 50, offset = 0 } = req.query;
    
    // Build WHERE conditions for partner filters
    let partnerConditions = ['p.is_active = TRUE'];
    const partnerParams = [];

    if (partnerId) {
      partnerConditions.push('p.id = ?');
      partnerParams.push(partnerId);
    }
    if (tier) {
      partnerConditions.push('p.partner_tier = ?');
      partnerParams.push(tier);
    }
    if (region) {
      partnerConditions.push('p.account_region = ?');
      partnerParams.push(region);
    }
    if (owner) {
      partnerConditions.push('p.account_owner = ?');
      partnerParams.push(owner);
    }

    // Build search condition (applies to outer query)
    let searchCondition = '';
    const searchParams = [];
    if (search) {
      searchCondition = 'AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR p.account_name LIKE ?)';
      const term = `%${search}%`;
      searchParams.push(term, term, term, term);
    }

    // Subquery to get ONE partner per user (pick partner with lowest ID for consistency)
    // This prevents users from appearing multiple times if they're in multiple partner groups
    const userPartnerSubquery = `
      SELECT 
        gm.user_id,
        MIN(p.id) as partner_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id AND g.partner_id IS NOT NULL
      INNER JOIN partners p ON p.id = g.partner_id
      WHERE ${partnerConditions.join(' AND ')}
      GROUP BY gm.user_id
    `;

    // Get total count first (unique users)
    const countSql = `
      SELECT COUNT(DISTINCT up.user_id) as total
      FROM (${userPartnerSubquery}) up
      INNER JOIN lms_users u ON u.id = up.user_id
      INNER JOIN partners p ON p.id = up.partner_id
      WHERE 1=1 ${searchCondition}
    `;
    const countParams = [...partnerParams, ...searchParams];
    const [countResult] = await query(countSql, countParams);
    const total = countResult?.total || 0;

    // Validate sort column
    const validSortColumns = ['email', 'first_name', 'last_name', 'account_name', 'partner_tier', 'enrollments', 'completions', 'certifications', 'total_npcu', 'expired_certs', 'last_activity'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'total_npcu';
    const sortDirection = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Main query with stats - each user appears only once
    // Calculate expiry: GTM = 12 months, others = 24 months from completion
    const sql = `
      SELECT 
        u.id as user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.status as lms_status,
        u.created_at_lms as registered_at,
        p.id as partner_id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        COUNT(DISTINCT e.id) as enrollments,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.id END) as completions,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' AND co.npcu_value > 0 THEN e.id END) as certifications,
        COALESCE(SUM(CASE 
          WHEN e.status = 'completed' AND co.npcu_value > 0 AND (
            COALESCE(e.expires_at, DATE_ADD(e.completed_at, INTERVAL IF(co.certification_category = 'go_to_market', 12, 24) MONTH)) > NOW()
          ) THEN co.npcu_value 
          ELSE 0 
        END), 0) as total_npcu,
        COUNT(DISTINCT CASE 
          WHEN e.status = 'completed' AND co.npcu_value > 0 AND (
            COALESCE(e.expires_at, DATE_ADD(e.completed_at, INTERVAL IF(co.certification_category = 'go_to_market', 12, 24) MONTH)) < NOW()
          ) THEN e.id 
        END) as expired_certs,
        MAX(e.completed_at) as last_activity
      FROM (${userPartnerSubquery}) up
      INNER JOIN lms_users u ON u.id = up.user_id
      INNER JOIN partners p ON p.id = up.partner_id
      LEFT JOIN lms_enrollments e ON e.user_id = u.id
      LEFT JOIN lms_courses co ON co.id = e.course_id
      WHERE 1=1 ${searchCondition}
      GROUP BY u.id, u.email, u.first_name, u.last_name, u.status, u.created_at_lms,
               p.id, p.account_name, p.partner_tier, p.account_region, p.account_owner
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT ? OFFSET ?
    `;
    const mainParams = [...partnerParams, ...searchParams, parseInt(limit), parseInt(offset)];

    const results = await query(sql, mainParams);
    
    res.json({
      data: results,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Partner users report error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get detailed stats for a specific user
router.get('/partner-users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user info
    const [user] = await query(`
      SELECT 
        u.id as user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.status as lms_status,
        u.created_at_lms as registered_at,
        p.id as partner_id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner
      FROM lms_users u
      INNER JOIN lms_group_members gm ON gm.user_id = u.id
      INNER JOIN lms_groups g ON g.id = gm.group_id AND g.partner_id IS NOT NULL
      INNER JOIN partners p ON p.id = g.partner_id
      WHERE u.id = ?
      LIMIT 1
    `, [userId]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get all enrollments with course details
    // Calculate expiry: GTM = 12 months, others = 24 months from completion
    const enrollments = await query(`
      SELECT 
        e.id,
        e.status,
        e.progress_percent,
        e.completed_at,
        COALESCE(
          e.expires_at,
          CASE 
            WHEN e.status = 'completed' AND e.completed_at IS NOT NULL THEN
              DATE_ADD(e.completed_at, INTERVAL IF(co.certification_category = 'go_to_market', 12, 24) MONTH)
            ELSE NULL
          END
        ) as expires_at,
        co.id as course_id,
        co.name as course_name,
        co.npcu_value,
        co.is_certification,
        co.certification_category,
        CASE 
          WHEN e.status = 'completed' AND co.npcu_value > 0 AND (
            COALESCE(e.expires_at, DATE_ADD(e.completed_at, INTERVAL IF(co.certification_category = 'go_to_market', 12, 24) MONTH)) < NOW()
          ) THEN 'expired'
          WHEN e.status = 'completed' THEN 'completed'
          ELSE 'in_progress'
        END as cert_status
      FROM lms_enrollments e
      INNER JOIN lms_courses co ON co.id = e.course_id
      WHERE e.user_id = ?
      ORDER BY e.completed_at DESC, co.name
    `, [userId]);
    
    // Calculate summary stats
    const stats = {
      total_enrollments: enrollments.length,
      completions: enrollments.filter(e => e.status === 'completed').length,
      certifications: enrollments.filter(e => e.status === 'completed' && e.npcu_value > 0).length,
      active_npcu: enrollments
        .filter(e => e.status === 'completed' && (e.expires_at === null || new Date(e.expires_at) > new Date()))
        .reduce((sum, e) => sum + (e.npcu_value || 0), 0),
      expired_certs: enrollments.filter(e => e.cert_status === 'expired').length,
      in_progress: enrollments.filter(e => e.status !== 'completed').length
    };
    
    res.json({
      user,
      stats,
      enrollments
    });
  } catch (error) {
    console.error('User details error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send user report email
router.post('/partner-users/:userId/send-report', async (req, res) => {
  try {
    const { userId } = req.params;
    const { ccEmail } = req.body;
    const { sendEmail } = require('../db/notificationService.cjs');
    
    // Get user details
    const [user] = await query(`
      SELECT 
        u.id as user_id,
        u.email,
        u.first_name,
        u.last_name,
        p.account_name,
        p.partner_tier
      FROM lms_users u
      INNER JOIN lms_group_members gm ON gm.user_id = u.id
      INNER JOIN lms_groups g ON g.id = gm.group_id AND g.partner_id IS NOT NULL
      INNER JOIN partners p ON p.id = g.partner_id
      WHERE u.id = ?
      LIMIT 1
    `, [userId]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get enrollments
    const enrollments = await query(`
      SELECT 
        e.status,
        e.completed_at,
        e.expires_at,
        co.name as course_name,
        co.npcu_value,
        CASE 
          WHEN e.expires_at IS NOT NULL AND e.expires_at < NOW() THEN 'expired'
          WHEN e.status = 'completed' THEN 'completed'
          ELSE 'in_progress'
        END as cert_status
      FROM lms_enrollments e
      INNER JOIN lms_courses co ON co.id = e.course_id
      WHERE e.user_id = ?
      ORDER BY e.completed_at DESC
    `, [userId]);
    
    // Build email HTML
    const completedCerts = enrollments.filter(e => e.status === 'completed' && e.npcu_value > 0);
    const expiredCerts = enrollments.filter(e => e.cert_status === 'expired');
    const activeNpcu = completedCerts
      .filter(e => e.cert_status !== 'expired')
      .reduce((sum, e) => sum + (e.npcu_value || 0), 0);
    
    const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #6B4C9A 0%, #FF6B35 100%); padding: 30px; border-radius: 12px 12px 0 0; color: white;">
          <h1 style="margin: 0; font-size: 24px;">Learning Progress Report</h1>
          <p style="margin: 10px 0 0; opacity: 0.9;">Nintex Partner Portal</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 25px; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 20px;">Hello <strong>${user.first_name || 'Partner'}</strong>,</p>
          <p style="margin: 0 0 25px;">Here is your current learning progress summary:</p>
          
          <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 15px; color: #333;">📊 Your Stats</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666;">Partner:</td>
                <td style="padding: 8px 0; font-weight: 600;">${user.account_name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Total Courses Completed:</td>
                <td style="padding: 8px 0; font-weight: 600;">${enrollments.filter(e => e.status === 'completed').length}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Active Certifications:</td>
                <td style="padding: 8px 0; font-weight: 600; color: #28a745;">${completedCerts.filter(c => c.cert_status !== 'expired').length}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Active NPCU:</td>
                <td style="padding: 8px 0; font-weight: 600; color: #FF6B35;">${activeNpcu}</td>
              </tr>
              ${expiredCerts.length > 0 ? `
              <tr>
                <td style="padding: 8px 0; color: #dc3545;">Expired Certifications:</td>
                <td style="padding: 8px 0; font-weight: 600; color: #dc3545;">${expiredCerts.length}</td>
              </tr>` : ''}
            </table>
          </div>
          
          ${completedCerts.length > 0 ? `
          <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 15px; color: #333;">🏆 Your Certifications</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background: #f1f1f1;">
                  <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Course</th>
                  <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">NPCU</th>
                  <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Status</th>
                  <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Expires</th>
                </tr>
              </thead>
              <tbody>
                ${completedCerts.map(cert => `
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #eee;">${cert.course_name}</td>
                  <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">${cert.npcu_value}</td>
                  <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">
                    <span style="padding: 2px 8px; border-radius: 4px; font-size: 12px; ${cert.cert_status === 'expired' ? 'background: #f8d7da; color: #721c24;' : 'background: #d4edda; color: #155724;'}">
                      ${cert.cert_status === 'expired' ? 'Expired' : 'Active'}
                    </span>
                  </td>
                  <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee; ${cert.cert_status === 'expired' ? 'color: #dc3545;' : ''}">
                    ${cert.expires_at ? new Date(cert.expires_at).toLocaleDateString() : 'Never'}
                  </td>
                </tr>
                `).join('')}
              </tbody>
            </table>
          </div>` : ''}
          
          ${expiredCerts.length > 0 ? `
          <div style="background: #fff3cd; border-radius: 8px; padding: 15px; border-left: 4px solid #856404; margin-bottom: 20px;">
            <p style="margin: 0; color: #856404;">
              <strong>⚠️ Action Required:</strong> You have ${expiredCerts.length} expired certification(s). 
              Please log in to Northpass to renew them and maintain your NPCU standing.
            </p>
          </div>` : ''}
          
          <div style="text-align: center; margin-top: 25px;">
            <a href="https://learn.nintex.com" style="display: inline-block; background: linear-gradient(135deg, #FF6B35 0%, #E55A2B 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600;">
              Continue Learning →
            </a>
          </div>
          
          <p style="margin: 25px 0 0; color: #666; font-size: 12px; text-align: center;">
            This report was generated by the Nintex Partner Portal on ${new Date().toLocaleDateString()}.
          </p>
        </div>
      </div>
    `;
    
    const result = await sendEmail(
      user.email,
      `Your Learning Progress Report - ${user.account_name}`,
      htmlContent,
      '',
      ccEmail || ''
    );
    
    res.json({
      success: true,
      message: `Report sent to ${user.email}${ccEmail ? ` (CC: ${ccEmail})` : ''}`,
      ...result
    });
  } catch (error) {
    console.error('Send report error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send bulk reports to multiple users
router.post('/partner-users/send-bulk-reports', async (req, res) => {
  try {
    const { userIds, ccEmail } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    
    const results = [];
    for (const userId of userIds) {
      try {
        // Reuse the single user endpoint logic
        const response = await new Promise((resolve, reject) => {
          const mockReq = { params: { userId }, body: { ccEmail } };
          const mockRes = {
            json: (data) => resolve(data),
            status: () => ({ json: (data) => reject(data) })
          };
          // Call the handler directly - simplified approach
        });
        results.push({ userId, success: true });
      } catch (err) {
        results.push({ userId, success: false, error: err.message });
      }
    }
    
    // For bulk, send emails one by one
    const { sendEmail } = require('../db/notificationService.cjs');
    const sentResults = [];
    
    for (const userId of userIds) {
      try {
        // Get user
        const [user] = await query(`
          SELECT u.id, u.email, u.first_name, u.last_name, p.account_name
          FROM lms_users u
          INNER JOIN lms_group_members gm ON gm.user_id = u.id
          INNER JOIN lms_groups g ON g.id = gm.group_id AND g.partner_id IS NOT NULL
          INNER JOIN partners p ON p.id = g.partner_id
          WHERE u.id = ?
          LIMIT 1
        `, [userId]);
        
        if (user) {
          // Simplified email for bulk
          const htmlContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2 style="color: #6B4C9A;">Learning Progress Update</h2>
              <p>Hello ${user.first_name || 'Partner'},</p>
              <p>This is a reminder to review your learning progress on the Nintex Partner Portal.</p>
              <p>Visit <a href="https://learn.nintex.com">learn.nintex.com</a> to view your certifications and continue learning.</p>
              <p style="color: #666; font-size: 12px;">- Nintex Partner Team</p>
            </div>
          `;
          
          await sendEmail(
            user.email,
            `Learning Progress Update - ${user.account_name}`,
            htmlContent,
            '',
            ccEmail || ''
          );
          sentResults.push({ userId, email: user.email, success: true });
        }
      } catch (err) {
        sentResults.push({ userId, success: false, error: err.message });
      }
    }
    
    res.json({
      success: true,
      sent: sentResults.filter(r => r.success).length,
      failed: sentResults.filter(r => !r.success).length,
      results: sentResults
    });
  } catch (error) {
    console.error('Bulk send error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Partner User List for PAM Export
// ============================================

// Get all users for a specific partner with CRM and LMS status
router.get('/partner-users-export/:partnerId', async (req, res) => {
  try {
    const { partnerId } = req.params;

    // Get partner info
    const [partner] = await query(`
      SELECT id, account_name, partner_tier, account_region, account_owner, is_active
      FROM partners WHERE id = ?
    `, [partnerId]);

    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    // Get all contacts/users for this partner with their CRM and LMS status
    // OPTIMIZED: Use LEFT JOIN with aggregation instead of correlated subqueries
    const users = await query(`
      SELECT
        c.id as contact_id,
        c.email,
        c.first_name,
        c.last_name,
        CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, '')) as full_name,
        c.title,
        c.is_active as crm_active,
        c.impartner_id,
        c.lms_user_id,
        u.id as lms_id,
        u.email as lms_email,
        u.status as lms_status,
        u.is_active as lms_active,
        u.deactivated_at as lms_deactivated_at,
        u.last_active_at,
        u.created_at_lms as lms_created_at,
        COALESCE(cert_stats.npcu_earned, 0) as npcu_earned,
        COALESCE(cert_stats.certifications, 0) as certifications
      FROM contacts c
      LEFT JOIN lms_users u ON u.id = c.lms_user_id
      LEFT JOIN (
        SELECT
          e.user_id,
          SUM(CASE WHEN course.npcu_value > 0 THEN course.npcu_value ELSE 0 END) as npcu_earned,
          COUNT(CASE WHEN course.is_certification = 1 THEN 1 END) as certifications
        FROM lms_enrollments e
        JOIN lms_courses course ON course.id = e.course_id
        WHERE e.status = 'completed'
          AND (e.expires_at IS NULL OR e.expires_at > NOW())
        GROUP BY e.user_id
      ) cert_stats ON cert_stats.user_id = u.id
      WHERE c.partner_id = ?
      ORDER BY c.last_name, c.first_name
    `, [partnerId]);

    // Format statuses for readability
    const formattedUsers = users.map(user => ({
      ...user,
      crm_status: user.crm_active ? 'Active' : 'Inactive',
      lms_status_display: !user.lms_id
        ? 'Not Registered'
        : (user.lms_active ? 'Active' : 'Deactivated'),
      in_lms: !!user.lms_id
    }));

    res.json({
      partner,
      users: formattedUsers,
      summary: {
        total: users.length,
        crmActive: users.filter(u => u.crm_active).length,
        crmInactive: users.filter(u => !u.crm_active).length,
        inLms: users.filter(u => u.lms_id).length,
        lmsActive: users.filter(u => u.lms_id && u.lms_active).length,
        lmsDeactivated: users.filter(u => u.lms_id && !u.lms_active).length,
        notInLms: users.filter(u => !u.lms_id).length
      }
    });
  } catch (error) {
    console.error('Partner users export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Regional Leaderboard with Smart Ranking
// Use case: Find partners with specific expertise (e.g., K2 in Germany)
// Formula: Score = CategoryCerts × sqrt(CertRate) × ln(TotalUsers + 10)
// ============================================

router.get('/regional-leaderboard', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const { region, country, category, tier, limit = 50 } = req.query;
    const cacheKey = `regional-leaderboard-${region || 'all'}-${country || 'all'}-${category || 'all'}-${tier || 'all'}`;

    if (!forceRefresh && isCacheValid(cacheKey)) {
      return res.json(reportCache[cacheKey].data);
    }

    // Build WHERE conditions
    let conditions = ['p.is_active = TRUE'];
    const params = [];

    if (region) {
      conditions.push('p.account_region = ?');
      params.push(region);
    }
    if (country) {
      conditions.push('p.country = ?');
      params.push(country);
    }
    if (tier) {
      conditions.push('p.partner_tier = ?');
      params.push(tier);
    }

    const whereClause = conditions.join(' AND ');

    // Main query with certification category breakdown
    // Uses partner's denormalized cert counts for speed, with category breakdown from enrollments
    const sql = `
      SELECT
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.country,
        p.account_owner,
        -- User counts
        (SELECT COUNT(*) FROM contacts ct WHERE ct.partner_id = p.id AND ct.is_active = TRUE) as crm_users,
        COALESCE(g.user_count, 0) as lms_users,
        -- Overall stats from cache
        COALESCE(nc.active_npcu, 0) as total_npcu,
        COALESCE(nc.total_certifications, 0) as total_certs,
        COALESCE(nc.certified_users, 0) as certified_users,
        -- Denormalized category counts from partners table (fast)
        COALESCE(p.cert_count_nintex_ce, 0) as ce_certs,
        COALESCE(p.cert_count_nintex_k2, 0) as k2_certs,
        COALESCE(p.cert_count_nintex_salesforce, 0) as salesforce_certs,
        COALESCE(p.cert_count_go_to_market, 0) as gtm_certs
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      LEFT JOIN partner_npcu_cache nc ON nc.partner_id = p.id
      WHERE ${whereClause}
    `;

    const partners = await query(sql, params);

    // Calculate smart scores for each partner
    const scoredPartners = partners.map(p => {
      const totalUsers = Math.max(p.crm_users, p.lms_users, 1); // At least 1 to avoid division by zero
      const certRate = p.certified_users / totalUsers;
      const scaleFactor = Math.log(totalUsers + 10); // Diminishing returns for size

      // Calculate category-specific scores
      const categoryScores = {
        ce: p.ce_certs * Math.sqrt(certRate) * scaleFactor,
        k2: p.k2_certs * Math.sqrt(certRate) * scaleFactor,
        salesforce: p.salesforce_certs * Math.sqrt(certRate) * scaleFactor,
        gtm: p.gtm_certs * Math.sqrt(certRate) * scaleFactor
      };

      // Overall score (sum of all category scores OR use specific category if filtered)
      let primaryScore;
      let categoryLabel = 'Overall';
      if (category) {
        const catKey = category.toLowerCase().replace('_', '');
        primaryScore = categoryScores[catKey] || categoryScores[category] || 0;
        categoryLabel = category;
      } else {
        primaryScore = categoryScores.ce + categoryScores.k2 + categoryScores.salesforce + categoryScores.gtm;
      }

      return {
        ...p,
        cert_rate: Math.round(certRate * 1000) / 10, // Percentage with 1 decimal
        scale_factor: Math.round(scaleFactor * 100) / 100,
        category_scores: categoryScores,
        score: Math.round(primaryScore * 100) / 100,
        score_category: categoryLabel
      };
    });

    // Sort by score descending and limit
    const sortedPartners = scoredPartners
      .filter(p => p.score > 0 || !category) // If category filtered, only show partners with that category
      .sort((a, b) => b.score - a.score)
      .slice(0, parseInt(limit));

    // Add rank
    sortedPartners.forEach((p, idx) => {
      p.rank = idx + 1;
    });

    // Build summary stats
    const summary = {
      total_partners: partners.length,
      partners_with_certs: partners.filter(p => p.total_certs > 0).length,
      avg_cert_rate: Math.round(
        (partners.reduce((sum, p) => sum + (p.certified_users / Math.max(p.crm_users, p.lms_users, 1)), 0) / partners.length) * 1000
      ) / 10,
      total_ce: partners.reduce((sum, p) => sum + p.ce_certs, 0),
      total_k2: partners.reduce((sum, p) => sum + p.k2_certs, 0),
      total_salesforce: partners.reduce((sum, p) => sum + p.salesforce_certs, 0),
      total_gtm: partners.reduce((sum, p) => sum + p.gtm_certs, 0),
      filters: { region, country, category, tier }
    };

    const result = {
      partners: sortedPartners,
      summary,
      scoring: {
        formula: 'Score = CategoryCerts × √(CertRate) × ln(TotalUsers + 10)',
        explanation: 'Balances absolute certification count with engagement rate and partner size'
      }
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (error) {
    console.error('Regional leaderboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get available countries for a region (for cascading filter)
router.get('/regional-leaderboard/countries', async (req, res) => {
  try {
    const { region } = req.query;

    let sql = `
      SELECT DISTINCT country, COUNT(*) as partner_count
      FROM partners
      WHERE is_active = TRUE
        AND country IS NOT NULL AND country != ''
    `;
    const params = [];

    if (region) {
      sql += ' AND account_region = ?';
      params.push(region);
    }

    sql += ' GROUP BY country ORDER BY partner_count DESC, country';

    const countries = await query(sql, params);
    res.json(countries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get category breakdown for a specific partner (detail view)
router.get('/regional-leaderboard/partner/:partnerId', async (req, res) => {
  try {
    const { partnerId } = req.params;

    // Get partner basic info
    const [partner] = await query(`
      SELECT
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.country,
        p.account_owner,
        p.primary_user_name,
        p.primary_user_email,
        (SELECT COUNT(*) FROM contacts ct WHERE ct.partner_id = p.id AND ct.is_active = TRUE) as crm_users,
        COALESCE(g.user_count, 0) as lms_users,
        COALESCE(nc.active_npcu, 0) as total_npcu,
        COALESCE(nc.total_certifications, 0) as total_certs,
        COALESCE(nc.certified_users, 0) as certified_users
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      LEFT JOIN partner_npcu_cache nc ON nc.partner_id = p.id
      WHERE p.id = ?
    `, [partnerId]);

    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    // Get detailed certification breakdown by category and course
    const certDetails = await query(`
      SELECT
        co.certification_category,
        co.name as course_name,
        co.npcu_value,
        COUNT(DISTINCT e.id) as completions,
        COUNT(DISTINCT e.user_id) as unique_users
      FROM lms_enrollments e
      INNER JOIN lms_courses co ON co.id = e.course_id AND co.npcu_value > 0
      INNER JOIN lms_group_members gm ON gm.user_id = e.user_id
      INNER JOIN lms_groups g ON g.id = gm.group_id AND g.partner_id = ?
      WHERE e.status = 'completed'
        AND (e.expires_at IS NULL OR e.expires_at > NOW())
      GROUP BY co.id, co.certification_category, co.name, co.npcu_value
      ORDER BY co.certification_category, completions DESC
    `, [partnerId]);

    // Group by category
    const byCategory = {};
    certDetails.forEach(cert => {
      const cat = cert.certification_category || 'other';
      if (!byCategory[cat]) {
        byCategory[cat] = {
          category: cat,
          total_certs: 0,
          total_npcu: 0,
          courses: []
        };
      }
      byCategory[cat].total_certs += cert.completions;
      byCategory[cat].total_npcu += cert.npcu_value * cert.completions;
      byCategory[cat].courses.push(cert);
    });

    // Get certified users list
    const certifiedUsers = await query(`
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        COUNT(DISTINCT e.id) as cert_count,
        SUM(co.npcu_value) as total_npcu
      FROM lms_users u
      INNER JOIN lms_group_members gm ON gm.user_id = u.id
      INNER JOIN lms_groups g ON g.id = gm.group_id AND g.partner_id = ?
      INNER JOIN lms_enrollments e ON e.user_id = u.id AND e.status = 'completed'
      INNER JOIN lms_courses co ON co.id = e.course_id AND co.npcu_value > 0
      WHERE (e.expires_at IS NULL OR e.expires_at > NOW())
      GROUP BY u.id
      ORDER BY total_npcu DESC
      LIMIT 20
    `, [partnerId]);

    res.json({
      partner,
      categories: Object.values(byCategory),
      top_certified_users: certifiedUsers
    });
  } catch (error) {
    console.error('Partner detail error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
