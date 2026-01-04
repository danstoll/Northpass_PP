import React, { useState, useEffect, useCallback } from 'react';
import './CompanyWidget.css';
import northpassApi from '../services/northpassApi';
import NintexButton from './NintexButton';

// Tier badge images
import PremierBadge from '../assets/images/PartnerNetworkPremierPartner_Horizontal.png';
import CertifiedBadge from '../assets/images/PartnerNetworkCertifiedPartner_Horizontal.png';
import RegisteredBadge from '../assets/images/PartnerNetworkRegisteredPartner_Horizontal.png';
import PartnerNetworkLogo from '../assets/images/PartnerNetworkLogo_Horizontal.png';

// Map tier names to badge images (case-insensitive lookup with typo tolerance)
const TIER_BADGES = {
  'premier': PremierBadge,
  'premier plus': PremierBadge,
  'certified': CertifiedBadge,
  'certifed': CertifiedBadge,  // Common typo
  'registered': RegisteredBadge,
  'registerd': RegisteredBadge, // Common typo
  'aggregator': PartnerNetworkLogo
};

// Helper to get tier badge with case-insensitive lookup
const getTierBadge = (tier) => {
  if (!tier) return null;
  const badge = TIER_BADGES[(tier || '').toLowerCase()];
  console.log('[TierBadge] Tier:', tier, '| Badge found:', !!badge, '| Badge URL:', badge);
  return badge;
};

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

