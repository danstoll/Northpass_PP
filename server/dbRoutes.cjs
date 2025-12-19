/**
 * Database API Routes
 * Express routes for database operations
 */

const express = require('express');
const { initializePool, closePool } = require('./db/connection.cjs');
const { initializeSchema, getSchemaVersion } = require('./db/schema.cjs');
const { 
  runFullSync, 
  syncUsers, 
  syncGroups, 
  syncCourses,
  syncCourseProperties,
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
  clearAllData
} = require('./db/partnerImportService.cjs');
const {
  getScheduleConfig,
  updateScheduleConfig,
  runScheduledSync,
  initializeScheduler,
  getSchedulerStatus
} = require('./db/scheduledSync.cjs');
const { query } = require('./db/connection.cjs');

const router = express.Router();

// Track sync status
let currentSync = null;

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
 * Helper to update a sync log entry
 */
async function updateSyncLog(logId, status, stats, error = null) {
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
// Sync Endpoints
// ============================================

router.post('/sync/full', async (req, res) => {
  if (currentSync) {
    return res.status(409).json({ 
      error: 'Sync already in progress', 
      sync: currentSync 
    });
  }

  // Start sync in background
  currentSync = {
    type: 'full',
    status: 'running',
    startedAt: new Date().toISOString(),
    progress: { stage: 'starting', current: 0, total: 0 }
  };

  res.json({ 
    message: 'Full sync started', 
    sync: currentSync 
  });

  try {
    const result = await runFullSync((stage, current, total) => {
      currentSync.progress = { stage, current, total };
    });
    
    currentSync = {
      ...currentSync,
      status: result.success ? 'completed' : 'failed',
      completedAt: new Date().toISOString(),
      result
    };
  } catch (error) {
    currentSync = {
      ...currentSync,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: error.message
    };
  }
});

router.post('/sync/users', async (req, res) => {
  if (currentSync) {
    return res.status(409).json({ error: 'Sync already in progress' });
  }

  currentSync = { type: 'users', status: 'running', startedAt: new Date().toISOString() };
  const logId = await createSyncLog('users');
  
  try {
    const result = await syncUsers(logId, (stage, current, total) => {
      currentSync.progress = { stage, current, total };
    });
    await updateSyncLog(logId, 'completed', result);
    currentSync = null;
    res.json({ success: true, result });
  } catch (error) {
    await updateSyncLog(logId, 'failed', {}, error.message);
    currentSync = null;
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync/groups', async (req, res) => {
  if (currentSync) {
    return res.status(409).json({ error: 'Sync already in progress' });
  }

  currentSync = { type: 'groups', status: 'running', startedAt: new Date().toISOString() };
  const logId = await createSyncLog('groups');
  
  try {
    const result = await syncGroups(logId, (stage, current, total) => {
      currentSync.progress = { stage, current, total };
    });
    await updateSyncLog(logId, 'completed', result);
    currentSync = null;
    res.json({ success: true, result });
  } catch (error) {
    await updateSyncLog(logId, 'failed', {}, error.message);
    currentSync = null;
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync/courses', async (req, res) => {
  if (currentSync) {
    return res.status(409).json({ error: 'Sync already in progress' });
  }

  currentSync = { type: 'courses', status: 'running', startedAt: new Date().toISOString() };
  const logId = await createSyncLog('courses');
  
  try {
    const result = await syncCourses(logId, (stage, current, total) => {
      currentSync.progress = { stage, current, total };
    });
    await updateSyncLog(logId, 'completed', result);
    currentSync = null;
    res.json({ success: true, result });
  } catch (error) {
    await updateSyncLog(logId, 'failed', {}, error.message);
    currentSync = null;
    res.status(500).json({ error: error.message });
  }
});

// Sync course properties (NPCU values) separately
router.post('/sync/course-properties', async (req, res) => {
  if (currentSync) {
    return res.status(409).json({ error: 'Sync already in progress' });
  }

  currentSync = { type: 'course-properties', status: 'running', startedAt: new Date().toISOString() };
  const logId = await createSyncLog('course-properties');
  
  try {
    const result = await syncCourseProperties(logId, (stage, current, total) => {
      currentSync.progress = { stage, current, total };
    });
    await updateSyncLog(logId, 'completed', result);
    currentSync = null;
    res.json({ success: true, result });
  } catch (error) {
    await updateSyncLog(logId, 'failed', {}, error.message);
    currentSync = null;
    res.status(500).json({ error: error.message });
  }
});

router.get('/sync/status', (req, res) => {
  res.json({ currentSync });
});

router.get('/sync/history', async (req, res) => {
  try {
    const history = await getSyncHistory(20);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sync/last', async (req, res) => {
  try {
    const last = await getLastSyncStatus();
    res.json(last);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    const { search, status, page = 1, limit = 100 } = req.query;
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
// Group Analysis Endpoints (Local DB)
// ============================================

// Get all groups with partner matching data
router.get('/group-analysis/groups', async (req, res) => {
  try {
    const { filter, search } = req.query;
    
    // Get all groups with partner matching info
    const groups = await query(`
      SELECT 
        g.id,
        g.name,
        g.description,
        g.user_count,
        g.partner_id,
        g.synced_at,
        p.account_name as partner_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        (SELECT COUNT(*) FROM contacts c WHERE c.partner_id = p.id) as partner_contact_count
      FROM lms_groups g
      LEFT JOIN partners p ON g.partner_id = p.id
      ORDER BY g.name
    `);

    // Get all partners for matching
    const partners = await query(`
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        COUNT(c.id) as contact_count,
        g.id as group_id
      FROM partners p
      LEFT JOIN contacts c ON c.partner_id = p.id
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      GROUP BY p.id
      ORDER BY p.account_name
    `);

    // Apply filters
    let filteredGroups = groups;
    
    if (search) {
      const term = search.toLowerCase();
      filteredGroups = filteredGroups.filter(g => 
        g.name?.toLowerCase().includes(term) ||
        g.partner_name?.toLowerCase().includes(term)
      );
    }

    if (filter === 'matched') {
      filteredGroups = filteredGroups.filter(g => g.partner_id);
    } else if (filter === 'unmatched') {
      filteredGroups = filteredGroups.filter(g => !g.partner_id);
    }

    // Calculate stats
    const stats = {
      totalGroups: groups.length,
      matched: groups.filter(g => g.partner_id).length,
      unmatched: groups.filter(g => !g.partner_id).length,
      totalPartners: partners.length,
      partnersWithGroups: partners.filter(p => p.group_id).length,
      partnersWithoutGroups: partners.filter(p => !p.group_id).length
    };

    res.json({ groups: filteredGroups, partners, stats });
  } catch (error) {
    console.error('Group analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get group details with members
router.get('/group-analysis/groups/:id', async (req, res) => {
  try {
    const [group] = await query(`
      SELECT 
        g.*,
        p.account_name as partner_name,
        p.partner_tier,
        p.account_region
      FROM lms_groups g
      LEFT JOIN partners p ON g.partner_id = p.id
      WHERE g.id = ?
    `, [req.params.id]);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Get members with contact info
    const members = await query(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        u.last_active_at,
        c.id as contact_id,
        c.title,
        p.account_name as crm_partner
      FROM lms_users u
      INNER JOIN lms_group_members gm ON gm.user_id = u.id
      LEFT JOIN contacts c ON c.email = u.email
      LEFT JOIN partners p ON p.id = c.partner_id
      WHERE gm.group_id = ?
      ORDER BY u.last_name, u.first_name
    `, [req.params.id]);

    // Extract unique email domains
    const domains = [...new Set(
      members
        .map(m => m.email?.split('@')[1])
        .filter(Boolean)
        .map(d => d.toLowerCase())
    )];

    // Find potential users (same domain, not in group)
    let potentialUsers = [];
    if (domains.length > 0) {
      const domainPattern = domains.map(d => `%@${d}`).join("','");
      potentialUsers = await query(`
        SELECT 
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.status
        FROM lms_users u
        WHERE u.id NOT IN (
          SELECT user_id FROM lms_group_members WHERE group_id = ?
        )
        AND (${domains.map(() => 'u.email LIKE ?').join(' OR ')})
        ORDER BY u.last_name, u.first_name
      `, [req.params.id, ...domains.map(d => `%@${d}`)]);
    }

    // Get CRM contacts not in LMS (if matched to partner)
    let crmContactsNotInLms = [];
    if (group.partner_id) {
      crmContactsNotInLms = await query(`
        SELECT 
          c.email,
          c.first_name,
          c.last_name,
          c.title
        FROM contacts c
        WHERE c.partner_id = ?
        AND c.lms_user_id IS NULL
        AND c.email IS NOT NULL
        AND c.email NOT LIKE '%@gmail.com'
        AND c.email NOT LIKE '%@hotmail.com'
        AND c.email NOT LIKE '%@outlook.com'
        AND c.email NOT LIKE '%@yahoo.com'
        ORDER BY c.last_name, c.first_name
      `, [group.partner_id]);
    }

    res.json({
      group,
      members,
      domains,
      potentialUsers,
      crmContactsNotInLms,
      stats: {
        memberCount: members.length,
        domainCount: domains.length,
        potentialCount: potentialUsers.length,
        crmNotInLmsCount: crmContactsNotInLms.length
      }
    });
  } catch (error) {
    console.error('Group detail error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get partners without groups
router.get('/group-analysis/partners-without-groups', async (req, res) => {
  try {
    const { search, tier, sort } = req.query;

    let sql = `
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        COUNT(c.id) as contact_count,
        COUNT(CASE WHEN c.lms_user_id IS NOT NULL THEN 1 END) as lms_user_count
      FROM partners p
      LEFT JOIN contacts c ON c.partner_id = p.id
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE g.id IS NULL
    `;
    const params = [];

    if (search) {
      sql += ' AND p.account_name LIKE ?';
      params.push(`%${search}%`);
    }

    if (tier) {
      sql += ' AND p.partner_tier = ?';
      params.push(tier);
    }

    sql += ' GROUP BY p.id';

    if (sort === 'tier') {
      sql += ` ORDER BY FIELD(p.partner_tier, 'Premier', 'Select', 'Registered', 'Certified'), p.account_name`;
    } else if (sort === 'region') {
      sql += ' ORDER BY p.account_region, p.account_name';
    } else {
      sql += ' ORDER BY p.account_name';
    }

    const partners = await query(sql, params);
    res.json(partners);
  } catch (error) {
    console.error('Partners without groups error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get sync timestamp for groups
router.get('/group-analysis/sync-status', async (req, res) => {
  try {
    const [lastSync] = await query(`
      SELECT MIN(synced_at) as oldest, MAX(synced_at) as newest 
      FROM lms_groups
    `);
    
    const [groupCount] = await query(`SELECT COUNT(*) as count FROM lms_groups`);
    const [memberCount] = await query(`SELECT COUNT(*) as count FROM lms_group_members`);

    res.json({
      lastSync: lastSync?.newest,
      oldestSync: lastSync?.oldest,
      groupCount: groupCount?.count || 0,
      memberCount: memberCount?.count || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get LMS users for a partner (to add to new group)
router.get('/group-analysis/partner-lms-users/:partnerId', async (req, res) => {
  try {
    const { partnerId } = req.params;
    
    // Get LMS users linked to contacts for this partner
    const users = await query(`
      SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
      FROM lms_users u
      INNER JOIN contacts c ON c.lms_user_id = u.id
      WHERE c.partner_id = ?
      ORDER BY u.last_name, u.first_name
    `, [partnerId]);
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Maintenance Endpoints
// ============================================

// Audit partner contacts vs LMS users and group memberships
router.get('/maintenance/partner-contact-audit', async (req, res) => {
  try {
    // Get All Partners group ID
    const [allPartnersGroup] = await query(`
      SELECT id, name FROM lms_groups 
      WHERE LOWER(name) LIKE '%all partner%'
      LIMIT 1
    `);
    
    const allPartnersGroupId = allPartnersGroup?.id;
    
    // Get all contacts with their LMS status and group memberships
    const contacts = await query(`
      SELECT 
        c.id as contact_id,
        c.email as contact_email,
        c.first_name,
        c.last_name,
        c.lms_user_id,
        p.id as partner_id,
        p.account_name as partner_name,
        p.partner_tier,
        u.email as lms_email,
        u.id as lms_id,
        g.id as partner_group_id,
        g.name as partner_group_name
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      LEFT JOIN lms_users u ON u.id = c.lms_user_id
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      ORDER BY p.account_name, c.last_name, c.first_name
    `);
    
    // Get group memberships for users with LMS accounts
    const memberships = await query(`
      SELECT user_id, group_id FROM lms_group_members
    `);
    const membershipMap = new Map();
    for (const m of memberships) {
      if (!membershipMap.has(m.user_id)) {
        membershipMap.set(m.user_id, new Set());
      }
      membershipMap.get(m.user_id).add(m.group_id);
    }
    
    // Analyze each contact
    const audit = {
      totalContacts: contacts.length,
      withLmsAccount: 0,
      withoutLmsAccount: 0,
      inPartnerGroup: 0,
      missingPartnerGroup: 0,
      inAllPartnersGroup: 0,
      missingAllPartnersGroup: 0,
      issues: [],
      byPartner: {}
    };
    
    for (const contact of contacts) {
      // Initialize partner tracking
      if (!audit.byPartner[contact.partner_id]) {
        audit.byPartner[contact.partner_id] = {
          partnerName: contact.partner_name,
          tier: contact.partner_tier,
          partnerGroupId: contact.partner_group_id,
          partnerGroupName: contact.partner_group_name,
          totalContacts: 0,
          withLms: 0,
          withoutLms: 0,
          missingPartnerGroup: [],
          missingAllPartnersGroup: []
        };
      }
      
      const partnerData = audit.byPartner[contact.partner_id];
      partnerData.totalContacts++;
      
      if (contact.lms_user_id) {
        audit.withLmsAccount++;
        partnerData.withLms++;
        
        const userGroups = membershipMap.get(contact.lms_user_id) || new Set();
        
        // Check partner group membership
        if (contact.partner_group_id) {
          if (userGroups.has(contact.partner_group_id)) {
            audit.inPartnerGroup++;
          } else {
            audit.missingPartnerGroup++;
            partnerData.missingPartnerGroup.push({
              userId: contact.lms_user_id,
              email: contact.lms_email || contact.contact_email,
              name: `${contact.first_name} ${contact.last_name}`.trim()
            });
          }
        }
        
        // Check All Partners group membership
        if (allPartnersGroupId) {
          if (userGroups.has(allPartnersGroupId)) {
            audit.inAllPartnersGroup++;
          } else {
            audit.missingAllPartnersGroup++;
            partnerData.missingAllPartnersGroup.push({
              userId: contact.lms_user_id,
              email: contact.lms_email || contact.contact_email,
              name: `${contact.first_name} ${contact.last_name}`.trim()
            });
          }
        }
      } else {
        audit.withoutLmsAccount++;
        partnerData.withoutLms++;
      }
    }
    
    // Convert byPartner to array and filter to only those with issues
    audit.partnersWithIssues = Object.entries(audit.byPartner)
      .filter(([_, p]) => p.missingPartnerGroup.length > 0 || p.missingAllPartnersGroup.length > 0)
      .map(([id, p]) => ({ partnerId: id, ...p }));
    
    audit.allPartnersGroupId = allPartnersGroupId;
    audit.allPartnersGroupName = allPartnersGroup?.name;
    
    res.json(audit);
  } catch (error) {
    console.error('Audit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get contacts without LMS accounts that could potentially be matched
router.get('/maintenance/unmatched-contacts', async (req, res) => {
  try {
    // Find contacts without LMS user_id but with email that matches an LMS user
    const potentialMatches = await query(`
      SELECT 
        c.id as contact_id,
        c.email as contact_email,
        c.first_name,
        c.last_name,
        p.account_name as partner_name,
        u.id as potential_lms_id,
        u.email as lms_email,
        u.first_name as lms_first_name,
        u.last_name as lms_last_name
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      INNER JOIN lms_users u ON LOWER(u.email) = LOWER(c.email)
      WHERE c.lms_user_id IS NULL
      ORDER BY p.account_name, c.last_name
    `);
    
    // Find contacts with no matching LMS user at all
    const noLmsAccount = await query(`
      SELECT 
        c.id as contact_id,
        c.email,
        c.first_name,
        c.last_name,
        p.account_name as partner_name,
        p.partner_tier
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      LEFT JOIN lms_users u ON LOWER(u.email) = LOWER(c.email)
      WHERE c.lms_user_id IS NULL AND u.id IS NULL
      ORDER BY p.account_name, c.last_name
    `);
    
    res.json({
      potentialMatches,
      noLmsAccount,
      potentialMatchCount: potentialMatches.length,
      noLmsAccountCount: noLmsAccount.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Report Endpoints
// ============================================

router.get('/reports/partner-npcu', async (req, res) => {
  try {
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
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/certification-gaps', async (req, res) => {
  try {
    const { tier } = req.query;
    const tierRequirements = {
      'Premier': 20,
      'Select': 10,
      'Registered': 5,
      'Certified': 5
    };

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
    
    // Add gap calculation
    const report = results.map(r => ({
      ...r,
      required_npcu: tierRequirements[r.partner_tier] || 0,
      npcu_gap: Math.max(0, (tierRequirements[r.partner_tier] || 0) - r.current_npcu)
    }));

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Overview report - summary by tier and region
router.get('/reports/overview', async (req, res) => {
  try {
    // Summary by tier
    const byTier = await query(`
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
    `);

    // Summary by region
    const byRegion = await query(`
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
    `);

    // Summary by owner
    const byOwner = await query(`
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
    `);

    // Overall totals
    const [totals] = await query(`
      SELECT 
        COUNT(DISTINCT p.id) as total_partners,
        COUNT(DISTINCT c.id) as total_contacts,
        COUNT(DISTINCT CASE WHEN c.lms_user_id IS NOT NULL THEN c.id END) as lms_linked_contacts,
        COUNT(DISTINCT u.id) as total_lms_users,
        COUNT(DISTINCT g.id) as total_lms_groups
      FROM partners p
      LEFT JOIN contacts c ON c.partner_id = p.id
      LEFT JOIN lms_users u ON 1=1
      LEFT JOIN lms_groups g ON 1=1
    `);

    res.json({ byTier, byRegion, byOwner, totals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User certifications report - who has what
router.get('/reports/user-certifications', async (req, res) => {
  try {
    const { partnerId, tier, region, search } = req.query;
    
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
      LEFT JOIN lms_enrollments e ON e.user_id = u.id
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

    sql += ' GROUP BY c.id ORDER BY total_npcu DESC, p.account_name';

    const results = await query(sql, params);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Contacts not in LMS - find gaps
router.get('/reports/contacts-not-in-lms', async (req, res) => {
  try {
    const { tier, region, owner, excludePersonal } = req.query;
    
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

    const results = await query(sql, params);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Partners without LMS groups
router.get('/reports/partners-without-groups', async (req, res) => {
  try {
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
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get tiers and regions for filters
router.get('/reports/filters', async (req, res) => {
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

// Trigger immediate scheduled sync
router.post('/schedule/run', async (req, res) => {
  try {
    // Run async, return immediately
    res.json({ success: true, message: 'Scheduled sync started' });
    runScheduledSync().catch(err => console.error('Manual scheduled sync error:', err));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Excel Import Endpoints (Partner Data Management)
// ============================================

// Import contacts from Excel file
router.post('/import/excel', async (req, res) => {
  try {
    const { fileData, fileName, clearExisting } = req.body;
    
    if (!fileData) {
      return res.status(400).json({ error: 'No file data provided' });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');
    
    const result = await importContactsFromExcel(buffer, fileName || 'import.xlsx', {
      clearExisting: clearExisting !== false
    });

    // After import, link contacts to LMS users
    if (result.success) {
      const linkResult = await linkContactsToLmsUsers();
      result.linkResult = linkResult;
    }

    res.json(result);
  } catch (error) {
    console.error('Excel import error:', error);
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

// Get partner list with contact counts
router.get('/import/partners', async (req, res) => {
  try {
    const { search, tier, region, limit = 100, offset = 0 } = req.query;
    const partners = await getPartnerList({
      search, tier, region,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    res.json(partners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get contacts for a partner
router.get('/import/partners/:id/contacts', async (req, res) => {
  try {
    const contacts = await getPartnerContacts(parseInt(req.params.id));
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search contacts
router.get('/import/contacts/search', async (req, res) => {
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

module.exports = { router, initializeDatabase };
