/**
 * Authentication Service
 * Handles user authentication, sessions, and authorization
 */

const crypto = require('crypto');
const { query } = require('./connection.cjs');

// Session duration: 24 hours
const SESSION_DURATION_HOURS = 24;
// Password reset token duration: 1 hour
const RESET_TOKEN_DURATION_HOURS = 1;
// Magic link duration: 15 minutes
const MAGIC_LINK_DURATION_MINUTES = 15;

/**
 * Hash a password using PBKDF2
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash
 */
function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

/**
 * Generate a secure session token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Authenticate user and create session
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {Object} metadata - Optional metadata for login history
 * @param {string} metadata.ipAddress - Client IP address
 * @param {string} metadata.userAgent - Client user agent
 */
async function login(email, password, metadata = {}) {
  const { ipAddress, userAgent } = metadata;
  
  // Find user (including inactive to distinguish error types)
  const users = await query(
    `SELECT u.*, p.name as profile_name, p.permissions
     FROM admin_users u
     JOIN admin_profiles p ON u.profile_id = p.id
     WHERE u.email = ?`,
    [email.toLowerCase()]
  );

  // User not found
  if (!users || users.length === 0) {
    await logLoginAttempt({
      userId: null,
      email: email.toLowerCase(),
      success: false,
      failureReason: 'invalid_email',
      ipAddress,
      userAgent,
      loginMethod: 'password'
    });
    return { success: false, error: 'Invalid email or password' };
  }

  const user = users[0];
  
  // User is disabled
  if (!user.is_active) {
    await logLoginAttempt({
      userId: user.id,
      email: email.toLowerCase(),
      success: false,
      failureReason: 'account_disabled',
      ipAddress,
      userAgent,
      loginMethod: 'password'
    });
    return { success: false, error: 'Invalid email or password' };
  }

  // Verify password
  if (!verifyPassword(password, user.password_hash)) {
    await logLoginAttempt({
      userId: user.id,
      email: email.toLowerCase(),
      success: false,
      failureReason: 'wrong_password',
      ipAddress,
      userAgent,
      loginMethod: 'password'
    });
    return { success: false, error: 'Invalid email or password' };
  }

  // Generate session token
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  // Create session
  const sessionResult = await query(
    'INSERT INTO admin_sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
    [user.id, token, expiresAt]
  );

  // Update last login
  await query('UPDATE admin_users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  
  // Log successful login
  await logLoginAttempt({
    userId: user.id,
    email: email.toLowerCase(),
    success: true,
    failureReason: null,
    ipAddress,
    userAgent,
    loginMethod: 'password',
    sessionId: sessionResult.insertId
  });

  // Parse permissions
  let permissions = {};
  try {
    permissions = typeof user.permissions === 'string' 
      ? JSON.parse(user.permissions) 
      : user.permissions;
  } catch (e) {
    console.error('Failed to parse permissions:', e);
  }

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      profileId: user.profile_id,
      profileName: user.profile_name,
      permissions
    },
    token,
    expiresAt
  };
}

/**
 * Validate session token and return user
 */
async function validateSession(token) {
  if (!token) return null;

  // Find valid session
  const sessions = await query(
    `SELECT s.*, u.id as user_id, u.email, u.first_name, u.last_name, 
            u.profile_id, u.is_active, p.name as profile_name, p.permissions
     FROM admin_sessions s
     JOIN admin_users u ON s.user_id = u.id
     JOIN admin_profiles p ON u.profile_id = p.id
     WHERE s.token = ? AND s.expires_at > NOW() AND u.is_active = TRUE`,
    [token]
  );

  if (!sessions || sessions.length === 0) {
    return null;
  }

  const session = sessions[0];

  // Parse permissions
  let permissions = {};
  try {
    permissions = typeof session.permissions === 'string' 
      ? JSON.parse(session.permissions) 
      : session.permissions;
  } catch (e) {
    console.error('Failed to parse permissions:', e);
  }

  return {
    id: session.user_id,
    email: session.email,
    firstName: session.first_name,
    lastName: session.last_name,
    profileId: session.profile_id,
    profileName: session.profile_name,
    permissions
  };
}

/**
 * Logout - invalidate session
 */
async function logout(token) {
  if (!token) return;
  await query('DELETE FROM admin_sessions WHERE token = ?', [token]);
}

