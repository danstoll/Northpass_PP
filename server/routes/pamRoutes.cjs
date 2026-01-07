/**
 * PAM (Partner Account Manager) Routes
 * Endpoints for managing partner account managers
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query } = require('../db/connection.cjs');

// ============================================
// PAM Management Endpoints
// ============================================

// Get all PAMs
router.get('/', async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    
    const pams = await query(`
      SELECT 
        pm.*,
        au.email as login_email,
        au.first_name as login_first_name,
        au.last_name as login_last_name,
        au.is_active as login_active,
        au.last_login_at,
        (SELECT COUNT(*) FROM partners p WHERE p.account_owner = pm.owner_name) as partner_count
      FROM partner_managers pm
      LEFT JOIN admin_users au ON au.id = pm.admin_user_id
      ${!includeInactive ? 'WHERE pm.is_active_pam = TRUE' : ''}
      ORDER BY pm.is_active_pam DESC, pm.owner_name
    `);
    
    const [stats] = await query(`
      SELECT 
        COUNT(*) as total_owners,
        SUM(is_active_pam) as active_pams,
        SUM(CASE WHEN admin_user_id IS NOT NULL THEN 1 ELSE 0 END) as with_accounts,
        SUM(CASE WHEN email_reports_enabled THEN 1 ELSE 0 END) as email_enabled
      FROM partner_managers
    `);
    
    res.json({
      pams,
      stats: {
        totalOwners: stats.total_owners || 0,
        activePams: stats.active_pams || 0,
        withAccounts: stats.with_accounts || 0,
        emailEnabled: stats.email_enabled || 0
      }
    });
  } catch (error) {
    console.error('Error getting PAMs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single PAM
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [pam] = await query(`
      SELECT 
        pm.*,
        au.email as login_email,
        au.first_name as login_first_name,
        au.last_name as login_last_name,
        au.is_active as login_active
      FROM partner_managers pm
      LEFT JOIN admin_users au ON au.id = pm.admin_user_id
      WHERE pm.id = ?
    `, [id]);
    
    if (!pam) {
      return res.status(404).json({ error: 'PAM not found' });
    }
    
    const partners = await query(`
      SELECT id, account_name, partner_tier, account_region
      FROM partners
      WHERE account_owner = ?
      ORDER BY account_name
    `, [pam.owner_name]);
    
    res.json({ pam, partners });
  } catch (error) {
    console.error('Error getting PAM:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update PAM
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active_pam, email, notes, email_reports_enabled, report_frequency, region } = req.body;
    
    const toNull = (v) => v === undefined ? null : v;
    
    await query(`
      UPDATE partner_managers SET
        is_active_pam = COALESCE(?, is_active_pam),
        email = COALESCE(?, email),
        notes = COALESCE(?, notes),
        email_reports_enabled = COALESCE(?, email_reports_enabled),
        report_frequency = COALESCE(?, report_frequency),
        region = COALESCE(?, region)
      WHERE id = ?
    `, [toNull(is_active_pam), toNull(email), toNull(notes), toNull(email_reports_enabled), toNull(report_frequency), toNull(region), id]);
    
    res.json({ success: true, message: 'PAM updated' });
  } catch (error) {
    console.error('Error updating PAM:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sync PAMs from CRM data
router.post('/sync-from-crm', async (req, res) => {
  try {
    const stats = { created: 0, updated: 0, skipped: 0 };
    
    const uniqueOwners = await query(`
      SELECT DISTINCT account_owner, owner_email, account_region 
      FROM partners 
      WHERE account_owner IS NOT NULL AND account_owner != ''
    `);
    
    for (const owner of uniqueOwners) {
      const ownerName = owner.account_owner.trim();
      const ownerEmail = owner.owner_email || null;
      const region = owner.account_region || null;
      
      try {
        const [existing] = await query('SELECT id, email FROM partner_managers WHERE owner_name = ?', [ownerName]);
        
        if (existing) {
          if (ownerEmail && ownerEmail !== existing.email) {
            await query('UPDATE partner_managers SET email = ?, region = COALESCE(?, region) WHERE id = ?', 
              [ownerEmail, region, existing.id]);
            stats.updated++;
          } else {
            stats.skipped++;
          }
        } else {
          await query(
            `INSERT INTO partner_managers (owner_name, email, region, is_active_pam, email_reports_enabled, report_frequency)
             VALUES (?, ?, ?, TRUE, TRUE, 'weekly')`,
            [ownerName, ownerEmail, region]
          );
          stats.created++;
        }
      } catch (err) {
        console.error(`Error syncing PAM ${ownerName}:`, err.message);
      }
    }
    
    res.json({
      success: true,
      message: `Synced PAMs from CRM data`,
      stats: {
        ...stats,
        totalOwners: uniqueOwners.length
      }
    });
  } catch (error) {
    console.error('Error syncing PAMs from CRM:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create login account for PAM
router.post('/:id/create-account', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, password, firstName, lastName } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const [pam] = await query('SELECT * FROM partner_managers WHERE id = ?', [id]);
    if (!pam) {
      return res.status(404).json({ error: 'PAM not found' });
    }
    
    const [existing] = await query('SELECT id FROM admin_users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    
    const [profile] = await query('SELECT id FROM admin_profiles WHERE name = ?', ['Channel Manager']);
    if (!profile) {
      return res.status(500).json({ error: 'Channel Manager profile not found' });
    }
    
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    const passwordHash = `${salt}:${hash}`;
    
    const result = await query(`
      INSERT INTO admin_users (email, password_hash, first_name, last_name, profile_id, is_active)
      VALUES (?, ?, ?, ?, ?, TRUE)
    `, [email.toLowerCase(), passwordHash, firstName || pam.owner_name.split(' ')[0], lastName || '', profile.id]);
    
    await query('UPDATE partner_managers SET admin_user_id = ?, email = ? WHERE id = ?', 
      [result.insertId, email.toLowerCase(), id]);
    
    res.json({
      success: true,
      message: 'Account created successfully',
      userId: result.insertId
    });
  } catch (error) {
    console.error('Error creating PAM account:', error);
    res.status(500).json({ error: error.message });
  }
});

// Link existing admin account to PAM
router.post('/:id/link-account', async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const [pam] = await query('SELECT * FROM partner_managers WHERE id = ?', [id]);
    if (!pam) {
      return res.status(404).json({ error: 'PAM not found' });
    }
    
    if (pam.admin_user_id) {
      return res.status(400).json({ error: 'PAM already has a linked account' });
    }
    
    const [adminUser] = await query('SELECT id, email, first_name, last_name FROM admin_users WHERE email = ?', [email.toLowerCase()]);
    if (!adminUser) {
      return res.status(404).json({ error: 'No admin account found with that email' });
    }
    
    await query('UPDATE partner_managers SET admin_user_id = ?, email = ? WHERE id = ?', 
      [adminUser.id, email.toLowerCase(), id]);
    
    res.json({
      success: true,
      message: `Account linked successfully (${adminUser.first_name} ${adminUser.last_name})`,
      userId: adminUser.id
    });
  } catch (error) {
    console.error('Error linking PAM account:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
