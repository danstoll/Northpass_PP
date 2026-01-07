/**
 * Notification Routes
 * Email templates and notification settings
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db/connection.cjs');

// ============================================
// Notification Template Endpoints
// ============================================

// Get all notification templates
router.get('/templates', async (req, res) => {
  try {
    const templates = await query(`
      SELECT * FROM notification_templates
      ORDER BY name
    `);
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get template by ID
router.get('/templates/:id', async (req, res) => {
  try {
    const [template] = await query(`
      SELECT * FROM notification_templates WHERE id = ?
    `, [req.params.id]);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create template
router.post('/templates', async (req, res) => {
  try {
    const { name, description, subject, body_html, body_text, variables, is_active } = req.body;
    
    if (!name || !subject) {
      return res.status(400).json({ error: 'Name and subject are required' });
    }
    
    const result = await query(`
      INSERT INTO notification_templates (name, description, subject, body_html, body_text, variables, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [name, description, subject, body_html, body_text, JSON.stringify(variables || []), is_active !== false]);
    
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update template
router.put('/templates/:id', async (req, res) => {
  try {
    const { name, description, subject, body_html, body_text, variables, is_active } = req.body;
    
    await query(`
      UPDATE notification_templates SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        subject = COALESCE(?, subject),
        body_html = COALESCE(?, body_html),
        body_text = COALESCE(?, body_text),
        variables = COALESCE(?, variables),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `, [name, description, subject, body_html, body_text, variables ? JSON.stringify(variables) : null, is_active, req.params.id]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete template
router.delete('/templates/:id', async (req, res) => {
  try {
    await query('DELETE FROM notification_templates WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Email Settings
// ============================================

// Get email settings
router.get('/settings', async (req, res) => {
  try {
    const [settings] = await query(`SELECT * FROM email_settings LIMIT 1`);
    res.json(settings || {});
  } catch (error) {
    console.error('Error fetching email settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update email settings
router.put('/settings', async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, from_email, from_name, is_enabled } = req.body;
    
    const [existing] = await query('SELECT id FROM email_settings LIMIT 1');
    
    if (existing) {
      await query(`
        UPDATE email_settings SET
          smtp_host = COALESCE(?, smtp_host),
          smtp_port = COALESCE(?, smtp_port),
          smtp_user = COALESCE(?, smtp_user),
          smtp_pass = COALESCE(?, smtp_pass),
          from_email = COALESCE(?, from_email),
          from_name = COALESCE(?, from_name),
          is_enabled = COALESCE(?, is_enabled)
        WHERE id = ?
      `, [smtp_host, smtp_port, smtp_user, smtp_pass, from_email, from_name, is_enabled, existing.id]);
    } else {
      await query(`
        INSERT INTO email_settings (smtp_host, smtp_port, smtp_user, smtp_pass, from_email, from_name, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [smtp_host, smtp_port, smtp_user, smtp_pass, from_email, from_name, is_enabled !== false]);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating email settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test email settings
router.post('/test', async (req, res) => {
  try {
    const { to_email, template_id } = req.body;
    
    if (!to_email) {
      return res.status(400).json({ error: 'to_email is required' });
    }
    
    // Get email settings
    const [settings] = await query('SELECT * FROM email_settings LIMIT 1');
    if (!settings || !settings.is_enabled) {
      return res.status(400).json({ error: 'Email settings not configured or disabled' });
    }
    
    // Get template if specified
    let subject = 'Test Email from Northpass Portal';
    let body = '<p>This is a test email from the Northpass Partner Portal.</p>';
    
    if (template_id) {
      const [template] = await query('SELECT * FROM notification_templates WHERE id = ?', [template_id]);
      if (template) {
        subject = template.subject;
        body = template.body_html;
      }
    }
    
    // Try to send email using nodemailer
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: settings.smtp_host,
        port: settings.smtp_port,
        secure: settings.smtp_port === 465,
        auth: {
          user: settings.smtp_user,
          pass: settings.smtp_pass
        }
      });
      
      await transporter.sendMail({
        from: `"${settings.from_name}" <${settings.from_email}>`,
        to: to_email,
        subject,
        html: body
      });
      
      res.json({ success: true, message: `Test email sent to ${to_email}` });
    } catch (sendError) {
      console.error('Email send error:', sendError);
      res.status(500).json({ 
        error: 'Failed to send email', 
        details: sendError.message 
      });
    }
  } catch (error) {
    console.error('Error testing email:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
