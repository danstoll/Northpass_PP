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
        SUM(CASE WHEN is_active_pam = TRUE AND email_reports_enabled = TRUE THEN 1 ELSE 0 END) as email_enabled
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

// Get email logs (MUST be before /:id to avoid route conflict)
router.get('/email-logs', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const logs = await query(`
      SELECT 
        el.*,
        pm.owner_name as pam_name
      FROM email_log el
      LEFT JOIN partner_managers pm ON pm.id = el.pam_id
      ORDER BY el.created_at DESC
      LIMIT ?
    `, [parseInt(limit)]);
    
    res.json(logs);
  } catch (error) {
    console.error('Error getting email logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send test notification email (MUST be before /:id to avoid route conflict)
router.post('/send-test', async (req, res) => {
  try {
    const { email, pamId } = req.body;
    const { sendEmail, renderTemplate } = require('../db/notificationService.cjs');
    
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }
    
    // If pamId provided, get that PAM's data; otherwise use sample data
    let pam, partners, expiringCerts;
    
    if (pamId) {
      [pam] = await query('SELECT * FROM partner_managers WHERE id = ?', [pamId]);
      if (pam) {
        partners = await query(`
          SELECT p.id, p.account_name, p.partner_tier, p.account_region, p.total_npcu, 
            (COALESCE(p.cert_count_nintex_ce, 0) + COALESCE(p.cert_count_nintex_k2, 0) + 
             COALESCE(p.cert_count_nintex_salesforce, 0) + COALESCE(p.cert_count_go_to_market, 0)) as active_certs,
            p.total_users
          FROM partners p WHERE p.account_owner = ? ORDER BY p.account_name LIMIT 10
        `, [pam.owner_name]);
        
        expiringCerts = await query(`
          SELECT u.first_name, u.last_name, u.email, c.name as course_name, e.expires_at, p.account_name
          FROM lms_enrollments e
          INNER JOIN lms_users u ON u.id = e.user_id
          INNER JOIN lms_courses c ON c.id = e.course_id
          INNER JOIN lms_group_members gm ON gm.user_id = u.id
          INNER JOIN lms_groups g ON g.id = gm.group_id
          INNER JOIN partners p ON p.id = g.partner_id
          WHERE p.account_owner = ? AND e.status = 'completed' AND c.npcu_value > 0
            AND e.expires_at IS NOT NULL AND e.expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 90 DAY)
          ORDER BY e.expires_at LIMIT 10
        `, [pam.owner_name]);
      }
    }
    
    // If no PAM data, use sample data
    if (!pam) {
      pam = { owner_name: 'Test User', email: email };
      partners = [
        { account_name: 'Sample Partner A', partner_tier: 'Premier', total_npcu: 25, active_certs: 5, total_users: 10 },
        { account_name: 'Sample Partner B', partner_tier: 'Select', total_npcu: 12, active_certs: 3, total_users: 6 },
        { account_name: 'Sample Partner C', partner_tier: 'Registered', total_npcu: 5, active_certs: 1, total_users: 3 }
      ];
      expiringCerts = [
        { first_name: 'John', last_name: 'Smith', account_name: 'Sample Partner A', course_name: 'Nintex Automation Cloud Admin', expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
        { first_name: 'Jane', last_name: 'Doe', account_name: 'Sample Partner B', course_name: 'Nintex Forms Certification', expires_at: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000) }
      ];
    }
    
    // Build report HTML
    const reportDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    // Partner table
    let partnerTable = '';
    if (partners && partners.length > 0) {
      partnerTable = `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Partner</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Tier</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">NPCU</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Certs</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Users</th>
            </tr>
          </thead>
          <tbody>
            ${partners.map(p => `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${p.account_name}</td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">
                  <span style="padding: 2px 8px; border-radius: 4px; font-size: 12px; background: #e3f2fd; color: #1565c0;">${p.partner_tier || '-'}</span>
                </td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee; font-weight: 600; color: #FF6B35;">${p.total_npcu || 0}</td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">${p.active_certs || 0}</td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">${p.total_users || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      partnerTable = '<p style="color: #666;">No partners assigned.</p>';
    }
    
    // Expiring certs section
    let expiringCertsSection = '';
    if (expiringCerts && expiringCerts.length > 0) {
      expiringCertsSection = `
        <div style="background: #fff3cd; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #856404;">
          <h3 style="margin: 0 0 15px; color: #856404;">⚠️ Expiring Certifications (Next 90 Days)</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">User</th>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Partner</th>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Course</th>
                <th style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd;">Expires</th>
              </tr>
            </thead>
            <tbody>
              ${expiringCerts.map(c => `
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${c.first_name} ${c.last_name}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${c.account_name}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${c.course_name}</td>
                  <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee; color: #856404;">${new Date(c.expires_at).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    
    // Build full email HTML
    const subject = `[TEST] Partner Certification Report - ${reportDate}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="background: #fff3cd; padding: 10px 20px; border-radius: 4px; margin-bottom: 20px; border: 1px solid #856404;">
          <strong>⚠️ TEST EMAIL</strong> - This is a test notification sent to ${email}
        </div>
        <div style="background: linear-gradient(135deg, #6B4C9A, #FF6B35); padding: 20px; color: white; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">Partner Certification Report</h1>
          <p style="margin: 10px 0 0; opacity: 0.9;">${reportDate}</p>
        </div>
        <div style="padding: 20px; background: white; border: 1px solid #ddd; border-top: none;">
          <p>Hello ${pam.owner_name.split(' ')[0]},</p>
          <p>Here's your weekly partner certification summary:</p>
          
          <h2 style="color: #6B4C9A; border-bottom: 2px solid #FF6B35; padding-bottom: 10px;">Your Partners</h2>
          ${partnerTable}
          
          ${expiringCertsSection}
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
            <p>This report was generated automatically by the Nintex Partner Portal.</p>
            <p>If you have questions, please contact the Partner Program team.</p>
          </div>
        </div>
      </div>
    `;
    
    // Send the test email
    await sendEmail(email, subject, emailHtml);
    
    // Log to email_log
    await query(`
      INSERT INTO email_log (recipient_email, recipient_name, subject, email_type, status, sent_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `, [email, 'Test Recipient', subject, 'test', 'sent']);
    
    res.json({
      success: true,
      message: `Test email sent to ${email}`,
      usedPamData: !!pamId && !!pam
    });
  } catch (error) {
    console.error('Error sending test email:', error);
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

// ============================================
// PAM Report Endpoints
// ============================================

// Send report to a single PAM
router.post('/:id/send-report', async (req, res) => {
  try {
    const { id } = req.params;
    const { sendEmail, renderTemplate } = require('../db/notificationService.cjs');
    
    // Get PAM details
    const [pam] = await query('SELECT * FROM partner_managers WHERE id = ?', [id]);
    if (!pam) {
      return res.status(404).json({ error: 'PAM not found' });
    }
    
    if (!pam.email) {
      return res.status(400).json({ error: 'PAM has no email address' });
    }
    
    // Get partner stats for this PAM - including certification categories
    const partners = await query(`
      SELECT 
        p.id,
        p.account_name,
        p.partner_tier,
        p.account_region,
        p.total_npcu,
        (COALESCE(p.cert_count_nintex_ce, 0) + COALESCE(p.cert_count_nintex_k2, 0) + 
         COALESCE(p.cert_count_nintex_salesforce, 0) + COALESCE(p.cert_count_go_to_market, 0)) as active_certs,
        p.total_users,
        p.cert_count_nintex_ce,
        p.cert_count_nintex_k2,
        p.cert_count_nintex_salesforce,
        p.cert_count_go_to_market,
        p.has_gtm_certification
      FROM partners p
      WHERE p.account_owner = ?
      ORDER BY p.account_name
    `, [pam.owner_name]);
    
    // Get expiring certifications (next 90 days)
    const expiringCerts = await query(`
      SELECT 
        u.first_name,
        u.last_name,
        u.email,
        c.name as course_name,
        e.expires_at,
        p.account_name
      FROM lms_enrollments e
      INNER JOIN lms_users u ON u.id = e.user_id
      INNER JOIN lms_courses c ON c.id = e.course_id
      INNER JOIN lms_group_members gm ON gm.user_id = u.id
      INNER JOIN lms_groups g ON g.id = gm.group_id
      INNER JOIN partners p ON p.id = g.partner_id
      WHERE p.account_owner = ?
        AND e.status = 'completed'
        AND c.npcu_value > 0
        AND e.expires_at IS NOT NULL
        AND e.expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 90 DAY)
      ORDER BY e.expires_at
      LIMIT 20
    `, [pam.owner_name]);
    
    // Build HTML report
    const reportDate = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    // Build partner table with certification category breakdown
    let partnerTable = '';
    if (partners.length > 0) {
      // Calculate totals for summary
      const totals = partners.reduce((acc, p) => ({
        npcu: acc.npcu + (p.total_npcu || 0),
        nintexCe: acc.nintexCe + (p.cert_count_nintex_ce || 0),
        k2: acc.k2 + (p.cert_count_nintex_k2 || 0),
        salesforce: acc.salesforce + (p.cert_count_nintex_salesforce || 0),
        gtm: acc.gtm + (p.cert_count_go_to_market || 0),
        totalCerts: acc.totalCerts + (p.active_certs || 0)
      }), { npcu: 0, nintexCe: 0, k2: 0, salesforce: 0, gtm: 0, totalCerts: 0 });

      partnerTable = `
        <!-- Summary Stats -->
        <div style="display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 20px;">
          <div style="background: linear-gradient(135deg, #FF6B35, #E55A2B); color: white; padding: 15px 20px; border-radius: 8px; text-align: center; min-width: 100px;">
            <div style="font-size: 24px; font-weight: 700;">${totals.npcu}</div>
            <div style="font-size: 12px; opacity: 0.9;">Total NPCU</div>
          </div>
          <div style="background: #FF6B35; color: white; padding: 15px 20px; border-radius: 8px; text-align: center; min-width: 80px;">
            <div style="font-size: 24px; font-weight: 700;">${totals.nintexCe}</div>
            <div style="font-size: 12px; opacity: 0.9;">Nintex CE</div>
          </div>
          <div style="background: #6B4C9A; color: white; padding: 15px 20px; border-radius: 8px; text-align: center; min-width: 80px;">
            <div style="font-size: 24px; font-weight: 700;">${totals.k2}</div>
            <div style="font-size: 12px; opacity: 0.9;">K2</div>
          </div>
          <div style="background: #00A1E0; color: white; padding: 15px 20px; border-radius: 8px; text-align: center; min-width: 80px;">
            <div style="font-size: 24px; font-weight: 700;">${totals.salesforce}</div>
            <div style="font-size: 12px; opacity: 0.9;">Salesforce</div>
          </div>
          <div style="background: #28a745; color: white; padding: 15px 20px; border-radius: 8px; text-align: center; min-width: 80px;">
            <div style="font-size: 24px; font-weight: 700;">${totals.gtm}</div>
            <div style="font-size: 12px; opacity: 0.9;">GTM</div>
          </div>
        </div>

        <!-- Partner Table -->
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Partner</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Tier</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">NPCU</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd; color: #FF6B35;">CE</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd; color: #6B4C9A;">K2</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd; color: #00A1E0;">SF</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd; color: #28a745;">GTM</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${partners.map(p => `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${p.account_name}</td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">
                  <span style="padding: 2px 8px; border-radius: 4px; font-size: 12px; background: #e3f2fd; color: #1565c0;">${p.partner_tier || '-'}</span>
                </td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee; font-weight: 600; color: #FF6B35;">${p.total_npcu || 0}</td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;${(p.cert_count_nintex_ce || 0) > 0 ? ' background: #fff5f0;' : ''}">${p.cert_count_nintex_ce || 0}</td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;${(p.cert_count_nintex_k2 || 0) > 0 ? ' background: #f5f0fa;' : ''}">${p.cert_count_nintex_k2 || 0}</td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;${(p.cert_count_nintex_salesforce || 0) > 0 ? ' background: #e6f7ff;' : ''}">${p.cert_count_nintex_salesforce || 0}</td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;${p.has_gtm_certification ? ' background: #e8f5e9;' : ''}">${p.has_gtm_certification ? '✓ ' + (p.cert_count_go_to_market || 1) : '0'}</td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee; font-weight: 600;">${p.active_certs || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      partnerTable = '<p style="color: #666;">No partners assigned.</p>';
    }
    
    // Build expiring certs section
    let expiringCertsSection = '';
    if (expiringCerts.length > 0) {
      expiringCertsSection = `
        <div style="background: #fff3cd; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #856404;">
          <h3 style="margin: 0 0 15px; color: #856404;">⚠️ Expiring Certifications (Next 90 Days)</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">User</th>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Partner</th>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Course</th>
                <th style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd;">Expires</th>
              </tr>
            </thead>
            <tbody>
              ${expiringCerts.map(c => `
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${c.first_name} ${c.last_name}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${c.account_name}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${c.course_name}</td>
                  <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee; color: #856404;">${new Date(c.expires_at).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    
    // Try to use template, fallback to inline HTML
    let emailHtml;
    let subject;
    try {
      const rendered = await renderTemplate('pam_weekly_report', {
        reportDate,
        pamFirstName: pam.owner_name.split(' ')[0],
        partnerTable,
        expiringCertsSection
      });
      emailHtml = rendered.content;
      subject = rendered.subject;
    } catch (e) {
      // Fallback HTML
      subject = `Partner Certification Report - ${reportDate}`;
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #6B4C9A, #FF6B35); padding: 20px; color: white;">
            <h1 style="margin: 0;">Partner Certification Report</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">${reportDate}</p>
          </div>
          <div style="padding: 20px;">
            <p>Hi ${pam.owner_name.split(' ')[0]},</p>
            <p>Here's your partner activity summary:</p>
            <h3>Your Partners (${partners.length})</h3>
            ${partnerTable}
            ${expiringCertsSection}
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              This report was generated automatically by the Nintex Partner Portal.
            </p>
          </div>
        </div>
      `;
    }
    
    // Send email
    const result = await sendEmail(pam.email, subject, emailHtml);
    
    // Log the email
    await query(`
      INSERT INTO email_log (recipient_email, recipient_name, subject, email_type, status, pam_id)
      VALUES (?, ?, ?, 'pam_report', 'sent', ?)
    `, [pam.email, pam.owner_name, subject, pam.id]);
    
    res.json({
      success: true,
      message: `Report sent to ${pam.email}`,
      partnerCount: partners.length,
      expiringCount: expiringCerts.length,
      ...result
    });
  } catch (error) {
    console.error('Error sending PAM report:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send reports to all PAMs with email_reports_enabled
router.post('/send-all-reports', async (req, res) => {
  try {
    const pams = await query(`
      SELECT id, owner_name, email 
      FROM partner_managers 
      WHERE is_active_pam = TRUE 
        AND email_reports_enabled = TRUE 
        AND email IS NOT NULL
    `);
    
    const results = { sent: 0, failed: 0, errors: [] };
    
    for (const pam of pams) {
      try {
        // Call the individual send-report endpoint internally
        const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/db/pams/${pam.id}/send-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
          results.sent++;
        } else {
          const data = await response.json();
          results.failed++;
          results.errors.push({ pam: pam.owner_name, error: data.error });
        }
      } catch (err) {
        results.failed++;
        results.errors.push({ pam: pam.owner_name, error: err.message });
      }
    }
    
    res.json({
      success: true,
      message: `Sent ${results.sent} reports, ${results.failed} failed`,
      ...results
    });
  } catch (error) {
    console.error('Error sending all PAM reports:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
