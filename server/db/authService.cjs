/**
 * Authentication Service
 * Handles user authentication, sessions, and authorization
 */

const crypto = require('crypto');
const { query } = require('./connection.cjs');

// Session duration: 24 hours
const SESSION_DURATION_HOURS = 24;

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
 */
async function login(email, password) {
  // Find user
  const users = await query(
    `SELECT u.*, p.name as profile_name, p.permissions
     FROM admin_users u
     JOIN admin_profiles p ON u.profile_id = p.id
     WHERE u.email = ? AND u.is_active = TRUE`,
    [email.toLowerCase()]
  );

  if (!users || users.length === 0) {
    return { success: false, error: 'Invalid email or password' };
  }

  const user = users[0];

  // Verify password
  if (!verifyPassword(password, user.password_hash)) {
    return { success: false, error: 'Invalid email or password' };
  }

  // Generate session token
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  // Create session
  await query(
    'INSERT INTO admin_sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
    [user.id, token, expiresAt]
  );

  // Update last login
  await query('UPDATE admin_users SET last_login_at = NOW() WHERE id = ?', [user.id]);

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

module.exports = {
  // Auth
  login,
  logout,
  validateSession,
  cleanupExpiredSessions,
  hashPassword,
  verifyPassword,
  
  // Users
  getUsers,
  getUserById,
  createUser,
  updateUser,
  changePassword,
  deleteUser,
  
  // Profiles
  getProfiles,
  getProfileById,
  createProfile,
  updateProfile,
  deleteProfile
};
