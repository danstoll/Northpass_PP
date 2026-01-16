/**
 * Maintenance Routes
 * Audit and maintenance endpoints for partner contacts and group memberships
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db/connection.cjs');

const API_BASE = 'https://api.northpass.com';
const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';

// Impartner API Configuration (same as impartnerSyncService.cjs)
const IMPARTNER_CONFIG = {
  host: 'https://prod.impartner.live',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  tenantId: '1'
};

// ============================================
// Maintenance Endpoints
// ============================================

// Partner Contact Group Audit - Check all contacts are in proper LMS groups
router.get('/partner-contact-audit', async (req, res) => {
  try {
    // Get "All Partners" group
    const [allPartnersGroup] = await query(`
      SELECT id, name FROM lms_groups 
      WHERE name = 'All Partners' OR name LIKE '%All Partners%'
      LIMIT 1
    `);
    
    if (!allPartnersGroup) {
      return res.status(404).json({ error: '"All Partners" group not found in database' });
    }
    
    // Get "All Partners" members - single query
    const allPartnersMembers = await query(`
      SELECT user_id FROM lms_group_members WHERE group_id = ?
    `, [allPartnersGroup.id]);
    const allPartnersUserIds = new Set(allPartnersMembers.map(m => m.user_id));
    
    // Get ALL partner group memberships in one query
    const allPartnerGroupMembers = await query(`
      SELECT 
        g.partner_id,
        gm.user_id
      FROM lms_group_members gm
      INNER JOIN lms_groups g ON g.id = gm.group_id
      WHERE g.partner_id IS NOT NULL
    `);
    
    // Build a map of partner_id -> Set of user_ids
    const partnerGroupMemberships = {};
    for (const m of allPartnerGroupMembers) {
      if (!partnerGroupMemberships[m.partner_id]) {
        partnerGroupMemberships[m.partner_id] = new Set();
      }
      partnerGroupMemberships[m.partner_id].add(m.user_id);
    }
    
    // Get contacts that have lms_user_id set (fast indexed query)
    const contacts = await query(`
      SELECT 
        c.partner_id,
        c.email,
        c.first_name,
        c.last_name,
        c.lms_user_id as user_id,
        p.account_name,
        p.partner_tier,
        g.id as partner_group_id,
        g.name as partner_group_name
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE c.is_active = TRUE
        AND p.is_active = TRUE
        AND c.lms_user_id IS NOT NULL
      ORDER BY p.account_name
    `);
    
    // Process contacts and find missing memberships
    const byPartner = {};
    let totalMissingPartnerGroup = 0;
    let totalMissingAllPartnersGroup = 0;
    
    for (const contact of contacts) {
      if (!contact.user_id) continue;
      
      const partnerId = contact.partner_id;
      const partnerMembers = partnerGroupMemberships[partnerId] || new Set();
      
      // Check if missing from partner group
      const missingFromPartner = contact.partner_group_id && !partnerMembers.has(contact.user_id);
      
      // Check if missing from All Partners
      const missingFromAllPartners = !allPartnersUserIds.has(contact.user_id);
      
      if (missingFromPartner || missingFromAllPartners) {
        // Initialize partner entry if needed
        if (!byPartner[partnerId]) {
          byPartner[partnerId] = {
            partnerId,
            partnerName: contact.account_name,
            partnerTier: contact.partner_tier,
            partnerGroupId: contact.partner_group_id,
            partnerGroupName: contact.partner_group_name,
            totalContacts: 0,
            missingPartnerGroup: [],
            missingAllPartnersGroup: []
          };
        }
        
        byPartner[partnerId].totalContacts++;
        
        const userInfo = {
          userId: contact.user_id,
          email: contact.email,
          firstName: contact.first_name,
          lastName: contact.last_name
        };
        
        if (missingFromPartner) {
          byPartner[partnerId].missingPartnerGroup.push(userInfo);
          totalMissingPartnerGroup++;
        }
        
        if (missingFromAllPartners) {
          byPartner[partnerId].missingAllPartnersGroup.push(userInfo);
          totalMissingAllPartnersGroup++;
        }
      }
    }
    
    // Build partnersWithIssues array with full data for frontend
    const partnersWithIssues = Object.values(byPartner).map(p => {
      // Check if group name needs ptr_ prefix
      const needsRename = p.partnerGroupName && !p.partnerGroupName.toLowerCase().startsWith('ptr_');
      const suggestedName = needsRename ? `ptr_${p.partnerName}` : null;
      
      return {
        partnerId: p.partnerId,
        partnerName: p.partnerName,
        tier: p.partnerTier,
        partnerGroupId: p.partnerGroupId,
        partnerGroupName: p.partnerGroupName,
        needsRename,
        suggestedName,
        totalContacts: p.totalContacts,
        withLms: p.missingPartnerGroup.length + p.missingAllPartnersGroup.length, // approx
        withoutLms: 0,
        missingPartnerGroup: p.missingPartnerGroup,  // Full array with user details
        missingAllPartnersGroup: p.missingAllPartnersGroup  // Full array with user details
      };
    });
    
    // Also get ALL partner groups that need renaming (even without membership issues)
    const groupsNeedingRename = await query(`
      SELECT 
        g.id as groupId,
        g.name as groupName,
        g.partner_id as partnerId,
        p.account_name as partnerName,
        p.partner_tier as tier
      FROM lms_groups g
      INNER JOIN partners p ON p.id = g.partner_id
      WHERE g.name NOT LIKE 'ptr\\_%'
        AND p.is_active = TRUE
      ORDER BY p.account_name
    `);
    
    // Add suggested names
    const groupsToRename = groupsNeedingRename.map(g => ({
      ...g,
      suggestedName: `ptr_${g.partnerName}`
    }));
    
    res.json({
      allPartnersGroupId: allPartnersGroup.id,
      allPartnersGroupName: allPartnersGroup.name,
      totalContacts: contacts.length,
      partnersWithIssues: partnersWithIssues.length,
      missingPartnerGroup: totalMissingPartnerGroup,
      missingAllPartnersGroup: totalMissingAllPartnersGroup,
      groupsNeedingRename: groupsToRename.length,
      groupsToRename,
      byPartner,
      partnersWithIssues
    });
  } catch (error) {
    console.error('Partner contact audit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET alias for all-partners-sync-audit (used by frontend)
router.get('/all-partners-sync-audit', async (req, res) => {
  try {
    // Get "All Partners" group
    const [allPartnersGroup] = await query(`
      SELECT id, name FROM lms_groups 
      WHERE name = 'All Partners' OR name LIKE '%All Partners%'
      LIMIT 1
    `);
    
    if (!allPartnersGroup) {
      return res.status(404).json({ error: '"All Partners" group not found in database' });
    }
    
    // Get "All Partners" members with their email
    const allPartnersMembers = await query(`
      SELECT gm.user_id, u.email, u.first_name, u.last_name
      FROM lms_group_members gm
      INNER JOIN lms_users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
    `, [allPartnersGroup.id]);
    const allPartnersUserIds = new Set(allPartnersMembers.map(m => m.user_id));
    
    // Get all partner group members from ACTIVE partners only
    const partnerGroupMembers = await query(`
      SELECT 
        g.id as group_id,
        g.name as group_name,
        p.id as partner_id,
        p.account_name,
        p.partner_tier,
        p.is_active as partner_active,
        p.account_status,
        gm.user_id,
        u.email,
        u.first_name,
        u.last_name
      FROM lms_groups g
      INNER JOIN partners p ON p.id = g.partner_id
      INNER JOIN lms_group_members gm ON gm.group_id = g.id
      INNER JOIN lms_users u ON u.id = gm.user_id
      WHERE g.id != ?
        AND p.is_active = TRUE
        AND (p.account_status IS NULL OR p.account_status = 'Active')
      ORDER BY p.account_name, u.last_name
    `, [allPartnersGroup.id]);
    
    // Find users in active partner groups but NOT in "All Partners" - these need to be ADDED
    const missingFromAllPartners = partnerGroupMembers.filter(m => !allPartnersUserIds.has(m.user_id));
    
    // Group by partner
    const byPartner = {};
    for (const member of missingFromAllPartners) {
      if (!byPartner[member.partner_id]) {
        byPartner[member.partner_id] = {
          partnerId: member.partner_id,
          partnerName: member.account_name,
          partnerTier: member.partner_tier,
          groupId: member.group_id,
          groupName: member.group_name,
          missingUsers: []
        };
      }
      byPartner[member.partner_id].missingUsers.push({
        userId: member.user_id,
        email: member.email,
        firstName: member.first_name,
        lastName: member.last_name
      });
    }
    
    // Flatten all missing users for the frontend
    const allMissingUsers = missingFromAllPartners.map(m => ({
      userId: m.user_id,
      email: m.email,
      firstName: m.first_name,
      lastName: m.last_name,
      partnerName: m.account_name,
      groupName: m.group_name
    }));
    
    // Count unique partner groups
    const uniquePartnerGroups = new Set(partnerGroupMembers.map(m => m.group_id)).size;
    
    // Build set of active partner group user IDs
    const activePartnerGroupUserIds = new Set(partnerGroupMembers.map(m => m.user_id));
    
    // ============================================
    // Find users to REMOVE from "All Partners"
    // ============================================
    
    // Get users in "All Partners" who belong to INACTIVE partners (deactivated/churned)
    // These users should be removed
    const usersFromInactivePartners = await query(`
      SELECT DISTINCT
        gm.user_id,
        u.email,
        u.first_name,
        u.last_name,
        p.id as partner_id,
        p.account_name as partner_name,
        p.partner_tier,
        p.is_active as partner_active,
        p.account_status,
        g.name as partner_group_name
      FROM lms_group_members gm
      INNER JOIN lms_users u ON u.id = gm.user_id
      INNER JOIN lms_group_members pgm ON pgm.user_id = gm.user_id
      INNER JOIN lms_groups g ON g.id = pgm.group_id AND g.partner_id IS NOT NULL
      INNER JOIN partners p ON p.id = g.partner_id
      WHERE gm.group_id = ?
        AND u.email NOT LIKE '%@nintex.com'
        AND (p.is_active = FALSE OR p.account_status != 'Active')
      ORDER BY p.account_name, u.last_name
    `, [allPartnersGroup.id]);
    
    // Get users NOT in any partner group but ARE in "All Partners" (orphaned in All Partners)
    // Exclude @nintex.com users (internal employees)
    const allUsersToRemove = await query(`
      SELECT 
        gm.user_id,
        u.email,
        u.first_name,
        u.last_name
      FROM lms_group_members gm
      INNER JOIN lms_users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
        AND u.email NOT LIKE '%@nintex.com'
      ORDER BY u.last_name, u.first_name
    `, [allPartnersGroup.id]);
    
    // Filter to only those NOT in any ACTIVE partner group
    const usersToRemoveFiltered = allUsersToRemove.filter(u => !activePartnerGroupUserIds.has(u.user_id));
    
    // Cross-reference: Check if these users SHOULD be in a partner group
    // by checking if they exist in our contacts table with an ACTIVE partner
    const userEmails = usersToRemoveFiltered.map(u => u.email?.toLowerCase()).filter(Boolean);
    let contactMatches = [];
    if (userEmails.length > 0) {
      contactMatches = await query(`
        SELECT 
          c.email,
          c.first_name,
          c.last_name,
          c.is_active as contact_active,
          p.id as partner_id,
          p.account_name as partner_name,
          p.partner_tier,
          p.is_active as partner_active,
          p.account_status,
          g.id as expected_group_id,
          g.name as expected_group_name
        FROM contacts c
        INNER JOIN partners p ON p.id = c.partner_id
        LEFT JOIN lms_groups g ON g.partner_id = p.id
        WHERE LOWER(c.email) IN (${userEmails.map(() => '?').join(',')})
      `, userEmails);
    }
    
    // Create a map of email -> contact info
    const contactMap = new Map();
    for (const c of contactMatches) {
      contactMap.set(c.email?.toLowerCase(), c);
    }
    
    // Categorize users to remove
    const usersWithMissingPartnerGroup = []; // Should be in a partner group but aren't (active partner)
    const usersFromDeactivatedPartners = []; // User's partner is no longer active - remove from All Partners
    const usersNotInCRM = []; // Not in our CRM at all - may be old/stale - remove from All Partners
    
    // Also track users from inactive partners found above
    const inactivePartnerUserIds = new Set(usersFromInactivePartners.map(u => u.user_id));
    
    for (const u of usersToRemoveFiltered) {
      const contact = contactMap.get(u.email?.toLowerCase());
      if (contact) {
        // Check if partner is active
        const partnerIsActive = contact.partner_active && (contact.account_status === 'Active' || !contact.account_status);
        const contactIsActive = contact.contact_active !== false; // treat null as active
        
        if (partnerIsActive && contactIsActive) {
          // Partner is active - user should be in partner group
          usersWithMissingPartnerGroup.push({
            userId: u.user_id,
            email: u.email,
            name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
            shouldBeInPartner: contact.partner_name,
            partnerTier: contact.partner_tier,
            partnerActive: true,
            expectedGroupId: contact.expected_group_id,
            expectedGroupName: contact.expected_group_name
          });
        } else {
          // Partner or contact is inactive - should be removed from All Partners
          usersFromDeactivatedPartners.push({
            userId: u.user_id,
            email: u.email,
            name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
            partnerName: contact.partner_name,
            partnerTier: contact.partner_tier,
            partnerActive: contact.partner_active,
            partnerStatus: contact.account_status || 'Unknown',
            contactActive: contactIsActive,
            reason: !contact.partner_active ? 'Partner deactivated' : 
                    contact.account_status !== 'Active' ? `Partner status: ${contact.account_status}` :
                    !contactIsActive ? 'Contact deactivated' : 'Unknown'
          });
        }
      } else {
        // Not in CRM - remove from All Partners
        usersNotInCRM.push({
          userId: u.user_id,
          email: u.email,
          name: `${u.first_name || ''} ${u.last_name || ''}`.trim()
        });
      }
    }
    
    res.json({
      // Fields expected by frontend
      allPartnersGroupId: allPartnersGroup.id,
      allPartnersGroupName: allPartnersGroup.name,
      allPartnersMemberCount: allPartnersMembers.length,
      totalPartnerGroups: uniquePartnerGroups,
      totalUsersChecked: partnerGroupMembers.length,
      usersAlreadyInAllPartners: allPartnersMembers.length,
      usersMissingFromAllPartners: missingFromAllPartners.length,
      usersToRemoveFromAllPartners: usersToRemoveFiltered.length,
      // Breakdown of users to remove
      usersWithMissingPartnerGroup: usersWithMissingPartnerGroup.length,
      usersNotInCRM: usersNotInCRM.length,
      // Legacy/detail fields
      allPartnersGroup,
      byPartner: Object.values(byPartner),
      partnerCount: Object.keys(byPartner).length,
      allMissingUsers,
      // Users to remove - now categorized
      allUsersToRemove: usersToRemoveFiltered.map(u => ({
        userId: u.user_id,
        email: u.email,
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim()
      })),
      // Detailed lists for UI
      usersWithMissingPartnerGroupList: usersWithMissingPartnerGroup,
      usersFromDeactivatedPartnersList: usersFromDeactivatedPartners,
      usersFromDeactivatedPartners: usersFromDeactivatedPartners.length,
      usersNotInCRMList: usersNotInCRM
    });
  } catch (error) {
    console.error('All Partners sync audit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Audit partner contacts vs LMS users and group memberships
router.post('/audit-contacts', async (req, res) => {
  try {
    const { partnerId } = req.body;
    
    if (!partnerId) {
      return res.status(400).json({ error: 'partnerId is required' });
    }
    
    // Get partner info
    const [partner] = await query(`
      SELECT 
        p.*,
        g.id as group_id,
        g.name as group_name
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE p.id = ?
    `, [partnerId]);
    
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    // Get all contacts for this partner
    const contacts = await query(`
      SELECT 
        c.id,
        c.email,
        c.first_name,
        c.last_name,
        c.lms_user_id
      FROM contacts c
      WHERE c.partner_id = ?
      ORDER BY c.last_name, c.first_name
    `, [partnerId]);
    
    // Get LMS users that match contact emails
    const emails = contacts.map(c => c.email?.toLowerCase()).filter(Boolean);
    let lmsUsers = [];
    if (emails.length > 0) {
      const placeholders = emails.map(() => '?').join(',');
      lmsUsers = await query(`
        SELECT 
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.status
        FROM lms_users u
        WHERE LOWER(u.email) IN (${placeholders})
      `, emails);
    }
    const lmsUserMap = Object.fromEntries(lmsUsers.map(u => [u.email.toLowerCase(), u]));
    
    // If partner has a group, get members
    let groupMembers = [];
    if (partner.group_id) {
      groupMembers = await query(`
        SELECT 
          u.id,
          u.email,
          gm.pending_source
        FROM lms_group_members gm
        JOIN lms_users u ON u.id = gm.user_id
        WHERE gm.group_id = ?
      `, [partner.group_id]);
    }
    const memberEmails = new Set(groupMembers.map(m => m.email?.toLowerCase()).filter(Boolean));
    
    // Categorize contacts
    const results = {
      partner,
      groupId: partner.group_id,
      groupName: partner.group_name,
      summary: {
        totalContacts: contacts.length,
        withLmsAccount: 0,
        withoutLmsAccount: 0,
        inGroup: 0,
        notInGroup: 0
      },
      contacts: contacts.map(c => {
        const email = c.email?.toLowerCase();
        const lmsUser = lmsUserMap[email];
        const inGroup = memberEmails.has(email);
        
        const status = {
          hasLmsAccount: !!lmsUser,
          inGroup,
          needsGroupAdd: lmsUser && !inGroup && partner.group_id
        };
        
        if (lmsUser) results.summary.withLmsAccount++;
        else results.summary.withoutLmsAccount++;
        if (inGroup) results.summary.inGroup++;
        else if (lmsUser) results.summary.notInGroup++;
        
        return {
          ...c,
          lmsUser,
          ...status
        };
      }),
      needsGroupAdd: []
    };
    
    results.needsGroupAdd = results.contacts.filter(c => c.needsGroupAdd);
    
    res.json(results);
  } catch (error) {
    console.error('Contact audit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get contacts without LMS accounts that could potentially be matched
router.get('/unlinked-contacts', async (req, res) => {
  try {
    const { partnerId, search, limit = 100, offset = 0 } = req.query;
    
    let sql = `
      SELECT 
        c.id,
        c.email,
        c.first_name,
        c.last_name,
        c.title,
        p.id as partner_id,
        p.account_name,
        p.partner_tier,
        EXISTS(SELECT 1 FROM lms_users u WHERE LOWER(u.email) = LOWER(c.email)) as has_lms_match
      FROM contacts c
      JOIN partners p ON p.id = c.partner_id
      WHERE c.lms_user_id IS NULL
        AND c.email IS NOT NULL
    `;
    const params = [];
    
    if (partnerId) {
      sql += ' AND c.partner_id = ?';
      params.push(partnerId);
    }
    
    if (search) {
      sql += ' AND (c.email LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR p.account_name LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }
    
    sql += ' ORDER BY p.account_name, c.last_name';
    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const contacts = await query(sql, params);
    res.json(contacts);
  } catch (error) {
    console.error('Unlinked contacts error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Audit partner group members vs "All Partners" group membership
router.post('/audit-all-partners', async (req, res) => {
  try {
    const { partnerId, groupId } = req.body;
    
    // Get "All Partners" group
    const [allPartnersGroup] = await query(`
      SELECT id, name FROM lms_groups 
      WHERE name = 'All Partners' OR name LIKE '%All Partners%'
      LIMIT 1
    `);
    
    if (!allPartnersGroup) {
      return res.status(404).json({ error: '"All Partners" group not found in database' });
    }
    
    // Get "All Partners" members
    const allPartnersMembers = await query(`
      SELECT user_id FROM lms_group_members WHERE group_id = ?
    `, [allPartnersGroup.id]);
    const allPartnersUserIds = new Set(allPartnersMembers.map(m => m.user_id));
    
    // Build query for partner groups
    let sql = `
      SELECT 
        g.id as group_id,
        g.name as group_name,
        p.id as partner_id,
        p.account_name,
        p.partner_tier,
        gm.user_id,
        u.email,
        u.first_name,
        u.last_name
      FROM lms_groups g
      INNER JOIN partners p ON p.id = g.partner_id
      INNER JOIN lms_group_members gm ON gm.group_id = g.id
      INNER JOIN lms_users u ON u.id = gm.user_id
      WHERE g.id != ?
    `;
    const params = [allPartnersGroup.id];
    
    if (partnerId) {
      sql += ' AND p.id = ?';
      params.push(partnerId);
    }
    
    if (groupId) {
      sql += ' AND g.id = ?';
      params.push(groupId);
    }
    
    sql += ' ORDER BY p.account_name, u.last_name';
    
    const partnerGroupMembers = await query(sql, params);
    
    // Find users not in "All Partners"
    const missingFromAllPartners = partnerGroupMembers.filter(m => !allPartnersUserIds.has(m.user_id));
    
    // Group by partner
    const byPartner = {};
    for (const member of missingFromAllPartners) {
      if (!byPartner[member.partner_id]) {
        byPartner[member.partner_id] = {
          partnerId: member.partner_id,
          partnerName: member.account_name,
          partnerTier: member.partner_tier,
          groupId: member.group_id,
          groupName: member.group_name,
          missingUsers: []
        };
      }
      byPartner[member.partner_id].missingUsers.push({
        userId: member.user_id,
        email: member.email,
        firstName: member.first_name,
        lastName: member.last_name
      });
    }
    
    res.json({
      allPartnersGroup,
      totalPartnerGroupMembers: partnerGroupMembers.length,
      totalInAllPartners: allPartnersMembers.length,
      missingCount: missingFromAllPartners.length,
      byPartner: Object.values(byPartner),
      partnerCount: Object.keys(byPartner).length
    });
  } catch (error) {
    console.error('All Partners audit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add users to "All Partners" group via API AND update local database
router.post('/add-to-all-partners', async (req, res) => {
  try {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    
    // Get "All Partners" group
    const [allPartnersGroup] = await query(`
      SELECT id, name FROM lms_groups 
      WHERE name = 'All Partners' OR name LIKE '%All Partners%'
      LIMIT 1
    `);
    
    if (!allPartnersGroup) {
      return res.status(404).json({ error: '"All Partners" group not found' });
    }
    
    const results = {
      total: userIds.length,
      apiAdded: 0,
      apiFailed: 0,
      dbAdded: 0,
      errors: [],
      addedUsers: []
    };
    
    // Add users to group via API one by one
    for (const userId of userIds) {
      try {
        const response = await fetch(`${API_BASE}/v2/groups/${allPartnersGroup.id}/relationships/people`, {
          method: 'POST',
          headers: {
            'X-Api-Key': API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            data: [{ type: 'people', id: userId }]
          })
        });
        
        if (response.ok || response.status === 204) {
          // Also update local DB
          await query(`
            INSERT IGNORE INTO lms_group_members (group_id, user_id, pending_source, synced_at)
            VALUES (?, ?, 'maintenance', NOW())
          `, [allPartnersGroup.id, userId]);
          
          results.apiAdded++;
          results.dbAdded++;
          results.addedUsers.push(userId);
        } else {
          const error = await response.text();
          results.apiFailed++;
          results.errors.push({ userId, error: `HTTP ${response.status}: ${error}` });
        }
      } catch (error) {
        results.apiFailed++;
        results.errors.push({ userId, error: error.message });
      }
    }
    
    res.json({ results });
  } catch (error) {
    console.error('Add to All Partners error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove users from "All Partners" group via API AND update local database
router.post('/remove-from-all-partners', async (req, res) => {
  try {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    
    // Get "All Partners" group
    const [allPartnersGroup] = await query(`
      SELECT id, name FROM lms_groups 
      WHERE name = 'All Partners' OR name LIKE '%All Partners%'
      LIMIT 1
    `);
    
    if (!allPartnersGroup) {
      return res.status(404).json({ error: '"All Partners" group not found' });
    }
    
    const results = {
      total: userIds.length,
      apiRemoved: 0,
      apiFailed: 0,
      dbRemoved: 0,
      errors: [],
      removedUsers: []
    };
    
    // Remove users from group via API one by one
    for (const userId of userIds) {
      try {
        // Northpass API to remove user from group
        const response = await fetch(`${API_BASE}/v2/groups/${allPartnersGroup.id}/relationships/people`, {
          method: 'DELETE',
          headers: {
            'X-Api-Key': API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            data: [{ type: 'people', id: String(userId) }]
          })
        });
        
        if (response.ok || response.status === 204 || response.status === 404) {
          // Also remove from local DB
          await query(`
            DELETE FROM lms_group_members 
            WHERE group_id = ? AND user_id = ?
          `, [allPartnersGroup.id, userId]);
          
          results.apiRemoved++;
          results.dbRemoved++;
          results.removedUsers.push(userId);
        } else {
          const error = await response.text();
          results.apiFailed++;
          results.errors.push({ userId, error: `HTTP ${response.status}: ${error}` });
        }
      } catch (error) {
        results.apiFailed++;
        results.errors.push({ userId, error: error.message });
      }
    }
    
    res.json({ results });
  } catch (error) {
    console.error('Remove from All Partners error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add users to their expected partner groups (based on CRM contact data)
router.post('/add-to-partner-groups', async (req, res) => {
  try {
    const { users } = req.body; // Array of { userId, expectedGroupId }
    
    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: 'users array is required with userId and expectedGroupId' });
    }
    
    const results = {
      total: users.length,
      apiAdded: 0,
      apiFailed: 0,
      dbAdded: 0,
      errors: [],
      addedUsers: []
    };
    
    for (const { userId, expectedGroupId } of users) {
      if (!userId || !expectedGroupId) {
        results.apiFailed++;
        results.errors.push({ userId, error: 'Missing userId or expectedGroupId' });
        continue;
      }
      
      try {
        // Add to LMS group via API
        const response = await fetch(`${API_BASE}/v2/groups/${expectedGroupId}/relationships/people`, {
          method: 'POST',
          headers: {
            'X-Api-Key': API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            data: [{ type: 'people', id: String(userId) }]
          })
        });
        
        if (response.ok || response.status === 204) {
          // Update local DB
          await query(`
            INSERT IGNORE INTO lms_group_members (group_id, user_id, pending_source, added_at)
            VALUES (?, ?, 'maintenance', NOW())
          `, [expectedGroupId, userId]);
          
          results.apiAdded++;
          results.dbAdded++;
          results.addedUsers.push(userId);
        } else {
          const error = await response.text();
          results.apiFailed++;
          results.errors.push({ userId, error: `HTTP ${response.status}: ${error}` });
        }
      } catch (error) {
        results.apiFailed++;
        results.errors.push({ userId, error: error.message });
      }
    }
    
    res.json({ results });
  } catch (error) {
    console.error('Add to partner groups error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Match users not in CRM to partners by email domain
router.post('/match-users-by-domain', async (req, res) => {
  try {
    const { users } = req.body; // Array of { userId, email }
    
    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: 'users array is required with userId and email' });
    }
    
    // Public/free email domains to exclude from matching
    const publicDomains = new Set([
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
      'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
      'live.com', 'msn.com', 'me.com', 'mac.com', 'googlemail.com',
      'qq.com', '163.com', '126.com', 'sina.com', 'foxmail.com',
      'gmx.com', 'gmx.net', 'web.de', 'yahoo.co.uk', 'yahoo.co.in',
      'outlook.co.uk', 'hotmail.co.uk', 'btinternet.com', 'sky.com',
      'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net',
      'rediffmail.com', 'ymail.com', 'rocketmail.com'
    ]);
    
    // Extract unique domains (excluding public domains)
    const domainMap = new Map(); // domain -> [users]
    const publicDomainUsers = []; // Users with public email domains
    
    for (const user of users) {
      if (!user.email) continue;
      const domain = user.email.split('@')[1]?.toLowerCase();
      if (!domain) continue;
      
      // Skip public domains - these users go directly to unmatched
      if (publicDomains.has(domain)) {
        publicDomainUsers.push({ ...user, domain, isPublicDomain: true });
        continue;
      }
      
      if (!domainMap.has(domain)) {
        domainMap.set(domain, []);
      }
      domainMap.get(domain).push(user);
    }
    
    // Get partner domains from contacts
    const domains = [...domainMap.keys()];
    if (domains.length === 0) {
      // All users have public domains
      return res.json({ matches: [], unmatched: [...publicDomainUsers] });
    }
    
    // Find partners by domain (from existing contacts)
    const domainConditions = domains.map(() => `LOWER(SUBSTRING_INDEX(c.email, '@', -1)) = ?`).join(' OR ');
    const partnersByDomain = await query(`
      SELECT DISTINCT
        LOWER(SUBSTRING_INDEX(c.email, '@', -1)) as domain,
        p.id as partner_id,
        p.account_name as partner_name,
        p.partner_tier,
        p.is_active,
        g.id as group_id,
        g.name as group_name
      FROM contacts c
      INNER JOIN partners p ON p.id = c.partner_id
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE (${domainConditions})
        AND p.is_active = 1
      GROUP BY domain, p.id, p.account_name, p.partner_tier, p.is_active, g.id, g.name
    `, domains);
    
    // Build domain -> partner map
    const domainToPartner = new Map();
    for (const row of partnersByDomain) {
      if (!domainToPartner.has(row.domain)) {
        domainToPartner.set(row.domain, row);
      }
    }
    
    // Match users to partners (only non-public domain users)
    const matches = [];
    const unmatched = [...publicDomainUsers]; // Start with public domain users
    
    for (const [domain, domainUsers] of domainMap) {
      const partner = domainToPartner.get(domain);
      
      for (const user of domainUsers) {
        if (partner) {
          matches.push({
            ...user,
            domain,
            matchedPartner: {
              partnerId: partner.partner_id,
              partnerName: partner.partner_name,
              partnerTier: partner.partner_tier,
              groupId: partner.group_id,
              groupName: partner.group_name
            }
          });
        } else {
          unmatched.push({ ...user, domain });
        }
      }
    }
    
    res.json({ matches, unmatched });
  } catch (error) {
    console.error('Match users by domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add users to Impartner CRM
router.post('/add-users-to-impartner', async (req, res) => {
  try {
    const { users } = req.body; // Array of { userId, email, firstName, lastName, partnerId }
    
    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: 'users array is required' });
    }
    
    // Use centralized config
    
    const results = {
      total: users.length,
      added: 0,
      failed: 0,
      errors: [],
      addedUsers: []
    };
    
    for (const user of users) {
      try {
        // Get partner's Impartner account ID
        const [partner] = await query(`
          SELECT impartner_id, account_name FROM partners WHERE id = ?
        `, [user.partnerId]);
        
        if (!partner || !partner.impartner_id) {
          results.failed++;
          results.errors.push({ email: user.email, error: 'Partner not found or missing Impartner ID' });
          continue;
        }
        
        // Create user in Impartner
        const response = await fetch(`${IMPARTNER_CONFIG.host}/api/objects/v1/User`, {
          method: 'POST',
          headers: {
            'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
            'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            Email: user.email,
            FirstName: user.firstName || '',
            LastName: user.lastName || '',
            AccountId: partner.impartner_id,
            Status: 'Active'
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Also add to local contacts table
          await query(`
            INSERT INTO contacts (email, first_name, last_name, partner_id, impartner_id, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, 1, NOW())
            ON DUPLICATE KEY UPDATE 
              partner_id = VALUES(partner_id),
              impartner_id = VALUES(impartner_id),
              is_active = 1,
              updated_at = NOW()
          `, [user.email, user.firstName || '', user.lastName || '', user.partnerId, data.Id || null]);
          
          results.added++;
          results.addedUsers.push(user.email);
        } else {
          const error = await response.text();
          results.failed++;
          results.errors.push({ email: user.email, error: `HTTP ${response.status}: ${error}` });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ email: user.email, error: error.message });
      }
    }
    
    res.json({ results });
  } catch (error) {
    console.error('Add users to Impartner error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all active partners for manual selection
router.get('/partners-for-selection', async (req, res) => {
  try {
    const partners = await query(`
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.impartner_id,
        g.id as group_id,
        g.name as group_name
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE p.is_active = 1
      ORDER BY p.account_name
    `);
    
    res.json({ partners });
  } catch (error) {
    console.error('Get partners error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Sync Failures & Soft-Delete Management
// ============================================

// Get recent sync failures
router.get('/sync-failures', async (req, res) => {
  try {
    const { limit = 100, entityType, syncType, unresolvedOnly = 'false' } = req.query;
    
    let sql = `
      SELECT * FROM sync_failures
      WHERE 1=1
    `;
    const params = [];
    
    if (entityType) {
      sql += ' AND entity_type = ?';
      params.push(entityType);
    }
    
    if (syncType) {
      sql += ' AND sync_type = ?';
      params.push(syncType);
    }
    
    if (unresolvedOnly === 'true') {
      sql += ' AND resolved_at IS NULL';
    }
    
    sql += ' ORDER BY occurred_at DESC LIMIT ?';
    params.push(parseInt(limit));
    
    const failures = await query(sql, params);
    
    // Get summary stats
    const summary = await query(`
      SELECT 
        entity_type,
        failure_reason,
        COUNT(*) as count,
        MAX(occurred_at) as last_occurred
      FROM sync_failures
      WHERE resolved_at IS NULL
      GROUP BY entity_type, failure_reason
      ORDER BY count DESC
    `);
    
    res.json({ failures, summary, total: failures.length });
  } catch (error) {
    console.error('Get sync failures error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get soft-deleted (inactive) groups
router.get('/deleted-groups', async (req, res) => {
  try {
    const deletedGroups = await query(`
      SELECT 
        g.id,
        g.name,
        g.is_active,
        g.deleted_at,
        g.deletion_reason,
        g.last_api_check,
        g.partner_id,
        p.account_name as partner_name,
        p.partner_tier,
        p.is_active as partner_is_active,
        (SELECT COUNT(*) FROM lms_group_members WHERE group_id = g.id) as member_count
      FROM lms_groups g
      LEFT JOIN partners p ON p.id = g.partner_id
      WHERE g.is_active = FALSE
      ORDER BY g.deleted_at DESC
    `);
    
    res.json({ 
      deletedGroups,
      total: deletedGroups.length
    });
  } catch (error) {
    console.error('Get deleted groups error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get users who need to be removed from "All Partners" group
// (users in soft-deleted groups or deactivated partners)
router.get('/users-needing-offboard', async (req, res) => {
  try {
    // Get "All Partners" group ID
    const [allPartnersGroup] = await query(`
      SELECT id FROM lms_groups WHERE LOWER(name) = 'all partners' LIMIT 1
    `);
    
    if (!allPartnersGroup) {
      return res.status(404).json({ error: '"All Partners" group not found' });
    }
    
    // Find users who are in All Partners but their partner group is deleted or partner is inactive
    const usersToOffboard = await query(`
      SELECT 
        u.id as user_id,
        u.email,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as name,
        u.is_active as user_is_active,
        u.removed_from_all_partners,
        gm.group_id as current_partner_group_id,
        g.name as partner_group_name,
        g.is_active as group_is_active,
        g.deleted_at as group_deleted_at,
        g.deletion_reason,
        p.id as partner_id,
        p.account_name,
        p.is_active as partner_is_active,
        p.deleted_at as partner_deleted_at
      FROM lms_group_members apm
      JOIN lms_users u ON u.id = apm.user_id
      LEFT JOIN lms_group_members gm ON gm.user_id = u.id AND gm.group_id != ?
      LEFT JOIN lms_groups g ON g.id = gm.group_id AND g.partner_id IS NOT NULL
      LEFT JOIN partners p ON p.id = g.partner_id
      WHERE apm.group_id = ?
        AND (
          g.is_active = FALSE 
          OR p.is_active = FALSE
          OR u.is_active = FALSE
        )
        AND (u.removed_from_all_partners IS NULL OR u.removed_from_all_partners = FALSE)
      ORDER BY p.account_name, u.first_name
    `, [allPartnersGroup.id, allPartnersGroup.id]);
    
    // Group by reason
    const byReason = {
      groupDeleted: usersToOffboard.filter(u => u.group_is_active === 0),
      partnerInactive: usersToOffboard.filter(u => u.partner_is_active === 0 && u.group_is_active !== 0),
      userInactive: usersToOffboard.filter(u => u.user_is_active === 0 && u.partner_is_active !== 0 && u.group_is_active !== 0)
    };
    
    res.json({
      usersToOffboard,
      total: usersToOffboard.length,
      allPartnersGroupId: allPartnersGroup.id,
      byReason: {
        groupDeleted: byReason.groupDeleted.length,
        partnerInactive: byReason.partnerInactive.length,
        userInactive: byReason.userInactive.length
      }
    });
  } catch (error) {
    console.error('Get users needing offboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Resolve/dismiss sync failures
router.post('/sync-failures/resolve', async (req, res) => {
  try {
    const { failureIds, resolutionAction } = req.body;
    
    if (!failureIds || !Array.isArray(failureIds) || failureIds.length === 0) {
      return res.status(400).json({ error: 'failureIds array is required' });
    }
    
    await query(`
      UPDATE sync_failures 
      SET resolved_at = NOW(), resolution_action = ?
      WHERE id IN (?)
    `, [resolutionAction || 'manually_resolved', failureIds]);
    
    res.json({ success: true, resolved: failureIds.length });
  } catch (error) {
    console.error('Resolve sync failures error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reactivate a soft-deleted group (if it was deleted in error)
router.post('/groups/:groupId/reactivate', async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const [group] = await query('SELECT * FROM lms_groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    await query(`
      UPDATE lms_groups 
      SET is_active = TRUE, deleted_at = NULL, deletion_reason = NULL
      WHERE id = ?
    `, [groupId]);
    
    res.json({ success: true, group: { ...group, is_active: true, deleted_at: null } });
  } catch (error) {
    console.error('Reactivate group error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Hard delete a soft-deleted group (remove from database completely)
router.delete('/groups/:groupId/purge', async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const [group] = await query('SELECT * FROM lms_groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    if (group.is_active !== false && group.is_active !== 0) {
      return res.status(400).json({ error: 'Cannot purge an active group - soft-delete it first' });
    }
    
    // Remove memberships first
    const memberCount = await query('SELECT COUNT(*) as count FROM lms_group_members WHERE group_id = ?', [groupId]);
    await query('DELETE FROM lms_group_members WHERE group_id = ?', [groupId]);
    await query('DELETE FROM lms_groups WHERE id = ?', [groupId]);
    
    res.json({ 
      success: true, 
      purged: { 
        groupId, 
        groupName: group.name, 
        membersRemoved: memberCount[0]?.count || 0 
      }
    });
  } catch (error) {
    console.error('Purge group error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Deactivate a user and remove from All Partners group
router.post('/users/:userId/deactivate', async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason = 'manual_deactivation' } = req.body;
    
    const [user] = await query('SELECT * FROM lms_users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Mark user as inactive
    await query(`
      UPDATE lms_users 
      SET is_active = FALSE, deactivated_at = NOW(), deactivation_reason = ?
      WHERE id = ?
    `, [reason, userId]);
    
    // Get "All Partners" group
    const [allPartnersGroup] = await query(`
      SELECT id FROM lms_groups WHERE LOWER(name) = 'all partners' LIMIT 1
    `);
    
    let removedFromAllPartners = false;
    if (allPartnersGroup) {
      // Check if user is in All Partners
      const [membership] = await query(
        'SELECT * FROM lms_group_members WHERE group_id = ? AND user_id = ?',
        [allPartnersGroup.id, userId]
      );
      
      if (membership) {
        // Remove from All Partners group via Northpass API
        try {
          const response = await fetch(`https://api.northpass.com/v2/groups/${allPartnersGroup.id}/relationships/people`, {
            method: 'DELETE',
            headers: {
              'X-Api-Key': API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              data: [{ type: 'people', id: userId }]
            })
          });
          
          if (response.ok || response.status === 404) {
            // Remove from local DB
            await query('DELETE FROM lms_group_members WHERE group_id = ? AND user_id = ?', 
              [allPartnersGroup.id, userId]);
            await query('UPDATE lms_users SET removed_from_all_partners = TRUE WHERE id = ?', [userId]);
            removedFromAllPartners = true;
          }
        } catch (e) {
          console.error(`Failed to remove user from All Partners via API: ${e.message}`);
        }
      }
    }
    
    res.json({ 
      success: true, 
      user: { id: userId, email: user.email },
      removedFromAllPartners
    });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Batch offboard users from All Partners group
router.post('/offboard-users', async (req, res) => {
  try {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    
    // Get "All Partners" group
    const [allPartnersGroup] = await query(`
      SELECT id FROM lms_groups WHERE LOWER(name) = 'all partners' LIMIT 1
    `);
    
    if (!allPartnersGroup) {
      return res.status(404).json({ error: '"All Partners" group not found' });
    }
    
    const results = { removed: 0, failed: 0, errors: [] };
    
    // Process in batches of 20
    for (let i = 0; i < userIds.length; i += 20) {
      const batch = userIds.slice(i, i + 20);
      
      try {
        const response = await fetch(`https://api.northpass.com/v2/groups/${allPartnersGroup.id}/relationships/people`, {
          method: 'DELETE',
          headers: {
            'X-Api-Key': API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            data: batch.map(id => ({ type: 'people', id: String(id) }))
          })
        });
        
        if (response.ok || response.status === 404) {
          // Remove from local DB - need to properly handle array in IN clause
          const placeholders = batch.map(() => '?').join(',');
          await query(`DELETE FROM lms_group_members WHERE group_id = ? AND user_id IN (${placeholders})`, 
            [allPartnersGroup.id, ...batch]);
          await query(`UPDATE lms_users SET removed_from_all_partners = TRUE WHERE id IN (${placeholders})`, batch);
          results.removed += batch.length;
        } else {
          results.failed += batch.length;
          results.errors.push({ batch: `${i}-${i + batch.length}`, status: response.status });
        }
      } catch (e) {
        results.failed += batch.length;
        results.errors.push({ batch: `${i}-${i + batch.length}`, error: e.message });
      }
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    res.json({ success: true, results });
  } catch (error) {
    console.error('Batch offboard users error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