/**
 * Clean up expired sessions
 */
async function cleanupExpiredSessions() {
  const result = await query('DELETE FROM admin_sessions WHERE expires_at < NOW()');
  return result.affectedRows || 0;
}

// ============================================
// User Management
// ============================================

/**
 * Get all admin users
 */
async function getUsers() {
  return await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.profile_id, 
            u.is_active, u.last_login_at, u.created_at,
            p.name as profile_name
     FROM admin_users u
     JOIN admin_profiles p ON u.profile_id = p.id
     ORDER BY u.created_at DESC`
  );
}

/**
 * Get user by ID
 */
async function getUserById(id) {
  const users = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.profile_id, 
            u.is_active, u.last_login_at, u.created_at,
            p.name as profile_name, p.permissions
     FROM admin_users u
     JOIN admin_profiles p ON u.profile_id = p.id
     WHERE u.id = ?`,
    [id]
  );
  return users[0] || null;
}

/**
 * Create new user
 */
async function createUser({ email, password, firstName, lastName, profileId, createdBy }) {
  // Check if email already exists
  const existing = await query('SELECT id FROM admin_users WHERE email = ?', [email.toLowerCase()]);
  if (existing && existing.length > 0) {
    throw new Error('Email already exists');
  }

  const passwordHash = hashPassword(password);
  
  const result = await query(
    `INSERT INTO admin_users (email, password_hash, first_name, last_name, profile_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [email.toLowerCase(), passwordHash, firstName, lastName, profileId, createdBy]
  );

  return { id: result.insertId, email: email.toLowerCase() };
}

/**
 * Update user
 */
async function updateUser(id, { email, firstName, lastName, profileId, isActive }) {
  const updates = [];
  const values = [];

  if (email !== undefined) {
    updates.push('email = ?');
    values.push(email.toLowerCase());
  }
  if (firstName !== undefined) {
    updates.push('first_name = ?');
    values.push(firstName);
  }
  if (lastName !== undefined) {
    updates.push('last_name = ?');
    values.push(lastName);
  }
  if (profileId !== undefined) {
    updates.push('profile_id = ?');
    values.push(profileId);
  }
  if (isActive !== undefined) {
    updates.push('is_active = ?');
    values.push(isActive);
  }

  if (updates.length === 0) {
    return { success: false, error: 'No fields to update' };
  }

  values.push(id);
  await query(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`, values);
  
  // If user is deactivated, invalidate all their sessions
  if (isActive === false) {
    await query('DELETE FROM admin_sessions WHERE user_id = ?', [id]);
  }

  return { success: true };
}

/**
 * Change user password
 */
async function changePassword(id, newPassword) {
  const passwordHash = hashPassword(newPassword);
  await query('UPDATE admin_users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
  // Invalidate existing sessions
  await query('DELETE FROM admin_sessions WHERE user_id = ?', [id]);
  return { success: true };
}

/**
 * Delete user
 */
async function deleteUser(id) {
  // Check if this is the last admin
  const admins = await query(
    `SELECT COUNT(*) as count FROM admin_users u
     JOIN admin_profiles p ON u.profile_id = p.id
     WHERE p.name = 'Admin' AND u.is_active = TRUE AND u.id != ?`,
    [id]
  );

  const user = await getUserById(id);
  if (user?.profile_name === 'Admin' && admins[0]?.count === 0) {
    throw new Error('Cannot delete the last admin user');
  }

  await query('DELETE FROM admin_users WHERE id = ?', [id]);
  return { success: true };
}

// ============================================
// Profile Management
// ============================================

/**
 * Get all profiles
 */
async function getProfiles() {
  const profiles = await query(
    `SELECT p.*, 
            (SELECT COUNT(*) FROM admin_users WHERE profile_id = p.id) as user_count
     FROM admin_profiles p
     ORDER BY p.is_system DESC, p.name ASC`
  );
  
  // Parse permissions
  return profiles.map(p => ({
    ...p,
    permissions: typeof p.permissions === 'string' ? JSON.parse(p.permissions) : p.permissions
  }));
}

/**
 * Get profile by ID
 */
async function getProfileById(id) {
  const profiles = await query('SELECT * FROM admin_profiles WHERE id = ?', [id]);
  if (!profiles || profiles.length === 0) return null;
  
  const profile = profiles[0];
  return {
    ...profile,
    permissions: typeof profile.permissions === 'string' ? JSON.parse(profile.permissions) : profile.permissions
  };
}

/**
 * Create new profile
 */
async function createProfile({ name, description, permissions }) {
  const result = await query(
    `INSERT INTO admin_profiles (name, description, permissions)
     VALUES (?, ?, ?)`,
    [name, description, JSON.stringify(permissions)]
  );
  return { id: result.insertId, name };
}

/**
 * Update profile
 */
async function updateProfile(id, { name, description, permissions }) {
  // Check if system profile
  const existing = await getProfileById(id);
  if (existing?.is_system && name && name !== existing.name) {
    throw new Error('Cannot rename system profiles');
  }

  const updates = [];
  const values = [];

  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    values.push(description);
  }
  if (permissions !== undefined) {
    updates.push('permissions = ?');
    values.push(JSON.stringify(permissions));
  }

  if (updates.length === 0) {
    return { success: false, error: 'No fields to update' };
  }

  values.push(id);
  await query(`UPDATE admin_profiles SET ${updates.join(', ')} WHERE id = ?`, values);
  return { success: true };
}

