import { useState, useEffect, useCallback } from 'react';
import './SyncDashboard.css';

/**
 * SyncDashboard Component
 * Consolidated LMS Sync Dashboard for all Northpass synchronization
 * Features:
 * - Quick Sync: Users, Groups, Courses (reference data)
 * - Enrollment Sync: Incremental and Full
 * - Scheduled Tasks: Database-backed task scheduler
 * - Sync History: Detailed batch sync log
 */

// Helper function to safely parse JSON response
// Returns { ok, data, error } where ok indicates if parsing succeeded
const safeJsonParse = async (response) => {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return { ok: true, data };
  } catch {
    // Response was not valid JSON (likely HTML error page)
    console.error('Invalid JSON response:', text.substring(0, 100));
    return { ok: false, error: 'Server returned invalid response', data: null };
  }
};

function SyncDashboard() {
  // Sync state
  const [syncStats, setSyncStats] = useState(null);
  const [syncHistory, setSyncHistory] = useState([]);
  const [currentSync, setCurrentSync] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  
  // Quick sync state
  const [quickSyncing, setQuickSyncing] = useState(null); // 'users' | 'groups' | 'courses' | null
  const [quickSyncResult, setQuickSyncResult] = useState(null);
  
  // Scheduled Tasks state
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [taskHistory, setTaskHistory] = useState({});
  const [editingInterval, setEditingInterval] = useState(null); // task_type being edited
  const [newInterval, setNewInterval] = useState('');
  
  
  // UI state
  const [expandedLog, setExpandedLog] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'scheduled' | 'history'

  // Object mapping (static display of what we sync)
  const objectMapping = [
    { id: 'users', name: 'LMS Users', icon: '👥', direction: 'inbound', enabled: true, description: 'Partner users from Northpass LMS' },
    { id: 'groups', name: 'LMS Groups', icon: '🏢', direction: 'inbound', enabled: true, description: 'Partner groups and memberships' },
    { id: 'courses', name: 'Courses', icon: '📚', direction: 'inbound', enabled: true, description: 'Course catalog with NPCU values' },
    { id: 'enrollments', name: 'Enrollments', icon: '📊', direction: 'inbound', enabled: true, description: 'User progress and completions' },
    { id: 'contacts', name: 'CRM Contacts', icon: '📇', direction: 'outbound', enabled: true, description: 'Link CRM contacts to LMS users' }
  ];

  // Fetch sync statistics
  const fetchSyncStats = useCallback(async () => {
    try {
      const response = await fetch('/api/db/sync/stats');
      if (response.ok) {
        const data = await response.json();
        setSyncStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch sync stats:', err);
    }
  }, []);

  // Fetch sync history (unified from both sources)
  const fetchSyncHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/db/sync/unified-history?limit=30');
      if (response.ok) {
        const data = await response.json();
        setSyncHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch sync history:', err);
    }
  }, []);

  // Fetch current sync status
  const fetchCurrentSync = useCallback(async () => {
    try {
      const response = await fetch('/api/db/sync/status');
      if (response.ok) {
        const data = await response.json();
        setCurrentSync(data.currentSync);
      }
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    }
  }, []);


  // Fetch scheduled tasks from taskScheduler
  const fetchScheduledTasks = useCallback(async () => {
    try {
      const response = await fetch('/api/db/tasks');
      if (response.ok) {
        const data = await response.json();
        setScheduledTasks(data.tasks || []);
        setSchedulerStatus(data.status || null);
      }
    } catch (err) {
      console.error('Failed to fetch scheduled tasks:', err);
    }
  }, []);

  // Fetch task history for a specific task
  const fetchTaskHistory = async (taskType) => {
    try {
      const response = await fetch(`/api/db/tasks/${taskType}/history?limit=5`);
      if (response.ok) {
        const data = await response.json();
        setTaskHistory(prev => ({ ...prev, [taskType]: data }));
      }
    } catch (err) {
      console.error(`Failed to fetch history for ${taskType}:`, err);
    }
  };

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchSyncStats(),
      fetchSyncHistory(),
      fetchCurrentSync(),
      fetchScheduledTasks()
    ]);
    setLoading(false);
  }, [fetchSyncStats, fetchSyncHistory, fetchCurrentSync, fetchScheduledTasks]);

  // Initial load and auto-refresh
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  // Separate effect for auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;
    
    const refreshRate = currentSync?.status === 'running' || quickSyncing ? 2000 : 10000;
    const interval = setInterval(() => {
      fetchSyncStats();
      fetchSyncHistory();
      fetchCurrentSync();
      if (activeTab === 'scheduled') {
        fetchScheduledTasks();
      }
    }, refreshRate);
    
    return () => clearInterval(interval);
  }, [autoRefresh, currentSync?.status, quickSyncing, activeTab, fetchSyncStats, fetchSyncHistory, fetchCurrentSync, fetchScheduledTasks]);

  // Clear messages after timeout
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);


  // Quick Sync for reference data (users, groups, courses)
  const startQuickSync = async (type) => {
    if (quickSyncing || currentSync?.status === 'running') {
      setError('A sync is already in progress');
      return;
    }
    
    setQuickSyncing(type);
    setQuickSyncResult(null);
    setError(null);
    
    try {
      const response = await fetch(`/api/db/sync/${type}`, { method: 'POST' });
      const { ok: parseOk, data, error: parseError } = await safeJsonParse(response);
      
      if (!parseOk) {
        throw new Error(parseError);
      }
      
      if (response.ok) {
        // Sync started successfully - now poll for completion
        setSuccessMessage(`${type.charAt(0).toUpperCase() + type.slice(1)} sync started...`);
        
        // Poll for sync completion
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch('/api/db/sync/status');
            const statusData = await statusRes.json();
            
            if (!statusData.currentSync || statusData.currentSync.type !== type) {
              // Sync completed
              clearInterval(pollInterval);
              setQuickSyncing(null);
              setSuccessMessage(`${type.charAt(0).toUpperCase() + type.slice(1)} sync completed!`);
              setQuickSyncResult({
                success: true,
                type,
                message: 'Sync completed'
              });
              // Reload stats and history after sync
              await fetchSyncStats();
              await fetchSyncHistory();
            }
          } catch {
            // Ignore poll errors
          }
        }, 2000);
        
        // Safety timeout after 5 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          if (quickSyncing === type) {
            setQuickSyncing(null);
            setSuccessMessage(`${type.charAt(0).toUpperCase() + type.slice(1)} sync is still running in background`);
          }
        }, 300000);
        
        return; // Don't set quickSyncing to null yet
      } else {
        setQuickSyncResult({
          success: false,
          type,
          error: data.error || 'Sync failed'
        });
        setError(data.error || `${type} sync failed`);
        setQuickSyncing(null);
      }
    } catch (err) {
      setQuickSyncResult({
        success: false,
        type,
        error: err.message
      });
      setError(err.message);
      setQuickSyncing(null);
    }
  };

  // Start enrollment sync
  const startEnrollmentSync = async (type) => {
    if (currentSync?.status === 'running' || quickSyncing) {
      setError('A sync is already in progress');
      return;
    }
    
    setError(null);
    
    try {
      const endpoint = type === 'incremental' 
        ? '/api/db/sync/incremental' 
        : '/api/db/sync/full-enrollments';
      
      const response = await fetch(endpoint, { method: 'POST' });
      const { ok: parseOk, data, error: parseError } = await safeJsonParse(response);
      
      if (!parseOk) {
        throw new Error(parseError);
      }
      
      if (response.ok) {
        setCurrentSync(data.sync);
        setTimeout(fetchCurrentSync, 1000);
      } else {
        setError(data.error || 'Failed to start sync');
      }
    } catch (err) {
      setError(err.message || 'Failed to start sync');
    }
  };

  // Toggle scheduled task enabled/disabled
  const toggleTask = async (taskType, enabled) => {
    try {
      const response = await fetch(`/api/db/tasks/${taskType}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      
      if (response.ok) {
        setSuccessMessage(`Task ${enabled ? 'enabled' : 'disabled'}`);
        fetchScheduledTasks();
      } else {
        const { ok: parseOk, data } = await safeJsonParse(response);
        if (parseOk) {
          setError(data.error || 'Failed to toggle task');
        } else {
          setError('Failed to toggle task');
        }
      }
    } catch {
      setError('Failed to toggle task');
    }
  };

  // Save task interval
  const saveInterval = async (taskType) => {
    const minutes = parseInt(newInterval, 10);
    if (isNaN(minutes) || minutes < 1 || minutes > 1440) {
      setError('Interval must be between 1 and 1440 minutes');
      return;
    }
    
    try {
      const response = await fetch(`/api/db/tasks/${taskType}/interval`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: minutes })
      });
      
      if (response.ok) {
        setSuccessMessage(`Interval updated to ${minutes} minutes`);
        setEditingInterval(null);
        fetchScheduledTasks();
      } else {
        const { ok: parseOk, data } = await safeJsonParse(response);
        if (parseOk) {
          setError(data.error || 'Failed to update interval');
        } else {
          setError('Failed to update interval');
        }
      }
    } catch {
      setError('Failed to update interval');
    }
  };

  // Manually trigger a scheduled task
  const triggerTask = async (taskType) => {
    try {
      setError(null);
      const response = await fetch(`/api/db/tasks/${taskType}/run`, { method: 'POST' });
      const { ok: parseOk, data, error: parseError } = await safeJsonParse(response);
      
      if (!parseOk) {
        throw new Error(parseError);
      }
      
      if (response.ok) {
        setSuccessMessage(`Task "${taskType}" started`);
        fetchScheduledTasks();
      } else {
        setError(data.error || 'Failed to trigger task');
      }
    } catch (err) {
      setError(err.message || 'Failed to trigger task');
    }
  };

  // Cancel/Reset sync
  const resetSync = async () => {
    try {
      const response = await fetch('/api/db/sync/reset', { method: 'POST' });
      const { ok: parseOk, data, error: parseError } = await safeJsonParse(response);
      
      if (!parseOk) {
        throw new Error(parseError);
      }
      
      if (response.ok) {
        setCurrentSync(null);
        setError(null);
        setSuccessMessage('Sync lock cleared');
        fetchSyncHistory();
      } else {
        setError(data.error || 'Failed to reset sync');
      }
    } catch (err) {
      setError(err.message || 'Failed to reset sync');
    }
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Get status badge class
  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed': case 'success': return 'badge-success';
      case 'running': return 'badge-info';
      case 'failed': return 'badge-error';
      default: return 'badge-default';
    }
  };

  // Get task icon
  const getTaskIcon = (taskType) => {
    switch (taskType) {
      case 'lms_sync': return '🔄';
      case 'group_analysis': return '🔍';
      case 'group_members_sync': return '👥';
      case 'cleanup': return '🧹';
      default: return '📋';
    }
  };

  // Get task display name
  const getTaskDisplayName = (taskType) => {
    switch (taskType) {
      case 'lms_sync': return 'LMS Data Sync';
      case 'group_analysis': return 'Group Analysis';
      case 'group_members_sync': return 'Group Members Sync';
      case 'cleanup': return 'Database Cleanup';
      default: return taskType;
    }
  };

  // Format runtime duration from startedAt timestamp
  const formatRuntime = (startedAt) => {
    if (!startedAt) return '-';
    const start = new Date(startedAt);
    const now = new Date();
    const seconds = Math.floor((now - start) / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  // Format sync summary for readability
  const formatSyncSummary = (details) => {
    if (!details) return null;
    
    // Try to parse if it's a string
    let data = details;
    if (typeof details === 'string') {
      try {
        data = JSON.parse(details);
      } catch {
        // If it's not valid JSON, just return the string
        return <span className="summary-text">{details}</span>;
      }
    }
    
    // Handle null or non-object
    if (!data || typeof data !== 'object') {
      return <span className="summary-text">{String(data)}</span>;
    }
    
    // Extract key metrics
    const metrics = [];
    if (data.totalGroups !== undefined) metrics.push({ label: 'Total Groups', value: data.totalGroups });
    if (data.groupsWithPotential !== undefined) metrics.push({ label: 'Groups with Potential', value: data.groupsWithPotential });
    if (data.totalPotentialUsers !== undefined) metrics.push({ label: 'Potential Users', value: data.totalPotentialUsers });
    if (data.groupsPendingSync !== undefined) metrics.push({ label: 'Pending Sync', value: data.groupsPendingSync, highlight: data.groupsPendingSync > 0 });
    if (data.errors !== undefined) metrics.push({ label: 'Errors', value: data.errors, error: data.errors > 0 });
    if (data.usersProcessed !== undefined) metrics.push({ label: 'Users Processed', value: data.usersProcessed });
    if (data.groupsProcessed !== undefined) metrics.push({ label: 'Groups Processed', value: data.groupsProcessed });
    if (data.membersAdded !== undefined) metrics.push({ label: 'Members Added', value: data.membersAdded });
    if (data.membersRemoved !== undefined) metrics.push({ label: 'Members Removed', value: data.membersRemoved });
    
    // If we found structured metrics, display them nicely
    if (metrics.length > 0) {
      return (
        <div className="summary-metrics">
          {metrics.map((m, i) => (
            <div key={i} className={`summary-metric ${m.highlight ? 'highlight' : ''} ${m.error ? 'error' : ''}`}>
              <span className="metric-value">{typeof m.value === 'number' ? m.value.toLocaleString() : m.value}</span>
              <span className="metric-label">{m.label}</span>
            </div>
          ))}
          {/* Show group details if available */}
          {data.details && Array.isArray(data.details) && data.details.length > 0 && (
            <details className="summary-groups">
              <summary>{data.details.length} groups with pending sync</summary>
              <div className="groups-list">
                {data.details.slice(0, 20).map((g, i) => (
                  <div key={i} className="group-item">
                    <span className="group-name">{g.groupName}</span>
                    <span className={`group-tier tier-${(g.partnerTier || 'unknown').toLowerCase()}`}>{g.partnerTier || 'Unknown'}</span>
                    <span className="group-stats">
                      {g.memberCount} members, {g.pendingSync} pending
                    </span>
                  </div>
                ))}
                {data.details.length > 20 && (
                  <div className="more-groups">...and {data.details.length - 20} more groups</div>
                )}
              </div>
            </details>
          )}
        </div>
      );
    }
    
    // Fallback: show formatted JSON
    return <pre className="summary-json">{JSON.stringify(data, null, 2)}</pre>;
  };

  if (loading) {
    return (
      <div className="sync-dashboard">
        <div className="loading-state">
          <div className="ntx-spinner"></div>
          <span>Loading sync dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="sync-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>🔄 LMS Sync Dashboard</h1>
          <span className="subtitle">Northpass Integration - All Sync Operations</span>
        </div>
        <div className="header-right">
          <label className="auto-refresh-toggle">
            <input 
              type="checkbox" 
              checked={autoRefresh} 
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh</span>
          </label>
          <button className="btn-refresh" onClick={loadData}>
            🔄 Refresh
          </button>
        </div>
      </header>

      {/* Active Tasks Banner - Real-time progress */}
      {schedulerStatus?.activeTasks?.length > 0 && (
        <div className="active-tasks-banner">
          <div className="banner-header">
            <span className="banner-icon">⚡</span>
            <span className="banner-title">Tasks Running ({schedulerStatus.activeTasks.length})</span>
          </div>
          <div className="active-tasks-list">
            {schedulerStatus.activeTasks.map((task, idx) => (
              <div key={idx} className="active-task-item">
                <span className="task-type-icon">{getTaskIcon(task.type)}</span>
                <div className="task-info">
                  <div className="task-name">{getTaskDisplayName(task.type)}</div>
                  {task.progress ? (
                    <div className="task-progress">
                      <div className="progress-stage">{task.progress.stage}</div>
                      {task.progress.total > 0 && (
                        <>
                          <div className="progress-bar-container">
                            <div 
                              className="progress-bar-fill" 
                              style={{ width: `${Math.round((task.progress.current / task.progress.total) * 100)}%` }}
                            ></div>
                          </div>
                          <span className="progress-numbers">
                            {task.progress.current.toLocaleString()}/{task.progress.total.toLocaleString()}
                          </span>
                        </>
                      )}
                      {task.progress.details && (
                        <span className="progress-details">{task.progress.details}</span>
                      )}
                    </div>
                  ) : (
                    <div className="task-progress">
                      <div className="progress-stage">Starting...</div>
                    </div>
                  )}
                </div>
                <div className="task-duration">
                  {formatRuntime(task.startedAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="tab-nav">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button 
          className={`tab-btn ${activeTab === 'scheduled' ? 'active' : ''}`}
          onClick={() => { setActiveTab('scheduled'); fetchScheduledTasks(); }}
        >
          ⏰ Scheduled Tasks
        </button>
        <button 
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📜 Sync History
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {successMessage && (
        <div className="success-banner">
          <span>✓ {successMessage}</span>
          <button onClick={() => setSuccessMessage(null)}>✕</button>
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Quick Sync Row */}
          <div className="dashboard-row quick-sync-row">
            <div className="panel quick-sync-panel">
              <div className="panel-header">
                <h2>⚡ Quick Sync - Reference Data</h2>
                <small>Sync users, groups, and courses from Northpass</small>
              </div>
              
              <div className="quick-sync-buttons">
                <button 
                  className={`quick-sync-btn ${quickSyncing === 'users' ? 'syncing' : ''}`}
                  onClick={() => startQuickSync('users')}
                  disabled={quickSyncing || currentSync?.status === 'running'}
                >
                  <span className="btn-icon">👥</span>
                  <span className="btn-content">
                    <strong>Sync Users</strong>
                    <small>{syncStats?.counts?.users?.toLocaleString() || 0} in database</small>
                  </span>
                  {quickSyncing === 'users' && <span className="ntx-spinner small"></span>}
                </button>
                
                <button 
                  className={`quick-sync-btn ${quickSyncing === 'groups' ? 'syncing' : ''}`}
                  onClick={() => startQuickSync('groups')}
                  disabled={quickSyncing || currentSync?.status === 'running'}
                >
                  <span className="btn-icon">🏢</span>
                  <span className="btn-content">
                    <strong>Sync Groups</strong>
                    <small>{syncStats?.counts?.groups?.toLocaleString() || 0} in database</small>
                  </span>
                  {quickSyncing === 'groups' && <span className="ntx-spinner small"></span>}
                </button>
                
                <button 
                  className={`quick-sync-btn ${quickSyncing === 'courses' ? 'syncing' : ''}`}
                  onClick={() => startQuickSync('courses')}
                  disabled={quickSyncing || currentSync?.status === 'running'}
                >
                  <span className="btn-icon">📚</span>
                  <span className="btn-content">
                    <strong>Sync Courses</strong>
                    <small>{syncStats?.counts?.courses?.toLocaleString() || 0} in database</small>
                  </span>
                  {quickSyncing === 'courses' && <span className="ntx-spinner small"></span>}
                </button>

                <button 
                  className={`quick-sync-btn ${quickSyncing === 'course-properties' ? 'syncing' : ''}`}
                  onClick={() => startQuickSync('course-properties')}
                  disabled={quickSyncing || currentSync?.status === 'running'}
                >
                  <span className="btn-icon">🎓</span>
                  <span className="btn-content">
                    <strong>Sync NPCU</strong>
                    <small>Course properties</small>
                  </span>
                  {quickSyncing === 'course-properties' && <span className="ntx-spinner small"></span>}
                </button>
              </div>

              {quickSyncResult && (
                <div className={`quick-sync-result ${quickSyncResult.success ? 'success' : 'error'}`}>
                  {quickSyncResult.success ? (
                    <>✓ {quickSyncResult.type} sync: {quickSyncResult.total || quickSyncResult.synced || 0} records</>
                  ) : (
                    <>✕ {quickSyncResult.error}</>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Status Row: Sync Status + Enrollment Actions */}
          <div className="dashboard-row status-row">
            {/* Sync Status Panel */}
            <div className="panel sync-status-panel">
              <div className="panel-header">
                <h2>Enrollment Sync Status</h2>
                <div className={`status-indicator ${currentSync?.status === 'running' ? 'active' : 'idle'}`}>
                  {currentSync?.status === 'running' ? '● Syncing' : '○ Idle'}
                </div>
              </div>
              
              <div className="status-content">
                {currentSync?.status === 'running' && (
                  <div className="current-sync">
                    <div className="sync-header">
                      <div className="sync-type">{currentSync.type}</div>
                      <button className="btn-cancel" onClick={resetSync} title="Stop and clear sync">
                        ✕ Cancel
                      </button>
                    </div>
                    <div className="sync-progress">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill"
                          style={{ 
                            width: currentSync.progress?.total > 0
                              ? `${(currentSync.progress.current / currentSync.progress.total) * 100}%`
                              : '100%'
                          }}
                        />
                      </div>
                      <span className="progress-text">
                        {currentSync.progress?.stage || 'Processing'} 
                        {currentSync.progress?.total > 0 && ` (${currentSync.progress.current}/${currentSync.progress.total})`}
                      </span>
                    </div>
                    <div className="sync-started">Started: {formatDate(currentSync.startedAt)}</div>
                  </div>
                )}

                {currentSync && currentSync.status !== 'running' && (
                  <div className="current-sync stuck">
                    <div className="sync-header">
                      <div className="sync-type">{currentSync.type} - {currentSync.status}</div>
                      <button className="btn-clear" onClick={resetSync} title="Clear stuck sync">
                        🗑️ Clear
                      </button>
                    </div>
                    {currentSync.error && <div className="sync-error">Error: {currentSync.error}</div>}
                  </div>
                )}
                
                <div className="last-sync-info">
                  <div className="info-row">
                    <span className="label">Last Sync:</span>
                    <span className="value">{formatDate(syncStats?.lastSync?.completed_at)}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Last Status:</span>
                    <span className={`value badge ${getStatusBadge(syncStats?.lastSync?.status)}`}>
                      {syncStats?.lastSync?.status || 'Never'}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="label">Records Synced:</span>
                    <span className="value">{syncStats?.lastSync?.records_processed?.toLocaleString() || 0}</span>
                  </div>
                </div>

                {syncStats?.estimatedSavingsPercent > 0 && (
                  <div className="savings-indicator">
                    <span className="savings-icon">⚡</span>
                    <span className="savings-text">
                      Incremental sync can skip ~{syncStats.potentialSavings} inactive users
                      ({syncStats.estimatedSavingsPercent}% savings)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Enrollment Actions Panel */}
            <div className="panel quick-actions-panel">
              <div className="panel-header">
                <h2>📊 Enrollment Sync</h2>
              </div>
              
              <div className="actions-content">
                <button 
                  className="action-btn primary"
                  onClick={() => startEnrollmentSync('incremental')}
                  disabled={currentSync?.status === 'running' || quickSyncing}
                >
                  <span className="action-icon">⚡</span>
                  <span className="action-text">
                    <strong>Incremental Sync</strong>
                    <small>Only active users (faster)</small>
                  </span>
                </button>
                
                <button 
                  className="action-btn secondary"
                  onClick={() => startEnrollmentSync('full')}
                  disabled={currentSync?.status === 'running' || quickSyncing}
                >
                  <span className="action-icon">🔄</span>
                  <span className="action-text">
                    <strong>Full Sync</strong>
                    <small>All users (comprehensive)</small>
                  </span>
                </button>
              </div>

              <div className="activity-stats">
                <h3>User Activity</h3>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-value">{syncStats?.userActivity?.total?.toLocaleString() || 0}</span>
                    <span className="stat-label">Total Users</span>
                  </div>
                  <div className="stat-item highlight">
                    <span className="stat-value">{syncStats?.userActivity?.active_24h?.toLocaleString() || 0}</span>
                    <span className="stat-label">Active 24h</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{syncStats?.userActivity?.active_7d?.toLocaleString() || 0}</span>
                    <span className="stat-label">Active 7d</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{syncStats?.userActivity?.active_30d?.toLocaleString() || 0}</span>
                    <span className="stat-label">Active 30d</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Object Mapping Row */}
          <div className="dashboard-row config-row">
            <div className="panel object-mapping-panel full-width">
              <div className="panel-header">
                <h2>📋 Object Mapping</h2>
              </div>
              
              <div className="mapping-content">
                <table className="mapping-table">
                  <thead>
                    <tr>
                      <th>Object</th>
                      <th>Direction</th>
                      <th>Status</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objectMapping.map(obj => (
                      <tr key={obj.id}>
                        <td className="object-name">
                          <span className="object-icon">{obj.icon}</span>
                          <span className="object-label">
                            <strong>{obj.name}</strong>
                            <small>{obj.description}</small>
                          </span>
                        </td>
                        <td className="object-direction">
                          <span className={`direction-badge ${obj.direction}`}>
                            {obj.direction === 'inbound' ? '📥 Inbound' : '📤 Outbound'}
                          </span>
                        </td>
                        <td className="object-status">
                          <span className={`status-badge ${obj.enabled ? 'enabled' : 'disabled'}`}>
                            {obj.enabled ? '✓ Active' : '○ Disabled'}
                          </span>
                        </td>
                        <td className="object-count">
                          {syncStats?.counts?.[obj.id]?.toLocaleString() || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Scheduled Tasks Tab */}
      {activeTab === 'scheduled' && (
        <div className="dashboard-row scheduled-tasks-row">
          <div className="panel scheduled-tasks-panel full-width">
            <div className="panel-header">
              <h2>⏰ Scheduled Tasks</h2>
              <div className="scheduler-status">
                {schedulerStatus?.running ? (
                  <span className="status-badge enabled">● Scheduler Running</span>
                ) : scheduledTasks.some(t => t.enabled) ? (
                  <span className="status-badge warning" title="Tasks are enabled but scheduler may not be active">⚡ Tasks Enabled</span>
                ) : (
                  <span className="status-badge disabled">○ No Active Tasks</span>
                )}
              </div>
            </div>
            
            <div className="tasks-content">
              {scheduledTasks.length === 0 ? (
                <div className="no-tasks">No scheduled tasks configured</div>
              ) : (
                <div className="tasks-grid">
                  {scheduledTasks.map(task => (
                    <div key={task.id} className={`task-card ${task.enabled ? 'enabled' : 'disabled'}`}>
                      <div className="task-header">
                        <span className="task-icon">{getTaskIcon(task.task_type)}</span>
                        <h3>{task.task_name}</h3>
                        <label className="toggle-switch small">
                          <input 
                            type="checkbox" 
                            checked={task.enabled}
                            onChange={(e) => toggleTask(task.task_type, e.target.checked)}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                      
                      <div className="task-details">
                        <div className="task-detail">
                          <span className="label">Interval:</span>
                          {editingInterval === task.task_type ? (
                            <span className="value editing">
                              <input 
                                type="number" 
                                value={newInterval}
                                onChange={(e) => setNewInterval(e.target.value)}
                                min="1"
                                max="1440"
                                className="interval-input"
                              />
                              <span className="unit">min</span>
                              <button className="btn-save-interval" onClick={() => saveInterval(task.task_type)} title="Save">✓</button>
                              <button className="btn-cancel-interval" onClick={() => setEditingInterval(null)} title="Cancel">✕</button>
                            </span>
                          ) : (
                            <span className="value editable" onClick={() => { setEditingInterval(task.task_type); setNewInterval(task.interval_minutes.toString()); }}>
                              {task.interval_minutes} min
                              <span className="edit-icon" title="Click to edit">✏️</span>
                            </span>
                          )}
                        </div>
                        <div className="task-detail">
                          <span className="label">Last Run:</span>
                          <span className="value">{formatDate(task.last_run_at)}</span>
                        </div>
                        <div className="task-detail">
                          <span className="label">Next Run:</span>
                          <span className="value">{task.enabled ? formatDate(task.next_run_at) : '-'}</span>
                        </div>
                        <div className="task-detail">
                          <span className="label">Last Status:</span>
                          <span className={`value badge ${getStatusBadge(task.last_status)}`}>
                            {task.last_status || 'Never'}
                          </span>
                        </div>
                        {task.last_error && (
                          <div className="task-error">
                            <small>⚠️ {task.last_error}</small>
                          </div>
                        )}
                      </div>
                      
                      <div className="task-stats">
                        <span className="stat">✓ {task.run_count || 0} runs</span>
                        <span className="stat">✕ {task.fail_count || 0} failures</span>
                      </div>
                      
                      <div className="task-actions">
                        <button 
                          className="btn-run"
                          onClick={() => triggerTask(task.task_type)}
                          disabled={schedulerStatus?.activeTasks?.some(t => t.type === task.task_type)}
                        >
                          ▶ Run Now
                        </button>
                        <button 
                          className="btn-history"
                          onClick={() => fetchTaskHistory(task.task_type)}
                        >
                          📜 History
                        </button>
                      </div>
                      
                      {taskHistory[task.task_type] && (
                        <div className="task-history">
                          <h4>Recent Runs</h4>
                          {taskHistory[task.task_type].map(h => (
                            <div key={h.id} className={`history-item ${h.status}`}>
                              <span className="time">{formatDate(h.started_at)}</span>
                              <span className={`badge ${getStatusBadge(h.status)}`}>{h.status}</span>
                              <span className="duration">{formatDuration(h.duration_seconds)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="dashboard-row log-row">
          <div className="panel sync-log-panel full-width">
            <div className="panel-header">
              <h2>📜 Unified Sync Log</h2>
              <span className="log-count">{syncHistory.length} records</span>
            </div>
            
            <div className="log-content">
              {syncHistory.length === 0 ? (
                <div className="no-logs">No sync history available</div>
              ) : (
                <table className="log-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Source</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Processed</th>
                      <th>Updated</th>
                      <th>Failed</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncHistory.map(log => (
                      <>
                        <tr key={`${log.source}-${log.id}`} className={`log-row ${log.status}`}>
                          <td className="log-time">{formatDate(log.started_at)}</td>
                          <td className="log-source">
                            <span className={`source-badge ${log.source === 'scheduled_task' ? 'scheduler' : 'manual'}`}>
                              {log.source === 'scheduled_task' ? '⏰ Sched' : '👤 Manual'}
                            </span>
                          </td>
                          <td className="log-type">{log.sync_type}</td>
                          <td>
                            <span className={`badge ${getStatusBadge(log.status)}`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="log-duration">{formatDuration(log.duration_seconds)}</td>
                          <td className="log-processed">{log.records_created || log.records_processed || 0}</td>
                          <td className="log-updated info">{log.records_updated || 0}</td>
                          <td className={`log-failed ${log.records_failed > 0 ? 'error' : ''}`}>
                            {log.records_failed || 0}
                          </td>
                          <td className="log-actions">
                            <button 
                              className="btn-expand"
                              onClick={() => setExpandedLog(expandedLog === `${log.source}-${log.id}` ? null : `${log.source}-${log.id}`)}
                            >
                              {expandedLog === `${log.source}-${log.id}` ? '▼' : '▶'}
                            </button>
                          </td>
                        </tr>
                        {expandedLog === `${log.source}-${log.id}` && (
                          <tr className="log-details-row">
                            <td colSpan="9">
                              <div className="log-details">
                                <h4>Sync Details</h4>
                                <div className="details-grid">
                                  {log.source === 'scheduled_task' ? (
                                    <div className="detail-item full-width">
                                      <span className="detail-label">SUMMARY:</span>
                                      {formatSyncSummary(log.details)}
                                    </div>
                                  ) : (
                                    <>
                                      <div className="detail-item">
                                        <span className="detail-label">Total Processed:</span>
                                        <span className="detail-value">{log.records_processed?.toLocaleString() || 0}</span>
                                      </div>
                                      {log.details?.totalUsers && (
                                        <div className="detail-item">
                                          <span className="detail-label">Total Users:</span>
                                          <span className="detail-value">{log.details.totalUsers.toLocaleString()}</span>
                                        </div>
                                      )}
                                    </>
                                  )}
                                  {log.details?.activeUsers !== undefined && (
                                    <div className="detail-item">
                                      <span className="detail-label">Active Users:</span>
                                      <span className="detail-value">{log.details.activeUsers.toLocaleString()}</span>
                                    </div>
                                  )}
                                  {log.details?.apiCalls && (
                                    <div className="detail-item">
                                      <span className="detail-label">API Calls:</span>
                                      <span className="detail-value">{log.details.apiCalls.toLocaleString()}</span>
                                    </div>
                                  )}
                                  {log.details?.durationSeconds && (
                                    <div className="detail-item">
                                      <span className="detail-label">Duration:</span>
                                      <span className="detail-value">{formatDuration(log.details.durationSeconds)}</span>
                                    </div>
                                  )}
                                </div>
                                
                                {log.error_message && (
                                  <div className="error-details">
                                    <h5>⚠️ Error Message</h5>
                                    <pre>{log.error_message}</pre>
                                  </div>
                                )}
                                
                                {log.details?.skipped > 0 && (
                                  <div className="savings-details">
                                    <span className="savings-badge">
                                      ⚡ Skipped {log.details.skipped.toLocaleString()} inactive users 
                                      ({Math.round(log.details.skipped / log.details.totalUsers * 100)}% bandwidth saved)
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="dashboard-footer">
        <div className="footer-stats">
          <div className="footer-stat">
            <span className="stat-label">Today's Syncs:</span>
            <span className="stat-value">{syncStats?.today?.syncs || 0}</span>
          </div>
          <div className="footer-stat">
            <span className="stat-label">Records Today:</span>
            <span className="stat-value">{syncStats?.today?.total_records?.toLocaleString() || 0}</span>
          </div>
          <div className="footer-stat success">
            <span className="stat-label">Successful:</span>
            <span className="stat-value">{syncStats?.today?.successful || 0}</span>
          </div>
          {syncStats?.today?.failed > 0 && (
            <div className="footer-stat error">
              <span className="stat-label">Failed:</span>
              <span className="stat-value">{syncStats?.today?.failed}</span>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

export default SyncDashboard;
