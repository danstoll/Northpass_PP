/**
 * Trend Routes
 * Time-series analytics and trend data endpoints
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

// KPI Summary - current period with MoM/YoY comparisons
router.get('/kpi-summary', async (req, res) => {
  try {
    const filters = extractFilters(req.query);
    const summary = await getKpiSummary(filters);
    res.json(summary);
  } catch (error) {
    console.error('KPI Summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Year-to-Date comparison
router.get('/ytd', async (req, res) => {
  try {
    const filters = extractFilters(req.query);
    const ytd = await getYtdComparison(filters);
    res.json(ytd);
  } catch (error) {
    console.error('YTD comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// User registration trends by month
router.get('/users', async (req, res) => {
  try {
    const { months = 24 } = req.query;
    const filters = extractFilters(req.query);
    const trends = await getUserRegistrationTrends(parseInt(months), filters);
    res.json(trends);
  } catch (error) {
    console.error('User trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enrollment trends by month
router.get('/enrollments', async (req, res) => {
  try {
    const { months = 24 } = req.query;
    const filters = extractFilters(req.query);
    const trends = await getEnrollmentTrends(parseInt(months), filters);
    res.json(trends);
  } catch (error) {
    console.error('Enrollment trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Certification trends (NPCU courses) by month
router.get('/certifications', async (req, res) => {
  try {
    const { months = 24 } = req.query;
    const filters = extractFilters(req.query);
    const trends = await getCertificationTrends(parseInt(months), filters);
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

// Compliance by tier (current snapshot)
router.get('/compliance', async (req, res) => {
  try {
    const filters = extractFilters(req.query);
    const compliance = await getComplianceTrends(12, filters);
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

// Weekly summary
router.get('/weekly', async (req, res) => {
  try {
    const { weeks = 12 } = req.query;
    const filters = extractFilters(req.query);
    const summary = await getWeeklySummary(parseInt(weeks), filters);
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
