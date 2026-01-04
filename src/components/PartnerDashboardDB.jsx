import React, { useState, useEffect, useCallback } from 'react';
import './CustomerDashboard.css'; // Reuse existing styles
import partnerDbService from '../services/partnerDatabaseService';
import NintexButton from './NintexButton';
import { ProgressRing, ProgressBar, SimpleBarChart, DonutChart, StatusBadge } from './ProgressCharts';

// Helper function to get expiry status and formatting
const getExpiryInfo = (expiryDate) => {
  if (!expiryDate) return { status: 'unknown', text: 'No expiry date', daysLeft: null };
  
  const expiry = new Date(expiryDate);
  const now = new Date();
  const timeDiff = expiry.getTime() - now.getTime();
  const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  let status = 'valid';
  let text = '';
  
  if (daysLeft < 0) {
    status = 'expired';
    text = `Expired ${Math.abs(daysLeft)} days ago`;
  } else if (daysLeft <= 30) {
    status = 'expiring';
    text = `Expires in ${daysLeft} days`;
  } else if (daysLeft <= 90) {
    status = 'warning';
    text = `Expires in ${daysLeft} days`;
  } else {
    status = 'valid';
    const months = Math.floor(daysLeft / 30);
    text = months > 0 ? `Expires in ${months} month${months !== 1 ? 's' : ''}` : `Expires in ${daysLeft} days`;
  }
  
  return { status, text, daysLeft, formattedDate: expiry.toLocaleDateString() };
};