/**
 * Delete profile
 */
async function deleteProfile(id) {
  // Check if system profile
  const profile = await getProfileById(id);
  if (profile?.is_system) {
    throw new Error('Cannot delete system profiles');
  }

  // Check if profile has users
  const users = await query('SELECT COUNT(*) as count FROM admin_users WHERE profile_id = ?', [id]);
  if (users[0]?.count > 0) {
    throw new Error('Cannot delete profile with assigned users');
  }

  await query('DELETE FROM admin_profiles WHERE id = ?', [id]);
  return { success: true };
}

// ============================================
// Password Reset
// ============================================

/**
 * Generate a secure reset token
 */
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Request password reset - creates token and returns it (caller sends email)
 */
async function requestPasswordReset(email) {
  // Find user
  const users = await query(
    'SELECT id, email, first_name FROM admin_users WHERE email = ? AND is_active = TRUE',
    [email.toLowerCase()]
  );

  if (!users || users.length === 0) {
    // Don't reveal if email exists - return success anyway
    return { success: true, message: 'If the email exists, a reset link has been sent' };
  }

  const user = users[0];
  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_DURATION_HOURS * 60 * 60 * 1000);

  // Store reset token (invalidate any existing ones first)
  await query('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);
  await query(
    'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
    [user.id, token, expiresAt]
  );

  return {
    success: true,
    token, // Caller will use this to construct reset URL
    email: user.email,
    firstName: user.first_name,
    expiresAt
  };
}

/**
 * Validate password reset token
 */
async function validateResetToken(token) {
  if (!token) return null;

  const tokens = await query(
    `SELECT prt.*, u.email, u.first_name, u.last_name
     FROM password_reset_tokens prt
     JOIN admin_users u ON prt.user_id = u.id
     WHERE prt.token = ? AND prt.expires_at > NOW() AND prt.used_at IS NULL AND u.is_active = TRUE`,
    [token]
  );

  if (!tokens || tokens.length === 0) {
    return null;
  }

  return {
    userId: tokens[0].user_id,
    email: tokens[0].email,
    firstName: tokens[0].first_name,
    lastName: tokens[0].last_name,
    expiresAt: tokens[0].expires_at
  };
}

/**
 * Reset password using token
 */
async function resetPassword(token, newPassword) {
  const tokenData = await validateResetToken(token);
  if (!tokenData) {
    return { success: false, error: 'Invalid or expired reset token' };
  }

  // Update password
  const passwordHash = hashPassword(newPassword);
  await query('UPDATE admin_users SET password_hash = ? WHERE id = ?', [passwordHash, tokenData.userId]);

  // Mark token as used
  await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token = ?', [token]);

  // Invalidate all existing sessions for this user
  await query('DELETE FROM admin_sessions WHERE user_id = ?', [tokenData.userId]);

  return { success: true, email: tokenData.email };
}

// ============================================
// Magic Link Login
// ============================================

/**
 * Request magic link - creates token and returns it (caller sends email)
 */