// Collapsible Product Category Card Component
const ProductCategoryCard = ({ category, stats }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };
  
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleExpanded();
    }
  };
  
  // Get unique courses (remove duplicates by name)
  const uniqueCourses = stats.courses.reduce((acc, course) => {
    const existing = acc.find(c => c.name === course.name);
    if (!existing) {
      acc.push(course);
    }
    return acc;
  }, []);
  
  // Sort courses by NPCU (highest first), then by name
  const sortedCourses = uniqueCourses.sort((a, b) => {
    if (b.npcu !== a.npcu) return b.npcu - a.npcu;
    return a.name.localeCompare(b.name);
  });
  
  // Calculate expiry summary for this category
  const expirySummary = uniqueCourses.reduce((acc, course) => {
    if (course.expiryDate) {
      const expiryInfo = getExpiryInfo(course.expiryDate);
      acc[expiryInfo.status] = (acc[expiryInfo.status] || 0) + 1;
    } else {
      acc.unknown = (acc.unknown || 0) + 1;
    }
    return acc;
  }, {});
  
  const hasExpiryIssues = (expirySummary.expired || 0) + (expirySummary.expiring || 0) > 0;
  
  return (
    <div className="product-card">
      <div 
        className="product-header-clickable" 
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
        aria-label={`${category} - ${stats.count} certifications, ${stats.npcu} NPCU points. Click to ${isExpanded ? 'collapse' : 'expand'} details.`}
      >
        <div className="product-header-content">
          <span className="product-category-name">{category}</span>
          <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded ? '▼' : '▶'}
          </span>
        </div>
        <div className="product-metrics">
          <span className="product-count">{stats.count} certs</span>
          <span className="product-npcu">{stats.npcu} NPCU</span>
          {hasExpiryIssues && (
            <span className="expiry-alert">
              {expirySummary.expired > 0 && `${expirySummary.expired} expired`}
              {expirySummary.expired > 0 && expirySummary.expiring > 0 && ', '}
              {expirySummary.expiring > 0 && `${expirySummary.expiring} expiring soon`}
            </span>
          )}
        </div>
      </div>
      
      {isExpanded && (
        <div className="product-details">
          <div className="product-details-header">
            <h4>Certifications in this category:</h4>
          </div>
          <div className="certification-list-detailed">
            {sortedCourses.map((course, index) => {
              const expiryInfo = getExpiryInfo(course.expiryDate);
              
              return (
                <div key={index} className="certification-detail-item">
                  <div className="cert-detail-header">
                    <span className="cert-detail-name">{course.name}</span>
                    <div className="cert-detail-badges">
                      <span className="cert-detail-npcu">{course.npcu} NPCU</span>
                      {course.isValid === false && (
                        <span className="cert-invalid-badge">❌ Invalid</span>
                      )}
                    </div>
                  </div>
                  {course.expiryDate && (
                    <div className="cert-expiry-info">
                      <span className={`cert-expiry-badge cert-expiry-${expiryInfo.status}`}>
                        <span className="expiry-icon">
                          {expiryInfo.status === 'expired' ? '🔴' : 
                           expiryInfo.status === 'expiring' ? '🟠' : 
                           expiryInfo.status === 'warning' ? '🟡' : '🟢'}
                        </span>
                        {expiryInfo.text}
                      </span>
                      <span className="cert-expiry-date">
                        Expires: {expiryInfo.formattedDate}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="product-summary">
            <span className="summary-text">
              Total: {uniqueCourses.length} unique certification{uniqueCourses.length !== 1 ? 's' : ''} • {stats.npcu} NPCU Points
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

const TIER_REQUIREMENTS = {
  'Registered': 5,
  'Certified': 10,
  'Premier': 20,
  'Premier Plus': 20,
  'Aggregator': 5
};

// Sort options for user list
const SORT_OPTIONS = {
  'npcu': { label: 'NPCU (High to Low)', sortFn: (a, b) => b.totalNPCU - a.totalNPCU },
  'npcu-asc': { label: 'NPCU (Low to High)', sortFn: (a, b) => a.totalNPCU - b.totalNPCU },
  'completions': { label: 'Completions (High to Low)', sortFn: (a, b) => b.completedCourses - a.completedCourses },
  'login': { label: 'Last Login (Recent First)', sortFn: (a, b) => {
    if (!a.lastLoginAt && !b.lastLoginAt) return 0;
    if (!a.lastLoginAt) return 1;
    if (!b.lastLoginAt) return -1;
    return new Date(b.lastLoginAt) - new Date(a.lastLoginAt);
  }},
  'login-asc': { label: 'Last Login (Oldest First)', sortFn: (a, b) => {
    if (!a.lastLoginAt && !b.lastLoginAt) return 0;
    if (!a.lastLoginAt) return 1;
    if (!b.lastLoginAt) return -1;
    return new Date(a.lastLoginAt) - new Date(b.lastLoginAt);
  }},
  'alpha': { label: 'Alphabetical (A-Z)', sortFn: (a, b) => a.name.localeCompare(b.name) },
  'alpha-desc': { label: 'Alphabetical (Z-A)', sortFn: (a, b) => b.name.localeCompare(a.name) }
};

// Format relative time for last login
const formatLastLogin = (dateString) => {
  if (!dateString) return 'Never logged in';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return date.toLocaleDateString();
};

const CompanyWidget = ({ groupName, tier }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupData, setGroupData] = useState(null);
  const [users, setUsers] = useState([]);
  const [totalNPCU, setTotalNPCU] = useState(0);
  const [certifiedUsers, setCertifiedUsers] = useState(0);
  const [tierRequirement, setTierRequirement] = useState(20);
  const [companyProductBreakdown, setCompanyProductBreakdown] = useState({
    'Nintex CE': { count: 0, npcu: 0, courses: [] },
    'Nintex K2': { count: 0, npcu: 0, courses: [] },
    'Nintex for Salesforce': { count: 0, npcu: 0, courses: [] },
    'Other': { count: 0, npcu: 0, courses: [] }
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cacheStats, setCacheStats] = useState(null);
  const [sortBy, setSortBy] = useState('npcu');
  const [expandedUserId, setExpandedUserId] = useState(null);
  
  // Learning activity summary
  const [learningStats, setLearningStats] = useState({
    totalEnrolled: 0,
    totalInProgress: 0,
    totalCompleted: 0,
    totalCertifications: 0
  });
  
  // Progress tracking
  const [progressStatus, setProgressStatus] = useState('');
  const [progressDetail, setProgressDetail] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [progressLogs, setProgressLogs] = useState([]);
  const [usersProcessed, setUsersProcessed] = useState(0);
  const [totalUsersToProcess, setTotalUsersToProcess] = useState(0);
  // coursesLoaded tracking removed - not currently displayed
  
  // Helper to add log entry
  const addProgressLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setProgressLogs(prev => [...prev.slice(-15), { message, type, timestamp }]);
  };

  // Handle cache refresh
  const handleRefreshData = async () => {
    if (loading || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      // Clear cache
      northpassApi.clearCache();
      
      // Reload data
      await fetchGroupUsers();
      
      // Update cache stats
      setCacheStats(northpassApi.getCacheStats());
    } catch (error) {
      console.error('Error refreshing data:', error);
      setError('Failed to refresh data. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch tier requirements from API on mount
  useEffect(() => {
    const fetchTierRequirements = async () => {
      try {
        const response = await fetch('/api/db/settings/tier-requirements');
        if (response.ok) {
          const tierReqs = await response.json();
          // Update the TIER_REQUIREMENTS object dynamically
          Object.assign(TIER_REQUIREMENTS, tierReqs);
          // Set the tier requirement for current tier
          setTierRequirement(tierReqs[tier] || 20);
        }
      } catch (error) {
        console.warn('Failed to fetch tier requirements, using defaults:', error);
        setTierRequirement(TIER_REQUIREMENTS[tier] || 20);
      }
    };
    fetchTierRequirements();
  }, [tier]);

  const fetchGroupUsers = useCallback(async () => {
    // Don't load data if no groupName is provided
    if (!groupName) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      setCurrentStep(0);
      setTotalSteps(2);
      setProgressLogs([]);
      setUsersProcessed(0);
      setTotalUsersToProcess(0);
      
      console.log(`🏢 Starting company analysis for: ${groupName} (${tier || 'Premier'} tier)`);
      addProgressLog(`Loading data for ${groupName}`, 'start');
      
      // Fetch from database API - much faster than live API
      setCurrentStep(1);
      setProgressStatus('Loading from database...');
      setProgressDetail(`Fetching data for "${groupName}"`);
      addProgressLog(`Querying database for: ${groupName}`, 'search');
      
      const response = await fetch(`/api/db/dashboard/group?name=${encodeURIComponent(groupName)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Group "${groupName}" not found`);
      }
      
      const data = await response.json();
      console.log(`✅ Database returned data for: ${data.group.name}`);
      addProgressLog(`✓ Found group: ${data.group.name}`, 'success');
      
      // Set group data
      setGroupData({
        id: data.group.id,
        attributes: { name: data.group.name }
      });
      setTotalUsersToProcess(data.group.memberCount);
      
      // Process users
      setCurrentStep(2);
      setProgressStatus('Processing results...');
      addProgressLog(`Processing ${data.users.length} users`, 'loading');
      
      const processedUsers = data.users;
      
      // Add company context to users
      const companyMeetsTierRequirement = data.totals.totalNPCU >= tierRequirement;
      processedUsers.forEach(user => {
        user.contributesToCompany = user.totalNPCU > 0;
        user.companyQualified = companyMeetsTierRequirement;
        // Ensure productBreakdown exists for each user (may not have it from DB)
        if (!user.productBreakdown) {
          user.productBreakdown = {
            'Nintex CE': { count: 0, npcu: 0, courses: [] },
            'Nintex K2': { count: 0, npcu: 0, courses: [] },
            'Nintex for Salesforce': { count: 0, npcu: 0, courses: [] },
            'Other': { count: 0, npcu: 0, courses: [] }
          };
        }
      });
      
      // Set all state from database response
      setUsers(processedUsers);
      setTotalNPCU(data.totals.totalNPCU);
      setCertifiedUsers(data.totals.certifiedUsers);
      setCompanyProductBreakdown(data.productBreakdown);
      setLearningStats({
        totalEnrolled: data.totals.totalEnrolled,
        totalInProgress: data.totals.totalInProgress,
        totalCompleted: data.totals.totalCompleted,
        totalCertifications: data.totals.totalCertifications
      });
      
      // Final step
      setProgressStatus('Analysis complete!');
      setProgressDetail(`Loaded ${processedUsers.length} users from database`);
      addProgressLog(`✓ Analysis complete: ${data.totals.totalNPCU} total NPCU`, 'success');
      
      console.log(`🏢 Company Summary (from database):`);
      console.log(`   Total Users: ${processedUsers.length}`);
      console.log(`   Company Total NPCU: ${data.totals.totalNPCU}`);
      console.log(`   Users with Certifications: ${data.totals.certifiedUsers}`);
      console.log(`   Company ${tier} Status: ${companyMeetsTierRequirement ? 'QUALIFIED' : 'NOT QUALIFIED'} (${data.totals.totalNPCU}/${tierRequirement} NPCU)`);
      console.log('🏢 COMPANY PRODUCT BREAKDOWN:');
      Object.entries(data.productBreakdown).forEach(([category, stats]) => {
        if (stats.count > 0) {
          console.log(`   ${category}: ${stats.count} certifications, ${stats.npcu} NPCU`);
        }
      });
      
    } catch (err) {
      console.error('❌ Company widget error:', err);
      setError(err.message);
      setProgressStatus('Error occurred');
      setProgressDetail(err.message);
    } finally {
      setLoading(false);
    }
  }, [groupName, tier, tierRequirement]);

  useEffect(() => {
    fetchGroupUsers();
    // Load initial cache stats
    setCacheStats(northpassApi.getCacheStats());
  }, [fetchGroupUsers]);

  const getCertificationBadgeColor = (npcu) => {
    if (npcu >= tierRequirement) return 'success';
    if (npcu >= tierRequirement * 0.5) return 'warning';
    return 'danger';
  };

  // Show instructions when no parameters are provided
  if (!groupName) {
    return (
      <div className="company-widget">
        <div className="widget-header">
          <h2>🏢 Nintex Partner Portal</h2>
          <div className="tier-badge tier-info">Partner Access</div>
        </div>
        <div className="welcome-state">
          <div className="welcome-icon">🔒</div>
          <h3>Partner Certification Portal</h3>
          <p className="welcome-message">
            This portal provides certification tracking for Nintex partners.
          </p>
          <p className="welcome-info">
            If you are a Nintex partner, please use the secure link provided by your account manager to access your certification dashboard.
          </p>
          <div className="contact-info">
            <p>Need access? Contact your Nintex Partner Account Manager.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="company-widget">
        <div className="widget-header">
          <h2>🏢 {groupName || 'Company Certifications'}</h2>
          <div className="tier-badge tier-premier">{tier || 'Loading...'}</div>
        </div>
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <div className="progress-info">
            <h3>{progressStatus || 'Initializing...'}</h3>
            <p className="progress-detail">{progressDetail}</p>
            {totalSteps > 0 && (
              <>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                  ></div>
                </div>
                <p className="progress-text">
                  Step {currentStep} of {totalSteps} 
                  {currentStep >= 3 && totalUsersToProcess > 0 && (
                    <span> • Users: {usersProcessed}/{totalUsersToProcess}</span>
                  )}
                </p>
              </>
            )}
            
            {/* Live activity log */}
            {progressLogs.length > 0 && (
              <div className="progress-log">
                <div className="log-header">Activity Log</div>
                <div className="log-entries">
                  {progressLogs.map((log, idx) => (
                    <div key={idx} className={`log-entry log-${log.type}`}>
                      <span className="log-time">{log.timestamp}</span>
                      <span className="log-message">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="company-widget">
        <div className="widget-header">
          <h2>🏢 Company Certifications</h2>
          <div className="tier-badge tier-error">Error</div>
        </div>
        <div className="error-state">
          <p>❌ {error}</p>
          <button onClick={fetchGroupUsers} className="retry-button">
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  const certificationRate = users.length > 0 ? ((certifiedUsers / users.length) * 100).toFixed(1) : 0;

  return (
    <div className="company-widget">
      <div className="widget-header">
        <div className="company-info">
          <h2>🏢 {groupData?.attributes.name || groupName}</h2>
          <p className="company-subtitle">Partnership Certification Overview</p>
          {cacheStats && (
            <small className="cache-info" title={`Cache hit rate: ${cacheStats.hitRate}%`}>
              📊 Cache: {cacheStats.hits} hits, {cacheStats.misses} misses
            </small>
          )}
        </div>
        <div className="header-actions">
          <button 
            className="refresh-button"
            onClick={handleRefreshData}
            disabled={loading || isRefreshing}
            title="Clear cache and refresh all data"
          >
            {isRefreshing ? '🔄 Refreshing...' : '🔄 Refresh Data'}
          </button>
          {getTierBadge(tier) ? (
            <img 
              src={getTierBadge(tier)} 
              alt={`${tier} Partner`} 
              className="tier-badge-image"
              title={`${tier} Partner`}
            />
          ) : (
            <div className={`tier-badge tier-${(tier || '').toLowerCase()}`}>
              {tier || 'Unknown'} Partner
            </div>
          )}
        </div>
      </div>

      <div className="company-stats">
        <div className="stat-card">
          <div className="stat-number">{users?.length ?? 0}</div>
          <div className="stat-label">Total Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{totalNPCU ?? 0}</div>
          <div className="stat-label">Total NPCU Points</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{certifiedUsers ?? 0}</div>
          <div className="stat-label">Certified Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{certificationRate ?? 0}%</div>
          <div className="stat-label">Certification Rate</div>
        </div>
      </div>

      {/* Learning Activity Summary Tiles */}
      <div className="learning-stats">
        <h3>📚 Learning Activity Summary</h3>
        <div className="learning-tiles">
          <div className="learning-tile total-courses">
            <div className="tile-icon">📚</div>
            <div className="tile-content">
              <div className="tile-number">{learningStats.totalEnrolled}</div>
              <div className="tile-label">Total Courses</div>
            </div>
          </div>
          <div className="learning-tile in-progress">
            <div className="tile-icon">⏳</div>
            <div className="tile-content">
              <div className="tile-number">{learningStats.totalInProgress}</div>
              <div className="tile-label">In Progress</div>
            </div>
          </div>
          <div className="learning-tile completed">
            <div className="tile-icon">✅</div>
            <div className="tile-content">
              <div className="tile-number">{learningStats.totalCompleted}</div>
              <div className="tile-label">Completed</div>
            </div>
          </div>
          <div className="learning-tile certifications">
            <div className="tile-icon">🎓</div>
            <div className="tile-content">
              <div className="tile-number">{learningStats.totalCertifications}</div>
              <div className="tile-label">Certifications</div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Category Breakdown */}
      <div className="product-breakdown">
        <h3>📊 Product Category Breakdown</h3>
        <div className="product-stats">
          {Object.entries(companyProductBreakdown).map(([category, stats]) => (
            stats.count > 0 && (
              <ProductCategoryCard 
                key={category} 
                category={category} 
                stats={stats} 
              />
            )
          ))}
        </div>
      </div>

      <div className="tier-requirements">
        <h3>📋 {tier} Partner Requirements</h3>
        <div className="requirement-item">
          <span className="requirement-label">Company Total NPCU Required:</span>
          <span className="requirement-value">{tierRequirement} points</span>
        </div>
        <div className="requirement-item">
          <span className="requirement-label">Current Company Total:</span>
          <span className={`requirement-value ${totalNPCU >= tierRequirement ? 'qualified' : 'not-qualified'}`}>
            {totalNPCU} points
          </span>
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${Math.min((totalNPCU / tierRequirement) * 100, 100)}%` }}
          ></div>
        </div>
        <p className="progress-text">
          Company Status: {totalNPCU >= tierRequirement ? 
            `✅ QUALIFIED (${totalNPCU}/${tierRequirement} NPCU)` : 
            `❌ NOT QUALIFIED (${totalNPCU}/${tierRequirement} NPCU)`}
        </p>
      </div>

      <div className="users-list">
        <div className="users-list-header">
          <h3>👥 User Certifications</h3>
          <div className="sort-controls">
            <label htmlFor="sort-select">Sort by:</label>
            <select 
              id="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="sort-select"
            >
              {Object.entries(SORT_OPTIONS).map(([key, option]) => (
                <option key={key} value={key}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="user-cards-grid">
          {[...users].sort(SORT_OPTIONS[sortBy].sortFn).map(user => {
            const isExpanded = expandedUserId === user.id;
            return (
              <div 
                key={user.id} 
                className={`user-card-compact ${isExpanded ? 'expanded' : ''}`}
                onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
              >
                <div className="user-card-top">
                  <div className="user-name-email">
                    <h4>{user.name}</h4>
                    <p className="user-email">{user.email}</p>
                  </div>
                  <div className={`npcu-badge ${getCertificationBadgeColor(user.totalNPCU)}`}>
                    {user.totalNPCU}
                  </div>
                </div>
                
                <div className="user-mini-stats">
                  <span className="mini-stat" title="Completed">✅ {user.completedCourses || 0}</span>
                  <span className="mini-stat" title="Certifications">🎓 {user.certificationCount || 0}</span>
                  <span className="mini-stat last-login" title={`Last login: ${formatLastLogin(user.lastLoginAt)}`}>
                    🕐 {formatLastLogin(user.lastLoginAt)}
                  </span>
                  <span className="expand-icon">{isExpanded ? '▲' : '▼'}</span>
                </div>
                
                {user.certifications.length > 0 && (
                  <div className={`user-certs-mini ${isExpanded ? 'expanded' : ''}`}>
                    {(isExpanded ? user.certifications : user.certifications.slice(0, 2)).map((cert, index) => (
                      <div key={index} className={`cert-tag ${isExpanded ? 'cert-tag-full' : ''}`}>
                        <span className="cert-tag-name">{isExpanded ? cert.name : (cert.name.length > 30 ? cert.name.substring(0, 30) + '...' : cert.name)}</span>
                        <span className="cert-tag-npcu">{cert.npcu}</span>
                      </div>
                    ))}
                    {!isExpanded && user.certifications.length > 2 && (
                      <div className="cert-more">+{user.certifications.length - 2} more</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="widget-footer">
        <NintexButton 
          variant="secondary" 
          size="medium"
          onClick={fetchGroupUsers}
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

export default CompanyWidget;