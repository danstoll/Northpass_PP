/**
 * Analytics Tracking Routes
 * Simple page view tracking for partner widget usage
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db/connection.cjs');

/**
 * Track a page view
 * POST /api/track/view
 * Body: { pageType, pagePath, partnerId?, contactId?, sessionId?, viewer?, viewerEmail? }
 */
router.post('/view', async (req, res) => {
  try {
    const { pageType, pagePath, partnerId, contactId, sessionId, viewer, viewerEmail } = req.body;

    if (!pageType) {
      return res.status(400).json({ error: 'pageType is required' });
    }

    // Extract user agent and IP
    const userAgent = req.headers['user-agent']?.substring(0, 500) || null;
    const referrer = req.headers['referer']?.substring(0, 500) || null;

    // Get IP (handle proxies)
    let ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
    if (ipAddress && ipAddress.includes(',')) {
      ipAddress = ipAddress.split(',')[0].trim();
    }
    if (ipAddress) {
      ipAddress = ipAddress.substring(0, 45);
    }

    // Determine viewer type
    let viewerType = 'unknown';
    if (viewer === 'nintex' || (viewerEmail && viewerEmail.toLowerCase().endsWith('@nintex.com'))) {
      viewerType = 'nintex';
    } else if (viewer === 'partner' || partnerId) {
      viewerType = 'partner';
    }

    await query(`
      INSERT INTO page_views (partner_id, contact_id, page_type, viewer_type, viewer_email, page_path, session_id, user_agent, ip_address, referrer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      partnerId || null,
      contactId || null,
      pageType.substring(0, 50),
      viewerType,
      viewerEmail?.substring(0, 255) || null,
      pagePath?.substring(0, 500) || null,
      sessionId?.substring(0, 100) || null,
      userAgent,
      ipAddress,
      referrer
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Tracking error:', error);
    // Don't fail silently - but don't expose details
    res.status(500).json({ error: 'Tracking failed' });
  }
});

/**
 * Get page view analytics summary
 * GET /api/track/summary?days=30&pageType=widget
 */
router.get('/summary', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const pageType = req.query.pageType || null;

    // Total views
    const totalResult = await query(`
      SELECT COUNT(*) as total
      FROM page_views
      WHERE viewed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ${pageType ? 'AND page_type = ?' : ''}
    `, pageType ? [days, pageType] : [days]);

    // Unique partners
    const uniquePartnersResult = await query(`
      SELECT COUNT(DISTINCT partner_id) as unique_partners
      FROM page_views
      WHERE partner_id IS NOT NULL
        AND viewed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ${pageType ? 'AND page_type = ?' : ''}
    `, pageType ? [days, pageType] : [days]);

    // Views by day
    const dailyResult = await query(`
      SELECT DATE(viewed_at) as date, COUNT(*) as views
      FROM page_views
      WHERE viewed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ${pageType ? 'AND page_type = ?' : ''}
      GROUP BY DATE(viewed_at)
      ORDER BY date DESC
    `, pageType ? [days, pageType] : [days]);

    // Top partners by views
    const topPartnersResult = await query(`
      SELECT
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        COUNT(*) as views,
        COUNT(DISTINCT DATE(pv.viewed_at)) as days_active,
        MAX(pv.viewed_at) as last_viewed
      FROM page_views pv
      JOIN partners p ON pv.partner_id = p.id
      WHERE pv.viewed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ${pageType ? 'AND pv.page_type = ?' : ''}
      GROUP BY p.id
      ORDER BY views DESC
      LIMIT 50
    `, pageType ? [days, pageType] : [days]);

    // Views by viewer type (Nintex staff vs Partners)
    const viewerTypeResult = await query(`
      SELECT
        COALESCE(viewer_type, 'unknown') as viewer_type,
        COUNT(*) as views
      FROM page_views
      WHERE viewed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ${pageType ? 'AND page_type = ?' : ''}
      GROUP BY viewer_type
    `, pageType ? [days, pageType] : [days]);

    // Convert to object for easier access
    const viewsByType = {
      nintex: 0,
      partner: 0,
      unknown: 0
    };
    viewerTypeResult.forEach(row => {
      viewsByType[row.viewer_type] = row.views;
    });

    res.json({
      period: { days },
      totalViews: totalResult[0]?.total || 0,
      uniquePartners: uniquePartnersResult[0]?.unique_partners || 0,
      viewsByType,
      dailyViews: dailyResult,
      topPartners: topPartnersResult
    });
  } catch (error) {
    console.error('Analytics summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get partner-specific view history
 * GET /api/track/partner/:partnerId?days=30
 */
router.get('/partner/:partnerId', async (req, res) => {
  try {
    const partnerId = parseInt(req.params.partnerId);
    const days = parseInt(req.query.days) || 30;

    if (!partnerId) {
      return res.status(400).json({ error: 'partnerId is required' });
    }

    // Partner info
    const partnerResult = await query(`
      SELECT id, account_name, partner_tier, account_region, account_owner
      FROM partners WHERE id = ?
    `, [partnerId]);

    if (partnerResult.length === 0) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    // View history
    const viewsResult = await query(`
      SELECT
        pv.id,
        pv.page_type,
        pv.page_path,
        pv.viewed_at,
        c.email as contact_email,
        c.first_name,
        c.last_name
      FROM page_views pv
      LEFT JOIN contacts c ON pv.contact_id = c.id
      WHERE pv.partner_id = ?
        AND pv.viewed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY pv.viewed_at DESC
      LIMIT 200
    `, [partnerId, days]);

    // Daily breakdown
    const dailyResult = await query(`
      SELECT DATE(viewed_at) as date, COUNT(*) as views
      FROM page_views
      WHERE partner_id = ?
        AND viewed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY DATE(viewed_at)
      ORDER BY date DESC
    `, [partnerId, days]);

    res.json({
      partner: partnerResult[0],
      totalViews: viewsResult.length,
      views: viewsResult,
      dailyBreakdown: dailyResult
    });
  } catch (error) {
    console.error('Partner analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get views by region
 * GET /api/track/by-region?days=30&pageType=widget
 */
router.get('/by-region', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const pageType = req.query.pageType || null;

    const result = await query(`
      SELECT
        COALESCE(p.account_region, 'Unknown') as region,
        COUNT(*) as views,
        COUNT(DISTINCT pv.partner_id) as unique_partners
      FROM page_views pv
      LEFT JOIN partners p ON pv.partner_id = p.id
      WHERE pv.viewed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ${pageType ? 'AND pv.page_type = ?' : ''}
      GROUP BY p.account_region
      ORDER BY views DESC
    `, pageType ? [days, pageType] : [days]);

    res.json(result);
  } catch (error) {
    console.error('Region analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get views by tier
 * GET /api/track/by-tier?days=30&pageType=widget
 */
router.get('/by-tier', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const pageType = req.query.pageType || null;

    const result = await query(`
      SELECT
        COALESCE(p.partner_tier, 'Unknown') as tier,
        COUNT(*) as views,
        COUNT(DISTINCT pv.partner_id) as unique_partners
      FROM page_views pv
      LEFT JOIN partners p ON pv.partner_id = p.id
      WHERE pv.viewed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ${pageType ? 'AND pv.page_type = ?' : ''}
      GROUP BY p.partner_tier
      ORDER BY views DESC
    `, pageType ? [days, pageType] : [days]);

    res.json(result);
  } catch (error) {
    console.error('Tier analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