async function requestMagicLink(email) {
  // Find user
  const users = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.profile_id, p.name as profile_name, p.permissions
     FROM admin_users u
     JOIN admin_profiles p ON u.profile_id = p.id
     WHERE u.email = ? AND u.is_active = TRUE`,
    [email.toLowerCase()]
  );

  if (!users || users.length === 0) {
    // Don't reveal if email exists
    return { success: true, message: 'If the email exists, a magic link has been sent' };
  }

  const user = users[0];
  const token = generateToken(); // Same secure token generation
  const expiresAt = new Date(Date.now() + MAGIC_LINK_DURATION_MINUTES * 60 * 1000);

  // Store magic link token (invalidate any existing ones first)
  await query('DELETE FROM magic_link_tokens WHERE user_id = ?', [user.id]);
  await query(
    'INSERT INTO magic_link_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
    [user.id, token, expiresAt]
  );

  return {
    success: true,
    token, // Caller will use this to construct magic link URL
    email: user.email,
    firstName: user.first_name,
    expiresAt
  };
}

/**
 * Login via magic link token
 * @param {string} magicToken - The magic link token
 * @param {Object} metadata - Optional metadata for login history
 * @param {string} metadata.ipAddress - Client IP address
 * @param {string} metadata.userAgent - Client user agent
 */
async function loginWithMagicLink(magicToken, metadata = {}) {
  const { ipAddress, userAgent } = metadata;
  
  if (!magicToken) {
    return { success: false, error: 'Magic link token is required' };
  }

  // Find valid magic link token
  const tokens = await query(
    `SELECT mlt.*, u.id as user_id, u.email, u.first_name, u.last_name, 
            u.profile_id, p.name as profile_name, p.permissions
     FROM magic_link_tokens mlt
     JOIN admin_users u ON mlt.user_id = u.id
     JOIN admin_profiles p ON u.profile_id = p.id
     WHERE mlt.token = ? AND mlt.expires_at > NOW() AND mlt.used_at IS NULL AND u.is_active = TRUE`,
    [magicToken]
  );

  if (!tokens || tokens.length === 0) {
    // Log failed magic link attempt (we don't know the email without more lookups)
    await logLoginAttempt({
      userId: null,
      email: 'unknown (invalid magic link)',
      success: false,
      failureReason: 'invalid_magic_link',
      ipAddress,
      userAgent,
      loginMethod: 'magic_link'
    });
    return { success: false, error: 'Invalid or expired magic link' };
  }

  const magicLinkData = tokens[0];

  // Mark magic link as used
  await query('UPDATE magic_link_tokens SET used_at = NOW() WHERE token = ?', [magicToken]);

  // Generate session token
  const sessionToken = generateToken();
  const sessionExpiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  // Create session
  const sessionResult = await query(
    'INSERT INTO admin_sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
    [magicLinkData.user_id, sessionToken, sessionExpiresAt]
  );

  // Update last login
  await query('UPDATE admin_users SET last_login_at = NOW() WHERE id = ?', [magicLinkData.user_id]);
  
  // Log successful magic link login
  await logLoginAttempt({
    userId: magicLinkData.user_id,
    email: magicLinkData.email,
    success: true,
    failureReason: null,
    ipAddress,
    userAgent,
    loginMethod: 'magic_link',
    sessionId: sessionResult.insertId
  });

  // Parse permissions
  let permissions = {};
  try {
    permissions = typeof magicLinkData.permissions === 'string' 
      ? JSON.parse(magicLinkData.permissions) 
      : magicLinkData.permissions;
  } catch (e) {
    console.error('Failed to parse permissions:', e);
  }

  return {
    success: true,
    user: {
      id: magicLinkData.user_id,
      email: magicLinkData.email,
      firstName: magicLinkData.first_name,
      lastName: magicLinkData.last_name,
      profileId: magicLinkData.profile_id,
      profileName: magicLinkData.profile_name,
      permissions
    },
    token: sessionToken,
    expiresAt: sessionExpiresAt
  };
}

/**
 * Clean up expired tokens (password reset and magic links)
 */
async function cleanupExpiredTokens() {
  const resetResult = await query('DELETE FROM password_reset_tokens WHERE expires_at < NOW()');
  const magicResult = await query('DELETE FROM magic_link_tokens WHERE expires_at < NOW()');
  return {
    passwordResetTokens: resetResult.affectedRows || 0,
    magicLinkTokens: magicResult.affectedRows || 0
  };
}

/**
 * Send welcome/credentials email to a user
 * @param {number} userId - The user ID
 * @param {string} [tempPassword] - If provided, this password will be set and emailed
 * @returns {Promise<Object>} Result
 */
async function sendCredentialsEmail(userId, tempPassword = null) {
  const { sendEmail } = require('./notificationService.cjs');
  
  // Get user details
  const user = await getUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  // If temp password provided, set it
  let password = tempPassword;
  if (tempPassword) {
    await changePassword(userId, tempPassword);
  } else {
    // Generate a random temporary password
    password = generateTemporaryPassword();
    await changePassword(userId, password);
  }
  
  const portalUrl = 'https://ptrlrndb.prod.ntxgallery.com/admin';
  
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <img src="https://www.nintex.com/wp-content/uploads/2023/03/nintex-logo.svg" alt="Nintex" style="height: 40px;" />
      </div>
      
      <div style="background: linear-gradient(135deg, #6B4C9A 0%, #FF6B35 100%); padding: 30px; border-radius: 12px; color: white; text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 24px;">Welcome to the Partner Portal!</h1>
        <p style="margin: 10px 0 0; opacity: 0.9;">Your admin account is ready</p>
      </div>
      
      <div style="background: #f8f9fa; border-radius: 12px; padding: 25px; margin-bottom: 25px;">
        <h2 style="color: #333; font-size: 18px; margin: 0 0 20px;">Your Login Credentials</h2>
        
        <div style="background: white; border-radius: 8px; padding: 20px; border-left: 4px solid #FF6B35;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; width: 100px;">Portal URL:</td>
              <td style="padding: 8px 0;"><a href="${portalUrl}" style="color: #6B4C9A; text-decoration: none; font-weight: 600;">${portalUrl}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Email:</td>
              <td style="padding: 8px 0; font-weight: 600;">${user.email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Password:</td>
              <td style="padding: 8px 0; font-family: monospace; background: #fff3cd; padding: 8px 12px; border-radius: 4px; font-weight: 600;">${password}</td>
            </tr>
          </table>
        </div>
      </div>
      
      <div style="background: #fff3cd; border-radius: 8px; padding: 15px; margin-bottom: 25px; border-left: 4px solid #856404;">
        <p style="margin: 0; color: #856404; font-size: 14px;">
          <strong>🔐 Security Notice:</strong> For security reasons, please change your password after your first login.
        </p>
      </div>
      
      <div style="text-align: center; margin-bottom: 25px;">
        <a href="${portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #FF6B35 0%, #E55A2B 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Login to Partner Portal →
        </a>
      </div>
      
      <div style="text-align: center; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #999; font-size: 12px; margin: 0;">
          This email was sent from the Nintex Partner Portal.<br/>
          If you did not expect this email, please contact your administrator.
        </p>
      </div>
    </div>
  `;
  
  const result = await sendEmail(
    user.email,
    'Your Nintex Partner Portal Login Credentials',
    htmlContent
  );
  
  return {
    success: true,
    email: user.email,
    message: 'Credentials email sent successfully',
    ...result
  };
}

