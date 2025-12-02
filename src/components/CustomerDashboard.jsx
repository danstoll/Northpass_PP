import React, { useState, useEffect, useCallback } from 'react';
import './CustomerDashboard.css';
import northpassApi from '../services/northpassApi';
import NintexButton from './NintexButton';
import CustomerUrlGenerator from './CustomerUrlGenerator';
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

// Learning Activity Card Component (replaces TrainingCourseCard)
const LearningActivityCard = ({ activity, status }) => {

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="learning-activity-card">
      <div className="activity-header">
        <div className="activity-info">
          <h4 className="activity-name">{activity.name}</h4>
          <div className="activity-meta">
            <span className="activity-category">{activity.category || 'General'}</span>
            <span className="activity-type">{activity.resourceType || 'course'}</span>
          </div>
        </div>
        <div className="activity-status">
          <StatusBadge status={status} />
        </div>
      </div>
      
      <div className="activity-details">
        {/* Progress bar for in-progress courses */}
        {status === 'in_progress' && activity.progress !== undefined && (
          <div className="progress-section">
            <ProgressBar progress={activity.progress} height={6} />
          </div>
        )}
        
        {/* Dates */}
        <div className="activity-dates">
          {activity.enrolledAt && (
            <div className="date-item">
              <span className="date-label">Enrolled:</span>
              <span className="date-value">{formatDate(activity.enrolledAt)}</span>
            </div>
          )}
          {activity.startedAt && status !== 'enrolled' && (
            <div className="date-item">
              <span className="date-label">Started:</span>
              <span className="date-value">{formatDate(activity.startedAt)}</span>
            </div>
          )}
          {activity.completedAt && status === 'completed' && (
            <div className="date-item">
              <span className="date-label">Completed:</span>
              <span className="date-value">{formatDate(activity.completedAt)}</span>
            </div>
          )}
          {activity.lastActiveAt && status === 'in_progress' && (
            <div className="date-item">
              <span className="date-label">Last Active:</span>
              <span className="date-value">{formatDate(activity.lastActiveAt)}</span>
            </div>
          )}
        </div>

        {/* Certificate link for completed courses */}
        {status === 'completed' && activity.certificateUrl && (
          <div className="certificate-section">
            <a 
              href={activity.certificateUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="certificate-link"
            >
              🏆 View Certificate
            </a>
          </div>
        )}

        {/* Expiry info for completed certifications */}
        {status === 'completed' && activity.expiryDate && (
          <div className="expiry-section">
            {(() => {
              const expiryInfo = getExpiryInfo(activity.expiryDate);
              return (
                <div className={`expiry-info ${expiryInfo.status}`}>
                  <span className="expiry-text">{expiryInfo.text}</span>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

// Staff Member Card Component
const StaffMemberCard = ({ user, isExpanded, onToggle }) => {
  const completed = user.completed?.length || 0;
  const inProgress = user.inProgress?.length || 0;
  const enrolled = user.enrollments?.length || 0;
  const completionRate = user.completionRate || 0;

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
          <h3 className="staff-name">{user.name}</h3>
          <p className="staff-email">{user.email}</p>
          <div className="learning-progress">
            <ProgressBar progress={completionRate} height={6} showText={false} />
            <div className="progress-text">{completionRate}% complete</div>
          </div>
        </div>
        <div className="staff-stats">
          <div className="learning-badges">
            <StatusBadge status="Completed" count={completed} />
            <StatusBadge status="In Progress" count={inProgress} />
            {enrolled > 0 && <StatusBadge status="Enrolled" count={enrolled} />}
          </div>
          <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded ? '▼' : '▶'}
          </span>
        </div>
      </div>
      
      {isExpanded && (
        <div className="staff-details">
          {user.error ? (
            <div className="staff-error">
              <p>❌ Error loading learning data: {user.error}</p>
            </div>
          ) : (
            <>
              {/* Completed Courses */}
              {user.completed && user.completed.length > 0 && (
                <div className="learning-section">
                  <h4>✅ Completed Courses ({user.completed.length})</h4>
                  <div className="courses-grid">
                    {user.completed.map((course, index) => (
                      <LearningActivityCard 
                        key={`completed-${index}`} 
                        activity={course} 
                        user={user}
                        status="completed"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* In Progress Courses */}
              {user.inProgress && user.inProgress.length > 0 && (
                <div className="learning-section">
                  <h4>⏳ In Progress ({user.inProgress.length})</h4>
                  <div className="courses-grid">
                    {user.inProgress.map((course, index) => (
                      <LearningActivityCard 
                        key={`progress-${index}`} 
                        activity={course} 
                        user={user}
                        status="in_progress"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Enrolled Courses */}
              {user.enrollments && user.enrollments.length > 0 && (
                <div className="learning-section">
                  <h4>📚 Enrolled Courses ({user.enrollments.length})</h4>
                  <div className="courses-grid">
                    {user.enrollments.map((course, index) => (
                      <LearningActivityCard 
                        key={`enrolled-${index}`} 
                        activity={course} 
                        user={user}
                        status="enrolled"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* No Learning Activity */}
              {user.totalCourses === 0 && (
                <div className="no-training">
                  <p>No learning activity found</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const CustomerDashboard = ({ company, companyId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupData, setGroupData] = useState(null);
  const [users, setUsers] = useState([]);
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  const [showUrlGenerator, setShowUrlGenerator] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cacheStats, setCacheStats] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  
  // Progress tracking
  const [progressStatus, setProgressStatus] = useState('');
  const [progressDetail, setProgressDetail] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);

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

  const fetchGroupUsers = useCallback(async () => {
    // Don't load data if no company identifier is provided
    if (!company && !companyId) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      setCurrentStep(0);
      setTotalSteps(3);
      
      const identifier = companyId || company;
      const isId = !!companyId;
      
      console.log(`🏢 Starting customer analysis for: ${identifier} (${isId ? 'ID' : 'Name'})`);
      
      // Step 1: Find the group by name or ID
      setCurrentStep(1);
      setProgressStatus('Searching for company...');
      setProgressDetail(`Looking for "${identifier}" in Northpass`);
      console.log('📋 Searching for company...');
      
      const group = await northpassApi.findGroup(identifier, isId);
      
      if (!group) {
        throw new Error(`Company "${identifier}" not found`);
      }
      
      console.log(`✅ Found company: ${group.attributes.name} (ID: ${group.id})`);
      setGroupData(group);
      
      // Step 2: Get all users in the group
      setCurrentStep(2);
      setProgressStatus('Loading staff members...');
      setProgressDetail('Fetching user list from company...');
      console.log('👥 Fetching staff members...');
      
      const groupUsers = await northpassApi.getGroupUsers(group.id);
      console.log(`📊 Found ${groupUsers.length} staff members`);
      
      setTotalSteps(4);
      setProgressDetail(`Found ${groupUsers.length} staff members - analyzing training records...`);
      
      // Step 3: Process all users' certifications in parallel
      setCurrentStep(3);
      setProgressStatus('Analyzing training records...');
      setProgressDetail('Processing staff training in parallel...');
      
      const processedUsers = await northpassApi.processUsersForCustomerDashboard(
        groupUsers, 
        (currentUser, totalUsers, user) => {
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
          
          const progress = Math.round((currentUser / totalUsers) * 100);
          setProgressDetail(`Processing ${displayName} (${currentUser}/${totalUsers} - ${progress}%)`);
        }
      );
      
      // Calculate comprehensive learning statistics
      let totalEnrollments = 0;
      let totalInProgress = 0;
      let totalCompleted = 0;
      let totalCourses = 0;
      let totalProgressSum = 0;
      let usersWithActivity = 0;
      
      // Category breakdown
      const categoryStats = {
        'Nintex CE': { enrolled: 0, inProgress: 0, completed: 0 },
        'Nintex K2': { enrolled: 0, inProgress: 0, completed: 0 },
        'Nintex for Salesforce': { enrolled: 0, inProgress: 0, completed: 0 },
        'Other': { enrolled: 0, inProgress: 0, completed: 0 }
      };
      
      processedUsers.forEach(user => {
        totalEnrollments += user.enrollments?.length || 0;
        totalInProgress += user.inProgress?.length || 0;
        totalCompleted += user.completed?.length || 0;
        totalCourses += user.totalCourses || 0;
        totalProgressSum += user.averageProgress || 0;
        
        if (user.totalCourses > 0) {
          usersWithActivity++;
        }
        
        // Count by category
        [...(user.enrollments || []), ...(user.inProgress || []), ...(user.completed || [])].forEach(activity => {
          const category = activity.category || 'Other';
          if (categoryStats[category]) {
            if (activity.status === 'completed') {
              categoryStats[category].completed++;
            } else if (activity.status === 'in_progress' || activity.progress > 0) {
              categoryStats[category].inProgress++;
            } else {
              categoryStats[category].enrolled++;
            }
          }
        });
      });
      
      const learningStats = {
        totalStaff: processedUsers.length,
        activeStaff: usersWithActivity,
        totalEnrollments,
        totalInProgress, 
        totalCompleted,
        totalCourses,
        overallCompletionRate: totalCourses > 0 ? Math.round((totalCompleted / totalCourses) * 100) : 0,
        averageProgressPerUser: usersWithActivity > 0 ? Math.round(totalProgressSum / usersWithActivity) : 0,
        categoryStats
      };
      
      // Final step: Complete analysis
      setCurrentStep(4);
      setProgressStatus('Analysis complete!');
      setProgressDetail(`Processed ${processedUsers.length} staff members`);
      
      setUsers(processedUsers);
      // Store summary stats for rendering
      setDashboardStats(learningStats);
      
      console.log(`🎯 Customer Dashboard Summary:`);
      console.log(`   Company: ${group.attributes.name}`);
      console.log(`   Total Staff: ${learningStats.totalStaff}`);
      console.log(`   Active Staff: ${learningStats.activeStaff}`);
      console.log(`   Total Courses: ${learningStats.totalCourses}`);
      console.log(`   Completed: ${learningStats.totalCompleted}`);
      console.log(`   In Progress: ${learningStats.totalInProgress}`);
      console.log(`   Completion Rate: ${learningStats.overallCompletionRate}%`);
      
    } catch (err) {
      console.error('❌ Customer dashboard error:', err);
      setError(err.message);
      setProgressStatus('Error occurred');
      setProgressDetail(err.message);
    } finally {
      setLoading(false);
    }
  }, [company, companyId]);

  useEffect(() => {
    fetchGroupUsers();
    // Load initial cache stats
    setCacheStats(northpassApi.getCacheStats());
  }, [fetchGroupUsers]);

  const toggleUserExpansion = (userId) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedUsers(newExpanded);
  };

  // Calculate summary stats
  // Summary stats are now provided in dashboardStats from the data loading process

  // Show welcome screen when no parameters are provided
  if (!company && !companyId) {
    return (
      <div className="customer-dashboard">
        <div className="dashboard-header">
          <h2>🎓 Customer Training Dashboard</h2>
          <div className="tier-badge tier-info">Ready</div>
        </div>
        <div className="welcome-state">
          <div className="welcome-icon">📚</div>
          <h3>Welcome to Customer Training Management</h3>
          
          {!showUrlGenerator ? (
            <>
              <p>Generate secure URLs to access staff training dashboards:</p>
              <div className="welcome-actions">
                <NintexButton
                  variant="primary"
                  size="large"
                  onClick={() => setShowUrlGenerator(true)}
                  leftIcon="🔗"
                >
                  Generate Customer URL
                </NintexButton>
              </div>
              
              <div className="features-list">
                <h4>Features:</h4>
                <ul>
                  <li>📊 Staff training overview</li>
                  <li>🎓 Certification tracking</li>
                  <li>📅 Expiry monitoring</li>
                  <li>👥 Individual staff records</li>
                  <li>🔒 Secure company URLs</li>
                </ul>
              </div>
              
              <div className="manual-params">
                <details>
                  <summary>💡 Manual URL Parameters (Legacy)</summary>
                  <div className="url-examples">
                    <h4>Required Parameters:</h4>
                    <ul>
                      <li><code>company</code> - Company name (exact match)</li>
                      <li><code>companyId</code> - Company ID for direct lookup</li>
                    </ul>
                    <h4>Example URLs:</h4>
                    <div className="example-url">
                      <code>/customer?company=Premier Tech</code>
                    </div>
                    <div className="example-url">
                      <code>/customer?companyId=pt-001</code>
                    </div>
                  </div>
                </details>
              </div>
            </>
          ) : (
            <>
              <div className="back-action">
                <NintexButton
                  variant="secondary"
                  size="medium"
                  onClick={() => setShowUrlGenerator(false)}
                  leftIcon="←"
                >
                  Back to Welcome
                </NintexButton>
              </div>
              <CustomerUrlGenerator />
            </>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="customer-dashboard">
        <div className="dashboard-header">
          <h2>🎓 Customer Training Dashboard</h2>
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
      <div className="customer-dashboard">
        <div className="dashboard-header">
          <h2>🎓 Customer Training Dashboard</h2>
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

  // Training rate calculation removed - using dashboardStats now

  return (
    <div className="customer-dashboard">
      <div className="dashboard-header">
        <div className="company-info">
          <h2>🎓 {groupData?.attributes.name || company}</h2>
          <p className="company-subtitle">Staff Training Dashboard</p>
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
          <div className="tier-badge tier-customer">
            Customer
          </div>
        </div>
      </div>

      <div className="training-stats">
        <div className="stat-card">
          <div className="stat-number">{dashboardStats?.totalStaff || 0}</div>
          <div className="stat-label">Total Staff</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{dashboardStats?.activeStaff || 0}</div>
          <div className="stat-label">Active Learners</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{dashboardStats?.totalCourses || 0}</div>
          <div className="stat-label">Total Enrollments</div>
        </div>
        <div className="stat-card success">
          <div className="stat-number">{dashboardStats?.totalCompleted || 0}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-number">{dashboardStats?.totalInProgress || 0}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{dashboardStats?.overallCompletionRate || 0}%</div>
          <div className="stat-label">Completion Rate</div>
        </div>
      </div>

      {/* Learning Progress Charts */}
      {dashboardStats && (
        <div className="charts-section">
          <div className="chart-row">
            <div className="chart-card">
              <h3>Learning Progress Overview</h3>
              <div className="progress-overview">
                <div className="progress-ring-container">
                  <ProgressRing progress={dashboardStats.overallCompletionRate} size={100} />
                  <div className="progress-stats">
                    <div><StatusBadge status="Completed" count={dashboardStats.totalCompleted} /></div>
                    <div><StatusBadge status="In Progress" count={dashboardStats.totalInProgress} /></div>
                    <div><StatusBadge status="Enrolled" count={dashboardStats.totalEnrollments} /></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="chart-card">
              <h3>Learning by Category</h3>
              <DonutChart 
                data={[
                  { label: 'Nintex CE', value: dashboardStats.categoryStats['Nintex CE'].completed + dashboardStats.categoryStats['Nintex CE'].inProgress + dashboardStats.categoryStats['Nintex CE'].enrolled },
                  { label: 'Nintex K2', value: dashboardStats.categoryStats['Nintex K2'].completed + dashboardStats.categoryStats['Nintex K2'].inProgress + dashboardStats.categoryStats['Nintex K2'].enrolled },
                  { label: 'Salesforce', value: dashboardStats.categoryStats['Nintex for Salesforce'].completed + dashboardStats.categoryStats['Nintex for Salesforce'].inProgress + dashboardStats.categoryStats['Nintex for Salesforce'].enrolled },
                  { label: 'Other', value: dashboardStats.categoryStats['Other'].completed + dashboardStats.categoryStats['Other'].inProgress + dashboardStats.categoryStats['Other'].enrolled }
                ].filter(d => d.value > 0)}
                size={140}
              />
            </div>
            
            <div className="chart-card">
              <h3>Completion by Category</h3>
              <SimpleBarChart 
                data={[
                  { label: 'CE', value: dashboardStats.categoryStats['Nintex CE'].completed },
                  { label: 'K2', value: dashboardStats.categoryStats['Nintex K2'].completed },
                  { label: 'SF', value: dashboardStats.categoryStats['Nintex for Salesforce'].completed },
                  { label: 'Other', value: dashboardStats.categoryStats['Other'].completed }
                ].filter(d => d.value > 0)}
                width={200}
                height={120}
              />
            </div>
          </div>
        </div>
      )}

      {/* Alerts section removed - customer dashboard focuses on learning progress */}

      <div className="staff-list">
        <h3>👥 Staff Training Records</h3>
        {users.map(user => (
          <StaffMemberCard
            key={user.id}
            user={user}
            isExpanded={expandedUsers.has(user.id)}
            onToggle={() => toggleUserExpansion(user.id)}
          />
        ))}
      </div>

      <div className="dashboard-footer">
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

export default CustomerDashboard;