/**
 * Database API Routes
 * Express routes for database operations
 */

const express = require('express');

// Northpass API configuration
const API_BASE = 'https://api.northpass.com';
const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';

// Import WebSocket emitters (may not be available during module load)
let emitSyncProgress, emitSyncComplete, emitSyncError;
function initWebSocketEmitters() {
  try {
    const server = require('../server-with-proxy.cjs');
    emitSyncProgress = server.emitSyncProgress || (() => {});
    emitSyncComplete = server.emitSyncComplete || (() => {});
    emitSyncError = server.emitSyncError || (() => {});
  } catch (e) {
    // Running standalone or during init, create no-op functions
    emitSyncProgress = () => {};
    emitSyncComplete = () => {};
    emitSyncError = () => {};
  }
}
// Initialize immediately (will be no-ops initially, re-init later)
initWebSocketEmitters();

// Simple in-memory cache for expensive reports
const reportCache = {
  overview: { data: null, timestamp: 0 },
  CACHE_TTL: 5 * 60 * 1000 // 5 minutes TTL
};

// Helper to check if cache is valid
function isCacheValid(cacheKey) {
  const cache = reportCache[cacheKey];
  return cache && cache.data && (Date.now() - cache.timestamp) < reportCache.CACHE_TTL;
}

// Helper to set cache
function setCache(cacheKey, data) {
  reportCache[cacheKey] = { data, timestamp: Date.now() };
}

// Helper to invalidate cache (call after data changes)
function invalidateReportCache() {
  reportCache.overview = { data: null, timestamp: 0 };
}

const { initializePool, closePool } = require('./db/connection.cjs');
const { initializeSchema, getSchemaVersion } = require('./db/schema.cjs');
const { 
  runFullSync, 
  syncUsers,
  syncUsersIncremental,
  syncGroups,
  syncGroupsIncremental,
  syncCourses,
  syncCoursesIncremental,
  syncCourseProperties,
  syncGroupMembers,
  syncEnrollments,
  syncEnrollmentsIncremental,
  linkContactsToLmsUsers,
  getLastSyncStatus, 
  getSyncHistory 
} = require('./db/lmsSyncService.cjs');
const {
  importPartners,
  importContacts,
  getPartnerSummary,
  getPartnersByOwner,
  getAccountOwners,
  getContactsByPartner,
  getContactsByAccountName,
  searchPartners,
  getDatabaseStats,
  clearPartnerData
} = require('./db/partnerService.cjs');
const {
  importContacts: importContactsFromExcel,
  getDatabaseStats: getImportStats,
  getPartnerSummary: getPartnerList,
  getContactsByPartner: getPartnerContacts,
  searchContacts,
  deletePartner,
  deleteByRegion,
  deleteByTier,
  deleteByAccountPattern,
  getContactsPreview,
  getUnmatchedContacts,
  getMatchStats,
  clearAllData,
  getImportProgress
} = require('./db/partnerImportService.cjs');
// Legacy scheduledSync.cjs removed. All syncs now use modern taskScheduler.
const taskScheduler = require('./db/taskScheduler.cjs');
const { initializeScheduler } = taskScheduler;
const { query } = require('./db/connection.cjs');
const {
  runIncrementalSync,
  runFullEnrollmentSync,
  getSyncStats,
  getSyncHistory: getIncrementalSyncHistory,
  getScheduleSettings,
  updateScheduleSettings
} = require('./db/incrementalSync.cjs');
const {
  autoMatchGroups,
  getMatchingSuggestions,
  linkGroupToPartner,
  unlinkGroup,
  getMatchingStats
} = require('./db/partnerMatchingService.cjs');
const {
  getAccountOwnerReport,
  getRegionalReport,
  getComplianceGapsReport,
  getAccountOwnersOverview,
  getPartnersByOwnerEmail,
  getExpiringCertificationsReport,
  getPartnerLeaderboard,
  generateAccountOwnerEmailReport,
  getPartnerCertificationSummary,
  getLmsUsersNotInCrm
} = require('./db/reportingService.cjs');
const {
  getUserRegistrationTrends,
  getEnrollmentTrends,
  getCertificationTrends,
  getCoursePopularityTrends,
  getComplianceTrends,
  getRegionalTrends,
  getKpiSummary,
  getWeeklySummary,
  getYtdComparison,
  getFullTrendReport,
  getOwnerTrends,
  // Deep Analytics
  getPartnerEngagementScores,
  getCohortAnalysis,
  getLearningPathAnalysis,
  getTierProgressionInsights,
  getOwnerPerformanceDashboard,
  getCourseEffectivenessAnalysis,
  getRegionalComparison,
  getUserActivitySegments,
  getCertificationVelocity
} = require('./db/trendService.cjs');
const {
  login,
  logout,
  validateSession,
  cleanupExpiredSessions,
  getUsers,
  getUserById,
  createUser,
  updateUser,
  changePassword,
  deleteUser,
  getProfiles,
  getProfileById,
  createProfile,
  updateProfile,
  deleteProfile
} = require('./db/authService.cjs');

const router = express.Router();

// Track sync status
let currentSync = null;

// Auto-clear stale sync locks (30 minute timeout)
function clearStaleSyncLock() {
  if (currentSync && currentSync.startedAt) {
    const startTime = new Date(currentSync.startedAt).getTime();
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;
    if (now - startTime > thirtyMinutes) {
      console.log('⚠️ Auto-clearing stale sync:', currentSync.type, 'started at', currentSync.startedAt);
      currentSync = null;
      return true;
    }
  }
  return false;
}

/**
 * Helper to create a sync log entry
 */
async function createSyncLog(syncType) {
  const result = await query(
    'INSERT INTO sync_logs (sync_type, status, started_at) VALUES (?, ?, NOW())',
    [syncType, 'running']
  );
  return result.insertId;
}

/**
 * Helper to update a sync log entry and emit WebSocket event
 */
async function updateSyncLog(logId, status, stats, error = null, syncType = 'unknown') {
  await query(
    `UPDATE sync_logs SET 
      status = ?, 
      completed_at = NOW(), 
      records_processed = ?,
      records_created = ?,
      records_updated = ?,
      records_failed = ?,
      error_message = ?,
      details = ?
    WHERE id = ?`,
    [
      status,
      stats.processed || 0,
      stats.created || 0,
      stats.updated || 0,
      stats.failed || 0,
      error,
      JSON.stringify(stats.details || stats || {}),
      logId
    ]
  );
  
  // Emit WebSocket event for real-time updates
  if (status === 'completed') {
    emitSyncComplete(syncType, {
      logId,
      ...stats,
      timestamp: new Date().toISOString()
    });
  } else if (status === 'failed') {
    emitSyncError(syncType, error || 'Sync failed');
  }
}

/**
 * Initialize database on startup
 */
async function initializeDatabase() {
  try {
    await initializePool();
    await initializeSchema();
    
    // Start the scheduler if enabled
    await initializeScheduler();
    
    console.log('✅ Database initialized');
    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    return false;
  }
}

// ============================================
// Health & Status Endpoints
// ============================================

