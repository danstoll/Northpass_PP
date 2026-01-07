/**
 * Maintenance Routes
 * Audit and maintenance endpoints for partner contacts and group memberships
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db/connection.cjs');

const API_BASE = 'https://api.northpass.com';
const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';

// ============================================
// Maintenance Endpoints
// ============================================

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
      success: 0,
      failed: 0,
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
          
          results.success++;
          results.addedUsers.push(userId);
        } else {
          const error = await response.text();
          results.failed++;
          results.errors.push({ userId, error: `HTTP ${response.status}: ${error}` });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ userId, error: error.message });
      }
    }
    
    res.json(results);
  } catch (error) {
    console.error('Add to All Partners error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
