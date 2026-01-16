import React, { useState, useEffect, useCallback } from 'react';
import { Tooltip, IconButton } from '@mui/material';
import { Info } from '@mui/icons-material';
import './CompanyWidget.css';
import northpassApi from '../services/northpassApi';
import NintexButton from './NintexButton';
import { exportToExcel, exportToPDF } from '../services/exportService';

// Tier badge images
import PremierBadge from '../assets/images/PartnerNetworkPremierPartner_Horizontal.png';
import CertifiedBadge from '../assets/images/PartnerNetworkCertifiedPartner_Horizontal.png';
import RegisteredBadge from '../assets/images/PartnerNetworkRegisteredPartner_Horizontal.png';
import PartnerNetworkLogo from '../assets/images/PartnerNetworkLogo_Horizontal.png';

// Metric definitions for info tooltips
const METRIC_DEFINITIONS = {
  certifiedUsers: {
    title: 'Certified Users',
    description: 'Team members who have earned at least one NPCU certification.',
    details: [
      'Only users with completed certification courses count',
      'Non-certification courses (NPCU = 0) don\'t count',
      'Users appear once even with multiple certifications'
    ]
  },
  totalNPCU: {
    title: 'Total NPCU Points',
    description: 'Nintex Partner Certification Units earned by your entire team.',
    formula: 'Sum of all NPCU from completed certification courses',
    details: [
      'NPCU values: 1 (basic), 2 (advanced)',
      'Expired certifications do NOT count',
      'Used to determine tier qualification'
    ]
  },
  totalLmsUsers: {
    title: 'Total LMS Users',
    description: 'All users registered in the Northpass LMS for your company.',
    details: [
      'Includes users with and without certifications',
      'Users who have accounts but no completions',
      'Base number for certification rate calculation'
    ]
  },
  certificationRate: {
    title: 'Certification Rate',
    description: 'Percentage of your LMS users who have earned certifications.',
    formula: '(Certified Users ÷ Total LMS Users) × 100',
    details: [
      'Higher is better - shows workforce readiness',
      'Goal: 50%+ certification rate',
      'Helps identify training opportunities'
    ]
  },
  totalCourses: {
    title: 'Total Courses',
    description: 'Total number of course enrollments across all team members.',
    details: [
      'Includes all courses, not just certifications',
      'Same course taken by multiple users counts each time',
      'Shows overall learning engagement'
    ]
  },
  inProgress: {
    title: 'In Progress',
    description: 'Courses that team members have started but not yet completed.',
    details: [
      'Users are actively working on these',
      'May need follow-up to ensure completion',
      'Potential future NPCU points'
    ]
  },
  expiredCerts: {
    title: 'Expired Certifications',
    description: 'Team members whose certifications have expired and need renewal.',
    details: [
      'Certifications expire 24 months after completion (12 months for GTM)',
      'Expired certifications do NOT count towards NPCU totals',
      'Users must retake the certification to restore NPCU',
      'Shows users with ONLY expired certs (no active ones)'
    ]
  },
  completed: {
    title: 'Completed',
    description: 'Total course completions across all team members.',
    details: [
      'Includes both certification and non-certification courses',
      'Higher number shows active learning culture',
      'Not all completions earn NPCU'
    ]
  },
  certifications: {
    title: 'Certifications',
    description: 'Number of certification course completions earning NPCU.',
    details: [
      'Only courses with NPCU value > 0',
      'Directly contributes to tier status',
      'Expired certifications excluded from NPCU total'
    ]
  },
  tierRequirement: {
    title: 'NPCU Requirement',
    description: 'Minimum NPCU points needed to maintain your partner tier.',
    details: [
      'Premier/Premier Plus: 20 NPCU required',
      'Certified/Select: 10 NPCU required',
      'Registered: 5 NPCU required',
      'Aggregator: 5 NPCU required'
    ]
  },
  userNPCU: {
    title: 'User NPCU',
    description: 'Total NPCU points earned by this individual user.',
    formula: 'Sum of NPCU values from user\'s completed certifications',
    details: [
      'Green badge: Meets tier requirement individually',
      'Yellow badge: 50%+ of tier requirement',
      'Red badge: Below 50% of tier requirement'
    ]
  },
  categoryNPCU: {
    title: 'Category NPCU',
    description: 'NPCU points earned in this certification category.',
    details: [
      'Categories: Nintex CE, K2, Salesforce, Other',
      'Shows specialization areas',
      'Helps plan balanced training'
    ]
  },
  expiryStatus: {
    title: 'Certification Expiry',
    description: 'Time remaining before a certification expires and stops counting.',
    details: [
      '🟢 Valid: More than 90 days remaining',
      '🟡 Warning: 31-90 days remaining',
      '🟠 Expiring: 30 days or less',
      '🔴 Expired: No longer counts toward NPCU'
    ]
  },
  lastLogin: {
    title: 'Last Login',
    description: 'When the user last accessed the Northpass LMS.',
    details: [
      'Helps identify inactive users',
      'Users who never logged in show "Never"',
      'Consider outreach for dormant accounts'
    ]
  }
};

