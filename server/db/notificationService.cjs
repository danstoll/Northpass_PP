/**
 * Notification Service - Nintex Workflow Cloud Integration
 * 
 * Sends notifications via Nintex Workflow Cloud which handles:
 * - Email notifications
 * - Slack messages
 * - System alerts
 * 
 * Workflow URL: https://ntx-channel.workflowcloud.com
 */

const { query } = require('./connection.cjs');

const WORKFLOW_URL = 'https://ntx-channel.workflowcloud.com/api/v1/workflow/published/6176b33c-9458-4579-8828-af69bb829e8d/instances';
const WORKFLOW_TOKEN = 'F80xrywkYF0FC7RyXa4QXUU78oQq7kobFQEp7HpauP1if7XsB81mswHarzweezCZwrlUgv';

/**
 * Start a Nintex Workflow to send a notification
 * @param {Object} options Notification options
 * @param {string} options.commType - 'email' or 'slack'
 * @param {string} [options.email] - Recipient email (for email type)
 * @param {string} [options.emailCC] - CC email address (for email type)
 * @param {string} [options.subject] - Email subject (for email type)
 * @param {string} [options.emailContent] - Email body HTML (for email type)
 * @param {string} [options.attachment] - Base64 encoded file attachment (for email type)
 * @param {string} [options.slackContent] - Slack message content (for slack type)
 * @param {string} [options.callbackUrl] - Optional callback URL for workflow completion
 * @returns {Promise<Object>} Workflow instance response
 */
async function sendNotification(options) {
  const {
    commType = 'email',
    email = '',
    emailCC = '',
    subject = '',
    emailContent = '',
    attachment = '',
    slackContent = '',
    callbackUrl = ''
  } = options;

  // Validate required fields based on communication type
  if (commType === 'email') {
    if (!email) throw new Error('Email address is required for email notifications');
    if (!subject) throw new Error('Subject is required for email notifications');
    if (!emailContent) throw new Error('Email content is required for email notifications');
  } else if (commType === 'slack' || commType === 'system') {
    if (!slackContent) throw new Error('Slack content is required for Slack/System notifications');
  } else {
    throw new Error(`Invalid communication type: ${commType}. Must be 'email', 'slack', or 'system'`);
  }

  const requestBody = {
    startData: {
      se_varcommtype: commType,
      se_varemail: email,
      se_varemailcc: emailCC,
      se_varemailsubject: subject,
      se_varemailcontent: emailContent,
      se_varemailattachement: attachment,
      se_varslackcontent: slackContent
    },
    options: {}
  };

  // Add callback URL if provided
  if (callbackUrl) {
    requestBody.options.callbackUrl = callbackUrl;
  }

  console.log(`📤 Starting Nintex Workflow - Type: ${commType}, To: ${email || 'Slack'}`);

  try {
    const response = await fetch(`${WORKFLOW_URL}?token=${WORKFLOW_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Workflow API error (${response.status}): ${errorText}`);
    }

    // NWC API returns instance ID as plain text or JSON - handle both
    const responseText = await response.text();
    let instanceId = responseText;
    let result = { id: responseText };
    
    // Try to parse as JSON, but don't fail if it's not
    try {
      result = JSON.parse(responseText);
      instanceId = result.id || responseText;
    } catch (e) {
      // Response is plain text (instance ID) - that's fine
      instanceId = responseText.trim();
    }
    
    console.log(`✅ Workflow started successfully - Instance ID: ${instanceId}`);
    
    return {
      success: true,
      instanceId: instanceId,
      status: result.status || 'started',
      message: `Notification sent via ${commType}`
    };
  } catch (error) {
    console.error(`❌ Workflow failed: ${error.message}`);
    throw error;
  }
}

/**
 * Send an email notification via Nintex Workflow
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlContent - Email body as HTML
 * @param {string} [attachment] - Optional base64 encoded attachment
 * @returns {Promise<Object>} Result
 */