// Certification Card Component
const CertificationCard = ({ enrollment }) => {
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const status = enrollment.status || 'enrolled';
  const isCompleted = status === 'completed';
  const expiryInfo = enrollment.expires_at ? getExpiryInfo(enrollment.expires_at) : null;

  return (
    <div className="learning-activity-card">
      <div className="activity-header">
        <div className="activity-info">
          <h4 className="activity-name">{enrollment.course_name || 'Unknown Course'}</h4>
          <div className="activity-meta">
            <span className="activity-category">{enrollment.product_category || 'General'}</span>
            {enrollment.npcu_value > 0 && (
              <span className="npcu-badge">NPCU: {enrollment.npcu_value}</span>
            )}
          </div>
        </div>
        <div className="activity-status">
          <StatusBadge status={status} />
        </div>
      </div>
      
      <div className="activity-details">
        {/* Progress bar for in-progress courses */}
        {!isCompleted && enrollment.progress_percent > 0 && (
          <div className="progress-section">
            <ProgressBar progress={enrollment.progress_percent} height={6} />
          </div>
        )}
        
        {/* Dates */}
        <div className="activity-dates">
          {enrollment.enrolled_at && (
            <div className="date-item">
              <span className="date-label">Enrolled:</span>
              <span className="date-value">{formatDate(enrollment.enrolled_at)}</span>
            </div>
          )}
          {enrollment.started_at && !isCompleted && (
            <div className="date-item">
              <span className="date-label">Started:</span>
              <span className="date-value">{formatDate(enrollment.started_at)}</span>
            </div>
          )}
          {enrollment.completed_at && isCompleted && (
            <div className="date-item">
              <span className="date-label">Completed:</span>
              <span className="date-value">{formatDate(enrollment.completed_at)}</span>
            </div>
          )}
        </div>

        {/* Expiry info for completed certifications */}
        {isCompleted && expiryInfo && (
          <div className="expiry-section">
            <div className={`expiry-info ${expiryInfo.status}`}>
              <span className="expiry-text">{expiryInfo.text}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// User Card Component
const UserCard = ({ userData, isExpanded, onToggle }) => {
  const contact = userData.contact || {};
  const enrollments = userData.enrollments || [];
  const user = userData.user || {};
  
  const completed = enrollments.filter(e => e.status === 'completed');
  const inProgress = enrollments.filter(e => e.status === 'in_progress' || (e.progress_percent > 0 && e.progress_percent < 100));
  const notStarted = enrollments.filter(e => e.status !== 'completed' && (!e.progress_percent || e.progress_percent === 0));
  
  const totalNpcu = completed.reduce((sum, e) => sum + (e.npcu_value || 0), 0);
  const completionRate = enrollments.length > 0 
    ? Math.round((completed.length / enrollments.length) * 100) 
    : 0;

  const displayName = contact.first_name && contact.last_name 
    ? `${contact.first_name} ${contact.last_name}`
    : contact.email || 'Unknown User';

  return (
    <div className="staff-member-card">
      <div 
        className="staff-header-clickable" 
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        <div className="staff-info">
          <h3 className="staff-name">{displayName}</h3>
          <p className="staff-email">{contact.email}</p>
          {contact.title && <p className="staff-title">{contact.title}</p>}
          <div className="learning-progress">
            <ProgressBar progress={completionRate} height={6} showText={false} />
            <div className="progress-text">{completionRate}% complete • {totalNpcu} NPCU</div>
          </div>
        </div>
        <div className="staff-stats">
          <div className="learning-badges">
            <StatusBadge status="Completed" count={completed.length} />
            <StatusBadge status="In Progress" count={inProgress.length} />
            {notStarted.length > 0 && <StatusBadge status="Enrolled" count={notStarted.length} />}
          </div>
          <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded ? '▼' : '▶'}
          </span>
        </div>
      </div>
      
      {isExpanded && (
        <div className="staff-details">
          {enrollments.length === 0 ? (
            <div className="no-training">
              <p>No learning activity found</p>
              {!user.id && <p className="muted">User not in LMS</p>}
            </div>
          ) : (
            <>
              {/* Completed */}
              {completed.length > 0 && (
                <div className="learning-section">
                  <h4>✅ Completed ({completed.length})</h4>
                  <div className="courses-grid">
                    {completed.map((enrollment, idx) => (
                      <CertificationCard key={enrollment.id || idx} enrollment={enrollment} />
                    ))}
                  </div>
                </div>
              )}

              {/* In Progress */}
              {inProgress.length > 0 && (
                <div className="learning-section">
                  <h4>⏳ In Progress ({inProgress.length})</h4>
                  <div className="courses-grid">
                    {inProgress.map((enrollment, idx) => (
                      <CertificationCard key={enrollment.id || idx} enrollment={enrollment} />
                    ))}
                  </div>
                </div>
              )}

              {/* Not Started */}
              {notStarted.length > 0 && (
                <div className="learning-section">
                  <h4>📚 Not Started ({notStarted.length})</h4>
                  <div className="courses-grid">
                    {notStarted.map((enrollment, idx) => (
                      <CertificationCard key={enrollment.id || idx} enrollment={enrollment} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Compliance Meter Component
const ComplianceMeter = ({ compliance, tier }) => {
  const { requirement, activeNpcu, gap, isCompliant, compliancePercent } = compliance;
  
  return (
    <div className={`compliance-meter ${isCompliant ? 'compliant' : 'non-compliant'}`}>
      <div className="compliance-header">
        <h4>Tier Compliance: {tier}</h4>
        <span className={`compliance-status ${isCompliant ? 'success' : 'warning'}`}>
          {isCompliant ? '✅ Compliant' : `⚠️ ${gap} NPCU needed`}
        </span>
      </div>
      <div className="compliance-bar">
        <div 
          className="compliance-fill"
          style={{ width: `${Math.min(100, compliancePercent)}%` }}
        />
        <div className="compliance-marker" style={{ left: '100%' }}>
          <span className="marker-label">{requirement}</span>
        </div>
      </div>
      <div className="compliance-stats">
        <span>Active NPCU: <strong>{activeNpcu}</strong></span>
        <span>Required: <strong>{requirement}</strong></span>
      </div>
    </div>
  );
};

/**
 * Partner Dashboard - Database Backed
 * Fetches data from local MariaDB instead of Northpass API
 */
const PartnerDashboardDB = ({ company, companyId, tier }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  const [progressStatus, setProgressStatus] = useState('');

  const fetchDashboardData = useCallback(async () => {
    if (!company && !companyId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setProgressStatus('Loading partner data from database...');

      const partnerName = companyId || company;
      console.log(`🏢 Loading dashboard for: ${partnerName}`);

      // Use the new consolidated endpoint
      const data = await partnerDbService.getPartnerDashboard(partnerName, tier);
      
      // Transform data to match component expectations
      const transformedData = {
        partner: {
          id: data.partner.id,
          account_name: data.partner.name,
          partner_tier: data.partner.tier,
          account_region: data.partner.region,
          account_owner: data.partner.owner
        },
        contacts: [], // Not needed separately
        users: data.users.map(user => ({
          contact: {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            title: user.title
          },
          user: user,
          enrollments: user.enrollments || []
        })),
        stats: {
          totalContacts: data.summary.totalUsers,
          usersWithLms: data.summary.totalUsers,
          totalEnrollments: data.users.reduce((sum, u) => sum + (u.enrollments?.length || 0), 0),
          totalCompleted: data.summary.activeCertifications + data.summary.expiredCertifications,
          totalInProgress: 0, // Not tracked separately in new endpoint
          totalNotStarted: 0,
          totalNpcu: data.summary.totalNpcu,
          activeNpcu: data.summary.totalNpcu,
          completionRate: data.summary.compliancePercent,
          categoryStats: Object.entries(data.certificationsByCategory || {}).reduce((acc, [cat, certs]) => {
            acc[cat] = {
              completed: certs.length,
              inProgress: 0,
              enrolled: 0
            };
            return acc;
          }, {}),
          courseStats: {}
        },
        compliance: {
          requirement: data.partner.requiredNpcu,
          activeNpcu: data.summary.totalNpcu,
          gap: data.partner.npcuGap,
          isCompliant: data.partner.isCompliant,
          compliancePercent: data.summary.compliancePercent
        },
        tier: data.partner.tier,
        group: data.group
      };

      setDashboardData(transformedData);
      setProgressStatus('');
      
      console.log('📊 Dashboard loaded:', {
        partner: data.partner.name,
        users: data.summary.totalUsers,
        activeCertifications: data.summary.activeCertifications,
        totalNpcu: data.summary.totalNpcu
      });

    } catch (err) {
      console.error('❌ Dashboard error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [company, companyId, tier]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const toggleUserExpansion = (contactId) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(contactId)) {
      newExpanded.delete(contactId);
    } else {
      newExpanded.add(contactId);
    }
    setExpandedUsers(newExpanded);
  };

  // Welcome screen when no parameters
  if (!company && !companyId) {
    return (
      <div className="customer-dashboard">
        <div className="dashboard-header">
          <h2>🎓 Partner Certification Dashboard</h2>
          <div className="tier-badge tier-info">Database Mode</div>
        </div>
        <div className="welcome-state">
          <div className="welcome-icon">📊</div>
          <h3>Partner Certification Dashboard</h3>
          <p>View certification status for partner organizations from the database.</p>
          
          <div className="features-list">
            <h4>Features:</h4>
            <ul>
              <li>📊 Real-time NPCU tracking</li>
              <li>🏆 Tier compliance monitoring</li>
              <li>👥 Staff certification details</li>
              <li>📅 Expiry alerts</li>
              <li>⚡ Fast database queries</li>
            </ul>
          </div>
          
          <div className="manual-params">
            <details>
              <summary>💡 URL Parameters</summary>
              <div className="url-examples">
                <h4>Required Parameters:</h4>
                <ul>
                  <li><code>group</code> or <code>company</code> - Partner name</li>
                  <li><code>tier</code> - Partner tier (Premier, Select, Registered, Certified)</li>
                </ul>
                <h4>Example:</h4>
                <div className="example-url">
                  <code>/?group=Acme Corporation&tier=Premier</code>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="customer-dashboard">
        <div className="dashboard-header">
          <h2>🎓 Partner Certification Dashboard</h2>
          <div className="tier-badge tier-premier">Loading...</div>
        </div>
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <div className="progress-info">
            <h3>{progressStatus || 'Loading...'}</h3>
            <p>Fetching data from database</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-dashboard">
        <div className="dashboard-header">
          <h2>🎓 Partner Certification Dashboard</h2>
          <div className="tier-badge tier-error">Error</div>
        </div>
        <div className="error-state">
          <p>❌ {error}</p>
          <button onClick={fetchDashboardData} className="retry-button">
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  const { partner, stats, users, compliance } = dashboardData;

  // Prepare chart data
  const categoryData = Object.entries(stats.categoryStats || {})
    .map(([label, data]) => ({
      label: label.replace('Nintex ', ''),
      value: data.completed + data.inProgress + data.enrolled
    }))
    .filter(d => d.value > 0);

  const completionData = Object.entries(stats.categoryStats || {})
    .map(([label, data]) => ({
      label: label.replace('Nintex ', '').substring(0, 6),
      value: data.completed
    }))
    .filter(d => d.value > 0);

  return (
    <div className="customer-dashboard">
      <div className="dashboard-header">
        <div className="company-info">
          <h2>🎓 {partner.account_name}</h2>
          <p className="company-subtitle">
            Partner Certification Dashboard
            {partner.account_region && ` • ${partner.account_region}`}
          </p>
          <small className="data-source">
            📊 Data from database • {partner.account_owner && `Owner: ${partner.account_owner}`}
          </small>
        </div>
        <div className="header-actions">
          <button 
            className="refresh-button"
            onClick={fetchDashboardData}
            disabled={loading}
          >
            🔄 Refresh
          </button>
          <div className={`tier-badge tier-${(dashboardData.tier || '').toLowerCase()}`}>
            {dashboardData.tier || 'Partner'}
          </div>
        </div>
      </div>

      {/* Compliance Meter */}
      {compliance && dashboardData.tier && (
        <ComplianceMeter compliance={compliance} tier={dashboardData.tier} />
      )}

      {/* Stats Cards */}
      <div className="training-stats">
        <div className="stat-card">
          <div className="stat-number">{stats.totalContacts}</div>
          <div className="stat-label">Total Contacts</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.usersWithLms}</div>
          <div className="stat-label">In LMS</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.totalEnrollments}</div>
          <div className="stat-label">Enrollments</div>
        </div>
        <div className="stat-card success">
          <div className="stat-number">{stats.totalCompleted}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-number">{stats.activeNpcu}</div>
          <div className="stat-label">Active NPCU</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.completionRate}%</div>
          <div className="stat-label">Completion</div>
        </div>
      </div>

      {/* Charts */}
      {(categoryData.length > 0 || completionData.length > 0) && (
        <div className="charts-section">
          <div className="chart-row">
            <div className="chart-card">
              <h3>NPCU Progress</h3>
              <div className="progress-overview">
                <div className="progress-ring-container">
                  <ProgressRing 
                    progress={compliance?.compliancePercent || 0} 
                    size={100} 
                  />
                  <div className="progress-stats">
                    <div><StatusBadge status="Completed" count={stats.totalCompleted} /></div>
                    <div><StatusBadge status="In Progress" count={stats.totalInProgress} /></div>
                    <div><StatusBadge status="Enrolled" count={stats.totalNotStarted} /></div>
                  </div>
                </div>
              </div>
            </div>
            
            {categoryData.length > 0 && (
              <div className="chart-card">
                <h3>By Category</h3>
                <DonutChart 
                  data={categoryData}
                  size={140}
                />
              </div>
            )}
            
            {completionData.length > 0 && (
              <div className="chart-card">
                <h3>Completions</h3>
                <SimpleBarChart 
                  data={completionData}
                  width={200}
                  height={120}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* User List */}
      <div className="staff-list">
        <h3>👥 Staff Certification Records ({users.length} with LMS access)</h3>
        {users.length === 0 ? (
          <div className="no-users-message">
            <p>No staff members found with LMS accounts.</p>
            <p className="muted">Contacts may need to be added to the LMS.</p>
          </div>
        ) : (
          users.map((userData, idx) => (
            <UserCard
              key={userData.contact?.id || idx}
              userData={userData}
              isExpanded={expandedUsers.has(userData.contact?.id)}
              onToggle={() => toggleUserExpansion(userData.contact?.id)}
            />
          ))
        )}
      </div>

      <div className="dashboard-footer">
        <NintexButton 
          variant="secondary" 
          size="medium"
          onClick={fetchDashboardData}
          leftIcon="🔄"
        >
          Refresh Data
        </NintexButton>
        <p className="last-updated">
          Last updated: {new Date().toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
};

export default PartnerDashboardDB;
