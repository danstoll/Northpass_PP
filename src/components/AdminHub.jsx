import React, { useState, useEffect } from 'react';
import AdminNav from './AdminNav';
import NintexButton from './NintexButton';
import './AdminHub.css';

// Password for admin access
const ADMIN_PASSWORD = 'Nintex2025!';

// Session storage key for admin auth
const AUTH_KEY = 'nintex_admin_auth';

const AdminHub = ({ children, currentPage }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Check for existing session on mount
  useEffect(() => {
    const session = sessionStorage.getItem(AUTH_KEY);
    if (session === 'authenticated') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setPasswordError('');
      // Store session
      sessionStorage.setItem(AUTH_KEY, 'authenticated');
    } else {
      setPasswordError('Incorrect password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem(AUTH_KEY);
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="admin-hub">
        <div className="login-container">
          <div className="login-card">
            <div className="login-icon">🔐</div>
            <h1>Admin Tools</h1>
            <p>Enter the admin password to access the Nintex Partner Portal administration tools.</p>
            
            <form onSubmit={handleLogin}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="password-input"
                autoFocus
              />
              {passwordError && (
                <p className="password-error">{passwordError}</p>
              )}
              <NintexButton type="submit" variant="primary" size="large">
                🔓 Login
              </NintexButton>
            </form>
            
            <div className="login-tools-preview">
              <h3>Available Tools:</h3>
              <ul>
                <li>💾 <strong>Data Management</strong> - Import partner contact data from Excel</li>
                <li>� <strong>DB Sync</strong> - Sync LMS data to MariaDB database</li>
                <li>�📊 <strong>Reporting</strong> - Analytics by Region, Tier & Certification gaps</li>
                <li>👔 <strong>Owner Report</strong> - View accounts by owner with dashboard links</li>
                <li>👥 <strong>Group Analysis</strong> - Find missing users by email domain</li>
                <li>👤 <strong>User Management</strong> - Add missing CRM contacts to LMS</li>
                <li>📤 <strong>Partner Import</strong> - Cross-reference XLSX with Northpass groups</li>
                <li>🔗 <strong>URL Generator</strong> - Bulk generate secure partner URLs</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated view with navigation and children
  return (
    <div className="admin-hub authenticated">
      <AdminNav currentPage={currentPage} onLogout={handleLogout} />
      <div className="admin-content">
        {children}
      </div>
    </div>
  );
};

export default AdminHub;