async function sendEmail(to, subject, htmlContent, attachment = '', cc = '') {
  return sendNotification({
    commType: 'email',
    email: to,
    emailCC: cc,
    subject,
    emailContent: htmlContent,
    attachment
  });
}

/**
 * Send a Slack message via Nintex Workflow
 * @param {string} message - Message content
 * @returns {Promise<Object>} Result
 */
async function sendSlackMessage(message) {
  return sendNotification({
    commType: 'slack',
    slackContent: message
  });
}

/**
 * Send a System alert via Nintex Workflow (admin notifications)
 * @param {string} message - Alert message content
 * @returns {Promise<Object>} Result
 */
async function sendSystemAlert(message) {
  return sendNotification({
    commType: 'system',
    slackContent: message
  });
}

/**
 * Send PAM report email via Nintex Workflow
 * @param {Object} pam - PAM record from database
 * @param {string} reportHtml - Generated HTML report content
 * @param {string} [attachmentBase64] - Optional PDF attachment as base64
 * @returns {Promise<Object>} Result
 */
async function sendPamReport(pam, reportHtml, attachmentBase64 = '') {
  const subject = `Partner Certification Report - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
  
  return sendNotification({
    commType: 'email',
    email: pam.email,
    subject,
    emailContent: reportHtml,
    attachment: attachmentBase64
  });
}

/**
 * Send test notification to verify workflow integration
 * @param {string} commType - 'email', 'slack', or 'system'
 * @param {string} [testEmail] - Email for testing (if commType is 'email')
 * @returns {Promise<Object>} Result
 */
async function sendTestNotification(commType, testEmail = '') {
  const timestamp = new Date().toLocaleString();
  
  if (commType === 'email') {
    if (!testEmail) throw new Error('Test email address is required');
    
    return sendEmail(
      testEmail,
      'Test Email from Nintex Partner Portal',
      `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #FF6B35;">🧪 Test Email</h2>
          <p>This is a test email from the Nintex Partner Portal.</p>
          <p>If you received this, the Nintex Workflow Cloud integration is working correctly!</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">Sent at: ${timestamp}</p>
        </div>
      `
    );
  } else if (commType === 'slack') {
    return sendSlackMessage(
      `🧪 *Test Message from Nintex Partner Portal*\n\nThis is a test user notification. If you see this, the Slack integration is working!\n\n_Sent at: ${timestamp}_`
    );
  } else if (commType === 'system') {
    return sendSystemAlert(
      `🔔 *System Alert Test*\n\nThis is a test admin notification from the Partner Portal.\nSystem alerts use the \`system\` workflow branch.\n\n_Sent at: ${timestamp}_`
    );
  } else {
    throw new Error(`Invalid communication type: ${commType}`);
  }
}

// ============================================================================
// Template Management Functions
// ============================================================================

/**
 * Get all notification templates
 * @returns {Promise<Array>} List of templates
 */
async function getTemplates() {
  return await query(`
    SELECT * FROM notification_templates 
    ORDER BY comm_type, template_name
  `);
}

/**
 * Get a specific template by key
 * @param {string} templateKey - The template key
 * @returns {Promise<Object|null>} Template or null
 */
async function getTemplate(templateKey) {
  const rows = await query(
    'SELECT * FROM notification_templates WHERE template_key = ?',
    [templateKey]
  );
  return rows[0] || null;
}

/**
 * Update a template
 * @param {number} id - Template ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated template
 */
async function updateTemplate(id, updates) {
  const { subject, content, description, is_active } = updates;
  
  await query(`
    UPDATE notification_templates 
    SET subject = ?, content = ?, description = ?, is_active = ?
    WHERE id = ?
  `, [subject, content, description, is_active !== false, id]);
  
  const [template] = await query('SELECT * FROM notification_templates WHERE id = ?', [id]);
  return template;
}

/**
 * Create a new template
 * @param {Object} template - Template data
 * @returns {Promise<Object>} Created template
 */