// Info tooltip component
const InfoTooltip = ({ metricKey, size = 'small', light = false }) => {
  const metric = METRIC_DEFINITIONS[metricKey];
  if (!metric) return null;
  
  return (
    <Tooltip
      title={
        <div style={{ padding: '8px', maxWidth: '300px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '14px' }}>
            {metric.title}
          </div>
          <div style={{ marginBottom: '8px', fontSize: '13px' }}>
            {metric.description}
          </div>
          {metric.formula && (
            <div style={{ 
              backgroundColor: 'rgba(255,255,255,0.1)', 
              padding: '6px', 
              borderRadius: '4px', 
              marginBottom: '8px',
              fontFamily: 'monospace',
              fontSize: '12px'
            }}>
              {metric.formula}
            </div>
          )}
          {metric.details && (
            <ul style={{ margin: '0', paddingLeft: '16px', fontSize: '12px' }}>
              {metric.details.map((detail, i) => (
                <li key={i} style={{ marginBottom: '2px' }}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      }
      arrow
      placement="top"
    >
      <IconButton 
        size={size} 
        sx={{ 
          opacity: 0.6, 
          '&:hover': { opacity: 1 },
          color: light ? 'rgba(255,255,255,0.8)' : 'inherit',
          padding: '2px',
          marginLeft: '4px'
        }}
      >
        <Info fontSize={size} />
      </IconButton>
    </Tooltip>
  );
};

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
  
  const isEmpty = !stats.count || stats.count === 0;
  
  const toggleExpanded = () => {
    if (!isEmpty) {
      setIsExpanded(!isExpanded);
    }
  };
  
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleExpanded();
    }
  };
  
  // Get unique courses (remove duplicates by name)
  const uniqueCourses = (stats.courses || []).reduce((acc, course) => {
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
    <div className={`product-card ${isEmpty ? 'product-card-empty' : ''}`}>
      <div 
        className={`product-header-clickable ${isEmpty ? 'not-clickable' : ''}`}
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        tabIndex={isEmpty ? -1 : 0}
        role="button"
        aria-expanded={isExpanded}
        aria-label={`${category} - ${stats.count || 0} certifications, ${stats.npcu || 0} NPCU points.${isEmpty ? '' : ` Click to ${isExpanded ? 'collapse' : 'expand'} details.`}`}
      >
        <div className="product-header-content">
          <span className="product-category-name">{category}</span>
          {!isEmpty && (
            <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
        </div>
        <div className="product-metrics">
          <span className={`product-count ${isEmpty ? 'empty' : ''}`}>{stats.count || 0} certs</span>
          <span className={`product-npcu ${isEmpty ? 'empty' : ''}`}>{stats.npcu || 0} NPCU</span>
          {hasExpiryIssues && (
            <span className="expiry-alert">
              {expirySummary.expired > 0 && `${expirySummary.expired} expired`}
              {expirySummary.expired > 0 && expirySummary.expiring > 0 && ', '}
              {expirySummary.expiring > 0 && `${expirySummary.expiring} expiring soon`}
            </span>
          )}
        </div>
      </div>
      
      {isExpanded && !isEmpty && (
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
                        {index === 0 && <InfoTooltip metricKey="expiryStatus" />}
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
  const [inProgressUsers, setInProgressUsers] = useState([]);  // Users with in-progress courses (no certs yet)
  const [expiredUsers, setExpiredUsers] = useState([]);  // Users with only expired certifications
  const [totalNPCU, setTotalNPCU] = useState(0);
  const [certifiedUsers, setCertifiedUsers] = useState(0);
  const [tierRequirement, setTierRequirement] = useState(20);
  const [certificationBreakdown, setCertificationBreakdown] = useState({});
  const [categoryLabels, setCategoryLabels] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const [sortBy, setSortBy] = useState('npcu');
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [expandedInProgressUserId, setExpandedInProgressUserId] = useState(null);  // For in-progress section
  const [expandedExpiredUserId, setExpandedExpiredUserId] = useState(null);  // For expired section
  const [totalLmsUsers, setTotalLmsUsers] = useState(0);
  
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

  // Sync partner data from Northpass API (admin function)
  const handleSyncPartner = async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    setSyncResult(null);
    
    try {
      const response = await fetch('/api/db/sync/partner-by-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }
      
      setSyncResult({
        success: true,
        message: `Synced successfully! ${result.stats?.enrollments?.created || 0} new enrollments, ${result.stats?.enrollments?.updated || 0} updated.`,
        stats: result.stats
      });
      
      // Refresh the dashboard to show updated data
      setTimeout(() => {
        fetchGroupUsers();
        setSyncResult(null);
      }, 3000);
      
    } catch (error) {
      console.error('Error syncing partner:', error);
      setSyncResult({
        success: false,
        message: error.message
      });
    } finally {
      setIsSyncing(false);
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
      setInProgressUsers(data.inProgressUsers || []);  // Users with in-progress courses (no certs yet)
      setExpiredUsers(data.expiredUsers || []);  // Users with only expired certifications
      setTotalNPCU(data.totals.totalNPCU);
      setCertifiedUsers(data.totals.certifiedUsers);
      setCertificationBreakdown(data.certificationBreakdown || {});
      setCategoryLabels(data.categoryLabels || {});
      setTotalLmsUsers(data.totals.totalLmsUsers || data.group.memberCount);
      setLearningStats({
        totalEnrolled: data.totals.totalEnrolled,
        totalInProgress: data.totals.totalInProgress,
        totalCompleted: data.totals.totalCompleted,
        totalCertifications: data.totals.totalCertifications,
        totalExpiredCertifications: data.totals.totalExpiredCertifications || 0
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
      console.log('🏢 CERTIFICATION CATEGORY BREAKDOWN:');
      Object.entries(data.certificationBreakdown || {}).forEach(([category, stats]) => {
        if (stats.count > 0) {
          const label = data.categoryLabels?.[category] || category;
          console.log(`   ${label}: ${stats.count} certifications, ${stats.npcu} NPCU`);
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

  // Calculate certification rate based on total LMS users, not just certified users
  const certificationRate = totalLmsUsers > 0 ? ((users.length / totalLmsUsers) * 100).toFixed(1) : 0;

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
          <div className="stat-label">
            Certified Users
            <InfoTooltip metricKey="certifiedUsers" />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{totalNPCU ?? 0}</div>
          <div className="stat-label">
            Total NPCU Points
            <InfoTooltip metricKey="totalNPCU" />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{totalLmsUsers ?? 0}</div>
          <div className="stat-label">
            Total LMS Users
            <InfoTooltip metricKey="totalLmsUsers" />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{certificationRate ?? 0}%</div>
          <div className="stat-label">
            Certification Rate
            <InfoTooltip metricKey="certificationRate" />
          </div>
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
              <div className="tile-label">
                Total Courses
                <InfoTooltip metricKey="totalCourses" />
              </div>
            </div>
          </div>
          <div className="learning-tile in-progress">
            <div className="tile-icon">⏳</div>
            <div className="tile-content">
              <div className="tile-number">{learningStats.totalInProgress}</div>
              <div className="tile-label">
                In Progress
                <InfoTooltip metricKey="inProgress" />
              </div>
            </div>
          </div>
          <div className="learning-tile completed">
            <div className="tile-icon">✅</div>
            <div className="tile-content">
              <div className="tile-number">{learningStats.totalCompleted}</div>
              <div className="tile-label">
                Completed
                <InfoTooltip metricKey="completed" />
              </div>
            </div>
          </div>
          <div className="learning-tile certifications">
            <div className="tile-icon">🎓</div>
            <div className="tile-content">
              <div className="tile-number">{learningStats.totalCertifications}</div>
              <div className="tile-label">
                Certifications
                <InfoTooltip metricKey="certifications" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Certification Category Breakdown */}
      <div className="product-breakdown">
        <h3>
          🎓 Certification Category Breakdown
          <InfoTooltip metricKey="categoryNPCU" />
        </h3>
        <div className="product-stats">
          {Object.entries(certificationBreakdown).map(([categoryKey, stats]) => (
            <ProductCategoryCard 
              key={categoryKey} 
              category={categoryLabels[categoryKey] || stats.label || categoryKey} 
              stats={stats} 
            />
          ))}
        </div>
      </div>

      <div className="tier-requirements">
        <h3>
          📋 {tier} Partner Requirements
          <InfoTooltip metricKey="tierRequirement" />
        </h3>
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
          <h3>
            🎓 Certified Team Members ({users.length})
            <InfoTooltip metricKey="userNPCU" />
          </h3>
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
        {users.length === 0 ? (
          <div className="no-certifications-message">
            <p>🎓 No team members with active certifications yet.</p>
            <p className="muted">Complete certification courses to appear on this dashboard.</p>
          </div>
        ) : (
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
        )}
      </div>

      {/* In-Progress Team Members Section */}
      <div className="users-list in-progress-section">
        <div className="users-list-header">
          <h3>
            📚 Learning In Progress ({inProgressUsers.length})
            <InfoTooltip metricKey="inProgress" />
          </h3>
        </div>
        <p className="section-description">
          Team members actively working on courses who haven't earned certifications yet.
        </p>
        {inProgressUsers.length === 0 ? (
          <div className="empty-section-message">
            <p>📭 No team members currently have courses in progress.</p>
          </div>
        ) : (
          <div className="user-cards-grid">
            {inProgressUsers.map(user => {
              const isExpanded = expandedInProgressUserId === user.id;
              const certCourses = (user.inProgressList || []).filter(c => c.isCertification);
              const potentialNPCU = certCourses.reduce((sum, c) => sum + (c.npcu || 0), 0);
              return (
                <div 
                  key={user.id} 
                  className={`user-card-compact in-progress-card ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => setExpandedInProgressUserId(isExpanded ? null : user.id)}
                >
                  <div className="user-card-top">
                    <div className="user-name-email">
                      <h4>{user.name}</h4>
                      <p className="user-email">{user.email}</p>
                    </div>
                    <div className="npcu-badge in-progress-badge" title="Courses in progress">
                      {user.inProgressCourses}
                    </div>
                  </div>
                  
                  <div className="user-mini-stats">
                    <span className="mini-stat" title="In Progress">📚 {user.inProgressCourses}</span>
                    <span className="mini-stat" title="Certification courses (potential NPCU)">
                      🎯 {certCourses.length} cert{certCourses.length !== 1 ? 's' : ''}
                    </span>
                    <span className="mini-stat last-login" title={`Last login: ${formatLastLogin(user.lastLoginAt)}`}>
                      🕐 {formatLastLogin(user.lastLoginAt)}
                    </span>
                    <span className="expand-icon">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  
                  {user.inProgressList && user.inProgressList.length > 0 && (
                    <div className={`user-certs-mini ${isExpanded ? 'expanded' : ''}`}>
                      {(isExpanded ? user.inProgressList : user.inProgressList.slice(0, 2)).map((course, index) => (
                        <div key={index} className={`cert-tag in-progress-tag ${isExpanded ? 'cert-tag-full' : ''}`}>
                          <span className="cert-tag-name">
                            {isExpanded ? course.name : (course.name.length > 30 ? course.name.substring(0, 30) + '...' : course.name)}
                          </span>
                          {course.isCertification && (
                            <span className="cert-tag-npcu potential">{course.npcu} NPCU</span>
                          )}
                        </div>
                      ))}
                      {!isExpanded && user.inProgressList.length > 2 && (
                        <div className="cert-more">+{user.inProgressList.length - 2} more</div>
                      )}
                    </div>
                  )}
                  
                  {potentialNPCU > 0 && (
                    <div className="potential-npcu">
                      Potential: +{potentialNPCU} NPCU on completion
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Expired Certifications Section */}
      <div className="users-list expired-section">
        <div className="users-list-header">
          <h3>
            ⏰ Expired Certifications ({expiredUsers.length})
            <InfoTooltip metricKey="expiredCerts" />
          </h3>
        </div>
        <p className="section-description">
          Team members whose certifications have expired and need to be renewed. Expired certifications do not count towards the partner's NPCU total.
        </p>
        {expiredUsers.length === 0 ? (
          <div className="empty-section-message">
            <p>✅ No expired certifications. All certifications are current!</p>
          </div>
        ) : (
          <div className="user-cards-grid">
            {expiredUsers.map(user => {
              const isExpanded = expandedExpiredUserId === user.id;
              const totalExpiredNPCU = (user.expiredCertifications || []).reduce((sum, c) => sum + (c.npcu || 0), 0);
              return (
                <div 
                  key={user.id} 
                  className={`user-card-compact expired-card ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => setExpandedExpiredUserId(isExpanded ? null : user.id)}
                >
                  <div className="user-card-top">
                    <div className="user-name-email">
                      <h4>{user.name}</h4>
                      <p className="user-email">{user.email}</p>
                    </div>
                    <div className="npcu-badge expired-badge" title="Expired certifications">
                      {user.expiredCertificationCount}
                    </div>
                  </div>
                  
                  <div className="user-mini-stats">
                    <span className="mini-stat expired" title="Expired Certifications">⏰ {user.expiredCertificationCount} expired</span>
                    <span className="mini-stat" title="Lost NPCU (needs renewal)">
                      ⚠️ -{totalExpiredNPCU} NPCU
                    </span>
                    <span className="mini-stat last-login" title={`Last login: ${formatLastLogin(user.lastLoginAt)}`}>
                      🕐 {formatLastLogin(user.lastLoginAt)}
                    </span>
                    <span className="expand-icon">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  
                  {user.expiredCertifications && user.expiredCertifications.length > 0 && (
                    <div className={`user-certs-mini ${isExpanded ? 'expanded' : ''}`}>
                      {(isExpanded ? user.expiredCertifications : user.expiredCertifications.slice(0, 2)).map((cert, index) => (
                        <div key={index} className={`cert-tag expired-tag ${isExpanded ? 'cert-tag-full' : ''}`}>
                          <span className="cert-tag-name">
                            {isExpanded ? cert.name : (cert.name.length > 30 ? cert.name.substring(0, 30) + '...' : cert.name)}
                          </span>
                          <span className="cert-tag-expiry">
                            Expired {new Date(cert.expiredAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                      {!isExpanded && user.expiredCertifications.length > 2 && (
                        <div className="cert-more">+{user.expiredCertifications.length - 2} more</div>
                      )}
                    </div>
                  )}
                  
                  <div className="renewal-cta">
                    🔄 Renewal required to restore NPCU
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* No Activity Message - shown when no certified or in-progress users */}
      {users.length === 0 && inProgressUsers.length === 0 && expiredUsers.length === 0 && (
        <div className="no-activity-section">
          <div className="no-activity-content">
            <div className="no-activity-icon">📭</div>
            <h3>No Learning Activity Found</h3>
            <p>This partner has <strong>{totalLmsUsers || 0} team member{totalLmsUsers !== 1 ? 's' : ''}</strong> in the LMS, but no one has started any courses yet.</p>
            <div className="no-activity-suggestions">
              <p><strong>To get started:</strong></p>
              <ul>
                <li>🎯 Encourage team members to log in and explore available courses</li>
                <li>📚 Start with foundational courses to build product knowledge</li>
                <li>🏆 Complete certification courses to earn NPCU points</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="widget-footer">
        <div className="footer-actions">
          <NintexButton 
            variant="secondary" 
            size="medium"
            onClick={fetchGroupUsers}
            leftIcon="🔄"
          >
            Refresh Data
          </NintexButton>
          
          <NintexButton 
            variant="secondary" 
            size="medium"
            onClick={handleSyncPartner}
            disabled={isSyncing}
            leftIcon={isSyncing ? "⏳" : "☁️"}
            title="Sync latest data from Northpass LMS for this partner"
          >
            {isSyncing ? 'Syncing...' : 'Sync from LMS'}
          </NintexButton>
          
          {syncResult && (
            <span className={`sync-result ${syncResult.success ? 'success' : 'error'}`}>
              {syncResult.success ? '✅' : '❌'} {syncResult.message}
            </span>
          )}
          
          {users.length > 0 && (
            <div className="export-buttons">
              <NintexButton 
                variant="secondary" 
                size="medium"
                onClick={() => exportToExcel({
                  groupName: groupData?.attributes?.name || groupName,
                  tier,
                  users,
                  inProgressUsers,
                  totals: { totalNPCU, certifiedUsers, totalLmsUsers, totalCertifications: learningStats.totalCertifications },
                  certificationBreakdown,
                  categoryLabels
                }, 'certification-export')}
                leftIcon="📊"
              >
                Export Excel
              </NintexButton>
              <NintexButton 
                variant="primary" 
                size="medium"
                onClick={() => exportToPDF({
                  groupName: groupData?.attributes?.name || groupName,
                  tier,
                  users,
                  inProgressUsers,
                  totals: { totalNPCU, certifiedUsers, totalLmsUsers, totalCertifications: learningStats.totalCertifications },
                  certificationBreakdown,
                  categoryLabels
                }, 'certification-letter')}
                leftIcon="📄"
              >
                Download PDF Report
              </NintexButton>
            </div>
          )}
        </div>
        <p className="last-updated">
          Last updated: {new Date().toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
};

export default CompanyWidget;