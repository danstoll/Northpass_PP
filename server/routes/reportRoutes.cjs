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
    const report = await query(`
      SELECT 
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        COUNT(DISTINCT c.id) as contact_count,
        COUNT(DISTINCT CASE WHEN c.lms_user_id IS NOT NULL THEN c.id END) as lms_users,
        SUM(CASE WHEN e.status = 'completed' AND c.npcu_value > 0 THEN c.npcu_value ELSE 0 END) as total_npcu,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' AND c.is_certification = 1 THEN e.id END) as certifications
      FROM partners p
      LEFT JOIN contacts ct ON ct.partner_id = p.id
      LEFT JOIN lms_users u ON u.id = ct.lms_user_id
      LEFT JOIN lms_enrollments e ON e.user_id = u.id
      LEFT JOIN lms_courses c ON c.id = e.course_id
      GROUP BY p.id
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
    if (!forceRefresh && isCacheValid('certification-gaps')) {
      return res.json(reportCache['certification-gaps'].data);
    }
    const { tier } = req.query;
    
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

    let sql = `
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        COALESCE(SUM(CASE WHEN e.status = 'completed' AND c.npcu_value > 0 THEN c.npcu_value ELSE 0 END), 0) as current_npcu
      FROM partners p
      LEFT JOIN contacts ct ON ct.partner_id = p.id
      LEFT JOIN lms_users u ON u.id = ct.lms_user_id
      LEFT JOIN lms_enrollments e ON e.user_id = u.id
      LEFT JOIN lms_courses c ON c.id = e.course_id
      WHERE 1=1
    `;
    const params = [];

    if (tier) {
      sql += ' AND p.partner_tier = ?';
      params.push(tier);
    }

    sql += ' GROUP BY p.id ORDER BY p.partner_tier, current_npcu';

    const results = await query(sql, params);
    const report = results.map(r => ({
      ...r,
      required_npcu: tierRequirements[r.partner_tier] || 0,
      npcu_gap: Math.max(0, (tierRequirements[r.partner_tier] || 0) - r.current_npcu)
    }));
    setCache('certification-gaps', report);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/partner-leaderboard', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCacheValid('partner-leaderboard')) {
      return res.json(reportCache['partner-leaderboard'].data);
    }
    const { tier, region, limit = 50 } = req.query;
    
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
      WHERE 1=1
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
    setCache('partner-leaderboard', results);
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
        u.id as lms_user_id,
        u.status as lms_status,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.id END) as completed_courses,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' AND co.is_certification = 1 THEN e.id END) as certifications,
        COALESCE(SUM(CASE WHEN e.status = 'completed' THEN co.npcu_value ELSE 0 END), 0) as total_npcu,
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

    sql += ' GROUP BY c.id, c.email, c.first_name, c.last_name, c.title, p.account_name, p.partner_tier, p.account_region, u.id, u.status';
    sql += ' ORDER BY total_npcu DESC, p.account_name';
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
        p.account_owner
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

    sql += ' ORDER BY p.partner_tier, p.account_name, c.last_name';
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
        COUNT(DISTINCT c.id) as contact_count
      FROM partners p
      LEFT JOIN contacts c ON c.partner_id = p.id
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE g.id IS NULL
      GROUP BY p.id
      ORDER BY p.partner_tier, p.account_name
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
    const owners = await query(`
      SELECT 
        p.account_owner,
        COUNT(DISTINCT p.id) as partner_count
      FROM partners p
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
        (SELECT COUNT(*) FROM contacts c WHERE c.partner_id = p.id) as contact_count,
        COALESCE(g.user_count, 0) as lms_users,
        COALESCE(nc.active_npcu, 0) as total_npcu,
        COALESCE(nc.total_certifications, 0) as active_certifications,
        g.id as group_id,
        g.name as group_name
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      LEFT JOIN partner_npcu_cache nc ON nc.partner_id = p.id
      WHERE p.account_owner = ?
      ORDER BY p.account_name
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
    
    const owners = await query(`
      SELECT DISTINCT account_owner as value 
      FROM partners 
      WHERE account_owner IS NOT NULL AND account_owner != ''
      ORDER BY account_owner
    `);

    res.json({ 
      tiers: tiers.map(t => t.value),
      regions: regions.map(r => r.value),
      owners: owners.map(o => o.value)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