router.get('/health', async (req, res) => {
  try {
    const stats = await getDatabaseStats();
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      stats 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await getDatabaseStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Sync Endpoints - MOVED to server/routes/syncRoutes.cjs
// ============================================

// ============================================
// Partner Endpoints
// ============================================

router.get('/partners', async (req, res) => {
  try {
    const { search, tier, region, owner } = req.query;
    const partners = await searchPartners(search, { tier, region, owner });
    res.json(partners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/partners/summary', async (req, res) => {
  try {
    const summary = await getPartnerSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/partners/owners', async (req, res) => {
  try {
    const owners = await getAccountOwners();
    res.json(owners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/partners/by-owner/:owner', async (req, res) => {
  try {
    const partners = await getPartnersByOwner(req.params.owner);
    res.json(partners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/partners/:id/contacts', async (req, res) => {
  try {
    const contacts = await getContactsByPartner(req.params.id);
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all contacts (for User Management page)
router.get('/contacts/all', async (req, res) => {
  try {
    const contacts = await query(`
      SELECT 
        c.id,
        c.email,
        c.first_name as firstName,
        c.last_name as lastName,
        c.title,
        p.account_name as accountName,
        p.partner_tier as partnerTier,
        p.account_region as accountRegion,
        p.account_owner as accountOwner
      FROM contacts c
      LEFT JOIN partners p ON c.partner_id = p.id
      ORDER BY c.email
    `);
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a contact by ID
router.delete('/contacts/:id', async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (!contactId) {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }
    
    // Get contact info before deleting
    const [contact] = await query('SELECT email, partner_id FROM contacts WHERE id = ?', [contactId]);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    await query('DELETE FROM contacts WHERE id = ?', [contactId]);
    
    console.log(`Deleted contact ${contactId} (${contact.email}) from partner ${contact.partner_id}`);
    res.json({ 
      success: true, 
      message: `Deleted contact ${contact.email}`,
      deletedId: contactId 
    });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/partners/import', async (req, res) => {
  try {
    const { partners, contacts, clearExisting } = req.body;
    
    if (clearExisting) {
      await clearPartnerData();
    }

    const results = { partners: null, contacts: null };

    if (partners && partners.length > 0) {
      results.partners = await importPartners(partners);
    }

    if (contacts && contacts.length > 0) {
      results.contacts = await importContacts(contacts);
    }

    // Link contacts to LMS users
    const linkResult = await linkContactsToLmsUsers();
    results.linked = linkResult.linked;

    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/partners', async (req, res) => {
  try {
    await clearPartnerData();
    res.json({ success: true, message: 'Partner data cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual contact linking endpoint
router.post('/partners/link-contacts', async (req, res) => {
  try {
    const result = await linkContactsToLmsUsers();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LMS Data Query Endpoints
// ============================================

router.get('/lms/users', async (req, res) => {
  try {
    const { search, status, page = 1, limit = 100, all } = req.query;
    
    // If all=true, return all users (for User Management comparison)
    if (all === 'true') {
      const users = await query(`
        SELECT id, email, first_name, last_name, status
        FROM lms_users
        ORDER BY email
      `);
      return res.json(users);
    }
    
    const offset = (page - 1) * limit;
    
    let sql = 'SELECT * FROM lms_users WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY last_name, first_name LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const users = await query(sql, params);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/lms/users/:id', async (req, res) => {
  try {
    const [user] = await query('SELECT * FROM lms_users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get groups
    const groups = await query(`
      SELECT g.* FROM lms_groups g
      INNER JOIN lms_group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ?
    `, [req.params.id]);

    // Get enrollments
    const enrollments = await query(`
      SELECT e.*, c.name as course_name, c.npcu_value, c.is_certification
      FROM lms_enrollments e
      INNER JOIN lms_courses c ON c.id = e.course_id
      WHERE e.user_id = ?
      ORDER BY e.completed_at DESC
    `, [req.params.id]);

    res.json({ user, groups, enrollments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/lms/groups', async (req, res) => {
  try {
    const { search, hasPartner } = req.query;
    
    let sql = 'SELECT * FROM lms_groups WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    if (hasPartner === 'true') {
      sql += ' AND partner_id IS NOT NULL';
    } else if (hasPartner === 'false') {
      sql += ' AND partner_id IS NULL';
    }

    sql += ' ORDER BY name';

    const groups = await query(sql, params);
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/lms/groups/:id', async (req, res) => {
  try {
    const [group] = await query('SELECT * FROM lms_groups WHERE id = ?', [req.params.id]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Get members
    const members = await query(`
      SELECT u.* FROM lms_users u
      INNER JOIN lms_group_members gm ON gm.user_id = u.id
      WHERE gm.group_id = ?
      ORDER BY u.last_name, u.first_name
    `, [req.params.id]);

    res.json({ group, members });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/lms/courses', async (req, res) => {
  try {
    const courses = await query(`
      SELECT c.*, cp.npcu_value as npcu_from_properties
      FROM lms_courses c
      LEFT JOIN course_properties cp ON cp.course_id = c.id
      ORDER BY c.name
    `);
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/lms/courses/:id', async (req, res) => {
  try {
    const [course] = await query(`
      SELECT c.*, cp.npcu_value, cp.property_data
      FROM lms_courses c
      LEFT JOIN course_properties cp ON cp.course_id = c.id
      WHERE c.id = ?
    `, [req.params.id]);
    
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json(course);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Domain Analysis Endpoints
// ============================================

// Public email domains to exclude from domain analysis
const PUBLIC_EMAIL_DOMAINS = [
  // Major providers
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'aol.com',
  'icloud.com', 'live.com', 'msn.com', 'me.com', 'mail.com',
  'protonmail.com', 'ymail.com', 'googlemail.com', 'fastmail.com',
  'zoho.com', 'tutanota.com', 'gmx.com', 'gmx.net', 'web.de',
  'qq.com', '163.com', '126.com', 'sina.com', 'naver.com',
  // ISPs
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net',
  'cox.net', 'charter.net', 'earthlink.net', 'optonline.net',
  'mac.com', 'pm.me', 'hey.com', 'bigpond.com', 'bigpond.net.au',
  // Disposable/temp email services
  'sharklasers.com', 'guerrillamail.com', 'mailinator.com', 'tempmail.com',
  'throwaway.email', '10minutemail.com', 'fakeinbox.com', 'trashmail.com',
  'yopmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc',
  // Regional providers
  'hotmail.co.uk', 'yahoo.co.uk', 'outlook.co.uk', 'btinternet.com',
  'yahoo.com.au', 'optusnet.com.au', 'hotmail.fr', 'yahoo.fr',
  'wanadoo.fr', 'orange.fr', 't-online.de', 'freenet.de'
];

/**
 * Extract domains from CRM contacts and store against partners
 * POST /api/db/partners/extract-domains
 */
router.post('/partners/extract-domains', async (req, res) => {
  try {
    // Get all contacts with their partner associations
    const contacts = await query(`
      SELECT c.email, c.partner_id, p.account_name
      FROM contacts c
      JOIN partners p ON p.id = c.partner_id
      WHERE c.partner_id IS NOT NULL AND c.email IS NOT NULL
    `);
    
    // Step 1: Build domain -> partner frequency map
    // Track how many contacts from each partner use each domain
    const domainPartnerCounts = new Map(); // domain -> Map(partnerId -> { count, partnerName })
    
    contacts.forEach(contact => {
      const email = contact.email?.toLowerCase();
      if (!email || !email.includes('@')) return;
      const domain = email.split('@')[1];
      
      // Skip public email domains
      if (PUBLIC_EMAIL_DOMAINS.includes(domain)) return;
      
      if (!domainPartnerCounts.has(domain)) {
        domainPartnerCounts.set(domain, new Map());
      }
      const partnerMap = domainPartnerCounts.get(domain);
      if (!partnerMap.has(contact.partner_id)) {
        partnerMap.set(contact.partner_id, { count: 0, partnerName: contact.account_name });
      }
      partnerMap.get(contact.partner_id).count++;
    });
    
    // Step 2: For each domain, determine the "owner" partner
    // A domain belongs to a partner if:
    // - That partner has the majority of contacts using this domain (>= 50%)
    // - OR the partner has at least 3 contacts AND >= 30% of contacts for this domain
    // - AND the domain is not shared across too many different partners (max 3)
    const partnerDomains = new Map(); // partnerId -> Set of domains
    const rejectedDomains = []; // for logging
    
    for (const [domain, partnerMap] of domainPartnerCounts) {
      const totalContacts = Array.from(partnerMap.values()).reduce((sum, p) => sum + p.count, 0);
      const partnerCount = partnerMap.size;
      
      // Skip domains used by too many different partners (likely shared/generic)
      if (partnerCount > 3) {
        rejectedDomains.push({ domain, reason: 'used by too many partners', partnerCount });
        continue;
      }
      
      // Find the dominant partner for this domain
      let dominantPartner = null;
      let maxCount = 0;
      
      for (const [partnerId, data] of partnerMap) {
        if (data.count > maxCount) {
          maxCount = data.count;
          dominantPartner = { partnerId, ...data };
        }
      }
      
      if (!dominantPartner) continue;
      
      const percentage = (maxCount / totalContacts) * 100;
      
      // STRICT RULES for domain ownership:
      // - Must have at least 2 contacts using this domain (avoids single wrong email)
      // - Must have majority (>= 50%) of contacts for this domain
      // OR
      // - Must have at least 5 contacts using this domain (strong signal)
      const isValidDomain = (
        (maxCount >= 2 && percentage >= 50) ||  // At least 2 contacts with majority
        (maxCount >= 5)                          // Or 5+ contacts (strong signal regardless of %)
      );
      
      if (isValidDomain) {
        if (!partnerDomains.has(dominantPartner.partnerId)) {
          partnerDomains.set(dominantPartner.partnerId, new Set());
        }
        partnerDomains.get(dominantPartner.partnerId).add(domain);
      } else {
        rejectedDomains.push({ 
          domain, 
          reason: maxCount < 2 ? 'only 1 contact' : 'no clear owner', 
          topPartner: dominantPartner.partnerName,
          count: maxCount,
          percentage: percentage.toFixed(1)
        });
      }
    }
    
    console.log(`📊 Domain extraction: ${rejectedDomains.length} domains rejected`);
    if (rejectedDomains.length > 0 && rejectedDomains.length <= 20) {
      console.log('Rejected:', rejectedDomains);
    }
    
    // Step 3: Update each partner with their domains
    // First clear all existing domains
    await query('UPDATE partners SET domains = NULL');
    
    let updated = 0;
    for (const [partnerId, domains] of partnerDomains) {
      const domainsArray = Array.from(domains).sort();
      await query(
        'UPDATE partners SET domains = ? WHERE id = ?',
        [JSON.stringify(domainsArray), partnerId]
      );
      updated++;
    }
    
    // Get summary stats
    const totalDomains = Array.from(partnerDomains.values())
      .reduce((sum, set) => sum + set.size, 0);
    
    res.json({
      message: `Extracted domains for ${updated} partners`,
      partnersUpdated: updated,
      totalDomains,
      avgDomainsPerPartner: updated > 0 ? (totalDomains / updated).toFixed(1) : 0
    });
  } catch (error) {
    console.error('Extract domains error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all partner domains (for quick lookup)
 * GET /api/db/partners/domains
 */
router.get('/partners/domains', async (req, res) => {
  try {
    const partners = await query(`
      SELECT id, account_name, partner_tier, domains
      FROM partners
      WHERE domains IS NOT NULL AND domains != '[]'
      ORDER BY account_name
    `);
    
    // Build domain -> partner lookup
    const domainLookup = {};
    let totalDomains = 0;
    
    partners.forEach(p => {
      const domains = typeof p.domains === 'string' ? JSON.parse(p.domains) : p.domains;
      if (Array.isArray(domains)) {
        domains.forEach(domain => {
          domainLookup[domain] = {
            partnerId: p.id,
            partnerName: p.account_name,
            partnerTier: p.partner_tier
          };
          totalDomains++;
        });
      }
    });
    
    res.json({
      partnersWithDomains: partners.length,
      totalDomains,
      domainLookup
    });
  } catch (error) {
    console.error('Get partner domains error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get domain analysis for PARTNER LMS users only
 * Filters to only users whose email domain matches a known partner domain
 */
router.get('/lms/partner-domain-analysis', async (req, res) => {
  try {
    // First, get all partner domains
    const partners = await query(`
      SELECT id, account_name, partner_tier, domains
      FROM partners
      WHERE domains IS NOT NULL AND domains != '[]'
    `);
    
    // Build domain -> partner lookup
    const partnerDomainLookup = new Map();
    partners.forEach(p => {
      const domains = typeof p.domains === 'string' ? JSON.parse(p.domains) : p.domains;
      if (Array.isArray(domains)) {
        domains.forEach(domain => {
          partnerDomainLookup.set(domain.toLowerCase(), {
            partnerId: p.id,
            partnerName: p.account_name,
            partnerTier: p.partner_tier
          });
        });
      }
    });
    
    if (partnerDomainLookup.size === 0) {
      return res.json({
        error: 'No partner domains found. Run "Extract Partner Domains" first.',
        summary: { totalDomains: 0, totalUsers: 0 },
        domains: []
      });
    }
    
    // Get all LMS users with their group memberships
    const users = await query(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        GROUP_CONCAT(DISTINCT g.id) as group_ids,
        GROUP_CONCAT(DISTINCT g.name) as group_names
      FROM lms_users u
      LEFT JOIN lms_group_members gm ON gm.user_id = u.id
      LEFT JOIN lms_groups g ON g.id = gm.group_id
      WHERE u.status = 'active'
      GROUP BY u.id
    `);
    
    // Get all groups (not just ptr_ prefix - also match by partner_id or exact name)
    const allGroups = await query(`
      SELECT g.id, g.name, g.partner_id, p.account_name
      FROM lms_groups g
      LEFT JOIN partners p ON p.id = g.partner_id
      ORDER BY g.name
    `);
    
    // Build group lookup by partner name and partner_id
    const groupByPartnerName = new Map();
    const groupByPartnerId = new Map();
    allGroups.forEach(g => {
      // Map by partner_id if linked
      if (g.partner_id) {
        groupByPartnerId.set(g.partner_id, g);
      }
      
      // Map by group name (with and without ptr_ prefix)
      const nameLower = g.name.toLowerCase();
      groupByPartnerName.set(nameLower, g);
      
      // If has ptr_ prefix, also map without it
      if (nameLower.startsWith('ptr_')) {
        const nameWithoutPrefix = nameLower.replace(/^ptr_/, '');
        groupByPartnerName.set(nameWithoutPrefix, g);
      }
      
      // Also map by linked partner account name
      if (g.account_name) {
        groupByPartnerName.set(g.account_name.toLowerCase(), g);
      }
    });
    
    // Analyze users - only include those with partner domains
    const domainStats = new Map();
    let totalPartnerUsers = 0;
    let skippedNonPartnerUsers = 0;
    
    users.forEach(user => {
      const email = user.email?.toLowerCase();
      if (!email || !email.includes('@')) return;
      const domain = email.split('@')[1];
      
      // Only include if domain belongs to a partner
      const partnerInfo = partnerDomainLookup.get(domain);
      if (!partnerInfo) {
        skippedNonPartnerUsers++;
        return;
      }
      
      totalPartnerUsers++;
      
      if (!domainStats.has(domain)) {
        // Find partner group - check by partner_id first, then by name variations
        let partnerGroup = null;
        
        // First try by partner_id (most reliable)
        if (partnerInfo.partnerId && groupByPartnerId.has(partnerInfo.partnerId)) {
          partnerGroup = groupByPartnerId.get(partnerInfo.partnerId);
        }
        
        // Then try by name variations
        if (!partnerGroup) {
          const possibleNames = [
            partnerInfo.partnerName?.toLowerCase(),
            `ptr_${partnerInfo.partnerName?.toLowerCase()}`
          ];
          for (const name of possibleNames) {
            if (name && groupByPartnerName.has(name)) {
              partnerGroup = groupByPartnerName.get(name);
              break;
            }
          }
        }
        
        domainStats.set(domain, {
          domain,
          userCount: 0,
          inPartnerGroup: 0,
          notInPartnerGroup: 0,
          matchedPartner: partnerInfo.partnerName,
          matchedPartnerId: partnerInfo.partnerId,
          partnerTier: partnerInfo.partnerTier,
          partnerGroupId: partnerGroup?.id || null,
          partnerGroupName: partnerGroup?.name || null,
          users: []
        });
      }
      
      const stats = domainStats.get(domain);
      stats.userCount++;
      
      // Check if user is in their specific partner group (by ID or name)
      const userGroupIds = user.group_ids?.split(',').filter(Boolean) || [];
      const userGroupNames = user.group_names?.split(',').filter(Boolean) || [];
      
      // User is "in partner group" if they're in the matched partner group for this domain
      const inPartnerGroup = stats.partnerGroupId 
        ? (userGroupIds.includes(stats.partnerGroupId) || 
           userGroupNames.some(g => g && g.toLowerCase() === stats.partnerGroupName?.toLowerCase()))
        : false;
      
      if (inPartnerGroup) {
        stats.inPartnerGroup++;
      } else {
        stats.notInPartnerGroup++;
      }
      
      stats.users.push({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        groupIds: userGroupIds,
        groupNames: userGroupNames,
        inPartnerGroup
      });
    });
    
    // Sort domains by user count descending
    const sortedDomains = Array.from(domainStats.values())
      .sort((a, b) => b.userCount - a.userCount);
    
    // Calculate summary stats
    const summary = {
      totalDomains: sortedDomains.length,
      totalUsers: totalPartnerUsers,
      usersInPartnerGroups: sortedDomains.reduce((sum, d) => sum + d.inPartnerGroup, 0),
      usersNotInPartnerGroups: sortedDomains.reduce((sum, d) => sum + d.notInPartnerGroup, 0),
      skippedNonPartnerUsers,
      domainsWithGroupRecommendation: sortedDomains.filter(d => d.partnerGroupId).length
    };
    
    res.json({
      summary,
      domains: sortedDomains
    });
  } catch (error) {
    console.error('Partner domain analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get domain analysis for all LMS users (original - includes non-partners)
 * Groups users by email domain, matches domains to partners, identifies ungrouped users
 */
router.get('/lms/domain-analysis', async (req, res) => {
  try {
    const { includePublic = 'false' } = req.query;
    
    // Get all LMS users with their group memberships
    const users = await query(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        GROUP_CONCAT(DISTINCT g.id) as group_ids,
        GROUP_CONCAT(DISTINCT g.name) as group_names
      FROM lms_users u
      LEFT JOIN lms_group_members gm ON gm.user_id = u.id
      LEFT JOIN lms_groups g ON g.id = gm.group_id
      WHERE u.status = 'active'
      GROUP BY u.id
    `);
    
    // Get CRM contacts with their partner info (for domain matching)
    const contacts = await query(`
      SELECT c.email, p.account_name, p.partner_tier, p.id as partner_id
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      WHERE c.email IS NOT NULL
    `);
    
    // Get all partner groups (ptr_ prefix)
    const partnerGroups = await query(`
      SELECT g.id, g.name, g.partner_id, p.account_name
      FROM lms_groups g
      LEFT JOIN partners p ON p.id = g.partner_id
      WHERE g.name LIKE 'ptr\\_%'
      ORDER BY g.name
    `);
    
    // Build domain -> partner mapping from CRM contacts
    const domainToPartner = new Map();
    contacts.forEach(contact => {
      const email = contact.email?.toLowerCase();
      if (!email || !email.includes('@')) return;
      const domain = email.split('@')[1];
      if (domain && !PUBLIC_EMAIL_DOMAINS.includes(domain)) {
        if (!domainToPartner.has(domain)) {
          domainToPartner.set(domain, {
            partnerId: contact.partner_id,
            partnerName: contact.account_name,
            partnerTier: contact.partner_tier
          });
        }
      }
    });
    
    // Build group lookup by name (for finding matching partner group)
    const groupByName = new Map();
    partnerGroups.forEach(g => {
      groupByName.set(g.name.toLowerCase(), g);
      // Also index by name without ptr_ prefix
      const nameWithoutPrefix = g.name.toLowerCase().replace(/^ptr_/, '');
      groupByName.set(nameWithoutPrefix, g);
    });
    
    // Analyze users by domain
    const domainStats = new Map();
    
    users.forEach(user => {
      const email = user.email?.toLowerCase();
      if (!email || !email.includes('@')) return;
      const domain = email.split('@')[1];
      
      // Skip public email domains unless requested
      if (!includePublic && PUBLIC_EMAIL_DOMAINS.includes(domain)) return;
      
      if (!domainStats.has(domain)) {
        const partnerInfo = domainToPartner.get(domain);
        domainStats.set(domain, {
          domain,
          userCount: 0,
          inPartnerGroup: 0,
          notInPartnerGroup: 0,
          matchedPartner: partnerInfo?.partnerName || null,
          matchedPartnerId: partnerInfo?.partnerId || null,
          partnerTier: partnerInfo?.partnerTier || null,
          partnerGroupId: null,
          partnerGroupName: null,
          users: [],
          isPublicDomain: PUBLIC_EMAIL_DOMAINS.includes(domain)
        });
      }
      
      const stats = domainStats.get(domain);
      stats.userCount++;
      
      // Check if user is in any partner group (ptr_*)
      const userGroups = user.group_names?.split(',') || [];
      const inAnyPartnerGroup = userGroups.some(g => g && g.toLowerCase().startsWith('ptr_'));
      
      if (inAnyPartnerGroup) {
        stats.inPartnerGroup++;
      } else {
        stats.notInPartnerGroup++;
      }
      
      stats.users.push({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        groupIds: user.group_ids?.split(',').filter(Boolean) || [],
        groupNames: userGroups.filter(Boolean),
        inPartnerGroup: inAnyPartnerGroup
      });
    });
    
    // Find recommended partner group for each domain
    domainStats.forEach((stats, domain) => {
      if (stats.matchedPartner) {
        // Try to find matching partner group
        const possibleNames = [
          `ptr_${stats.matchedPartner}`.toLowerCase(),
          stats.matchedPartner.toLowerCase()
        ];
        for (const name of possibleNames) {
          const group = groupByName.get(name);
          if (group) {
            stats.partnerGroupId = group.id;
            stats.partnerGroupName = group.name;
            break;
          }
        }
      }
    });
    
    // Sort domains by user count descending
    const sortedDomains = Array.from(domainStats.values())
      .sort((a, b) => b.userCount - a.userCount);
    
    // Calculate summary stats
    const summary = {
      totalDomains: sortedDomains.length,
      totalUsers: sortedDomains.reduce((sum, d) => sum + d.userCount, 0),
      usersInPartnerGroups: sortedDomains.reduce((sum, d) => sum + d.inPartnerGroup, 0),
      usersNotInPartnerGroups: sortedDomains.reduce((sum, d) => sum + d.notInPartnerGroup, 0),
      domainsMatchedToPartners: sortedDomains.filter(d => d.matchedPartner).length,
      domainsWithGroupRecommendation: sortedDomains.filter(d => d.partnerGroupId).length
    };
    
    res.json({
      summary,
      domains: sortedDomains
    });
  } catch (error) {
    console.error('Domain analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get LMS users by domain
 */
router.get('/lms/users-by-domain/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const { notInGroup } = req.query;
    
    let sql = `
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        GROUP_CONCAT(DISTINCT g.id) as group_ids,
        GROUP_CONCAT(DISTINCT g.name) as group_names
      FROM lms_users u
      LEFT JOIN lms_group_members gm ON gm.user_id = u.id
      LEFT JOIN lms_groups g ON g.id = gm.group_id
      WHERE u.email LIKE ? AND u.status = 'active'
      GROUP BY u.id
    `;
    
    const users = await query(sql, [`%@${domain}`]);
    
    // Optionally filter to only users not in the specified group
    let filteredUsers = users;
    if (notInGroup) {
      filteredUsers = users.filter(u => {
        const groupIds = u.group_ids?.split(',') || [];
        return !groupIds.includes(notInGroup);
      });
    }
    
    res.json(filteredUsers.map(u => ({
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      groupIds: u.group_ids?.split(',').filter(Boolean) || [],
      groupNames: u.group_names?.split(',').filter(Boolean) || []
    })));
  } catch (error) {
    console.error('Users by domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Sync a single group to the database (after creating via API)
 * POST body: { groupId, groupName, partnerId? }
 */
router.post('/lms/groups/sync-one', async (req, res) => {
  try {
    const { groupId, groupName, partnerId } = req.body;
    
    if (!groupId || !groupName) {
      return res.status(400).json({ error: 'groupId and groupName are required' });
    }
    
    // Insert or update the group in our database
    // The partner relationship is stored in lms_groups.partner_id
    await query(`
      INSERT INTO lms_groups (id, name, partner_id, synced_at)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE 
        name = VALUES(name),
        partner_id = COALESCE(VALUES(partner_id), partner_id),
        synced_at = NOW()
    `, [groupId, groupName, partnerId || null]);
    
    console.log(`✅ Group synced to database: ${groupName} (${groupId}), partner_id: ${partnerId || 'none'}`);
    
    res.json({ 
      success: true, 
      message: 'Group synced to database',
      groupId,
      groupName,
      partnerId
    });
  } catch (error) {
    console.error('Group sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Add users to a group via Northpass API
 * POST body: { userIds: string[] }
 */
router.post('/lms/groups/:groupId/add-users', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userIds } = req.body;
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    
    // Verify group exists
    const [group] = await query('SELECT * FROM lms_groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Get user emails for reporting
    const users = await query(
      `SELECT id, email FROM lms_users WHERE id IN (${userIds.map(() => '?').join(',')})`,
      userIds
    );
    
    const results = {
      success: 0,
      alreadyMember: 0,
      failed: 0,
      errors: []
    };
    
    // Build the JSON:API format payload for batch add
    const peopleData = users.map(user => ({
      type: 'people',
      id: String(user.id)
    }));
    
    console.log(`📤 Adding ${users.length} users to group ${groupId}`);
    console.log(`   Payload: ${JSON.stringify({ data: peopleData.slice(0, 2) })}...`);
    
    try {
      // Call Northpass API to add users to group (batch)
      const apiUrl = `${API_BASE}/v2/groups/${groupId}/relationships/people`;
      console.log(`   API URL: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'X-Api-Key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: peopleData })
      });
      
      console.log(`   Response status: ${response.status}`);
      
      if (response.ok || response.status === 201 || response.status === 204) {
        // Success - update local database for all users
        for (const user of users) {
          await query(
            'INSERT IGNORE INTO lms_group_members (group_id, user_id, pending_source) VALUES (?, ?, ?)',
            [groupId, user.id, 'api']
          );
        }
        results.success = users.length;
        console.log(`✅ Added ${users.length} users to group ${groupId}`);
      } else {
        const errorText = await response.text();
        console.error(`❌ Northpass API error (${response.status}): ${errorText}`);
        
        // If batch failed, try one by one
        console.log(`🔄 Batch failed, trying one by one...`);
        for (const user of users) {
          try {
            const singleResponse = await fetch(`${API_BASE}/v2/groups/${groupId}/relationships/people`, {
              method: 'POST',
              headers: {
                'X-Api-Key': API_KEY,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ data: [{ type: 'people', id: String(user.id) }] })
            });
            
            console.log(`   ${user.email}: ${singleResponse.status}`);
            
            if (singleResponse.ok || singleResponse.status === 201 || singleResponse.status === 204) {
              await query(
                'INSERT IGNORE INTO lms_group_members (group_id, user_id, pending_source) VALUES (?, ?, ?)',
                [groupId, user.id, 'api']
              );
              results.success++;
            } else if (singleResponse.status === 422) {
              // Already a member
              results.alreadyMember++;
              await query(
                'INSERT IGNORE INTO lms_group_members (group_id, user_id, pending_source) VALUES (?, ?, ?)',
                [groupId, user.id, 'api']
              );
            } else {
              const singleError = await singleResponse.text();
              results.failed++;
              results.errors.push({ email: user.email, error: singleError || `Status ${singleResponse.status}` });
            }
          } catch (singleErr) {
            results.failed++;
            results.errors.push({ email: user.email, error: singleErr.message });
          }
        }
      }
    } catch (err) {
      console.error('❌ Error calling Northpass API:', err.message);
      results.failed = users.length;
      results.errors = users.map(u => ({ email: u.email, error: err.message }));
    }
    
    // Update group user count
    const [countResult] = await query(
      'SELECT COUNT(*) as count FROM lms_group_members WHERE group_id = ?',
      [groupId]
    );
    await query(
      'UPDATE lms_groups SET user_count = ? WHERE id = ?',
      [countResult.count, groupId]
    );
    
    res.json({
      message: `Added ${results.success} users to group "${group.name}"`,
      results
    });
  } catch (error) {
    console.error('Add users to group error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Group Analysis - MOVED to server/routes/groupRoutes.cjs
// ============================================

// ============================================
// Maintenance - MOVED to server/routes/maintenanceRoutes.cjs
// ============================================

// ============================================
// Reports - MOVED to server/routes/reportRoutes.cjs
// ============================================

// ============================================
// Trends - MOVED to server/routes/trendRoutes.cjs
// ============================================

// ============================================
// Deep Analytics - MOVED to server/routes/analyticsRoutes.cjs
// ============================================

// ============================================
// Company Dashboard Endpoint (for CompanyWidget)
// ============================================

// Helper function to determine product category from course name
function getProductCategory(courseName) {
  if (!courseName) return 'Other';
  const name = courseName.toLowerCase();
  
  if (name.includes('k2') || name.includes('automation k2')) {
    return 'Nintex K2';
  }
  if (name.includes('salesforce') || name.includes('docgen')) {
    return 'Nintex for Salesforce';
  }
  if (name.includes('automation cloud') || name.includes('workflow') || 
      name.includes('forms') || name.includes('rpa') || name.includes('process') ||
      name.includes('sharepoint') || name.includes('office 365') || name.includes('apps') ||
      name.includes('esign') || name.includes('promapp')) {
    return 'Nintex CE';
  }
  return 'Other';
}

// Get company dashboard data by group name (for CompanyWidget)
router.get('/dashboard/group', async (req, res) => {
  try {
    const { name } = req.query;
    
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    // Find the LMS group by name (case-insensitive)
    const [groups] = await query(
      'SELECT * FROM lms_groups WHERE LOWER(name) = LOWER(?) LIMIT 1',
      [name]
    );
    
    if (!groups || groups.length === 0) {
      return res.status(404).json({ error: `Group "${name}" not found` });
    }
    
    const group = groups;
    
    // Get all users in this group via lms_group_members
    const users = await query(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.last_active_at
      FROM lms_users u
      JOIN lms_group_members gm ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `, [group.id]);
    
    if (users.length === 0) {
      // Return empty dashboard
      return res.json({
        group: {
          id: group.id,
          name: group.name,
          memberCount: 0
        },
        users: [],
        totals: {
          totalNPCU: 0,
          certifiedUsers: 0,
          totalEnrolled: 0,
          totalInProgress: 0,
          totalCompleted: 0,
          totalCertifications: 0
        },
        productBreakdown: {
          'Nintex CE': { count: 0, npcu: 0, courses: [] },
          'Nintex K2': { count: 0, npcu: 0, courses: [] },
          'Nintex for Salesforce': { count: 0, npcu: 0, courses: [] },
          'Other': { count: 0, npcu: 0, courses: [] }
        }
      });
    }
    
    const userIds = users.map(u => u.id);
    const placeholders = userIds.map(() => '?').join(',');
    
    // Get all enrollments for these users with course info
    const enrollments = await query(`
      SELECT 
        e.id as enrollment_id,
        e.user_id,
        e.course_id,
        e.status,
        e.progress_percent,
        e.enrolled_at,
        e.started_at,
        e.completed_at,
        e.expires_at,
        co.name as course_name,
        co.npcu_value,
        co.is_certification,
        co.product_category
      FROM lms_enrollments e
      JOIN lms_courses co ON co.id = e.course_id
      WHERE e.user_id IN (${placeholders})
    `, userIds);
    
    // Build user data with learning stats
    const productBreakdown = {
      'Nintex CE': { count: 0, npcu: 0, courses: [] },
      'Nintex K2': { count: 0, npcu: 0, courses: [] },
      'Nintex for Salesforce': { count: 0, npcu: 0, courses: [] },
      'Other': { count: 0, npcu: 0, courses: [] }
    };
    
    let totalNPCU = 0;
    let certifiedUsers = 0;
    let totalEnrolled = 0;
    let totalInProgress = 0;
    let totalCompleted = 0;
    let totalCertifications = 0;
    
    // Track unique certifications to avoid duplicates
    const countedCertifications = new Set();
    
    const processedUsers = users.map(user => {
      const userEnrollments = enrollments.filter(e => e.user_id === user.id);
      
      let userNPCU = 0;
      let userCertCount = 0;
      const userCertifications = [];
      
      // Count all enrollments (total courses user is enrolled in, regardless of status)
      let totalEnrollments = userEnrollments.length;
      let inProgress = 0;
      let completed = 0;
      
      userEnrollments.forEach(e => {
        if (e.status === 'in_progress') inProgress++;
        else if (e.status === 'completed') {
          completed++;
          
          // Check if this is a valid certification (not expired)
          const isExpired = e.expires_at && new Date(e.expires_at) < new Date();
          
          if (e.is_certification && e.npcu_value > 0 && !isExpired) {
            // Use course_id + user_id as unique key to avoid counting duplicates
            const certKey = `${user.id}-${e.course_id}`;
            if (!countedCertifications.has(certKey)) {
              countedCertifications.add(certKey);
              
              userNPCU += e.npcu_value;
              userCertCount++;
              
              // Add to product breakdown
              const category = e.product_category || getProductCategory(e.course_name);
              if (productBreakdown[category]) {
                productBreakdown[category].count++;
                productBreakdown[category].npcu += e.npcu_value;
                productBreakdown[category].courses.push({
                  id: e.course_id,
                  name: e.course_name,
                  npcu: e.npcu_value,
                  completedAt: e.completed_at,
                  expiresAt: e.expires_at,
                  userId: user.id,
                  userName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email
                });
              }
              
              userCertifications.push({
                id: e.enrollment_id,
                courseId: e.course_id,
                name: e.course_name,
                npcu: e.npcu_value,
                completedAt: e.completed_at,
                expiresAt: e.expires_at,
                status: 'completed',
                isValidCourse: true
              });
            }
          }
        }
      });
      
      // Update totals
      totalNPCU += userNPCU;
      totalEnrolled += totalEnrollments;  // Total courses enrolled (all statuses)
      totalInProgress += inProgress;
      totalCompleted += completed;
      totalCertifications += userCertCount;
      
      if (userNPCU > 0) certifiedUsers++;
      
      return {
        id: user.id,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
        email: user.email,
        lastLoginAt: user.last_active_at,
        totalNPCU: userNPCU,
        certificationCount: userCertCount,
        certifications: userCertifications,
        enrolledCourses: totalEnrollments,  // Total courses this user is enrolled in
        inProgressCourses: inProgress,
        completedCourses: completed,
        totalCourses: userEnrollments.length,
        completionRate: userEnrollments.length > 0 
          ? Math.round((completed / userEnrollments.length) * 100) 
          : 0
      };
    });
    
    // Sort users by NPCU descending
    processedUsers.sort((a, b) => b.totalNPCU - a.totalNPCU);
    
    res.json({
      group: {
        id: group.id,
        name: group.name,
        memberCount: users.length
      },
      users: processedUsers,
      totals: {
        totalNPCU,
        certifiedUsers,
        totalEnrolled,
        totalInProgress,
        totalCompleted,
        totalCertifications
      },
      productBreakdown
    });
    
  } catch (error) {
    console.error('Company dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Scheduled Sync Endpoints
// ============================================

// Get schedule configuration
router.get('/schedule', async (req, res) => {
  try {
    const config = await getScheduleConfig();
    const status = getSchedulerStatus();
    res.json({ ...config, ...status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update schedule configuration
router.put('/schedule', async (req, res) => {
  try {
    const { enabled, interval_hours, sync_types } = req.body;
    const config = await updateScheduleConfig({
      enabled: enabled ?? false,
      interval_hours: interval_hours ?? 24,
      sync_types: sync_types ?? ['users', 'groups', 'courses', 'enrollments']
    });
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Excel Import Endpoints (Partner Data Management)
// ============================================

// Track active import
let activeImport = null;

// Import progress endpoint
router.get('/import/progress', async (req, res) => {
  try {
    const progress = await getImportProgress();
    res.json(progress || { status: 'idle' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import status endpoint
router.get('/import/status', async (req, res) => {
  try {
    if (activeImport) {
      res.json(activeImport);
    } else {
      res.json({ status: 'idle' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Excel import endpoint
router.post('/import/excel', async (req, res) => {
  try {
    // Set active import status
    activeImport = { status: 'processing', startedAt: new Date().toISOString() };
    
    // Extract file data from request body
    const { fileData, fileName, clearExisting = false } = req.body;
    
    if (!fileData) {
      throw new Error('No file data provided');
    }
    
    // Convert base64 to Buffer
    const fileBuffer = Buffer.from(fileData, 'base64');
    console.log(`📥 Received ${fileBuffer.length} bytes for ${fileName || 'unnamed file'}`);
    
    const result = await importContactsFromExcel(fileBuffer, fileName, { clearExisting });
    
    activeImport = { 
      status: 'completed', 
      completedAt: new Date().toISOString(),
      result 
    };
    
    res.json(result);
  } catch (error) {
    console.error('❌ Import failed:', error);
    activeImport = { 
      status: 'error', 
      error: error.message,
      completedAt: new Date().toISOString()
    };
    res.status(500).json({ error: error.message });
  }
});

// Get import statistics
router.get('/import/stats', async (req, res) => {
  try {
    const stats = await getImportStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get partners list for import management
router.get('/import/partners', async (req, res) => {
  try {
    const { limit = 100, search } = req.query;
    if (search) {
      const partners = await searchPartners(search, parseInt(limit));
      res.json(partners);
    } else {
      const partners = await getPartnerList(parseInt(limit));
      res.json(partners);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get contacts for a specific partner
router.get('/import/partners/:id/contacts', async (req, res) => {
  try {
    const contacts = await getPartnerContacts(parseInt(req.params.id));
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search contacts endpoint
router.get('/import/search', async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }
    const contacts = await searchContacts(q, parseInt(limit));
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search contacts (alternate endpoint for export)
router.get('/import/contacts/search', async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    const contacts = await searchContacts(q || '@', parseInt(limit));
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Preview contacts for cleaning
router.get('/import/preview/:type/:value', async (req, res) => {
  try {
    const { type, value } = req.params;
    const { limit = 200 } = req.query;
    const contacts = await getContactsPreview(type, value, parseInt(limit));
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete partner
router.delete('/import/partners/:id', async (req, res) => {
  try {
    const result = await deletePartner(parseInt(req.params.id));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete by region
router.delete('/import/by-region/:region', async (req, res) => {
  try {
    const result = await deleteByRegion(req.params.region);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete by tier
router.delete('/import/by-tier/:tier', async (req, res) => {
  try {
    const result = await deleteByTier(req.params.tier);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete by account pattern
router.delete('/import/by-pattern/:pattern', async (req, res) => {
  try {
    const result = await deleteByAccountPattern(req.params.pattern);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unmatched contacts (not linked to LMS)
router.get('/import/unmatched', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const contacts = await getUnmatchedContacts({
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get match statistics
router.get('/import/match-stats', async (req, res) => {
  try {
    const stats = await getMatchStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all partner/contact data
router.delete('/import/all', async (req, res) => {
  try {
    const result = await clearAllData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Re-link contacts to LMS users
router.post('/import/link', async (req, res) => {
  try {
    const result = await linkContactsToLmsUsers();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Partner-Group Matching Endpoints
// ============================================

// Run auto-matching
router.post('/matching/auto', async (req, res) => {
  try {
    const { minScore = 0.85, dryRun = false } = req.body;
    const result = await autoMatchGroups(minScore, dryRun);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get matching suggestions
router.get('/matching/suggestions', async (req, res) => {
  try {
    const { minScore = 0.5 } = req.query;
    const suggestions = await getMatchingSuggestions(parseFloat(minScore));
    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get matching stats
router.get('/matching/stats', async (req, res) => {
  try {
    const stats = await getMatchingStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Link a group to a partner manually
router.post('/matching/link', async (req, res) => {
  try {
    const { groupId, partnerId } = req.body;
    const result = await linkGroupToPartner(groupId, partnerId);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unlink a group from its partner
router.post('/matching/unlink', async (req, res) => {
  try {
    const { groupId } = req.body;
    const result = await unlinkGroup(groupId);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Account Owner Reporting Endpoints
// ============================================

// Get all account owners with overview stats
router.get('/owner-reports/overview', async (req, res) => {
  try {
    const owners = await getAccountOwnersOverview();
    res.json(owners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get partners for the currently logged-in user (by their email)
// This enables "My Accounts" filtering for Channel Managers
router.get('/owner-reports/my-accounts', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'User email not found in session' });
    }
    
    const partners = await getPartnersByOwnerEmail(userEmail);
    res.json({
      ownerEmail: userEmail,
      partnerCount: partners.length,
      partners
    });
  } catch (error) {
    console.error('Error getting my accounts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get partners by owner email (admin lookup)
router.get('/owner-reports/by-email/:email', authMiddleware, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const partners = await getPartnersByOwnerEmail(email);
    res.json({
      ownerEmail: email,
      partnerCount: partners.length,
      partners
    });
  } catch (error) {
    console.error('Error getting partners by owner email:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get full report for a specific account owner
router.get('/owner-reports/:ownerName', async (req, res) => {
  try {
    const report = await getAccountOwnerReport(decodeURIComponent(req.params.ownerName));
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate email-ready report for an account owner
router.get('/owner-reports/:ownerName/email', async (req, res) => {
  try {
    const report = await generateAccountOwnerEmailReport(decodeURIComponent(req.params.ownerName));
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Regional Reporting Endpoints
// ============================================

// Get regional report
router.get('/regional-reports', async (req, res) => {
  try {
    const { region } = req.query;
    const report = await getRegionalReport(region);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Compliance & Leaderboard Endpoints
// ============================================

// Get compliance gaps (partners not meeting tier requirements)
router.get('/compliance/gaps', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const gaps = await getComplianceGapsReport(parseInt(limit));
    res.json(gaps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get partner leaderboard by NPCU
router.get('/compliance/leaderboard', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const leaderboard = await getPartnerLeaderboard(parseInt(limit));
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get expiring certifications
router.get('/compliance/expiring', async (req, res) => {
  try {
    const { days = 90 } = req.query;
    const expiring = await getExpiringCertificationsReport(parseInt(days));
    res.json(expiring);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get partner certification summary
router.get('/partners/:id/certifications', async (req, res) => {
  try {
    const summary = await getPartnerCertificationSummary(parseInt(req.params.id));
    if (!summary) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Partner Dashboard Endpoints (DB-backed)
// ============================================

// Find partner by name (exact or fuzzy) - for partner dashboard
router.get('/dashboard/partner', async (req, res) => {
  try {
    const { name, tier } = req.query;
    
    if (!name) {
      return res.status(400).json({ error: 'Partner name is required' });
    }
    
    // Try exact match first
    let [partner] = await query(
      'SELECT * FROM partners WHERE account_name = ?',
      [name]
    );
    
    // If no exact match, try case-insensitive
    if (!partner) {
      [partner] = await query(
        'SELECT * FROM partners WHERE LOWER(account_name) = LOWER(?)',
        [name]
      );
    }
    
    // If still no match, try LIKE
    if (!partner) {
      [partner] = await query(
        'SELECT * FROM partners WHERE account_name LIKE ?',
        [`%${name}%`]
      );
    }
    
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found', searchedName: name });
    }
    
    // Get partner's LMS group
    const [group] = await query(
      'SELECT * FROM lms_groups WHERE partner_id = ?',
      [partner.id]
    );
    
    // Get users linked to this partner through contacts
    const users = await query(`
      SELECT DISTINCT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        u.last_active_at,
        c.title
      FROM lms_users u
      INNER JOIN contacts c ON c.lms_user_id = u.id
      WHERE c.partner_id = ?
      ORDER BY u.last_name, u.first_name
    `, [partner.id]);
    
    // Get all enrollments for these users
    const userIds = users.map(u => u.id);
    let enrollments = [];
    
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      enrollments = await query(`
        SELECT 
          e.id,
          e.user_id,
          e.course_id,
          e.status,
          e.progress_percent,
          e.completed_at,
          e.expires_at,
          e.score,
          c.name as course_name,
          c.npcu_value,
          c.is_certification,
          c.product_category
        FROM lms_enrollments e
        INNER JOIN lms_courses c ON c.id = e.course_id
        WHERE e.user_id IN (${placeholders})
        ORDER BY e.completed_at DESC
      `, userIds);
    }
    
    // Calculate NPCU totals
    const now = new Date();
    let totalNpcu = 0;
    let activeCertifications = 0;
    let expiredCertifications = 0;
    
    const certificationsByUser = new Map();
    
    for (const enrollment of enrollments) {
      if (enrollment.status === 'completed' && enrollment.is_certification && enrollment.npcu_value > 0) {
        // Check expiry
        const isExpired = enrollment.expires_at && new Date(enrollment.expires_at) < now;
        
        if (isExpired) {
          expiredCertifications++;
        } else {
          activeCertifications++;
          totalNpcu += enrollment.npcu_value;
        }
        
        // Track by user
        if (!certificationsByUser.has(enrollment.user_id)) {
          certificationsByUser.set(enrollment.user_id, { active: 0, expired: 0, npcu: 0 });
        }
        const userStats = certificationsByUser.get(enrollment.user_id);
        if (isExpired) {
          userStats.expired++;
        } else {
          userStats.active++;
          userStats.npcu += enrollment.npcu_value;
        }
      }
    }
    
    // Build user details with certifications
    const userDetails = users.map(user => {
      const userEnrollments = enrollments.filter(e => e.user_id === user.id);
      const userCertStats = certificationsByUser.get(user.id) || { active: 0, expired: 0, npcu: 0 };
      
      return {
        ...user,
        enrollments: userEnrollments,
        certifications: userCertStats.active,
        expiredCertifications: userCertStats.expired,
        npcu: userCertStats.npcu
      };
    });
    
    // Determine tier requirement from database
    const effectiveTier = tier || partner.partner_tier || 'Certified';
    const tiers = await query('SELECT name, npcu_required FROM partner_tiers WHERE is_active = TRUE');
    const tierRequirements = {};
    tiers.forEach(t => {
      tierRequirements[t.name] = t.npcu_required || 0;
    });
    // Fallback defaults if no tiers in database
    if (Object.keys(tierRequirements).length === 0) {
      tierRequirements['Premier'] = 20;
      tierRequirements['Premier Plus'] = 20;
      tierRequirements['Certified'] = 10;
      tierRequirements['Registered'] = 5;
      tierRequirements['Aggregator'] = 5;
    }
    const requiredNpcu = tierRequirements[effectiveTier] || 2;
    
    // Group certifications by product category
    const certificationsByCategory = {};
    for (const enrollment of enrollments) {
      if (enrollment.status === 'completed' && enrollment.is_certification) {
        const category = enrollment.product_category || 'Other';
        if (!certificationsByCategory[category]) {
          certificationsByCategory[category] = [];
        }
        certificationsByCategory[category].push(enrollment);
      }
    }
    
    res.json({
      partner: {
        id: partner.id,
        name: partner.account_name,
        tier: effectiveTier,
        region: partner.account_region,
        owner: partner.account_owner,
        requiredNpcu,
        currentNpcu: totalNpcu,
        npcuGap: Math.max(0, requiredNpcu - totalNpcu),
        isCompliant: totalNpcu >= requiredNpcu
      },
      group: group ? {
        id: group.id,
        name: group.name,
        userCount: group.user_count
      } : null,
      users: userDetails,
      certificationsByCategory,
      summary: {
        totalUsers: users.length,
        usersWithCertifications: certificationsByUser.size,
        activeCertifications,
        expiredCertifications,
        totalNpcu,
        requiredNpcu,
        compliancePercent: Math.min(100, Math.round((totalNpcu / requiredNpcu) * 100))
      }
    });
  } catch (error) {
    console.error('Dashboard partner lookup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all certification courses with NPCU values
router.get('/dashboard/courses', async (req, res) => {
  try {
    const courses = await query(`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.product_category,
        c.npcu_value,
        c.is_certification,
        c.status
      FROM lms_courses c
      WHERE c.is_certification = 1 AND c.npcu_value > 0
      ORDER BY c.product_category, c.name
    `);
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// Task Scheduler API
// ==========================================

// Get all scheduled tasks
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await taskScheduler.getAllTasks();
    const status = taskScheduler.getSchedulerStatus();
    res.json({ tasks, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single task details
router.get('/tasks/:taskType', async (req, res) => {
  try {
    const task = await taskScheduler.getTask(req.params.taskType);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const history = await taskScheduler.getTaskHistory(req.params.taskType, 10);
    res.json({ task, history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enable/disable a task
router.post('/tasks/:taskType/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    const task = await taskScheduler.setTaskEnabled(req.params.taskType, enabled);
    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task config
router.put('/tasks/:taskType/config', async (req, res) => {
  try {
    const config = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Invalid config object' });
    }
    
    const result = await query(`
      UPDATE scheduled_tasks 
      SET config = ?, 
          updated_at = NOW()
      WHERE task_type = ?
    `, [JSON.stringify(config), req.params.taskType]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = await taskScheduler.getTask(req.params.taskType);
    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task interval
router.put('/tasks/:taskType/interval', async (req, res) => {
  try {
    const { intervalMinutes } = req.body;
    if (!intervalMinutes || intervalMinutes < 1) {
      return res.status(400).json({ error: 'Invalid interval (minimum 1 minute)' });
    }
    
    const result = await query(`
      UPDATE scheduled_tasks 
      SET interval_minutes = ?, 
          next_run_at = DATE_ADD(COALESCE(last_run_at, NOW()), INTERVAL ? MINUTE),
          updated_at = NOW()
      WHERE task_type = ?
    `, [intervalMinutes, intervalMinutes, req.params.taskType]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = await taskScheduler.getTask(req.params.taskType);
    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manually trigger a task
router.post('/tasks/:taskType/run', async (req, res) => {
  try {
    // Start the task but don't wait for it
    taskScheduler.triggerTask(req.params.taskType)
      .then(result => console.log(`Task ${req.params.taskType} completed:`, result))
      .catch(err => console.error(`Task ${req.params.taskType} failed:`, err.message));
    
    res.json({ success: true, message: 'Task started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get task history
router.get('/tasks/:taskType/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const history = await taskScheduler.getTaskHistory(req.params.taskType, limit);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get analysis history
router.get('/analysis/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await taskScheduler.getAnalysisHistory(limit);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get analysis details
router.get('/analysis/:id', async (req, res) => {
  try {
    const details = await taskScheduler.getAnalysisDetails(req.params.id);
    res.json(details);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save manual analysis results
router.post('/analysis/save', async (req, res) => {
  try {
    const analysisId = await taskScheduler.saveManualAnalysis(req.body);
    res.json({ success: true, analysisId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unified sync history (combines task_run_history and sync_logs)
router.get('/sync/unified-history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    
    // Get task run history (scheduled tasks) - extract records from result_summary JSON
    const taskHistory = await query(`
      SELECT 
        id,
        task_type as sync_type,
        status,
        started_at,
        completed_at,
        duration_seconds,
        error_message,
        result_summary as details,
        records_processed,
        COALESCE(JSON_EXTRACT(result_summary, '$.recordsProcessed'), 0) as json_records_processed,
        COALESCE(JSON_EXTRACT(result_summary, '$.updated'), JSON_EXTRACT(result_summary, '$.confirmed'), 0) as records_updated,
        COALESCE(JSON_EXTRACT(result_summary, '$.errors'), JSON_EXTRACT(result_summary, '$.failed'), 0) as records_failed,
        'scheduled_task' as source
      FROM task_run_history 
      ORDER BY started_at DESC 
      LIMIT ?
    `, [limit]);
    
    // Get enrollment sync logs
    const syncLogs = await query(`
      SELECT 
        id,
        sync_type,
        status,
        started_at,
        completed_at,
        records_processed,
        records_created,
        records_updated,
        records_failed,
        error_message,
        details,
        TIMESTAMPDIFF(SECOND, started_at, completed_at) as duration_seconds,
        'enrollment_sync' as source
      FROM sync_logs 
      ORDER BY started_at DESC 
      LIMIT ?
    `, [limit]);
    
    // Merge and sort by started_at DESC
    const taskHistoryArray = Array.isArray(taskHistory) ? taskHistory : [];
    const syncLogsArray = Array.isArray(syncLogs) ? syncLogs : [];
    
    const combined = [
      ...taskHistoryArray.map(h => ({
        ...h,
        // Use records_processed from column or fallback to JSON
        records_processed: h.records_processed || h.json_records_processed || 0,
        records_updated: h.records_updated || 0,
        records_failed: h.records_failed || 0,
        details: typeof h.details === 'string' ? h.details : JSON.stringify(h.details)
      })),
      ...syncLogsArray.map(log => ({
        ...log,
        details: typeof log.details === 'string' ? log.details : JSON.stringify(log.details)
      }))
    ].sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
     .slice(0, limit);
    
    res.json(combined);
  } catch (error) {
    console.error('Failed to get unified history:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Authentication & Authorization Endpoints
// ============================================

/**
 * Middleware to validate auth token
 */
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  
  validateSession(token)
    .then(user => {
      if (!user) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }
      req.user = user;
      next();
    })
    .catch(err => {
      res.status(500).json({ error: 'Authentication error' });
    });
}

/**
 * Check if user has specific permission
 */
function requirePermission(category, action) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const permissions = req.user.permissions || {};
    if (!permissions[category]?.[action]) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    next();
  };
}

// Login
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const result = await login(email, password);
    
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout
router.post('/auth/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    await logout(token);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Validate session / get current user
router.get('/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

// Clean up expired sessions (admin only)
router.post('/auth/cleanup', authMiddleware, requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const deleted = await cleanupExpiredSessions();
    res.json({ success: true, deletedSessions: deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// User Management Endpoints
// ============================================

// Get all users
router.get('/admin/users', authMiddleware, requirePermission('users', 'view'), async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by ID
router.get('/admin/users/:id', authMiddleware, requirePermission('users', 'view'), async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user
router.post('/admin/users', authMiddleware, requirePermission('users', 'create'), async (req, res) => {
  try {
    const { email, password, firstName, lastName, profileId } = req.body;
    
    if (!email || !password || !profileId) {
      return res.status(400).json({ error: 'Email, password, and profile required' });
    }
    
    const result = await createUser({
      email,
      password,
      firstName,
      lastName,
      profileId,
      createdBy: req.user.id
    });
    
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update user
router.put('/admin/users/:id', authMiddleware, requirePermission('users', 'edit'), async (req, res) => {
  try {
    const result = await updateUser(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Change password
router.put('/admin/users/:id/password', authMiddleware, async (req, res) => {
  try {
    // Users can change their own password, admins can change anyone's
    const targetId = parseInt(req.params.id);
    const canEditOthers = req.user.permissions?.users?.edit;
    
    if (targetId !== req.user.id && !canEditOthers) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    const result = await changePassword(targetId, newPassword);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete user
router.delete('/admin/users/:id', authMiddleware, requirePermission('users', 'delete'), async (req, res) => {
  try {
    // Prevent self-deletion
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const result = await deleteUser(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Profile Management Endpoints
// ============================================

// Get all profiles
router.get('/admin/profiles', authMiddleware, requirePermission('profiles', 'view'), async (req, res) => {
  try {
    const profiles = await getProfiles();
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get profiles (for dropdowns - less restrictive)
router.get('/admin/profiles/list', authMiddleware, async (req, res) => {
  try {
    const profiles = await getProfiles();
    res.json(profiles.map(p => ({ id: p.id, name: p.name, description: p.description })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get profile by ID
router.get('/admin/profiles/:id', authMiddleware, requirePermission('profiles', 'view'), async (req, res) => {
  try {
    const profile = await getProfileById(req.params.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create profile
router.post('/admin/profiles', authMiddleware, requirePermission('profiles', 'create'), async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    
    if (!name || !permissions) {
      return res.status(400).json({ error: 'Name and permissions required' });
    }
    
    const result = await createProfile({ name, description, permissions });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update profile
router.put('/admin/profiles/:id', authMiddleware, requirePermission('profiles', 'edit'), async (req, res) => {
  try {
    const result = await updateProfile(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete profile
router.delete('/admin/profiles/:id', authMiddleware, requirePermission('profiles', 'delete'), async (req, res) => {
  try {
    const result = await deleteProfile(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Portal Settings Endpoints
// ============================================

// Get tier requirements (public - used by CompanyWidget)
router.get('/settings/tier-requirements', async (req, res) => {
  try {
    // Primary source: partner_tiers table
    const tiers = await query('SELECT name, npcu_required FROM partner_tiers WHERE is_active = TRUE');
    if (tiers.length > 0) {
      const tierReqs = {};
      tiers.forEach(t => {
        tierReqs[t.name] = t.npcu_required || 0;
      });
      return res.json(tierReqs);
    }
    
    // Fallback to portal_settings (legacy)
    const rows = await query('SELECT tier_requirements FROM portal_settings WHERE id = 1');
    if (rows.length > 0 && rows[0].tier_requirements) {
      const tierReqs = typeof rows[0].tier_requirements === 'string' 
        ? JSON.parse(rows[0].tier_requirements) 
        : rows[0].tier_requirements;
      return res.json(tierReqs);
    }
    
    // Return defaults if nothing configured
    res.json({
      'Registered': 5,
      'Certified': 10,
      'Premier': 20,
      'Premier Plus': 20,
      'Aggregator': 5
    });
  } catch (error) {
    console.error('Error getting tier requirements:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update tier requirements (admin only)
router.put('/settings/tier-requirements', authMiddleware, async (req, res) => {
  try {
    const tierRequirements = req.body;
    
    // Validate the input
    const validTiers = ['Registered', 'Certified', 'Select', 'Premier', 'Premier Plus', 'Aggregator'];
    for (const tier of validTiers) {
      if (tierRequirements[tier] !== undefined && (typeof tierRequirements[tier] !== 'number' || tierRequirements[tier] < 0)) {
        return res.status(400).json({ error: `Invalid value for ${tier}: must be a non-negative number` });
      }
    }
    
    await query(
      'INSERT INTO portal_settings (id, tier_requirements) VALUES (1, ?) ON DUPLICATE KEY UPDATE tier_requirements = VALUES(tier_requirements), updated_at = NOW()',
      [JSON.stringify(tierRequirements)]
    );
    
    res.json({ success: true, tierRequirements });
  } catch (error) {
    console.error('Error updating tier requirements:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all portal settings (admin only)
router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM portal_settings WHERE id = 1');
    if (rows.length === 0) {
      res.json({
        tierRequirements: {
          'Registered': 5,
          'Certified': 10,
          'Select': 15,
          'Premier': 20,
          'Premier Plus': 20,
          'Aggregator': 5
        }
      });
    } else {
      const settings = rows[0];
      res.json({
        tierRequirements: typeof settings.tier_requirements === 'string' 
          ? JSON.parse(settings.tier_requirements) 
          : settings.tier_requirements,
        updatedAt: settings.updated_at
      });
    }
  } catch (error) {
    console.error('Error getting portal settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Partner Tier Management Endpoints
// ============================================

// Get all tiers (public - for dropdowns, badges, etc.)
router.get('/tiers', async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, name, description, npcu_required, color, sort_order, is_active FROM partner_tiers ORDER BY sort_order ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error getting tiers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get active tiers only (for public dropdowns)
router.get('/tiers/active', async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, name, description, npcu_required, color, sort_order FROM partner_tiers WHERE is_active = TRUE ORDER BY sort_order ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error getting active tiers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single tier by ID
router.get('/tiers/:id', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM partner_tiers WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Tier not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error getting tier:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new tier (admin only)
router.post('/tiers', authMiddleware, requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const { name, description, npcu_required, color, sort_order, is_active } = req.body;
    
    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Tier name is required' });
    }
    
    // Check for duplicate name
    const existing = await query('SELECT id FROM partner_tiers WHERE name = ?', [name.trim()]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'A tier with this name already exists' });
    }
    
    // Get next sort order if not provided
    let finalSortOrder = sort_order;
    if (finalSortOrder === undefined || finalSortOrder === null) {
      const maxSort = await query('SELECT MAX(sort_order) as max_sort FROM partner_tiers');
      finalSortOrder = (maxSort[0]?.max_sort || 0) + 1;
    }
    
    const result = await query(
      `INSERT INTO partner_tiers (name, description, npcu_required, color, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        description || '',
        npcu_required || 0,
        color || '#666666',
        finalSortOrder,
        is_active !== false
      ]
    );
    
    // Fetch the created tier
    const newTier = await query('SELECT * FROM partner_tiers WHERE id = ?', [result.insertId]);
    
    res.status(201).json(newTier[0]);
  } catch (error) {
    console.error('Error creating tier:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a tier (admin only)
router.put('/tiers/:id', authMiddleware, requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, npcu_required, color, sort_order, is_active } = req.body;
    
    // Check tier exists
    const existing = await query('SELECT * FROM partner_tiers WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Tier not found' });
    }
    
    // Validate name if changing
    if (name && name.trim() !== existing[0].name) {
      const duplicate = await query('SELECT id FROM partner_tiers WHERE name = ? AND id != ?', [name.trim(), id]);
      if (duplicate.length > 0) {
        return res.status(400).json({ error: 'A tier with this name already exists' });
      }
    }
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    
    if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (npcu_required !== undefined) { updates.push('npcu_required = ?'); values.push(npcu_required); }
    if (color !== undefined) { updates.push('color = ?'); values.push(color); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    await query(`UPDATE partner_tiers SET ${updates.join(', ')} WHERE id = ?`, values);
    
    // If name changed, update partners table too
    if (name && name.trim() !== existing[0].name) {
      await query(
        'UPDATE partners SET partner_tier = ? WHERE partner_tier = ?',
        [name.trim(), existing[0].name]
      );
    }
    
    // Fetch the updated tier
    const updatedTier = await query('SELECT * FROM partner_tiers WHERE id = ?', [id]);
    
    res.json(updatedTier[0]);
  } catch (error) {
    console.error('Error updating tier:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a tier (admin only)
router.delete('/tiers/:id', authMiddleware, requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check tier exists
    const existing = await query('SELECT * FROM partner_tiers WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Tier not found' });
    }
    
    // Check if tier is in use
    const inUse = await query(
      'SELECT COUNT(*) as count FROM partners WHERE partner_tier = ?',
      [existing[0].name]
    );
    
    if (inUse[0].count > 0) {
      return res.status(400).json({ 
        error: `Cannot delete tier "${existing[0].name}" - it is assigned to ${inUse[0].count} partner(s)`,
        partnersCount: inUse[0].count
      });
    }
    
    await query('DELETE FROM partner_tiers WHERE id = ?', [id]);
    
    res.json({ success: true, message: `Tier "${existing[0].name}" deleted successfully` });
  } catch (error) {
    console.error('Error deleting tier:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reorder tiers (admin only)
router.put('/tiers/reorder', authMiddleware, requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const { tierIds } = req.body; // Array of tier IDs in desired order
    
    if (!Array.isArray(tierIds) || tierIds.length === 0) {
      return res.status(400).json({ error: 'tierIds array is required' });
    }
    
    // Update sort_order for each tier
    for (let i = 0; i < tierIds.length; i++) {
      await query('UPDATE partner_tiers SET sort_order = ? WHERE id = ?', [i + 1, tierIds[i]]);
    }
    
    // Return updated tiers
    const tiers = await query('SELECT * FROM partner_tiers ORDER BY sort_order ASC');
    res.json(tiers);
  } catch (error) {
    console.error('Error reordering tiers:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// USER ANALYTICS & ORPHAN DISCOVERY ROUTES
// ============================================

/**
 * Get breakdown of LMS users by association status
 * Partner users = in partner groups OR linked via contacts
 * Unlinked users = not yet linked to a partner (potential orphans to discover)
 */
router.get('/users/breakdown', async (req, res) => {
  try {
    // Total LMS users
    const [totalResult] = await query('SELECT COUNT(*) as count FROM lms_users');
    const totalUsers = totalResult.count;
    
    // Linked partner users (confirmed associations)
    const [linkedResult] = await query(`
      SELECT COUNT(DISTINCT user_id) as count FROM (
        SELECT ct.lms_user_id as user_id
        FROM contacts ct
        WHERE ct.partner_id IS NOT NULL AND ct.lms_user_id IS NOT NULL
        UNION
        SELECT gm.user_id
        FROM lms_group_members gm
        INNER JOIN lms_groups g ON g.id = gm.group_id
        WHERE g.partner_id IS NOT NULL
      ) linked_users
    `);
    const linkedPartnerUsers = linkedResult.count;
    
    // Unlinked users (potential orphans to discover)
    const unlinkedUsers = totalUsers - linkedPartnerUsers;
    
    res.json({
      totalUsers,
      linkedPartnerUsers,
      unlinkedUsers,
      percentageLinked: ((linkedPartnerUsers / totalUsers) * 100).toFixed(1),
      percentageUnlinked: ((unlinkedUsers / totalUsers) * 100).toFixed(1),
      note: 'Analytics only track linkedPartnerUsers. Unlinked users are available for orphan discovery via domain matching.'
    });
  } catch (error) {
    console.error('Error getting user breakdown:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Find orphaned partner users - LMS users whose email domain matches a partner
 * but who are NOT yet linked to that partner
 * These are users who registered directly in Northpass bypassing the CRM automation
 * 
 * IMPORTANT: Only considers domains that represent a significant portion of a partner's
 * contacts (default 20%). This prevents one-off domains (like 1 dentsu.com contact among
 * 22 merkle.com contacts) from causing false matches, while still supporting small partners.
 */
router.get('/users/orphans', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 500;
    const offset = parseInt(req.query.offset) || 0;
    const includeDismissed = req.query.includeDismissed === 'true';
    const minDomainPercentage = parseInt(req.query.minDomainPercentage) || 20; // Domain must represent at least X% of partner's contacts
    
    // Find users whose email domain matches a partner's PRIMARY domain but aren't linked
    // Only considers domains that represent at least minDomainPercentage% of the partner's contacts
    const orphanedUsers = await query(`
      SELECT 
        u.id as user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        u.created_at_lms,
        SUBSTRING_INDEX(u.email, '@', -1) as user_domain,
        p.id as matched_partner_id,
        p.account_name as matched_partner,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        partner_domains.domain_count as domain_contact_count,
        partner_domains.total_contacts as partner_total_contacts,
        partner_domains.domain_percentage
      FROM lms_users u
      INNER JOIN (
        -- Get partner domains that represent at least X% of the partner's contacts
        SELECT 
          domain_counts.partner_id,
          domain_counts.domain,
          domain_counts.domain_count,
          partner_totals.total_contacts,
          ROUND(100.0 * domain_counts.domain_count / partner_totals.total_contacts, 1) as domain_percentage
        FROM (
          SELECT 
            c.partner_id,
            SUBSTRING_INDEX(c.email, '@', -1) as domain,
            COUNT(*) as domain_count
          FROM contacts c
          WHERE c.partner_id IS NOT NULL
          AND c.email LIKE '%@%'
          AND SUBSTRING_INDEX(c.email, '@', -1) NOT IN (
            'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
            'aol.com', 'icloud.com', 'live.com', 'msn.com', 'me.com',
            'sharklasers.com', 'guerrillamail.com', 'mailinator.com'
          )
          GROUP BY c.partner_id, SUBSTRING_INDEX(c.email, '@', -1)
        ) domain_counts
        INNER JOIN (
          SELECT partner_id, COUNT(*) as total_contacts
          FROM contacts
          WHERE partner_id IS NOT NULL AND email LIKE '%@%'
          GROUP BY partner_id
        ) partner_totals ON domain_counts.partner_id = partner_totals.partner_id
        WHERE (100.0 * domain_counts.domain_count / partner_totals.total_contacts) >= ?
      ) partner_domains ON SUBSTRING_INDEX(u.email, '@', -1) = partner_domains.domain
      INNER JOIN partners p ON p.id = partner_domains.partner_id
      WHERE NOT EXISTS (
        -- Not already linked via contacts
        SELECT 1 FROM contacts ct 
        WHERE ct.lms_user_id = u.id AND ct.partner_id IS NOT NULL
      )
      AND NOT EXISTS (
        -- Not already in a partner group
        SELECT 1 FROM lms_group_members gm
        INNER JOIN lms_groups g ON g.id = gm.group_id
        WHERE gm.user_id = u.id AND g.partner_id IS NOT NULL
      )
      ${!includeDismissed ? `
      AND NOT EXISTS (
        -- Not dismissed for this partner
        SELECT 1 FROM dismissed_orphans do
        WHERE do.user_id = u.id AND do.partner_id = p.id
      )
      ` : ''}
      ORDER BY p.account_name, u.created_at_lms DESC
      LIMIT ? OFFSET ?
    `, [minDomainPercentage, limit, offset]);
    
    // Get total count (same filtering logic)
    const [countResult] = await query(`
      SELECT COUNT(*) as count
      FROM lms_users u
      INNER JOIN (
        SELECT 
          domain_counts.partner_id,
          domain_counts.domain
        FROM (
          SELECT 
            c.partner_id,
            SUBSTRING_INDEX(c.email, '@', -1) as domain,
            COUNT(*) as domain_count
          FROM contacts c
          WHERE c.partner_id IS NOT NULL
          AND c.email LIKE '%@%'
          AND SUBSTRING_INDEX(c.email, '@', -1) NOT IN (
            'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
            'aol.com', 'icloud.com', 'live.com', 'msn.com', 'me.com',
            'sharklasers.com', 'guerrillamail.com', 'mailinator.com'
          )
          GROUP BY c.partner_id, SUBSTRING_INDEX(c.email, '@', -1)
        ) domain_counts
        INNER JOIN (
          SELECT partner_id, COUNT(*) as total_contacts
          FROM contacts
          WHERE partner_id IS NOT NULL AND email LIKE '%@%'
          GROUP BY partner_id
        ) partner_totals ON domain_counts.partner_id = partner_totals.partner_id
        WHERE (100.0 * domain_counts.domain_count / partner_totals.total_contacts) >= ?
      ) partner_domains ON SUBSTRING_INDEX(u.email, '@', -1) = partner_domains.domain
      INNER JOIN partners p ON p.id = partner_domains.partner_id
      WHERE NOT EXISTS (
        SELECT 1 FROM contacts ct 
        WHERE ct.lms_user_id = u.id AND ct.partner_id IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM lms_group_members gm
        INNER JOIN lms_groups g ON g.id = gm.group_id
        WHERE gm.user_id = u.id AND g.partner_id IS NOT NULL
      )
      ${!includeDismissed ? `
      AND NOT EXISTS (
        SELECT 1 FROM dismissed_orphans do
        WHERE do.user_id = u.id AND do.partner_id = p.id
      )
      ` : ''}
    `, [minDomainPercentage]);
    
    // Group by partner for summary
    const byPartner = {};
    orphanedUsers.forEach(u => {
      if (!byPartner[u.matched_partner]) {
        byPartner[u.matched_partner] = {
          partnerId: u.matched_partner_id,
          partnerName: u.matched_partner,
          tier: u.partner_tier,
          region: u.account_region,
          owner: u.account_owner,
          orphanCount: 0,
          users: []
        };
      }
      byPartner[u.matched_partner].orphanCount++;
      byPartner[u.matched_partner].users.push({
        userId: u.user_id,
        email: u.email,
        name: `${u.first_name} ${u.last_name}`.trim(),
        status: u.status,
        createdAt: u.created_at_lms
      });
    });
    
    res.json({
      totalOrphans: countResult.count,
      returnedCount: orphanedUsers.length,
      limit,
      offset,
      byPartner: Object.values(byPartner).sort((a, b) => b.orphanCount - a.orphanCount),
      message: countResult.count > 0 
        ? `Found ${countResult.count} potential orphaned partner users (domain matches but not linked)`
        : 'No orphaned partner users found'
    });
  } catch (error) {
    console.error('Error finding orphaned users:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get orphan summary by partner - quick overview without user details
 */
router.get('/users/orphans/summary', async (req, res) => {
  try {
    const includeDismissed = req.query.includeDismissed === 'true';
    const minDomainPercentage = parseInt(req.query.minDomainPercentage) || 20;
    
    const summary = await query(`
      SELECT 
        p.id as partner_id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        COUNT(DISTINCT u.id) as orphan_count
      FROM lms_users u
      INNER JOIN (
        SELECT 
          domain_counts.partner_id,
          domain_counts.domain
        FROM (
          SELECT 
            c.partner_id,
            SUBSTRING_INDEX(c.email, '@', -1) as domain,
            COUNT(*) as domain_count
          FROM contacts c
          WHERE c.partner_id IS NOT NULL
          AND c.email LIKE '%@%'
          AND SUBSTRING_INDEX(c.email, '@', -1) NOT IN (
            'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
            'aol.com', 'icloud.com', 'live.com', 'msn.com', 'me.com',
            'sharklasers.com', 'guerrillamail.com', 'mailinator.com'
          )
          GROUP BY c.partner_id, SUBSTRING_INDEX(c.email, '@', -1)
        ) domain_counts
        INNER JOIN (
          SELECT partner_id, COUNT(*) as total_contacts
          FROM contacts
          WHERE partner_id IS NOT NULL AND email LIKE '%@%'
          GROUP BY partner_id
        ) partner_totals ON domain_counts.partner_id = partner_totals.partner_id
        WHERE (100.0 * domain_counts.domain_count / partner_totals.total_contacts) >= ?
      ) partner_domains ON SUBSTRING_INDEX(u.email, '@', -1) = partner_domains.domain
      INNER JOIN partners p ON p.id = partner_domains.partner_id
      WHERE NOT EXISTS (
        SELECT 1 FROM contacts ct 
        WHERE ct.lms_user_id = u.id AND ct.partner_id IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM lms_group_members gm
        INNER JOIN lms_groups g ON g.id = gm.group_id
        WHERE gm.user_id = u.id AND g.partner_id IS NOT NULL
      )
      ${!includeDismissed ? `
      AND NOT EXISTS (
        SELECT 1 FROM dismissed_orphans do
        WHERE do.user_id = u.id AND do.partner_id = p.id
      )
      ` : ''}
      GROUP BY p.id, p.account_name, p.partner_tier, p.account_region, p.account_owner
      ORDER BY orphan_count DESC
    `, [minDomainPercentage]);
    
    const totalOrphans = summary.reduce((sum, p) => sum + p.orphan_count, 0);
    
    res.json({
      totalOrphans,
      partnersWithOrphans: summary.length,
      minDomainPercentage,
      partners: summary
    });
  } catch (error) {
    console.error('Error getting orphan summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get orphans for a specific partner
 */
router.get('/users/orphans/partner/:partnerId', async (req, res) => {
  try {
    const { partnerId } = req.params;
    const includeDismissed = req.query.includeDismissed === 'true';
    const minDomainPercentage = parseInt(req.query.minDomainPercentage) || 20;
    
    // Get partner info
    const [partner] = await query('SELECT * FROM partners WHERE id = ?', [partnerId]);
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    // Get total contacts for this partner (for percentage calculation)
    const [partnerTotals] = await query(`
      SELECT COUNT(*) as total_contacts 
      FROM contacts 
      WHERE partner_id = ? AND email LIKE '%@%'
    `, [partnerId]);
    
    // Get orphaned users for this partner (only domains representing >= X% of contacts)
    const orphans = await query(`
      SELECT 
        u.id as user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        u.created_at_lms,
        u.last_active_at,
        SUBSTRING_INDEX(u.email, '@', -1) as domain,
        partner_domains.domain_count as domain_contact_count,
        partner_domains.domain_percentage,
        do.id as dismissed_id,
        do.reason as dismissed_reason,
        do.dismissed_at
      FROM lms_users u
      INNER JOIN (
        SELECT 
          SUBSTRING_INDEX(c.email, '@', -1) as domain,
          COUNT(*) as domain_count,
          ROUND(100.0 * COUNT(*) / ?, 1) as domain_percentage
        FROM contacts c
        WHERE c.partner_id = ?
        AND c.email LIKE '%@%'
        AND SUBSTRING_INDEX(c.email, '@', -1) NOT IN (
          'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
          'aol.com', 'icloud.com', 'live.com', 'msn.com', 'me.com',
          'sharklasers.com', 'guerrillamail.com', 'mailinator.com'
        )
        GROUP BY SUBSTRING_INDEX(c.email, '@', -1)
        HAVING (100.0 * COUNT(*) / ?) >= ?
      ) partner_domains ON SUBSTRING_INDEX(u.email, '@', -1) = partner_domains.domain
      LEFT JOIN dismissed_orphans do ON do.user_id = u.id AND do.partner_id = ?
      WHERE NOT EXISTS (
        SELECT 1 FROM contacts ct 
        WHERE ct.lms_user_id = u.id AND ct.partner_id IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM lms_group_members gm
        INNER JOIN lms_groups g ON g.id = gm.group_id
        WHERE gm.user_id = u.id AND g.partner_id IS NOT NULL
      )
      ${!includeDismissed ? 'AND do.id IS NULL' : ''}
      ORDER BY do.id IS NOT NULL, u.created_at_lms DESC
    `, [partnerTotals.total_contacts, partnerId, partnerTotals.total_contacts, minDomainPercentage, partnerId]);
    
    // Get dismissed count for this partner
    const [dismissedCount] = await query(`
      SELECT COUNT(*) as count FROM dismissed_orphans WHERE partner_id = ?
    `, [partnerId]);
    
    res.json({
      partner: {
        id: partner.id,
        name: partner.account_name,
        tier: partner.partner_tier,
        region: partner.account_region,
        owner: partner.account_owner
      },
      orphanCount: orphans.filter(o => !o.dismissed_id).length,
      dismissedCount: dismissedCount.count,
      showingDismissed: includeDismissed,
      orphans: orphans.map(o => ({
        ...o,
        isDismissed: !!o.dismissed_id
      }))
    });
  } catch (error) {
    console.error('Error getting partner orphans:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Dismiss an orphan user - marks them as not belonging to the matched partner
 */
router.post('/users/orphans/dismiss', async (req, res) => {
  try {
    const { userId, partnerId, reason } = req.body;
    
    if (!userId || !partnerId) {
      return res.status(400).json({ error: 'userId and partnerId are required' });
    }
    
    // Insert into dismissed_orphans (ON DUPLICATE KEY UPDATE for idempotency)
    await query(`
      INSERT INTO dismissed_orphans (user_id, partner_id, reason, dismissed_by)
      VALUES (?, ?, ?, 'admin')
      ON DUPLICATE KEY UPDATE reason = VALUES(reason), dismissed_at = CURRENT_TIMESTAMP
    `, [userId, partnerId, reason || 'Not a match']);
    
    res.json({
      success: true,
      message: 'User dismissed from orphan list'
    });
  } catch (error) {
    console.error('Error dismissing orphan:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Bulk dismiss orphans for a partner
 */
router.post('/users/orphans/dismiss-bulk', async (req, res) => {
  try {
    const { userIds, partnerId, reason } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    if (!partnerId) {
      return res.status(400).json({ error: 'partnerId is required' });
    }
    
    let dismissed = 0;
    for (const userId of userIds) {
      try {
        await query(`
          INSERT INTO dismissed_orphans (user_id, partner_id, reason, dismissed_by)
          VALUES (?, ?, ?, 'admin')
          ON DUPLICATE KEY UPDATE reason = VALUES(reason), dismissed_at = CURRENT_TIMESTAMP
        `, [userId, partnerId, reason || 'Bulk dismiss']);
        dismissed++;
      } catch (err) {
        console.error(`Error dismissing user ${userId}:`, err.message);
      }
    }
    
    res.json({
      success: true,
      dismissed,
      message: `Dismissed ${dismissed} users from orphan list`
    });
  } catch (error) {
    console.error('Error bulk dismissing orphans:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Restore a dismissed orphan - removes them from dismissed list
 */
router.post('/users/orphans/restore', async (req, res) => {
  try {
    const { userId, partnerId } = req.body;
    
    if (!userId || !partnerId) {
      return res.status(400).json({ error: 'userId and partnerId are required' });
    }
    
    const result = await query(`
      DELETE FROM dismissed_orphans WHERE user_id = ? AND partner_id = ?
    `, [userId, partnerId]);
    
    res.json({
      success: true,
      restored: result.affectedRows > 0,
      message: result.affectedRows > 0 
        ? 'User restored to orphan list'
        : 'User was not in dismissed list'
    });
  } catch (error) {
    console.error('Error restoring orphan:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get dismissed orphans for a partner
 */
router.get('/users/orphans/dismissed/:partnerId', async (req, res) => {
  try {
    const { partnerId } = req.params;
    
    const dismissed = await query(`
      SELECT 
        do.id,
        do.user_id,
        do.reason,
        do.dismissed_at,
        u.email,
        u.first_name,
        u.last_name,
        SUBSTRING_INDEX(u.email, '@', -1) as domain
      FROM dismissed_orphans do
      INNER JOIN lms_users u ON u.id = do.user_id
      WHERE do.partner_id = ?
      ORDER BY do.dismissed_at DESC
    `, [partnerId]);
    
    res.json({
      partnerId,
      count: dismissed.length,
      dismissed
    });
  } catch (error) {
    console.error('Error getting dismissed orphans:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PAM Management - MOVED to server/routes/pamRoutes.cjs
// ============================================

// ============================================
// Notifications - MOVED to server/routes/notificationRoutes.cjs
// ============================================

// ============================================
// Partner Families - MOVED to server/routes/partnerFamilyRoutes.cjs
// ============================================

// ============================================
// Certification Categories - MOVED to server/routes/certificationRoutes.cjs
// ============================================

// Impartner API Configuration
const IMPARTNER_CONFIG = {
  host: 'https://prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  tenantId: '1'
};

// Sync certification data to Impartner
router.post('/certifications/sync-to-impartner', async (req, res) => {
  const dryRun = req.query.dryRun === 'true';
  const mode = req.query.mode || 'incremental';
  
  // Valid tiers to sync (exclude Pending, blank)
  const VALID_TIERS = ['Premier', 'Premier Plus', 'Certified', 'Registered', 'Aggregator'];
  
  try {
    // Get last sync time for incremental mode
    let lastSyncTime = null;
    if (mode === 'incremental') {
      const [lastSync] = await query(`
        SELECT completed_at FROM sync_log 
        WHERE sync_type = 'sync_to_impartner' AND status = 'completed'
        ORDER BY completed_at DESC LIMIT 1
      `);
      lastSyncTime = lastSync?.completed_at;
    }
    
    // Get partners with certification counts, including LMS group info
    // Only include partners with valid tiers and active status
    const tierList = VALID_TIERS.map(t => `'${t}'`).join(',');
    let partnersQuery = `
      SELECT 
        p.id,
        p.account_name,
        p.salesforce_id,
        p.partner_tier,
        p.cert_count_nintex_ce,
        p.cert_count_nintex_k2,
        p.cert_count_nintex_salesforce,
        p.cert_count_go_to_market,
        p.has_gtm_certification,
        p.total_npcu,
        p.cert_counts_updated_at,
        g.id as lms_group_id,
        g.name as lms_group_name
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE p.salesforce_id IS NOT NULL
        AND p.cert_counts_updated_at IS NOT NULL
        AND p.partner_tier IN (${tierList})
        AND p.is_active = TRUE
    `;
    
    const queryParams = [];
    if (mode === 'incremental' && lastSyncTime) {
      partnersQuery += ` AND p.cert_counts_updated_at > ?`;
      queryParams.push(lastSyncTime);
    }
    partnersQuery += ` ORDER BY p.account_name`;
    
    const partners = await query(partnersQuery, queryParams);
    
    // Build sync payload matching Impartner field names (with __cf suffix for custom fields)
    const syncPayload = partners.map(p => {
      // Build the portal URL (base64 encoded JSON with company and tier)
      let portalUrl = '';
      if (p.lms_group_name) {
        const urlData = {
          company: p.lms_group_name,
          tier: p.partner_tier || 'Registered'
        };
        const encodedData = Buffer.from(JSON.stringify(urlData)).toString('base64');
        portalUrl = `https://ptrlrndb.prod.ntxgallery.com/?data=${encodedData}`;
      }
      
      return {
        // Impartner lookup field
        Id: null, // Will be looked up by CrmId
        CrmId: p.salesforce_id,
        Name: p.account_name,
        // Custom fields (with __cf suffix)
        Nintex_CE_Certifications__cf: p.cert_count_nintex_ce || 0,
        Nintex_K2_Certifications__cf: p.cert_count_nintex_k2 || 0,
        Nintex_for_Salesforce_Certifications__cf: p.cert_count_nintex_salesforce || 0,
        Nintex_GTM_Certifications__cf: p.cert_count_go_to_market || 0,
        Total_NPCU__cf: p.total_npcu || 0,
        LMS_Account_ID__cf: String(p.id),
        LMS_Group_Name__cf: p.lms_group_name || '',
        LMS_Training_Dashboard__cf: portalUrl
      };
    });
    
    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        mode,
        lastSyncTime: lastSyncTime || null,
        validTiers: VALID_TIERS,
        message: `Would sync ${syncPayload.length} partners to Impartner (${mode} mode)`,
        preview: syncPayload.slice(0, 20),
        totalCount: syncPayload.length
      });
    }
    
    // First, get Impartner Account IDs by CrmId lookup
    console.log('[Impartner Sync] Looking up Account IDs...');
    
    // Build a map of CrmId -> Impartner Id
    const crmIdToImpartnerId = new Map();
    
    // Fetch accounts in batches to get their IDs
    const lookupBatchSize = 100;
    for (let i = 0; i < syncPayload.length; i += lookupBatchSize) {
      const batchCrmIds = syncPayload.slice(i, i + lookupBatchSize).map(p => p.CrmId);
      const crmIdFilter = batchCrmIds.map(id => `CrmId eq '${id}'`).join(' or ');
      
      const lookupUrl = `${IMPARTNER_CONFIG.host}/api/objects/v1/Account?fields=Id,CrmId&filter=${encodeURIComponent(crmIdFilter)}&take=${lookupBatchSize}`;
      
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
          if (lookupData.data?.results) {
            for (const account of lookupData.data.results) {
              if (account.CrmId) {
                crmIdToImpartnerId.set(account.CrmId, account.Id);
              }
            }
          }
        }
      } catch (err) {
        console.error(`[Impartner Sync] Lookup batch failed:`, err.message);
      }
    }
    
    console.log(`[Impartner Sync] Found ${crmIdToImpartnerId.size} matching accounts in Impartner`);
    
    // Build update payload with Impartner IDs
    const updatePayload = syncPayload
      .filter(p => crmIdToImpartnerId.has(p.CrmId))
      .map(p => ({
        Id: crmIdToImpartnerId.get(p.CrmId),
        Name: p.Name,
        Nintex_CE_Certifications__cf: p.Nintex_CE_Certifications__cf,
        Nintex_K2_Certifications__cf: p.Nintex_K2_Certifications__cf,
        Nintex_for_Salesforce_Certifications__cf: p.Nintex_for_Salesforce_Certifications__cf,
        Nintex_GTM_Certifications__cf: p.Nintex_GTM_Certifications__cf,
        Total_NPCU__cf: p.Total_NPCU__cf,
        LMS_Account_ID__cf: p.LMS_Account_ID__cf,
        LMS_Group_Name__cf: p.LMS_Group_Name__cf,
        LMS_Training_Dashboard__cf: p.LMS_Training_Dashboard__cf
      }));
    
    // Sync to Impartner API using PATCH with array
    const results = {
      synced: 0,
      failed: 0,
      notFound: syncPayload.length - updatePayload.length,
      errors: []
    };
    
    // Process in batches of 50 for PATCH
    const batchSize = 50;
    for (let i = 0; i < updatePayload.length; i += batchSize) {
      const batch = updatePayload.slice(i, i + batchSize);
      
      try {
        const updateUrl = `${IMPARTNER_CONFIG.host}/api/objects/v1/Account`;
        const updateResp = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
            'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(batch)
        });
        
        if (updateResp.ok) {
          const updateData = await updateResp.json();
          // Count successes and failures from response
          if (updateData.results) {
            for (const result of updateData.results) {
              if (result.success) {
                results.synced++;
              } else {
                results.failed++;
                results.errors.push({
                  id: result.data?.id,
                  error: result.message || 'Unknown error'
                });
              }
            }
          } else {
            results.synced += batch.length;
          }
        } else {
          const errText = await updateResp.text();
          results.failed += batch.length;
          results.errors.push({ batch: i, error: errText });
        }
      } catch (err) {
        results.failed += batch.length;
        results.errors.push({ batch: i, error: err.message });
      }
      
      // Log progress
      console.log(`[Impartner Sync] Progress: ${Math.min(i + batchSize, updatePayload.length)}/${updatePayload.length}`);
    }
    
    res.json({
      success: true,
      message: `Synced ${results.synced} partners to Impartner (${results.failed} failed, ${results.notFound} not found)`,
      synced: results.synced,
      failed: results.failed,
      notFound: results.notFound,
      errors: results.errors.slice(0, 20),
      totalCount: syncPayload.length
    });
  } catch (error) {
    console.error('Error syncing to Impartner:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, initializeDatabase, authMiddleware, requirePermission };