async function createTemplate(template) {
  const { template_key, template_name, comm_type, subject, content, description, variables } = template;
  
  const result = await query(`
    INSERT INTO notification_templates (template_key, template_name, comm_type, subject, content, description, variables)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [template_key, template_name, comm_type, subject, content, description, JSON.stringify(variables || [])]);
  
  const [created] = await query('SELECT * FROM notification_templates WHERE id = ?', [result.insertId]);
  return created;
}

/**
 * Delete a template
 * @param {number} id - Template ID
 * @returns {Promise<boolean>} Success
 */
async function deleteTemplate(id) {
  const result = await query('DELETE FROM notification_templates WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

/**
 * Render a template with variables
 * @param {string} templateKey - Template key
 * @param {Object} variables - Variables to substitute
 * @returns {Promise<Object>} Rendered subject and content
 */
async function renderTemplate(templateKey, variables = {}) {
  const template = await getTemplate(templateKey);
  if (!template) {
    throw new Error(`Template not found: ${templateKey}`);
  }
  
  let subject = template.subject || '';
  let content = template.content || '';
  
  // Replace {{variable}} placeholders
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    subject = subject.replace(regex, value);
    content = content.replace(regex, value);
  }
  
  return { subject, content, commType: template.comm_type };
}

// ============================================================================
// Specialized Alert Functions
// ============================================================================

/**
 * Send a sync error alert via system notification
 * @param {string} taskName - Name of the failed task
 * @param {string} errorMessage - Error message
 * @param {number} [duration] - Duration in seconds before failure
 * @returns {Promise<Object>} Result
 */
async function sendSyncErrorAlert(taskName, errorMessage, duration = 0) {
  const timestamp = new Date().toLocaleString();
  
  // Try to use template, fall back to default format
  try {
    const template = await getTemplate('sync_error_alert');
    if (template && template.is_active) {
      const rendered = await renderTemplate('sync_error_alert', {
        taskName,
        errorMessage: errorMessage.substring(0, 500), // Truncate long errors
        timestamp,
        duration: duration.toString()
      });
      return sendSystemAlert(rendered.content);
    }
  } catch (e) {
    console.log('Template not available, using default format');
  }
  
  // Default format
  const message = `🚨 *Sync Task Failed*\n\n*Task:* ${taskName}\n*Error:* ${errorMessage.substring(0, 500)}\n*Time:* ${timestamp}\n*Duration:* ${duration} seconds\n\nPlease check the sync dashboard for details.`;
  return sendSystemAlert(message);
}

/**
 * Send a daily sync summary (optional)
 * @param {Object} stats - Sync statistics
 * @returns {Promise<Object>} Result
 */
async function sendDailySyncSummary(stats) {
  const timestamp = new Date().toLocaleString();
  
  const summaryLines = [
    `*Tasks Run:* ${stats.tasksRun || 0}`,
    `*Successful:* ${stats.successful || 0}`,
    `*Failed:* ${stats.failed || 0}`,
    `*Records Processed:* ${(stats.recordsProcessed || 0).toLocaleString()}`
  ];
  
  if (stats.details) {
    summaryLines.push('', '*Details:*');
    for (const [task, result] of Object.entries(stats.details)) {
      summaryLines.push(`• ${task}: ${result}`);
    }
  }
  
  try {
    const rendered = await renderTemplate('sync_success_summary', {
      summaryContent: summaryLines.join('\n'),
      timestamp
    });
    return sendSystemAlert(rendered.content);
  } catch (e) {
    // Fallback
    return sendSystemAlert(`✅ *Daily Sync Summary*\n\n${summaryLines.join('\n')}\n\n_Generated at ${timestamp}_`);
  }
}

module.exports = {
  sendNotification,
  sendEmail,
  sendSlackMessage,
  sendSystemAlert,
  sendPamReport,
  sendTestNotification,
  // Template functions
  getTemplates,
  getTemplate,
  updateTemplate,
  createTemplate,
  deleteTemplate,
  renderTemplate,
  // Alert functions
  sendSyncErrorAlert,
  sendDailySyncSummary,
  WORKFLOW_URL
};
