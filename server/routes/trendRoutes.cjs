/**
 * Trend Routes
 * Time-series analytics and trend data endpoints
 * 
 * CACHING: All endpoints use server-side caching (2-5 min TTL)
 * to improve response times for expensive queries.
 */

const express = require('express');
const router = express.Router();

// Import trend service functions
const {
  getKpiSummary,
  getYtdComparison,
  getUserRegistrationTrends,
  getEnrollmentTrends,
  getCertificationTrends,
  getCoursePopularityTrends,
  getComplianceTrends,
  getRegionalTrends,
  getWeeklySummary,
  getOwnerTrends,
  getFullTrendReport
} = require('../db/trendService.cjs');

// Import caching
const { analyticsCache, CACHE_TTL } = require('../db/analyticsCache.cjs');

// Helper to extract filters from query params
function extractFilters(query) {
  const filters = {};
  if (query.region) filters.region = query.region;
  if (query.owner) filters.owner = query.owner;
  if (query.tier) filters.tier = query.tier;
  return filters;
}

// ============================================
// Trend Analytics Endpoints
// All endpoints support stacked filters: region, owner, tier
// Example: /api/db/trends/kpi-summary?region=Americas&tier=Premier&owner=John%20Doe
// ============================================

// KPI Summary - current period with MoM/YoY comparisons (CACHED 2 min)
router.get('/kpi-summary', async (req, res) => {
  try {
    const filters = extractFilters(req.query);
    
    const summary = await analyticsCache.withCache(
      'kpi-summary',
      filters,
      () => getKpiSummary(filters),
      CACHE_TTL.SHORT // 2 minutes - relatively fresh data needed
    );
    
    res.json(summary);
  } catch (error) {
    console.error('KPI Summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Year-to-Date comparison (CACHED 5 min)
router.get('/ytd', async (req, res) => {
  try {
    const filters = extractFilters(req.query);
    
    const ytd = await analyticsCache.withCache(
      'ytd',
      filters,
      () => getYtdComparison(filters),
      CACHE_TTL.MEDIUM // 5 minutes
    );
    
    res.json(ytd);
  } catch (error) {
    console.error('YTD comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// User registration trends by month (CACHED 5 min)
router.get('/users', async (req, res) => {
  try {
    const { months = 24 } = req.query;
    const filters = extractFilters(req.query);
    
    const trends = await analyticsCache.withCache(
      'users',
      { ...filters, months },
      () => getUserRegistrationTrends(parseInt(months), filters),
      CACHE_TTL.MEDIUM // 5 minutes
    );
    
    res.json(trends);
  } catch (error) {
    console.error('User trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enrollment trends by month (CACHED 5 min)
router.get('/enrollments', async (req, res) => {
  try {
    const { months = 24 } = req.query;
    const filters = extractFilters(req.query);
    
    const trends = await analyticsCache.withCache(
      'enrollments',
      { ...filters, months },
      () => getEnrollmentTrends(parseInt(months), filters),
      CACHE_TTL.MEDIUM // 5 minutes
    );
    
    res.json(trends);
  } catch (error) {
    console.error('Enrollment trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Certification trends (NPCU courses) by month (CACHED 5 min)
router.get('/certifications', async (req, res) => {
  try {
    const { months = 24 } = req.query;
    const filters = extractFilters(req.query);
    
    const trends = await analyticsCache.withCache(
      'certifications',
      { ...filters, months },
      () => getCertificationTrends(parseInt(months), filters),
      CACHE_TTL.MEDIUM // 5 minutes
    );
    
    res.json(trends);
  } catch (error) {
    console.error('Certification trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Course popularity trends
router.get('/courses', async (req, res) => {
  try {
    const { months = 12, top = 10 } = req.query;
    const filters = extractFilters(req.query);
    const trends = await getCoursePopularityTrends(parseInt(months), parseInt(top), filters);
    res.json(trends);
  } catch (error) {
    console.error('Course popularity error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compliance by tier (current snapshot) (CACHED 5 min)
router.get('/compliance', async (req, res) => {
  try {
    const filters = extractFilters(req.query);
    
    const compliance = await analyticsCache.withCache(
      'compliance',
      filters,
      () => getComplianceTrends(12, filters),
      CACHE_TTL.MEDIUM // 5 minutes
    );
    
    res.json(compliance);
  } catch (error) {
    console.error('Compliance trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Regional trends
router.get('/regional', async (req, res) => {
  try {
    const { months = 24 } = req.query;
    const filters = extractFilters(req.query);
    const trends = await getRegionalTrends(parseInt(months), filters);
    res.json(trends);
  } catch (error) {
    console.error('Regional trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Weekly summary (CACHED 2 min - more real-time)
router.get('/weekly', async (req, res) => {
  try {
    const { weeks = 12 } = req.query;
    const filters = extractFilters(req.query);
    
    const summary = await analyticsCache.withCache(
      'weekly',
      { ...filters, weeks },
      () => getWeeklySummary(parseInt(weeks), filters),
      CACHE_TTL.SHORT // 2 minutes
    );
    
    res.json(summary);
  } catch (error) {
    console.error('Weekly summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Owner-specific trends
router.get('/owner', async (req, res) => {
  try {
    const { owner, months = 12 } = req.query;
    if (!owner) {
      return res.status(400).json({ error: 'Owner name required' });
    }
    const filters = extractFilters(req.query);
    const trends = await getOwnerTrends(owner, parseInt(months), filters);
    res.json(trends);
  } catch (error) {
    console.error('Owner trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Full trend report (for export/presentation)
router.get('/full-report', async (req, res) => {
  try {
    const { months = 12 } = req.query;
    const filters = extractFilters(req.query);
    const report = await getFullTrendReport(parseInt(months), filters);
    res.json(report);
  } catch (error) {
    console.error('Full trend report error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
