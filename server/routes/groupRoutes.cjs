/**
 * Group Analysis Routes
 * LMS group management and analysis endpoints
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db/connection.cjs');

// Public email domains to exclude
const PUBLIC_DOMAINS = [
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'aol.com',
  'icloud.com', 'live.com', 'msn.com', 'me.com', 'mail.com',
  'protonmail.com', 'ymail.com'
];

// ============================================
// Group Analysis Endpoints (Local DB)
// ============================================

// Get all groups with partner matching data
router.get('/groups', async (req, res) => {
  try {
    const { filter, search } = req.query;
    
    const groups = await query(`
      SELECT 
        g.id,
        g.name,
        g.description,
        g.partner_id,
        g.synced_at,
        g.potential_users,
        g.total_npcu,
        g.last_analyzed,
        p.account_name as partner_name,
        p.partner_tier,
        p.account_region,
        p.account_owner
      FROM lms_groups g
      LEFT JOIN partners p ON g.partner_id = p.id
      ORDER BY g.name
    `);

    const memberCounts = await query(`
      SELECT group_id, COUNT(*) as count 
      FROM lms_group_members 
      GROUP BY group_id
    `);
    const memberMap = Object.fromEntries(memberCounts.map(m => [m.group_id, m.count]));

    const npcuTotals = await query(`
      SELECT 
        gm.group_id,
        COALESCE(SUM(lc.npcu_value), 0) as total_npcu
      FROM lms_group_members gm 
      JOIN lms_enrollments le ON le.user_id = gm.user_id AND le.status = 'completed'
      JOIN lms_courses lc ON lc.id = le.course_id AND lc.npcu_value > 0
      GROUP BY gm.group_id
    `);
    const npcuMap = Object.fromEntries(npcuTotals.map(n => [n.group_id, n.total_npcu]));

    const enrichedGroups = groups.map(g => ({
      ...g,
      user_count: memberMap[g.id] || 0,
      potential_users: g.potential_users ?? null,
      total_npcu: g.total_npcu ?? npcuMap[g.id] ?? 0,
      last_analyzed: g.last_analyzed ?? null
    }));

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

    let filteredGroups = enrichedGroups;
    
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

    const stats = {
      totalGroups: enrichedGroups.length,
      withMembers: enrichedGroups.filter(g => g.user_count > 0).length,
      matched: enrichedGroups.filter(g => g.partner_id).length,
      unmatched: enrichedGroups.filter(g => !g.partner_id).length,
      totalMembers: enrichedGroups.reduce((sum, g) => sum + (g.user_count || 0), 0),
      totalPotentialUsers: enrichedGroups.reduce((sum, g) => sum + (g.potential_users || 0), 0),
      groupsWithPotential: enrichedGroups.filter(g => g.potential_users > 0).length,
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
router.get('/groups/:id', async (req, res) => {
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

    const blockedDomains = group.blocked_domains ? JSON.parse(group.blocked_domains) : [];
    const customDomains = group.custom_domains ? JSON.parse(group.custom_domains) : [];

    const members = await query(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        u.last_active_at,
        gm.pending_source,
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

    const allDomains = [...new Set(
      members
        .map(m => m.email?.split('@')[1])
        .filter(Boolean)
        .map(d => d.toLowerCase())
    )];
    
    let corporateDomains = allDomains.filter(d => !PUBLIC_DOMAINS.includes(d) && !blockedDomains.includes(d));
    let searchDomains = corporateDomains;
    
    if (customDomains.length > 0) {
      searchDomains = [...new Set([...corporateDomains, ...customDomains])];
    }
    searchDomains = searchDomains.filter(d => !blockedDomains.includes(d));

    let potentialUsers = [];
    if (searchDomains.length > 0) {
      potentialUsers = await query(`
        SELECT 
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.status,
          NULL as crm_match
        FROM lms_users u
        WHERE u.id NOT IN (
          SELECT user_id FROM lms_group_members WHERE group_id = ?
        )
        AND (${searchDomains.map(() => 'u.email LIKE ?').join(' OR ')})
        ORDER BY u.last_name, u.first_name
      `, [req.params.id, ...searchDomains.map(d => `%@${d}`)]);
    }
    
    if (blockedDomains.length > 0) {
      potentialUsers = potentialUsers.filter(u => {
        const userDomain = u.email?.split('@')[1]?.toLowerCase();
        return !blockedDomains.includes(userDomain);
      });
    }
    
    if (group.partner_id) {
      const existingIds = potentialUsers.map(p => p.id);
      let crmMatchedUsers = await query(`
        SELECT DISTINCT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.status,
          'CRM' as crm_match
        FROM lms_users u
        INNER JOIN contacts c ON LOWER(c.email) = LOWER(u.email)
        WHERE c.partner_id = ?
        AND u.id NOT IN (
          SELECT user_id FROM lms_group_members WHERE group_id = ?
        )
        ORDER BY u.last_name, u.first_name
      `, [group.partner_id, req.params.id]);
      
      if (blockedDomains.length > 0) {
        crmMatchedUsers = crmMatchedUsers.filter(u => {
          const userDomain = u.email?.split('@')[1]?.toLowerCase();
          return !blockedDomains.includes(userDomain);
        });
      }
      
      for (const user of crmMatchedUsers) {
        if (!existingIds.includes(user.id)) {
          potentialUsers.push(user);
        }
      }
    }

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
      
      if (blockedDomains.length > 0) {
        crmContactsNotInLms = crmContactsNotInLms.filter(c => {
          const contactDomain = c.email?.split('@')[1]?.toLowerCase();
          return !blockedDomains.includes(contactDomain);
        });
      }
    }

    const [npcuResult] = await query(`
      SELECT COALESCE(SUM(lc.npcu_value), 0) as total_npcu
      FROM lms_group_members gm 
      JOIN lms_enrollments le ON le.user_id = gm.user_id AND le.status = 'completed'
      JOIN lms_courses lc ON lc.id = le.course_id AND lc.npcu_value > 0
      WHERE gm.group_id = ?
    `, [req.params.id]);
    const totalNpcu = npcuResult?.total_npcu || 0;

    res.json({
      group,
      members,
      domains: allDomains,
      corporateDomains,
      publicDomainsExcluded: allDomains.filter(d => PUBLIC_DOMAINS.includes(d)),
      blockedDomains,
      customDomains,
      searchDomains,
      potentialUsers,
      crmContactsNotInLms,
      stats: {
        memberCount: members.length,
        domainCount: allDomains.length,
        corporateDomainCount: corporateDomains.length,
        potentialCount: potentialUsers.length,
        crmNotInLmsCount: crmContactsNotInLms.length,
        totalNpcu
      }
    });
  } catch (error) {
    console.error('Group detail error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get partners without groups (with extended details)
router.get('/partners-without-groups', async (req, res) => {
  try {
    const { search, tier, sort } = req.query;

    let sql = `
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.account_owner,
        p.is_active,
        p.account_status,
        p.impartner_id,
        p.salesforce_id,
        p.lead_count,
        p.leads_last_30_days,
        p.created_at,
        COUNT(DISTINCT c.id) as contact_count,
        COUNT(DISTINCT CASE WHEN c.lms_user_id IS NOT NULL THEN c.id END) as lms_user_count,
        COUNT(DISTINCT CASE WHEN c.is_active = TRUE THEN c.id END) as active_contact_count
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

// Delete a partner (and its contacts) - for test accounts or cleanup
router.delete('/partners/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.query;
    
    // Get partner details first
    const [partner] = await query('SELECT * FROM partners WHERE id = ?', [id]);
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    // Check if partner has LMS group
    const [lmsGroup] = await query('SELECT id, name FROM lms_groups WHERE partner_id = ?', [id]);
    if (lmsGroup && !force) {
      return res.status(400).json({ 
        error: 'Partner has an LMS group. Use force=true to delete anyway.',
        lmsGroup: lmsGroup.name
      });
    }
    
    // Get contact count
    const [contactInfo] = await query('SELECT COUNT(*) as count FROM contacts WHERE partner_id = ?', [id]);
    const contactCount = contactInfo?.count || 0;
    
    // Get lead count (if leads exist)
    let leadCount = 0;
    try {
      const [leadInfo] = await query('SELECT COUNT(*) as count FROM leads WHERE partner_id = ?', [id]);
      leadCount = leadInfo?.count || 0;
    } catch (e) {
      // Leads table may not exist
    }
    
    // Delete contacts first (due to foreign key)
    const deleteContacts = await query('DELETE FROM contacts WHERE partner_id = ?', [id]);
    
    // Delete dismissed orphans for this partner
    await query('DELETE FROM dismissed_orphans WHERE partner_id = ?', [id]);
    
    // Delete the partner
    await query('DELETE FROM partners WHERE id = ?', [id]);
    
    res.json({
      success: true,
      deleted: {
        partner: partner.account_name,
        contacts: deleteContacts.affectedRows,
        hadLeads: leadCount > 0,
        leadCount
      }
    });
  } catch (error) {
    console.error('Delete partner error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete partners
router.post('/partners/bulk-delete', async (req, res) => {
  try {
    const { partnerIds, force } = req.body;
    
    if (!partnerIds || !Array.isArray(partnerIds) || partnerIds.length === 0) {
      return res.status(400).json({ error: 'partnerIds array required' });
    }
    
    const results = {
      deleted: [],
      failed: [],
      contactsDeleted: 0
    };
    
    for (const id of partnerIds) {
      try {
        // Get partner details
        const [partner] = await query('SELECT * FROM partners WHERE id = ?', [id]);
        if (!partner) {
          results.failed.push({ id, error: 'Not found' });
          continue;
        }
        
        // Check if partner has LMS group
        const [lmsGroup] = await query('SELECT id FROM lms_groups WHERE partner_id = ?', [id]);
        if (lmsGroup && !force) {
          results.failed.push({ id, name: partner.account_name, error: 'Has LMS group' });
          continue;
        }
        
        // Delete contacts
        const deleteContacts = await query('DELETE FROM contacts WHERE partner_id = ?', [id]);
        results.contactsDeleted += deleteContacts.affectedRows;
        
        // Delete dismissed orphans
        await query('DELETE FROM dismissed_orphans WHERE partner_id = ?', [id]);
        
        // Delete partner
        await query('DELETE FROM partners WHERE id = ?', [id]);
        results.deleted.push({ id, name: partner.account_name });
      } catch (err) {
        results.failed.push({ id, error: err.message });
      }
    }
    
    res.json(results);
  } catch (error) {
    console.error('Bulk delete partners error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get sync timestamp for groups
router.get('/sync-status', async (req, res) => {
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

// Save analysis results for a group
router.post('/groups/:id/save-analysis', async (req, res) => {
  try {
    const { id } = req.params;
    const { potential_users, total_npcu } = req.body;
    
    await query(`
      UPDATE lms_groups 
      SET potential_users = ?,
          total_npcu = ?,
          last_analyzed = NOW()
      WHERE id = ?
    `, [potential_users, total_npcu, id]);
    
    res.json({ success: true, id, potential_users, total_npcu });
  } catch (error) {
    console.error('Save analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get group domain settings
router.get('/groups/:id/domains', async (req, res) => {
  try {
    const [group] = await query(`
      SELECT id, name, blocked_domains, custom_domains 
      FROM lms_groups 
      WHERE id = ?
    `, [req.params.id]);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json({
      id: group.id,
      name: group.name,
      blocked_domains: group.blocked_domains ? JSON.parse(group.blocked_domains) : [],
      custom_domains: group.custom_domains ? JSON.parse(group.custom_domains) : []
    });
  } catch (error) {
    console.error('Get domain settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update group domain settings
router.put('/groups/:id/domains', async (req, res) => {
  try {
    const { blocked_domains, custom_domains } = req.body;
    
    await query(`
      UPDATE lms_groups 
      SET blocked_domains = ?,
          custom_domains = ?
      WHERE id = ?
    `, [
      JSON.stringify(blocked_domains || []),
      JSON.stringify(custom_domains || []),
      req.params.id
    ]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update domain settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add a blocked domain
router.post('/groups/:id/blocked-domains', async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    const [group] = await query('SELECT blocked_domains FROM lms_groups WHERE id = ?', [req.params.id]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const blockedDomains = group.blocked_domains ? JSON.parse(group.blocked_domains) : [];
    const normalizedDomain = domain.toLowerCase().trim();
    
    if (!blockedDomains.includes(normalizedDomain)) {
      blockedDomains.push(normalizedDomain);
      await query('UPDATE lms_groups SET blocked_domains = ? WHERE id = ?', [
        JSON.stringify(blockedDomains),
        req.params.id
      ]);
    }

    res.json({ success: true, blocked_domains: blockedDomains });
  } catch (error) {
    console.error('Add blocked domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove a blocked domain
router.delete('/groups/:id/blocked-domains/:domain', async (req, res) => {
  try {
    const { domain } = req.params;

    const [group] = await query('SELECT blocked_domains FROM lms_groups WHERE id = ?', [req.params.id]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    let blockedDomains = group.blocked_domains ? JSON.parse(group.blocked_domains) : [];
    const normalizedDomain = domain.toLowerCase().trim();
    blockedDomains = blockedDomains.filter(d => d !== normalizedDomain);

    await query('UPDATE lms_groups SET blocked_domains = ? WHERE id = ?', [
      JSON.stringify(blockedDomains),
      req.params.id
    ]);

    res.json({ success: true, blocked_domains: blockedDomains });
  } catch (error) {
    console.error('Remove blocked domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add a custom domain
router.post('/groups/:id/custom-domains', async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    const [group] = await query('SELECT custom_domains FROM lms_groups WHERE id = ?', [req.params.id]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const customDomains = group.custom_domains ? JSON.parse(group.custom_domains) : [];
    const normalizedDomain = domain.toLowerCase().trim();
    
    if (!customDomains.includes(normalizedDomain)) {
      customDomains.push(normalizedDomain);
      await query('UPDATE lms_groups SET custom_domains = ? WHERE id = ?', [
        JSON.stringify(customDomains),
        req.params.id
      ]);
    }

    res.json({ success: true, custom_domains: customDomains });
  } catch (error) {
    console.error('Add custom domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove a custom domain
router.delete('/groups/:id/custom-domains/:domain', async (req, res) => {
  try {
    const { domain } = req.params;

    const [group] = await query('SELECT custom_domains FROM lms_groups WHERE id = ?', [req.params.id]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    let customDomains = group.custom_domains ? JSON.parse(group.custom_domains) : [];
    const normalizedDomain = domain.toLowerCase().trim();
    customDomains = customDomains.filter(d => d !== normalizedDomain);

    await query('UPDATE lms_groups SET custom_domains = ? WHERE id = ?', [
      JSON.stringify(customDomains),
      req.params.id
    ]);

    res.json({ success: true, custom_domains: customDomains });
  } catch (error) {
    console.error('Remove custom domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk save analysis results
router.post('/bulk-save-analysis', async (req, res) => {
  try {
    const { groups } = req.body;
    if (!groups || !Array.isArray(groups)) {
      return res.status(400).json({ error: 'groups array is required' });
    }

    let updated = 0;
    for (const g of groups) {
      if (g.id && (g.potential_users !== undefined || g.total_npcu !== undefined)) {
        await query(`
          UPDATE lms_groups 
          SET potential_users = COALESCE(?, potential_users),
              total_npcu = COALESCE(?, total_npcu),
              last_analyzed = NOW()
          WHERE id = ?
        `, [g.potential_users, g.total_npcu, g.id]);
        updated++;
      }
    }

    res.json({ success: true, updated });
  } catch (error) {
    console.error('Bulk save analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Record a group membership in local database (after adding via API)
router.post('/groups/:groupId/members/:userId/record', async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const { source = 'manual_fix' } = req.body;

    await query(`
      INSERT INTO lms_group_members (group_id, user_id, pending_source, added_at)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE pending_source = VALUES(pending_source), added_at = NOW()
    `, [groupId, userId, source]);

    res.json({ success: true, groupId, userId });
  } catch (error) {
    console.error('Record group membership error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
