/**
 * Analytics Routes (Deep Analytics)
 * Advanced analytics endpoints for engagement, cohorts, learning paths, etc.
 * 
 * CACHING: All endpoints use server-side caching (5-10 min TTL)
 * to improve response times for expensive queries.
 */

const express = require('express');
const router = express.Router();

// Import deep analytics functions from trend service
const {
  getPartnerEngagementScores,
  getCohortAnalysis,
  getLearningPathAnalysis,
  getTierProgressionInsights,
  getOwnerPerformanceDashboard,
  getCourseEffectivenessAnalysis,
  getRegionalComparison,
  getUserActivitySegments,
  getCertificationVelocity
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
// Deep Analytics Endpoints
// All endpoints support stacked filters: region, owner, tier
// ============================================

// Partner Engagement Scores - Composite engagement metrics (CACHED 10 min - expensive query)
router.get('/engagement-scores', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const filters = extractFilters(req.query);
    
    const scores = await analyticsCache.withCache(
      'engagement-scores',
      { ...filters, limit },
      () => getPartnerEngagementScores(parseInt(limit), filters),
      CACHE_TTL.LONG // 10 minutes - expensive query with multiple subqueries
    );
    
    res.json({
      success: true,
      count: scores.length,
      data: scores,
      cached: analyticsCache.get(analyticsCache.generateKey('engagement-scores', { ...filters, limit })) !== null,
      description: 'Engagement score based on activation rate, completion rate, certification density, and recent activity'
    });
  } catch (error) {
    console.error('Engagement scores error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cohort Analysis - User behavior by registration cohort
router.get('/cohort', async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const filters = extractFilters(req.query);
    const cohorts = await getCohortAnalysis(parseInt(months), filters);
    res.json({
      success: true,
      count: cohorts.length,
      data: cohorts,
      description: 'User retention and progression by registration month cohort'
    });
  } catch (error) {
    console.error('Cohort analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Learning Path Analysis - Course sequences and progression
router.get('/learning-paths', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const paths = await getLearningPathAnalysis(parseInt(limit));
    res.json({
      success: true,
      data: paths,
      description: 'Common course sequences and paths to certification'
    });
  } catch (error) {
    console.error('Learning path analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Tier Progression Insights - Partner tier movement and at-risk partners (CACHED 5 min)
router.get('/tier-progression', async (req, res) => {
  try {
    const filters = extractFilters(req.query);
    
    const insights = await analyticsCache.withCache(
      'tier-progression',
      filters,
      () => getTierProgressionInsights(filters),
      CACHE_TTL.MEDIUM // 5 minutes
    );
    
    res.json({
      success: true,
      data: insights,
      description: 'Partner tier statistics, close to upgrade, and at-risk partners'
    });
  } catch (error) {
    console.error('Tier progression error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Account Owner Performance Dashboard (CACHED 10 min - expensive query)
router.get('/owner-performance', async (req, res) => {
  try {
    const filters = extractFilters(req.query);
    
    const performance = await analyticsCache.withCache(
      'owner-performance',
      filters,
      () => getOwnerPerformanceDashboard(filters),
      CACHE_TTL.LONG // 10 minutes
    );
    
    res.json({
      success: true,
      count: performance.length,
      data: performance,
      description: 'Detailed metrics for each account owner portfolio'
    });
  } catch (error) {
    console.error('Owner performance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Course Effectiveness Analysis
router.get('/course-effectiveness', async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const analysis = await getCourseEffectivenessAnalysis(parseInt(limit));
    res.json({
      success: true,
      data: analysis,
      description: 'Course completion rates, time to complete, and engagement metrics'
    });
  } catch (error) {
    console.error('Course effectiveness error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Regional Comparison (CACHED 5 min)
router.get('/regional-comparison', async (req, res) => {
  try {
    const filters = extractFilters(req.query);
    
    const comparison = await analyticsCache.withCache(
      'regional-comparison',
      filters,
      () => getRegionalComparison(filters),
      CACHE_TTL.MEDIUM // 5 minutes
    );
    
    res.json({
      success: true,
      count: comparison.length,
      data: comparison,
      description: 'Performance metrics comparison across regions'
    });
  } catch (error) {
    console.error('Regional comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// User Activity Segments (CACHED 5 min)
router.get('/user-segments', async (req, res) => {
  try {
    const filters = extractFilters(req.query);
    
    const segments = await analyticsCache.withCache(
      'user-segments',
      filters,
      () => getUserActivitySegments(filters),
      CACHE_TTL.MEDIUM // 5 minutes
    );
    
    res.json({
      success: true,
      count: segments.length,
      data: segments,
      description: 'User segmentation by activity level (active, recent, lapsed, dormant)'
    });
  } catch (error) {
    console.error('User segments error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Certification Velocity
router.get('/certification-velocity', async (req, res) => {
  try {
    const { months = 12 } = req.query;
    const filters = extractFilters(req.query);
    const velocity = await getCertificationVelocity(parseInt(months), filters);
    res.json({
      success: true,
      count: velocity.length,
      data: velocity,
      description: 'Monthly certification velocity with running totals and growth metrics'
    });
  } catch (error) {
    console.error('Certification velocity error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
