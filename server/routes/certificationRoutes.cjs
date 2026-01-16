/**
 * Certification Routes
 * Certification category management and partner certification stats
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db/connection.cjs');

// Valid certification categories
const CERT_CATEGORIES = ['nintex_ce', 'nintex_k2', 'nintex_salesforce', 'go_to_market'];
const CERT_CATEGORY_LABELS = {
  'nintex_ce': 'Nintex CE',
  'nintex_k2': 'Nintex Automation K2',
  'nintex_salesforce': 'Nintex for Salesforce',
  'go_to_market': 'Go To Market'
};

// ============================================
// Certification Category Management
// ============================================

// Get all certification courses with their categories
router.get('/courses', async (req, res) => {
  try {
    const courses = await query(`
      SELECT 
        c.id,
        c.name,
        c.npcu_value,
        c.certification_category,
        c.product_category,
        c.is_certification
      FROM lms_courses c
      WHERE c.npcu_value > 0
      ORDER BY c.certification_category, c.name
    `);
    
    const stats = await query(`
      SELECT 
        COALESCE(certification_category, 'uncategorized') as category,
        COUNT(*) as count,
        SUM(npcu_value) as total_npcu
      FROM lms_courses
      WHERE npcu_value > 0
      GROUP BY certification_category
    `);
    
    res.json({ 
      courses, 
      stats,
      categories: CERT_CATEGORIES,
      categoryLabels: CERT_CATEGORY_LABELS
    });
  } catch (error) {
    console.error('Error fetching certification courses:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get categorization rules
router.get('/rules', async (req, res) => {
  try {
    const rules = await query(`
      SELECT * FROM certification_category_rules
      ORDER BY priority DESC, pattern
    `);
    res.json({ rules, categories: CERT_CATEGORIES, categoryLabels: CERT_CATEGORY_LABELS });
  } catch (error) {
    console.error('Error fetching rules:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add a categorization rule
router.post('/rules', async (req, res) => {
  try {
    const { category, pattern, priority } = req.body;
    
    if (!CERT_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${CERT_CATEGORIES.join(', ')}` });
    }
    if (!pattern || pattern.trim().length === 0) {
      return res.status(400).json({ error: 'Pattern is required' });
    }
    
    await query(
      'INSERT INTO certification_category_rules (category, pattern, priority) VALUES (?, ?, ?)',
      [category, pattern.trim(), priority || 0]
    );
    
    res.json({ success: true, message: `Rule added: "${pattern}" → ${category}` });
  } catch (error) {
    console.error('Error adding rule:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a categorization rule
router.delete('/rules/:ruleId', async (req, res) => {
  try {
    const { ruleId } = req.params;
    await query('DELETE FROM certification_category_rules WHERE id = ?', [ruleId]);
    res.json({ success: true, message: 'Rule deleted' });
  } catch (error) {
    console.error('Error deleting rule:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manually set a course's category
router.put('/courses/:courseId/category', async (req, res) => {
  try {
    const { courseId } = req.params;
    const { category } = req.body;
    
    if (category && !CERT_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${CERT_CATEGORIES.join(', ')}` });
    }
    
    await query(
      'UPDATE lms_courses SET certification_category = ? WHERE id = ?',
      [category || null, courseId]
    );
    
    const [course] = await query('SELECT id, name, certification_category FROM lms_courses WHERE id = ?', [courseId]);
    res.json({ success: true, course });
  } catch (error) {
    console.error('Error updating course category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Apply categorization rules to all courses
router.post('/apply-rules', async (req, res) => {
  try {
    const rules = await query('SELECT * FROM certification_category_rules ORDER BY priority DESC');
    const courses = await query('SELECT id, name FROM lms_courses WHERE npcu_value > 0');
    
    let categorized = 0;
    let unchanged = 0;
    const results = [];
    
    for (const course of courses) {
      const courseName = course.name.toLowerCase();
      let matchedCategory = null;
      let matchedPattern = null;
      
      for (const rule of rules) {
        if (courseName.includes(rule.pattern.toLowerCase())) {
          matchedCategory = rule.category;
          matchedPattern = rule.pattern;
          break;
        }
      }
      
      if (matchedCategory) {
        await query('UPDATE lms_courses SET certification_category = ? WHERE id = ?', [matchedCategory, course.id]);
        results.push({ courseId: course.id, name: course.name, category: matchedCategory, pattern: matchedPattern });
        categorized++;
      } else {
        unchanged++;
      }
    }
    
    res.json({
      success: true,
      categorized,
      unchanged,
      total: courses.length,
      results: results.slice(0, 50)
    });
  } catch (error) {
    console.error('Error applying rules:', error);
    res.status(500).json({ error: error.message });
  }
});

// Calculate certification counts per partner
router.post('/calculate-partner-counts', async (req, res) => {
  try {
    const partners = await query(`
      SELECT p.id, p.account_name, g.id as group_id
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE p.partner_tier IS NOT NULL
    `);
    
    const results = {
      updated: 0,
      errors: [],
      samples: []
    };
    
    for (const partner of partners) {
      if (!partner.group_id) continue;
      
      try {
        const counts = await query(`
          SELECT 
            c.certification_category as category,
            COUNT(DISTINCT e.user_id) as user_count,
            COUNT(*) as cert_count
          FROM lms_enrollments e
          JOIN lms_courses c ON c.id = e.course_id
          JOIN lms_group_members gm ON gm.user_id = e.user_id
          WHERE gm.group_id = ?
            AND e.status = 'completed'
            AND c.npcu_value > 0
            AND c.certification_category IS NOT NULL
            AND (e.expires_at IS NULL OR e.expires_at > NOW())
          GROUP BY c.certification_category
        `, [partner.group_id]);
        
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
        const totalNpcu = npcuResult?.total_npcu || 0;
        
        const certCounts = {
          nintex_ce: 0,
          nintex_k2: 0,
          nintex_salesforce: 0,
          go_to_market: 0
        };
        
        for (const row of counts) {
          if (row.category && certCounts.hasOwnProperty(row.category)) {
            certCounts[row.category] = row.cert_count;
          }
        }
        
        await query(`
          UPDATE partners SET
            cert_count_nintex_ce = ?,
            cert_count_nintex_k2 = ?,
            cert_count_nintex_salesforce = ?,
            cert_count_go_to_market = ?,
            has_gtm_certification = ?,
            total_npcu = ?,
            cert_counts_updated_at = NOW()
          WHERE id = ?
        `, [
          certCounts.nintex_ce,
          certCounts.nintex_k2,
          certCounts.nintex_salesforce,
          certCounts.go_to_market,
          certCounts.go_to_market > 0,
          totalNpcu,
          partner.id
        ]);
        
        results.updated++;
        
        if (results.samples.length < 10) {
          results.samples.push({
            partnerId: partner.id,
            partnerName: partner.account_name,
            counts: certCounts,
            totalNpcu
          });
        }
        
      } catch (err) {
        results.errors.push({ partnerId: partner.id, error: err.message });
      }
    }
    
    res.json({
      success: true,
      ...results,
      message: `Updated certification counts for ${results.updated} partners`
    });
  } catch (error) {
    console.error('Error calculating partner counts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get partners NOT FOUND in Impartner
// This compares our partners table against Impartner's CrmId lookup
router.get('/impartner-comparison', async (req, res) => {
  try {
    // Impartner API config (same as dbRoutes.cjs)
    const IMPARTNER_CONFIG = {
      host: 'https://prod.impartner.live',
      apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
      tenantId: '1'
    };
    
    // Valid tiers to sync (same as sync-to-impartner)
    const VALID_TIERS = ['Premier', 'Premier Plus', 'Certified', 'Registered', 'Aggregator'];
    
    // Get our partners with valid tiers
    const tierPlaceholders = VALID_TIERS.map(() => '?').join(',');
    const partners = await query(`
      SELECT 
        p.id,
        p.account_name,
        p.salesforce_id,
        p.partner_tier,
        p.account_region,
        p.total_npcu,
        g.name as lms_group_name
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE p.is_active = TRUE
        AND p.partner_tier IN (${tierPlaceholders})
        AND p.salesforce_id IS NOT NULL
      ORDER BY p.account_name
    `, VALID_TIERS);
    
    console.log(`[Impartner Comparison] Checking ${partners.length} partners against Impartner...`);
    
    // Build Impartner CrmId maps
    const crmIdToImpartner = new Map();      // Exact CrmId -> name
    const crmId15ToImpartner = new Map();    // 15-char prefix -> name
    
    const pageSize = 500;
    let skip = 0;
    let hasMore = true;
    let totalFetched = 0;
    
    while (hasMore) {
      const lookupUrl = `${IMPARTNER_CONFIG.host}/api/objects/v1/Account?fields=Id,CrmId,Name&take=${pageSize}&skip=${skip}`;
      
      try {
        const lookupResp = await fetch(lookupUrl, {
          headers: {
            'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
            'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
            'Accept': 'application/json'
          }
        });
        
        if (lookupResp.ok) {
          const lookupData = await lookupResp.json();
          const results = lookupData.data?.results || [];
          totalFetched += results.length;
          
          for (const account of results) {
            if (account.crmId && account.id) {
              crmIdToImpartner.set(account.crmId, account.name);
              
              if (account.crmId.length === 15) {
                crmId15ToImpartner.set(account.crmId, account.name);
              } else if (account.crmId.length === 18) {
                crmId15ToImpartner.set(account.crmId.substring(0, 15), account.name);
              }
            }
          }
          
          hasMore = results.length === pageSize;
          skip += pageSize;
        } else {
          console.error(`[Impartner Comparison] Lookup failed: ${lookupResp.status}`);
          hasMore = false;
        }
      } catch (err) {
        console.error(`[Impartner Comparison] Fetch error:`, err.message);
        hasMore = false;
      }
    }
    
    console.log(`[Impartner Comparison] Fetched ${totalFetched} Impartner accounts, ${crmIdToImpartner.size} have CrmIds`);
    
    // Compare and find not-found partners
    const notFound = [];
    const found = [];
    
    for (const p of partners) {
      let match = null;
      
      // Try exact match
      if (crmIdToImpartner.has(p.salesforce_id)) {
        match = crmIdToImpartner.get(p.salesforce_id);
      }
      // Try 15-char prefix (18 -> 15)
      else if (p.salesforce_id && p.salesforce_id.length === 18) {
        const prefix15 = p.salesforce_id.substring(0, 15);
        if (crmId15ToImpartner.has(prefix15)) {
          match = crmId15ToImpartner.get(prefix15);
        }
      }
      // Try 15-char direct match
      else if (p.salesforce_id && p.salesforce_id.length === 15) {
        if (crmId15ToImpartner.has(p.salesforce_id)) {
          match = crmId15ToImpartner.get(p.salesforce_id);
        }
      }
      
      if (match) {
        found.push({ ...p, impartnerName: match });
      } else {
        notFound.push(p);
      }
    }
    
    console.log(`[Impartner Comparison] Found: ${found.length}, Not Found: ${notFound.length}`);
    
    res.json({
      success: true,
      totalPartners: partners.length,
      impartnerAccounts: totalFetched,
      impartnerWithCrmId: crmIdToImpartner.size,
      foundCount: found.length,
      notFoundCount: notFound.length,
      notFoundPartners: notFound.map(p => ({
        id: p.id,
        name: p.account_name,
        crmId: p.salesforce_id,
        tier: p.partner_tier,
        region: p.account_region,
        npcu: p.total_npcu,
        lmsGroup: p.lms_group_name
      }))
    });
  } catch (error) {
    console.error('Error comparing with Impartner:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get certification stats by partner
router.get('/partner-stats', async (req, res) => {
  try {
    const { tier, region, hasGtm, limit = 100 } = req.query;
    
    let whereClause = 'WHERE cert_counts_updated_at IS NOT NULL';
    const params = [];
    
    if (tier) {
      whereClause += ' AND partner_tier = ?';
      params.push(tier);
    }
    if (region) {
      whereClause += ' AND account_region = ?';
      params.push(region);
    }
    if (hasGtm === 'true') {
      whereClause += ' AND has_gtm_certification = TRUE';
    } else if (hasGtm === 'false') {
      whereClause += ' AND (has_gtm_certification = FALSE OR has_gtm_certification IS NULL)';
    }
    
    const partners = await query(`
      SELECT 
        id,
        account_name,
        partner_tier,
        account_region,
        cert_count_nintex_ce,
        cert_count_nintex_k2,
        cert_count_nintex_salesforce,
        cert_count_go_to_market,
        has_gtm_certification,
        total_npcu,
        cert_counts_updated_at
      FROM partners
      ${whereClause}
      ORDER BY total_npcu DESC
      LIMIT ?
    `, [...params, parseInt(limit)]);
    
    // Calculate summary stats
    const [summary] = await query(`
      SELECT 
        COUNT(*) as total_partners,
        SUM(CASE WHEN has_gtm_certification = TRUE THEN 1 ELSE 0 END) as with_gtm,
        SUM(total_npcu) as total_npcu,
        SUM(cert_count_nintex_ce) as total_ce,
        SUM(cert_count_nintex_k2) as total_k2,
        SUM(cert_count_nintex_salesforce) as total_salesforce,
        SUM(cert_count_go_to_market) as total_gtm
      FROM partners
      ${whereClause}
    `, params);
    
    res.json({ partners, summary });
  } catch (error) {
    console.error('Error fetching partner stats:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
