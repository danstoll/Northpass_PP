import React, { useState, useEffect, useCallback } from 'react';
import './CompanyWidget.css';
import northpassApi from '../services/northpassApi';
import NintexButton from './NintexButton';

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
  'Aggregator': 5
};

const CompanyWidget = ({ groupName = "_BWI_Fernao Digital Solutions", tier = "Premier" }) => {
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
  
  // Progress tracking
  const [progressStatus, setProgressStatus] = useState('');
  const [progressDetail, setProgressDetail] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);

  useEffect(() => {
    setTierRequirement(TIER_REQUIREMENTS[tier] || 20);
  }, [tier]);

  const fetchGroupUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setCurrentStep(0);
      setTotalSteps(3); // Initial estimate: 1) Find group, 2) Get users, 3) Process certifications
      
      console.log(`🏢 Starting company analysis for: ${groupName} (${tier} tier)`);
      
      // Step 1: Find the group by name
      setCurrentStep(1);
      setProgressStatus('Searching for group...');
      setProgressDetail(`Looking for "${groupName}" in Northpass`);
      console.log('📋 Searching for group...');
      
      const group = await northpassApi.findGroupByName(groupName);
      
      if (!group) {
        throw new Error(`Group "${groupName}" not found`);
      }
      
      console.log(`✅ Found group: ${group.attributes.name} (ID: ${group.id})`);
      setGroupData(group);
      
      // Step 2: Get all users in the group
      setCurrentStep(2);
      setProgressStatus('Fetching group members...');
      setProgressDetail('Loading user list from group');
      console.log('👥 Fetching group members...');
      
      const groupUsers = await northpassApi.getGroupUsers(group.id);
      console.log(`📊 Found ${groupUsers.length} users in group`);
      
      // Update total steps for parallel processing (much simpler!)
      setTotalSteps(4); // 1) Find group, 2) Get users, 3) Process certifications, 4) Complete
      setProgressDetail(`Found ${groupUsers.length} users - analyzing certifications in parallel...`);
      
      // Step 3: Process all users' certifications in parallel (much faster!)
      setCurrentStep(3);
      setProgressStatus('Analyzing certifications...');
      setProgressDetail('Processing users in parallel batches...');
      
      const processedUsers = await northpassApi.processUsersInParallel(
        groupUsers, 
        (currentUser, totalUsers, user) => {
          // Update progress during parallel processing
          const firstName = user?.attributes?.first_name || '';
          const lastName = user?.attributes?.last_name || '';
          const email = user?.attributes?.email || '';
          const userId = user?.id || user?.attributes?.id || 'Unknown';
          
          let displayName;
          if (firstName.trim() && lastName.trim()) {
            displayName = `${firstName.trim()} ${lastName.trim()}`;
          } else if (email) {
            displayName = email;
          } else {
            displayName = `User ${userId.substring(0, 8)}...`;
          }
          
          setProgressDetail(`Processing ${displayName} (${currentUser}/${totalUsers})`);
        }
      );
      
      // Calculate totals from processed results (COMPANY-LEVEL AGGREGATION)
      let runningTotal = 0;
      let usersWithCertifications = 0;
      
      // Initialize company product breakdown aggregation
      const companyBreakdown = {
        'Nintex CE': { count: 0, npcu: 0, courses: [] },
        'Nintex K2': { count: 0, npcu: 0, courses: [] },
        'Nintex for Salesforce': { count: 0, npcu: 0, courses: [] },
        'Other': { count: 0, npcu: 0, courses: [] }
      };
      
      processedUsers.forEach(user => {
        runningTotal += user.totalNPCU;
        
        // Count users who have any certifications (NPCU > 0)
        if (user.totalNPCU > 0) {
          usersWithCertifications++;
        }
        
        // Aggregate product breakdown from each user
        if (user.productBreakdown) {
          Object.keys(companyBreakdown).forEach(category => {
            if (user.productBreakdown[category]) {
              companyBreakdown[category].count += user.productBreakdown[category].count;
              companyBreakdown[category].npcu += user.productBreakdown[category].npcu;
              companyBreakdown[category].courses.push(...user.productBreakdown[category].courses);
            }
          });
        }
        
        console.log(`✅ ${user.name}: ${user.totalNPCU} NPCU (contributes to company total)`);
      });
      
      // Update company product breakdown state
      setCompanyProductBreakdown(companyBreakdown);
      
      // Log company product breakdown summary
      console.log('🏢 COMPANY PRODUCT BREAKDOWN:');
      Object.entries(companyBreakdown).forEach(([category, stats]) => {
        if (stats.count > 0) {
          console.log(`   ${category}: ${stats.count} certifications, ${stats.npcu} NPCU`);
        }
      });
      
      // Company-level tier assessment
      const companyMeetsTierRequirement = runningTotal >= tierRequirement;
      console.log(`🏢 Company ${tier} Status: ${runningTotal}/${tierRequirement} NPCU ${companyMeetsTierRequirement ? '✅ QUALIFIED' : '❌ NOT QUALIFIED'}`);
      
      // Update users with company context (not individual requirements)
      processedUsers.forEach(user => {
        // Users don't have individual requirements - they contribute to company total
        user.contributesToCompany = user.totalNPCU > 0;
        user.companyQualified = companyMeetsTierRequirement;
      });
      
      // Final step: Complete analysis
      setCurrentStep(4);
      setProgressStatus('Analysis complete!');
      setProgressDetail(`Processed ${processedUsers.length} users in parallel`);
      
      setUsers(processedUsers);
      setTotalNPCU(runningTotal);
      setCertifiedUsers(usersWithCertifications);
      
      // Calculate validation statistics
      let totalCertifications = 0;
      let validCertifications = 0;
      let invalidCertifications = 0;
      
      processedUsers.forEach(user => {
        totalCertifications += user.certifications.length;
        user.certifications.forEach(cert => {
          if (cert.isValidCourse !== false) {
            validCertifications++;
          } else {
            invalidCertifications++;
          }
        });
      });

      console.log(`🎯 Company Summary:`);
      console.log(`   Total Users: ${processedUsers.length}`);
      console.log(`   Company Total NPCU: ${runningTotal}`);
      console.log(`   Users with Certifications: ${usersWithCertifications}`);
      console.log(`   Company ${tier} Status: ${companyMeetsTierRequirement ? 'QUALIFIED' : 'NOT QUALIFIED'} (${runningTotal}/${tierRequirement} NPCU)`);
      console.log(`   User Participation Rate: ${((usersWithCertifications / processedUsers.length) * 100).toFixed(1)}%`);
      console.log(`📚 Course Validation Summary:`);
      console.log(`   Total Certifications: ${totalCertifications}`);
      console.log(`   Valid Courses: ${validCertifications}`);
      console.log(`   Invalid/Outdated Courses: ${invalidCertifications}`);
      console.log(`   Course Validity Rate: ${totalCertifications > 0 ? ((validCertifications / totalCertifications) * 100).toFixed(1) : 0}%`);
      
      // Run comprehensive course validation analysis
      northpassApi.analyzeCompanyCourseValidation(processedUsers);
      
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
  }, [fetchGroupUsers]);

  const getCertificationBadgeColor = (npcu) => {
    if (npcu >= tierRequirement) return 'certification-badge-success';
    if (npcu >= tierRequirement * 0.5) return 'certification-badge-warning';
    return 'certification-badge-danger';
  };

  if (loading) {
    return (
      <div className="company-widget">
        <div className="widget-header">
          <h2>🏢 Company Certifications</h2>
          <div className="tier-badge tier-premier">Loading...</div>
        </div>
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <div className="progress-info">
            <h3>{progressStatus}</h3>
            <p>{progressDetail}</p>
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
                  {totalSteps > 2 && ` (${Math.round((currentStep / totalSteps) * 100)}%)`}
                </p>
              </>
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
        </div>
        <div className={`tier-badge tier-${tier.toLowerCase()}`}>
          {tier} Partner
        </div>
      </div>

      <div className="company-stats">
        <div className="stat-card">
          <div className="stat-number">{users.length}</div>
          <div className="stat-label">Total Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{totalNPCU}</div>
          <div className="stat-label">Total NPCU Points</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{certifiedUsers}</div>
          <div className="stat-label">Certified Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{certificationRate}%</div>
          <div className="stat-label">Certification Rate</div>
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
        <h3>👥 User Certifications</h3>
        {users.map(user => (
          <div key={user.id} className="user-card">
            <div className="user-header">
              <div className="user-info">
                <h4>{user.name}</h4>
                <p className="user-email">{user.email}</p>
              </div>
              <div className={`certification-badge ${getCertificationBadgeColor(user.totalNPCU)}`}>
                {user.totalNPCU} NPCU
              </div>
            </div>
            
            {user.error ? (
              <div className="user-error">
                <p>❌ Error loading certifications: {user.error}</p>
              </div>
            ) : (
              <div className="user-certifications">
                {user.certifications.length > 0 ? (
                  <>
                    <p className="certification-count">
                      🎓 {user.certifications.length} certification{user.certifications.length !== 1 ? 's' : ''}
                    </p>
                    <div className="certification-list">
                      {user.certifications.map((cert, index) => (
                        <div key={index} className={`certification-item ${cert.isValidCourse === false ? 'invalid-course' : ''}`}>
                          <span className="cert-name">
                            {cert.name}
                            {cert.isValidCourse === false && <span className="invalid-badge">❌ Invalid</span>}
                          </span>
                          <span className="cert-npcu">{cert.npcu} NPCU</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="no-certifications">No certifications completed</p>
                )}
              </div>
            )}
          </div>
        ))}
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