/**
 * Generate a random temporary password
 */
function generateTemporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const specials = '!@#$%&*';
  let password = '';
  
  // 8 alphanumeric characters
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Add 1 special character
  password += specials.charAt(Math.floor(Math.random() * specials.length));
  
  // Add 2 more alphanumeric
  for (let i = 0; i < 2; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return password;
}

// ============================================
// Login History
// ============================================

/**
 * Log a login attempt (success or failure)
 */
async function logLoginAttempt({ userId, email, success, failureReason, ipAddress, userAgent, loginMethod = 'password', sessionId = null }) {
  try {
    await query(
      `INSERT INTO login_history (user_id, email, success, failure_reason, ip_address, user_agent, login_method, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, email, success, failureReason, ipAddress, userAgent || null, loginMethod, sessionId]
    );
  } catch (err) {
    // Don't fail login if history logging fails
    console.error('Failed to log login attempt:', err.message);
  }
}

/**
 * Get login history with optional filters
 * @param {Object} filters - Optional filters
 * @param {number} filters.userId - Filter by user ID
 * @param {string} filters.email - Filter by email
 * @param {boolean} filters.success - Filter by success status
 * @param {number} filters.limit - Max records (default 100)
 * @param {number} filters.offset - Offset for pagination
 * @param {Date} filters.startDate - Filter from date
 * @param {Date} filters.endDate - Filter to date
 */
async function getLoginHistory(filters = {}) {
  const { userId, email, success, limit = 100, offset = 0, startDate, endDate } = filters;
  
  let sql = `
    SELECT lh.*, 
           u.first_name, u.last_name, u.email as user_email,
           p.name as profile_name
    FROM login_history lh
    LEFT JOIN admin_users u ON lh.user_id = u.id
    LEFT JOIN admin_profiles p ON u.profile_id = p.id
    WHERE 1=1
  `;
  const params = [];
  
  if (userId !== undefined) {
    sql += ' AND lh.user_id = ?';
    params.push(userId);
  }
  if (email) {
    sql += ' AND lh.email LIKE ?';
    params.push(`%${email}%`);
  }
  if (success !== undefined) {
    sql += ' AND lh.success = ?';
    params.push(success);
  }
  if (startDate) {
    sql += ' AND lh.created_at >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND lh.created_at <= ?';
    params.push(endDate);
  }
  
  sql += ' ORDER BY lh.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  return await query(sql, params);
}

/**
 * Get login history stats for a user or overall
 */
async function getLoginStats(userId = null, days = 30) {
  const userFilter = userId ? 'AND user_id = ?' : '';
  const params = userId ? [days, userId, days, userId, days, userId] : [days, days, days];
  
  const results = await query(`
    SELECT 
      (SELECT COUNT(*) FROM login_history WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${userFilter}) as total_attempts,
      (SELECT COUNT(*) FROM login_history WHERE success = TRUE AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${userFilter}) as successful_logins,
      (SELECT COUNT(*) FROM login_history WHERE success = FALSE AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${userFilter}) as failed_attempts
  `, params);
  
  const stats = results[0];
  stats.success_rate = stats.total_attempts > 0 
    ? Math.round((stats.successful_logins / stats.total_attempts) * 100) 
    : 0;
  
  return stats;
}

/**
 * Get recent failed login attempts (for security monitoring)
 */
async function getRecentFailedAttempts(hours = 1, minAttempts = 3) {
  return await query(`
    SELECT email, ip_address, COUNT(*) as attempt_count, 
           MAX(created_at) as last_attempt,
           GROUP_CONCAT(DISTINCT failure_reason) as failure_reasons
    FROM login_history
    WHERE success = FALSE 
      AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
    GROUP BY email, ip_address
    HAVING attempt_count >= ?
    ORDER BY attempt_count DESC
  `, [hours, minAttempts]);
}

/**
 * Get login activity by day for charts
 */
async function getLoginActivityByDay(days = 30, userId = null) {
  let sql = `
    SELECT 
      DATE(created_at) as date,
      SUM(CASE WHEN success = TRUE THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN success = FALSE THEN 1 ELSE 0 END) as failed
    FROM login_history
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
  `;
  const params = [days];
  
  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }
  
  sql += ' GROUP BY DATE(created_at) ORDER BY date ASC';
  
  return await query(sql, params);
}

/**
 * Clean up old login history (retention policy)
 */
async function cleanupLoginHistory(retentionDays = 90) {
  const result = await query(
    'DELETE FROM login_history WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
    [retentionDays]
  );
  return result.affectedRows || 0;
}

module.exports = {
  // Auth
  login,
  logout,
  validateSession,
  cleanupExpiredSessions,
  hashPassword,
  verifyPassword,
  
  // Password Reset
  requestPasswordReset,
  validateResetToken,
  resetPassword,
  
  // Magic Link
  requestMagicLink,
  loginWithMagicLink,
  cleanupExpiredTokens,
  
  // Users
  getUsers,
  getUserById,
  createUser,
  updateUser,
  changePassword,
  deleteUser,
  sendCredentialsEmail,
  
  // Profiles
  getProfiles,
  getProfileById,
  createProfile,
  updateProfile,
  deleteProfile,
  
  // Login History
  logLoginAttempt,
  getLoginHistory,
  getLoginStats,
  getRecentFailedAttempts,
  getLoginActivityByDay,
  cleanupLoginHistory
};
