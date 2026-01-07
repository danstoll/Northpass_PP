/**
 * Partner Family Routes
 * Endpoints for managing partner family relationships and GSI partners
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db/connection.cjs');

// ============================================
// Partner Family Management Endpoints
// ============================================

// Get all partner families with member counts
router.get('/', async (req, res) => {
  try {
    const families = await query(`
      SELECT 
        pf.*,
        hp.account_name as head_partner_name,
        (SELECT COUNT(*) FROM partners WHERE partner_family = pf.family_name) as member_count,
        (SELECT GROUP_CONCAT(DISTINCT account_region SEPARATOR ', ') 
         FROM partners WHERE partner_family = pf.family_name) as regions
      FROM partner_families pf
      LEFT JOIN partners hp ON hp.id = pf.head_partner_id
      ORDER BY pf.family_name
    `);
    
    res.json(families);
  } catch (error) {
    console.error('Error fetching families:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a single partner family with all members
router.get('/:familyName', async (req, res) => {
  try {
    const { familyName } = req.params;
    
    const [family] = await query(
      'SELECT * FROM partner_families WHERE family_name = ?',
      [familyName]
    );
    
    const members = await query(`
      SELECT 
        p.*,
        g.id as lms_group_id,
        g.name as lms_group_name,
        g.user_count as lms_user_count,
        (SELECT COUNT(*) FROM contacts WHERE partner_id = p.id) as contact_count,
        (SELECT COUNT(*) FROM contacts c 
         INNER JOIN lms_users u ON u.id = c.lms_user_id 
         WHERE c.partner_id = p.id) as lms_linked_count
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE p.partner_family = ?
      ORDER BY p.is_family_head DESC, p.account_name
    `, [familyName]);
    
    const sharedUsers = await query(`
      SELECT 
        su.*,
        u.email,
        u.first_name,
        u.last_name,
        ap.account_name as assigned_partner_name
      FROM shared_users su
      INNER JOIN lms_users u ON u.id = su.lms_user_id
      LEFT JOIN partners ap ON ap.id = su.assigned_partner_id
      WHERE su.partner_family = ?
      ORDER BY u.last_name, u.first_name
    `, [familyName]);
    
    res.json({
      family: family || { family_name: familyName },
      members,
      sharedUsers,
      memberCount: members.length,
      sharedUserCount: sharedUsers.length
    });
  } catch (error) {
    console.error('Error fetching family:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create or update a partner family
router.post('/', async (req, res) => {
  try {
    const { 
      family_name, 
      display_name, 
      is_gsi, 
      allow_cross_group_users, 
      aggregate_reporting,
      head_partner_id,
      notes 
    } = req.body;
    
    if (!family_name) {
      return res.status(400).json({ error: 'family_name is required' });
    }
    
    await query(`
      INSERT INTO partner_families 
        (family_name, display_name, is_gsi, allow_cross_group_users, aggregate_reporting, head_partner_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        display_name = VALUES(display_name),
        is_gsi = VALUES(is_gsi),
        allow_cross_group_users = VALUES(allow_cross_group_users),
        aggregate_reporting = VALUES(aggregate_reporting),
        head_partner_id = VALUES(head_partner_id),
        notes = VALUES(notes),
        updated_at = NOW()
    `, [
      family_name,
      display_name || family_name,
      is_gsi || false,
      allow_cross_group_users || false,
      aggregate_reporting !== false,
      head_partner_id || null,
      notes || null
    ]);
    
    if (head_partner_id) {
      await query('UPDATE partners SET is_family_head = FALSE WHERE partner_family = ?', [family_name]);
      await query('UPDATE partners SET is_family_head = TRUE WHERE id = ?', [head_partner_id]);
    }
    
    await query('UPDATE partners SET is_gsi = ? WHERE partner_family = ?', [is_gsi || false, family_name]);
    
    res.json({ success: true, message: `Family "${family_name}" saved` });
  } catch (error) {
    console.error('Error saving family:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a partner family
router.delete('/:familyName', async (req, res) => {
  try {
    const { familyName } = req.params;
    
    await query('UPDATE partners SET partner_family = NULL, is_gsi = FALSE, is_family_head = FALSE WHERE partner_family = ?', [familyName]);
    await query('DELETE FROM shared_users WHERE partner_family = ?', [familyName]);
    await query('DELETE FROM partner_families WHERE family_name = ?', [familyName]);
    
    res.json({ success: true, message: `Family "${familyName}" deleted` });
  } catch (error) {
    console.error('Error deleting family:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add partners to a family
router.post('/:familyName/members', async (req, res) => {
  try {
    const { familyName } = req.params;
    const { partnerIds } = req.body;
    
    if (!partnerIds || !Array.isArray(partnerIds) || partnerIds.length === 0) {
      return res.status(400).json({ error: 'partnerIds array is required' });
    }
    
    const [family] = await query('SELECT * FROM partner_families WHERE family_name = ?', [familyName]);
    
    const placeholders = partnerIds.map(() => '?').join(',');
    await query(
      `UPDATE partners SET partner_family = ?, is_gsi = ? WHERE id IN (${placeholders})`,
      [familyName, family?.is_gsi || false, ...partnerIds]
    );
    
    const updated = await query(
      `SELECT id, account_name FROM partners WHERE id IN (${placeholders})`,
      partnerIds
    );
    
    res.json({ 
      success: true, 
      message: `Added ${updated.length} partners to family "${familyName}"`,
      partners: updated
    });
  } catch (error) {
    console.error('Error adding members:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove a partner from a family
router.delete('/:familyName/members/:partnerId', async (req, res) => {
  try {
    const { familyName, partnerId } = req.params;
    
    await query(
      'UPDATE partners SET partner_family = NULL, is_gsi = FALSE, is_family_head = FALSE WHERE id = ? AND partner_family = ?',
      [partnerId, familyName]
    );
    
    res.json({ success: true, message: 'Partner removed from family' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: error.message });
  }
});

// Detect potential partner families by name patterns
router.get('/detect/by-pattern', async (req, res) => {
  try {
    // Find partners with common name prefixes
    const patterns = await query(`
      SELECT 
        SUBSTRING_INDEX(account_name, ' ', 1) as prefix,
        COUNT(*) as count,
        GROUP_CONCAT(id) as partner_ids,
        GROUP_CONCAT(account_name SEPARATOR ' | ') as partner_names
      FROM partners
      WHERE partner_family IS NULL
      GROUP BY prefix
      HAVING count >= 2
      ORDER BY count DESC
      LIMIT 50
    `);
    
    res.json(patterns);
  } catch (error) {
    console.error('Error detecting families:', error);
    res.status(500).json({ error: error.message });
  }
});

// Detect families from Impartner parent relationships
router.get('/detect/by-impartner', async (req, res) => {
  try {
    const families = await query(`
      SELECT 
        parent.id as parent_id,
        parent.account_name as parent_name,
        parent.impartner_id as parent_impartner_id,
        child.id as child_id,
        child.account_name as child_name,
        child.impartner_parent_id
      FROM partners parent
      INNER JOIN partners child ON child.impartner_parent_id = parent.impartner_id
      WHERE parent.impartner_id IS NOT NULL
      ORDER BY parent.account_name, child.account_name
    `);
    
    // Group by parent
    const byParent = {};
    for (const row of families) {
      if (!byParent[row.parent_id]) {
        byParent[row.parent_id] = {
          parentId: row.parent_id,
          parentName: row.parent_name,
          children: []
        };
      }
      byParent[row.parent_id].children.push({
        id: row.child_id,
        name: row.child_name
      });
    }
    
    res.json(Object.values(byParent));
  } catch (error) {
    console.error('Error detecting Impartner families:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
