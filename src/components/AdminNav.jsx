import React from 'react';
import './AdminNav.css';

const AdminNav = ({ currentPage, onLogout }) => {
  const navItems = [
    { id: 'data', label: 'Data', path: '/admin/data', icon: '💾' },
    { id: 'reports', label: 'Reporting', path: '/admin/reports', icon: '📊' },
    { id: 'groups', label: 'Group Analysis', path: '/admin/groups', icon: '👥' },
    { id: 'import', label: 'Partner Import', path: '/admin/import', icon: '📤' },
    { id: 'urls', label: 'URL Generator', path: '/admin', icon: '🔗' },
  ];

  const handleNavClick = (path) => {
    window.location.href = path;
  };

  return (
    <nav className="admin-nav">
      <div className="admin-nav-brand">
        <span className="brand-icon">🔧</span>
        <span className="brand-text">Admin Tools</span>
      </div>
      <div className="admin-nav-links">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => handleNavClick(item.path)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="admin-nav-actions">
        <button 
          className="nav-link back-link"
          onClick={() => window.location.href = '/'}
        >
          <span className="nav-icon">🏠</span>
          <span className="nav-label">Portal</span>
        </button>
        {onLogout && (
          <button 
            className="nav-link logout-link"
            onClick={onLogout}
          >
            <span className="nav-icon">🚪</span>
            <span className="nav-label">Logout</span>
          </button>
        )}
      </div>
    </nav>
  );
};

export default AdminNav;
