import { useState, useEffect, useCallback } from 'react';
import { northpassApi } from '../services/northpassApi';
import './UserWidget.css';

const UserWidget = ({ onViewGroupStats, userEmail }) => {
  const [user, setUser] = useState(null);
  const [certifications, setCertifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Debug logging
  console.log('🔍 UserWidget render - certifications:', certifications);

  const loadUserData = useCallback(async () => {
    // Don't load data if no userEmail is provided
    if (!userEmail) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);

      // Test API connection first
      const connectionOk = await northpassApi.testConnection();
      if (!connectionOk) {
        throw new Error('Unable to connect to Northpass API. Please check your API key and network connection.');
      }

      // Load current user by email
      const userData = await northpassApi.getCurrentUser(userEmail);
      setUser(userData);

      // Load user's certifications
      if (userData.id) {
        console.log('🚀 Loading certifications for user ID:', userData.id);
        const userCerts = await northpassApi.getUserCertifications(userData.id);
        console.log('📜 Got certification data:', userCerts);
        console.log('📊 Certification data length:', userCerts?.length || 0);
        console.log('📋 First certification:', userCerts?.[0]);
        setCertifications(userCerts);
        console.log('✅ State updated - certifications set to:', userCerts?.length || 0, 'items');
      }
    } catch (err) {
      setError(err.message || 'Failed to load user data. Please try again.');
      console.error('Error loading user data:', err);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'passed':
        return '#28a745';
      case 'in_progress':
        return '#ffc107';
      case 'failed':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  const handleViewGroupStats = () => {
    if (user?.group_id && onViewGroupStats) {
      onViewGroupStats(user.group_id);
    }
  };

  // Show instructions when no email is provided
  if (!userEmail) {
    return (
      <div className="user-widget">
        <div className="welcome-state">
          <div className="welcome-icon">👤</div>
          <h3>User Certification Tracker</h3>
          <p>To view individual user certifications, provide the email parameter:</p>
          <div className="url-examples">
            <h4>Example URL:</h4>
            <div className="example-url">
              <code>?email=user@company.com</code>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="user-widget loading">
        <div className="spinner"></div>
        <p>Loading user information...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="user-widget error">
        <div className="error-icon">⚠️</div>
        <p>{error}</p>
        <button onClick={loadUserData} className="retry-btn">
          Retry
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="user-widget error">
        <p>No user data available</p>
      </div>
    );
  }

  const completedCourses = certifications.filter(cert => {
    return cert.status === 'completed';
  });

  // Certifications are courses with NPCU > 0 (as per business logic)
  const certifications_only = certifications.filter(cert => {
    return cert.status === 'completed' && cert.npcu > 0;
  });

  // Calculate total NPCU points from all certifications
  const totalNPCU = certifications.reduce((total, cert) => {
    return total + (cert.npcu || 0);
  }, 0);

  return (
    <div className="user-widget">
      <div className="debug-info" style={{ 
        fontSize: '12px', 
        color: '#6c757d', 
        marginBottom: '12px', 
        padding: '8px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '4px',
        border: '1px solid #e9ecef'
      }}>
        <div>🔍 Looking up user: <strong>{userEmail}</strong></div>
        <div>🔑 API Key: wcU0QRp...{/* truncated for security */}</div>
        <div>🌐 API Base: https://api.northpass.com</div>
      </div>
      
      <div className="user-header">
        <div className="user-avatar">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={`${user.first_name} ${user.last_name}`} />
          ) : (
            <div className="avatar-placeholder">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </div>
          )}
        </div>
        <div className="user-info">
          <h3>{user.first_name} {user.last_name}</h3>
          <p className="user-email">{user.email}</p>
          {user.job_title && <p className="user-title">{user.job_title}</p>}
        </div>
      </div>

      <div className="certifications-summary">
        <h4>Your Learning Progress</h4>
        <button 
          onClick={() => {
            console.log('Testing queue system...')
            northpassApi.testPropertiesQueue()
          }}
          style={{padding: '8px 16px', marginBottom: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}
        >
          Test Queue System
        </button>
        <div className="cert-stats">
          <div className="stat-item">
            <span className="stat-number">{completedCourses.length}</span>
            <span className="stat-label">Completed Courses</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{certifications_only.length}</span>
            <span className="stat-label">Certifications</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{totalNPCU}</span>
            <span className="stat-label">Total NPCU</span>
          </div>
        </div>
      </div>

      {certifications.length > 0 && (
        <div className="recent-certifications">
          <h4>Recent Activity</h4>
          <div className="cert-list">
            {certifications.slice(0, 5).map((cert, index) => {
              return (
                <div key={cert.id || index} className="cert-item">
                  <div className="cert-info">
                    <span className="cert-name">
                      {cert.name}
                      {cert.npcu > 0 && <span className="npcu-badge"> ({cert.npcu} NPCU)</span>}
                      {cert.hasCertificate && <span className="cert-badge"> 🏆</span>}
                      {cert.resourceType === 'learning_path' && <span className="path-badge"> 📚 Path</span>}
                    </span>
                    <span 
                      className="cert-status"
                      style={{ color: getStatusColor(cert.status) }}
                    >
                      {cert.status === 'completed' ? '✅ COMPLETED' : 
                       cert.status === 'in_progress' ? '⏳ IN PROGRESS' : 
                       '📚 ENROLLED'}
                    </span>
                  </div>
                  
                  <div className="cert-details">
                    {cert.completedAt && (
                      <span className="cert-date">
                        Completed: {new Date(cert.completedAt).toLocaleDateString()}
                      </span>
                    )}
                    {cert.enrolledAt && !cert.completedAt && (
                      <span className="cert-date">
                        Enrolled: {new Date(cert.enrolledAt).toLocaleDateString()}
                      </span>
                    )}
                    
                    {/* Certificate download link */}
                    {cert.certificateUrl && (
                      <a 
                        href={cert.certificateUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="cert-download-link"
                        title="Download Certificate"
                      >
                        📜 Certificate
                      </a>
                    )}
                    
                    {/* Learning progress info */}
                    {cert.attemptNumber > 1 && (
                      <span className="attempt-info">
                        Attempt #{cert.attemptNumber}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {certifications.length > 5 && (
            <div className="show-more">
              <button className="show-more-btn">
                Show All {certifications.length} Items →
              </button>
            </div>
          )}
        </div>
      )}

      <div className="widget-actions">
        <button 
          onClick={handleViewGroupStats}
          className="group-stats-btn"
          disabled={!user.group_id}
        >
          View Company Stats →
        </button>
      </div>
    </div>
  );
};

export default UserWidget;