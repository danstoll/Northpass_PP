import React, { useState } from 'react';
import './AdminNav.css';

const AdminNav = ({ currentPage, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    // Data & Sync
    { id: 'data', label: 'Data Management', path: '/admin/data', icon: '💾' },
    { id: 'sync', label: 'DB Sync', path: '/admin/sync', icon: '🔄' },
    { id: 'import', label: 'Partner Import', path: '/admin/import', icon: '📤' },
    // Reports
    { id: 'dbreports', label: 'DB Reports', path: '/admin/dbreports', icon: '📈' },
    { id: 'reports', label: 'LMS Reporting', path: '/admin/reports', icon: '📊' },
    { id: 'owners', label: 'Owner Report', path: '/admin/owners', icon: '👔' },
    // Groups & Users
    { id: 'groupsdb', label: 'Groups (DB)', path: '/admin/groupsdb', icon: '📦' },
    { id: 'groups', label: 'Groups (Live)', path: '/admin/groups', icon: '👥' },
    { id: 'users', label: 'User Management', path: '/admin/users', icon: '👤' },
    // Tools
    { id: 'urls', label: 'URL Generator', path: '/admin', icon: '🔗' },
    { id: 'maintenance', label: 'Maintenance', path: '/admin/maintenance', icon: '🔧' },
  ];

  const handleNavClick = (path) => {
    setIsOpen(false);
    window.location.href = path;
  };

  const toggleNav = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Mobile toggle button */}
      <button className="admin-nav-toggle" onClick={toggleNav} aria-label="Toggle navigation">
        {isOpen ? '✕' : '☰'}
      </button>
      
      {/* Overlay for mobile */}
      <div 
        className={`admin-nav-overlay ${isOpen ? 'open' : ''}`} 
        onClick={() => setIsOpen(false)}
      />
      
      <nav className={`admin-nav ${isOpen ? 'open' : ''}`}>
        <div className="admin-nav-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-text">Admin</span>
        </div>
        
        <div className="admin-nav-links">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => handleNavClick(item.path)}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </div>
        
        <div className="admin-nav-actions">
          <button 
            className="nav-link back-link"
            onClick={() => handleNavClick('/')}
            title="Back to Portal"
          >
            <span className="nav-icon">🏠</span>
            <span className="nav-label">Portal</span>
          </button>
          {onLogout && (
            <button 
              className="nav-link logout-link"
              onClick={onLogout}
              title="Logout"
            >
              <span className="nav-icon">🚪</span>
              <span className="nav-label">Logout</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
};

export default AdminNav;
