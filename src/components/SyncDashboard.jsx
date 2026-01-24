import { useState, useEffect, useCallback } from 'react';
import './SyncDashboard.css';

/**
 * Unified SyncDashboard Component
 * All sync jobs share the same visualization, can be manually run and scheduled
 */

// Helper function to safely parse JSON response
const safeJsonParse = async (response) => {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return { ok: true, data };
  } catch {
    console.error('Invalid JSON response:', text.substring(0, 100));
    return { ok: false, error: 'Server returned invalid response', data: null };
  }
};

// Task category definitions
const TASK_CATEGORIES = {
  sync: { name: 'Data Sync', icon: '🔄', description: 'Sync data from Northpass LMS' },
  analysis: { name: 'Analysis', icon: '🔍', description: 'Analyze and match data' },
  maintenance: { name: 'Maintenance', icon: '🔧', description: 'System maintenance tasks' },
  notifications: { name: 'Notifications', icon: '📧', description: 'Email and notification tasks' }
};

// Task type metadata
const TASK_METADATA = {
  sync_users: { icon: '👥', name: 'Users', category: 'sync', description: 'LMS users from Northpass', apiEndpoint: '/api/db/sync/users' },
  sync_groups: { icon: '🏢', name: 'Groups', category: 'sync', description: 'LMS groups and memberships', apiEndpoint: '/api/db/sync/groups' },
  sync_courses: { icon: '📚', name: 'Courses', category: 'sync', description: 'Course catalog', apiEndpoint: '/api/db/sync/courses' },
  sync_npcu: { icon: '🎓', name: 'NPCU', category: 'sync', description: 'Course certification values', apiEndpoint: '/api/db/sync/course-properties' },
  sync_enrollments: { icon: '📊', name: 'Enrollments', category: 'sync', description: 'User completions & progress', apiEndpoint: '/api/db/sync/enrollments' },
  sync_leads: { icon: '🎯', name: 'Leads', category: 'sync', description: 'Partner leads from Impartner', apiEndpoint: '/api/db/leads/sync' },
  lms_sync: { icon: '📦', name: 'LMS Bundle', category: 'sync', description: 'All syncs combined (Users, Groups, Courses, NPCU, Enrollments)', apiEndpoint: null },
  impartner_sync: { icon: '🔄', name: 'Impartner CRM', category: 'sync', description: 'Sync partners, contacts & leads from Impartner PRM', apiEndpoint: '/api/impartner/sync/all' },
  sync_to_impartner: { icon: '📤', name: 'Push to Impartner', category: 'sync', description: 'Push cert counts, NPCU & training URLs to Impartner', apiEndpoint: '/api/db/certifications/sync-to-impartner' },
  group_analysis: { icon: '🔍', name: 'Group Analysis', category: 'analysis', description: 'Find potential users by domain', apiEndpoint: null },
  group_members_sync: { icon: '👥', name: 'Member Sync', category: 'analysis', description: 'Confirm pending group members', apiEndpoint: null },
  cleanup: { icon: '🧹', name: 'Cleanup', category: 'maintenance', description: 'Remove old logs and data', apiEndpoint: null },
  pam_weekly_report: { icon: '📧', name: 'PAM Weekly Reports', category: 'notifications', description: 'Send weekly reports to Partner Account Managers', apiEndpoint: '/api/db/pams/send-all-reports' },
  daily_sync_chain: { icon: '⛓️', name: 'Daily Sync Chain', category: 'orchestrated', description: 'Orchestrated full sync: Courses → Impartner → NPCU → Users → Groups → Enrollments → Push', apiEndpoint: '/api/db/tasks/daily-sync-chain/trigger', hidden: true }
};

function SyncDashboard() {
  // State
  const [tasks, setTasks] = useState([]);
  const [syncHistory, setSyncHistory] = useState([]);
  const [syncStats, setSyncStats] = useState(null);
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  
  // Running tasks state
  const [runningTasks, setRunningTasks] = useState(new Set());
  
  // UI state
  const [activeTab, setActiveTab] = useState('tasks'); // 'tasks' | 'history'
  const [expandedTask, setExpandedTask] = useState(null);
  const [editingInterval, setEditingInterval] = useState(null);
  const [newInterval, setNewInterval] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedLog, setExpandedLog] = useState(null);

  // Daily sync chain state
  const [dailySyncChainRunning, setDailySyncChainRunning] = useState(false);
  const [dailySyncChainStatus, setDailySyncChainStatus] = useState(null);

  // Fetch all tasks
  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch('/api/db/tasks');
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
        setSchedulerStatus(data.status || null);
        
        // Update running tasks set
        const running = new Set(
          (data.status?.activeTasks || []).map(t => t.type)
        );
        setRunningTasks(running);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  }, []);

  // Fetch sync stats
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

  // Fetch sync history
  const fetchSyncHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/db/sync/unified-history?limit=50');
      if (response.ok) {
        const data = await response.json();
        setSyncHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch sync history:', err);
    }
  }, []);

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchTasks(), fetchSyncStats(), fetchSyncHistory()]);
    setLoading(false);
  }, [fetchTasks, fetchSyncStats, fetchSyncHistory]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;
    
    const refreshRate = runningTasks.size > 0 ? 3000 : 15000;
    const interval = setInterval(() => {
      fetchTasks();
      fetchSyncStats();
      if (activeTab === 'history') {
        fetchSyncHistory();
      }
    }, refreshRate);
    
    return () => clearInterval(interval);
  }, [autoRefresh, runningTasks.size, activeTab, fetchTasks, fetchSyncStats, fetchSyncHistory]);

  // Clear messages after timeout
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Run a task manually (via direct API for sync tasks, or via scheduler for others)
  const runTask = async (taskType) => {
    const meta = TASK_METADATA[taskType];
    if (!meta) return;
    
    setError(null);
    setRunningTasks(prev => new Set([...prev, taskType]));
    
    try {
      let response;
      
      // For sync tasks, use their direct API endpoint
      if (meta.apiEndpoint) {
        // Get the task config to pass mode parameter
        const task = tasks.find(t => t.task_type === taskType);
        let url = meta.apiEndpoint;
        
        // If task has a mode config, pass it as query parameter
        if (task && task.config) {
          try {
            const config = JSON.parse(task.config);
            if (config.mode) {
              url += `?mode=${config.mode}`;
            }
          } catch {
            // Ignore parse errors
          }
        }
        
        response = await fetch(url, { method: 'POST' });
      } else {
        // For other tasks, use the scheduler trigger
        response = await fetch(`/api/db/tasks/${taskType}/run`, { method: 'POST' });
      }
      
      const { ok: parseOk, data, error: parseError } = await safeJsonParse(response);
      
      if (!parseOk) {
        throw new Error(parseError);
      }
      
      if (response.ok) {
        // Check if this is a background task (returns status: 'running')
        if (data.status === 'running') {
          setSuccessMessage(`${meta.name} started in background`);
          // Keep task in running state and poll for completion
          pollForCompletion(taskType, data.logId);
        } else {
          setSuccessMessage(`${meta.name} completed successfully`);
          // Task completed synchronously, remove from running
          setRunningTasks(prev => {
            const next = new Set(prev);
            next.delete(taskType);
            return next;
          });
        }
        // Refresh data
        setTimeout(fetchTasks, 1000);
        setTimeout(fetchSyncHistory, 2000);
      } else {
        setError(data.error || `Failed to start ${meta.name}`);
        setRunningTasks(prev => {
          const next = new Set(prev);
          next.delete(taskType);
          return next;
        });
      }
    } catch (err) {
      setError(err.message || `Failed to start ${meta.name}`);
      setRunningTasks(prev => {
        const next = new Set(prev);
        next.delete(taskType);
        return next;
      });
    }
  };

  // Poll for background task completion
  const pollForCompletion = (taskType, logId) => {
    const meta = TASK_METADATA[taskType];
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max (5s intervals)
    
    const checkStatus = async () => {
      attempts++;
      try {
        // Fetch sync history and check if our log entry is completed
        const response = await fetch('/api/db/sync/history?limit=10');
        if (response.ok) {
          const history = await response.json();
          const entry = history.find(h => h.id === logId && h.source !== 'scheduled_task');
          
          if (entry && entry.status !== 'running') {
            // Task completed
            setRunningTasks(prev => {
              const next = new Set(prev);
              next.delete(taskType);
              return next;
            });
            
            if (entry.status === 'completed') {
              setSuccessMessage(`${meta.name} completed: ${entry.records_processed || 0} records`);
            } else if (entry.status === 'failed') {
              setError(`${meta.name} failed: ${entry.error_message || 'Unknown error'}`);
            }
            
            fetchSyncHistory();
            fetchTasks();
            return; // Stop polling
          }
        }
        
        // Continue polling if not done and under max attempts
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 5000);
        } else {
          // Timeout - remove from running state
          setRunningTasks(prev => {
            const next = new Set(prev);
            next.delete(taskType);
            return next;
          });
          setError(`${meta.name} is taking longer than expected. Check History tab for status.`);
        }
      } catch {
        // On error, continue polling
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 5000);
        }
      }
    };
    
    // Start polling after 3 seconds
    setTimeout(checkStatus, 3000);
  };

  // Toggle task enabled/disabled
  const toggleTask = async (taskType, enabled) => {
    try {
      const response = await fetch(`/api/db/tasks/${taskType}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      
      if (response.ok) {
        setSuccessMessage(`Task ${enabled ? 'enabled' : 'disabled'}`);
        fetchTasks();
      } else {
        const { data } = await safeJsonParse(response);
        setError(data?.error || 'Failed to toggle task');
      }
    } catch {
      setError('Failed to toggle task');
    }
  };

  // Save interval
  const saveInterval = async (taskType) => {
    const minutes = parseInt(newInterval, 10);
    if (isNaN(minutes) || minutes < 1 || minutes > 10080) {
      setError('Interval must be between 1 and 10080 minutes (1 week)');
      return;
    }
    
    try {
      const response = await fetch(`/api/db/tasks/${taskType}/interval`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: minutes })
      });
      
      if (response.ok) {
        setSuccessMessage(`Interval updated to ${formatInterval(minutes)}`);
        setEditingInterval(null);
        fetchTasks();
      } else {
        const { data } = await safeJsonParse(response);
        setError(data?.error || 'Failed to update interval');
      }
    } catch {
      setError('Failed to update interval');
    }
  };

  // Trigger daily sync chain
  const triggerDailySyncChain = async () => {
    setError(null);
    setDailySyncChainRunning(true);
    setDailySyncChainStatus({ status: 'starting', message: 'Starting daily sync chain...' });

    try {
      const response = await fetch('/api/db/tasks/daily-sync-chain/trigger', { method: 'POST' });
      const { ok: parseOk, data, error: parseError } = await safeJsonParse(response);

      if (!parseOk) {
        throw new Error(parseError);
      }

      if (response.ok) {
        setDailySyncChainStatus({
          status: 'running',
          message: data.message || 'Daily sync chain started. Check sync logs for progress.'
        });
        setSuccessMessage('Daily sync chain started in background');
        // Refresh data to show progress
        setTimeout(fetchTasks, 2000);
        setTimeout(fetchSyncHistory, 3000);
      } else {
        setDailySyncChainRunning(false);
        setDailySyncChainStatus({ status: 'error', message: data.error || 'Failed to start sync chain' });
        setError(data.error || 'Failed to start daily sync chain');
      }
    } catch (err) {
      setDailySyncChainRunning(false);
      setDailySyncChainStatus({ status: 'error', message: err.message });
      setError(err.message || 'Failed to start daily sync chain');
    }
  };

  // Update task mode (full/incremental)
  const updateTaskMode = async (taskType, mode) => {
    try {
      const response = await fetch(`/api/db/tasks/${taskType}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      
      if (response.ok) {
        setSuccessMessage(`Mode updated to ${mode}`);
        fetchTasks();
      } else {
        const { data } = await safeJsonParse(response);
        setError(data?.error || 'Failed to update mode');
      }
    } catch {
      setError('Failed to update mode');
    }
  };

  // Format interval for display
  const formatInterval = (minutes) => {
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
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
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  };

  // Get status badge class
  const getStatusClass = (status) => {
    switch (status) {
      case 'completed': case 'success': return 'success';
      case 'running': return 'running';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  // Get task count by category
  const getTaskCount = (taskType) => {
    if (!syncStats?.counts) return null;
    switch (taskType) {
      case 'sync_users': return syncStats.counts.users;
      case 'sync_groups': return syncStats.counts.groups;
      case 'sync_courses': return syncStats.counts.courses;
      case 'sync_enrollments': return syncStats.counts.enrollments;
      default: return null;
    }
  };

  // Group tasks by category
  const groupedTasks = tasks.reduce((acc, task) => {
    const meta = TASK_METADATA[task.task_type];
    if (!meta || meta.hidden) return acc;
    
    const category = meta.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push({ ...task, meta });
    return acc;
  }, {});

  // Format sync summary for readability
  const formatSyncSummary = (details, log) => {
    if (!details && !log) return <span className="summary-text empty">No details available</span>;
    
    let data = details;
    if (typeof details === 'string') {
      try {
        data = JSON.parse(details);
      } catch {
        return <span className="summary-text">{details}</span>;
      }
    }
    
    if (!data || typeof data !== 'object') {
      data = {};
    }
    
    // Build metrics array with consistent ordering
    const metrics = [];
    
    // Primary metrics (from log object or data)
    const processed = log?.records_processed || data.processed || data.recordsProcessed || data.total || 0;
    const created = log?.records_created || data.created || 0;
    const updated = log?.records_updated || data.updated || data.confirmed || data.synced || 0;
    const deleted = log?.records_deleted || data.deleted || 0;
    const failed = log?.records_failed || data.failed || data.errors || 0;
    const skipped = data.skipped || data.stillPending || 0;
    const matched = data.matched || 0;
    const notFound = data.notFound || 0;
    
    // Always show processed first if > 0
    if (processed > 0) {
      metrics.push({ label: 'Processed', value: processed, icon: '📊' });
    }
    
    // Show CRUD breakdown
    if (created > 0) {
      metrics.push({ label: 'Created', value: created, highlight: true, icon: '➕' });
    }
    if (typeof updated === 'number' && updated > 0) {
      metrics.push({ label: 'Updated', value: updated, highlight: true, icon: '✏️' });
    }
    if (typeof deleted === 'number' && deleted > 0) {
      metrics.push({ label: 'Deleted', value: deleted, icon: '🗑️' });
    }
    if (matched > 0) {
      metrics.push({ label: 'Matched', value: matched, highlight: true, icon: '🔗' });
    }
    if (skipped > 0) {
      metrics.push({ label: 'Pending', value: skipped, icon: '⏳' });
    }
    if (notFound > 0) {
      metrics.push({ label: 'Not Found', value: notFound, icon: '❓' });
    }
    if (failed > 0) {
      metrics.push({ label: 'Failed', value: failed, error: true, icon: '❌' });
    }
    
    // Handle "confirmed" specifically (from Member Sync)
    if (data.confirmed !== undefined && !metrics.find(m => m.label === 'Updated')) {
      metrics.push({ label: 'Confirmed', value: data.confirmed, highlight: data.confirmed > 0, icon: '✅' });
    }
    
    // Show mode if present
    if (data.mode) {
      metrics.push({ label: 'Mode', value: data.mode === 'full' ? '🔄 Full' : '📈 Incremental', isText: true });
    }
    
    // Handle message (from Member Sync, etc.)
    const message = data.message;
    
    // Handle nested "deleted" object (from Cleanup task)
    const deletedDetails = [];
    if (data.deleted && typeof data.deleted === 'object' && !Array.isArray(data.deleted)) {
      Object.entries(data.deleted).forEach(([key, val]) => {
        if (typeof val === 'number') {
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          deletedDetails.push({ name: label, count: val });
        }
      });
    }
    
    // Handle nested details for composite tasks (like LMS Bundle)
    const nestedDetails = [];
    if (data.details && typeof data.details === 'object') {
      Object.entries(data.details).forEach(([key, val]) => {
        if (val && typeof val === 'object') {
          const subProcessed = val.processed || val.synced || val.total || 0;
          const subCreated = val.created || 0;
          const subUpdated = val.updated || 0;
          const subFailed = val.failed || val.errors || 0;
          if (subProcessed > 0 || subCreated > 0 || subUpdated > 0) {
            nestedDetails.push({
              name: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
              processed: subProcessed,
              created: subCreated,
              updated: subUpdated,
              failed: subFailed
            });
          }
        }
      });
    }
    
    // If no metrics but we have a message, show the message nicely
    if (metrics.length === 0 && message) {
      return (
        <div className="summary-container">
          <div className="summary-message">
            <span className="message-icon">ℹ️</span>
            <span>{message}</span>
          </div>
        </div>
      );
    }
    
    // If no metrics and no nested details, show "no details"
    if (metrics.length === 0 && nestedDetails.length === 0 && deletedDetails.length === 0) {
      return <span className="summary-text empty">No details available</span>;
    }
    
    return (
      <div className="summary-container">
        {metrics.length > 0 && (
          <div className="summary-metrics">
            {metrics.map((m, i) => (
              <div key={i} className={`summary-metric ${m.highlight ? 'highlight' : ''} ${m.error ? 'error' : ''}`}>
                <span className="metric-icon">{m.icon}</span>
                <span className="metric-value">{m.isText ? m.value : (typeof m.value === 'number' ? m.value.toLocaleString() : m.value)}</span>
                <span className="metric-label">{m.label}</span>
              </div>
            ))}
          </div>
        )}
        {message && (
          <div className="summary-message">
            <span className="message-icon">ℹ️</span>
            <span>{message}</span>
          </div>
        )}
        {deletedDetails.length > 0 && (
          <div className="nested-details">
            <div className="nested-header">Cleanup Details:</div>
            <div className="nested-list">
              {deletedDetails.map((item, i) => (
                <div key={i} className="nested-item">
                  <span className="nested-name">{item.name}:</span>
                  <span className="nested-stats">
                    <span>{item.count} deleted</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {nestedDetails.length > 0 && (
          <div className="nested-details">
            <div className="nested-header">Sub-tasks:</div>
            <div className="nested-list">
              {nestedDetails.map((sub, i) => (
                <div key={i} className="nested-item">
                  <span className="nested-name">{sub.name}:</span>
                  <span className="nested-stats">
                    {sub.processed > 0 && <span>{sub.processed.toLocaleString()} processed</span>}
                    {sub.created > 0 && <span className="created">+{sub.created}</span>}
                    {sub.updated > 0 && <span className="updated">↻{sub.updated}</span>}
                    {sub.failed > 0 && <span className="failed">✗{sub.failed}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
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
          <h1>🔄 Sync Dashboard</h1>
          <span className="subtitle">Unified sync management - run manually or schedule</span>
        </div>
        <div className="header-right">
          <div className={`scheduler-indicator ${schedulerStatus?.running ? 'active' : ''}`}>
            <span className="indicator-dot"></span>
            <span>{schedulerStatus?.running ? 'Scheduler Active' : 'Scheduler Idle'}</span>
          </div>
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

      {/* Active Tasks Banner - shows for both scheduler and manually triggered tasks */}
      {(schedulerStatus?.activeTasks?.length > 0 || runningTasks.size > 0) && (() => {
        // Combine scheduler active tasks with manually triggered tasks
        const schedulerTasks = schedulerStatus?.activeTasks || [];
        const schedulerTaskTypes = new Set(schedulerTasks.map(t => t.type));
        
        // Add manually triggered tasks that aren't already in scheduler list
        const manualTasks = [...runningTasks]
          .filter(type => !schedulerTaskTypes.has(type))
          .map(type => ({
            type,
            isManual: true,
            startedAt: Date.now()
          }));
        
        const allRunningTasks = [...schedulerTasks, ...manualTasks];
        
        return (
          <div className="active-tasks-banner">
            <div className="banner-header">
              <span className="banner-icon">⚡</span>
              <span className="banner-title">Running ({allRunningTasks.length})</span>
            </div>
            <div className="active-tasks-list">
              {allRunningTasks.map((task, idx) => {
                const meta = TASK_METADATA[task.type] || { icon: '📋', name: task.type };
                return (
                  <div key={idx} className="active-task-item">
                    <span className="task-icon">{meta.icon}</span>
                    <div className="task-info">
                      <div className="task-name">
                        {meta.name}
                        {task.isManual && <span className="manual-badge">Manual</span>}
                      </div>
                      {task.progress ? (
                        <div className="task-progress">
                          <span className="progress-stage">{task.progress.stage}</span>
                          {task.progress.total > 0 && (
                            <>
                              <div className="progress-bar-container">
                                <div 
                                  className="progress-bar-fill" 
                                  style={{ width: `${Math.round((task.progress.current / task.progress.total) * 100)}%` }}
                                />
                              </div>
                              <span className="progress-numbers">
                                {task.progress.current.toLocaleString()}/{task.progress.total.toLocaleString()}
                              </span>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="task-progress">
                          <span className="progress-stage">Processing...</span>
                          <div className="progress-bar-container indeterminate">
                            <div className="progress-bar-fill indeterminate" />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="task-runtime">
                      {task.runningSeconds ? formatDuration(task.runningSeconds) : <span className="ntx-spinner small"></span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Daily Sync Chain Panel */}
      {(() => {
        const chainTask = tasks.find(t => t.task_type === 'daily_sync_chain');
        if (!chainTask) return null;

        const isChainRunning = dailySyncChainRunning || runningTasks.has('daily_sync_chain') ||
          schedulerStatus?.activeTasks?.some(t => t.type === 'daily_sync_chain');

        return (
          <div className="daily-sync-chain-panel">
            <div className="chain-header">
              <div className="chain-title">
                <span className="chain-icon">⛓️</span>
                <div>
                  <h2>Daily Sync Chain</h2>
                  <span className="chain-subtitle">
                    Orchestrated full sync with proper dependency order
                  </span>
                </div>
              </div>
              <div className="chain-controls">
                <label className="toggle-switch" title={chainTask.enabled ? 'Disable schedule' : 'Enable schedule'}>
                  <input
                    type="checkbox"
                    checked={chainTask.enabled}
                    onChange={(e) => toggleTask('daily_sync_chain', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div className="chain-steps">
              <div className="chain-step">
                <span className="step-badge tier1">Tier 1</span>
                <span className="step-tasks">📚 Courses + 🔄 Impartner</span>
                <span className="step-note">(parallel)</span>
              </div>
              <span className="chain-arrow">→</span>
              <div className="chain-step">
                <span className="step-badge">2</span>
                <span className="step-tasks">🎓 NPCU</span>
              </div>
              <span className="chain-arrow">→</span>
              <div className="chain-step">
                <span className="step-badge">3</span>
                <span className="step-tasks">👥 Users</span>
              </div>
              <span className="chain-arrow">→</span>
              <div className="chain-step">
                <span className="step-badge">4</span>
                <span className="step-tasks">🏢 Groups</span>
              </div>
              <span className="chain-arrow">→</span>
              <div className="chain-step">
                <span className="step-badge">5</span>
                <span className="step-tasks">📊 Enrollments</span>
              </div>
              <span className="chain-arrow">→</span>
              <div className="chain-step">
                <span className="step-badge">6</span>
                <span className="step-tasks">📤 Push</span>
              </div>
            </div>

            <div className="chain-info">
              <div className="info-item">
                <span className="info-label">Schedule:</span>
                <span className="info-value">
                  {chainTask.enabled ? (
                    <>Daily at {chainTask.schedule_time?.substring(0, 5) || '02:00'}</>
                  ) : (
                    <span className="disabled-text">Disabled</span>
                  )}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Last Run:</span>
                <span className="info-value">{formatDate(chainTask.last_run_at)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Status:</span>
                <span className={`info-value status ${isChainRunning ? 'running' : getStatusClass(chainTask.last_status)}`}>
                  {isChainRunning ? '⏳ Running' : (chainTask.last_status || 'Never run')}
                </span>
              </div>
              {chainTask.last_duration_seconds && (
                <div className="info-item">
                  <span className="info-label">Duration:</span>
                  <span className="info-value">{formatDuration(chainTask.last_duration_seconds)}</span>
                </div>
              )}
            </div>

            {dailySyncChainStatus && dailySyncChainStatus.status !== 'running' && (
              <div className={`chain-status-message ${dailySyncChainStatus.status}`}>
                {dailySyncChainStatus.message}
              </div>
            )}

            <div className="chain-actions">
              <button
                className={`btn-run-chain ${isChainRunning ? 'running' : ''}`}
                onClick={triggerDailySyncChain}
                disabled={isChainRunning}
              >
                {isChainRunning ? (
                  <><span className="ntx-spinner small"></span> Running Chain...</>
                ) : (
                  <>▶ Run Full Sync Chain Now</>
                )}
              </button>
              <span className="action-hint">
                Runs all syncs in sequence (~75-120 min)
              </span>
            </div>
          </div>
        );
      })()}

      {/* Tab Navigation */}
      <div className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          📋 All Tasks
        </button>
        <button
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => { setActiveTab('history'); fetchSyncHistory(); }}
        >
          📜 History
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="message-banner error">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {successMessage && (
        <div className="message-banner success">
          <span>✓ {successMessage}</span>
          <button onClick={() => setSuccessMessage(null)}>✕</button>
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div className="tasks-container">
          {Object.entries(TASK_CATEGORIES).map(([categoryKey, category]) => {
            const categoryTasks = groupedTasks[categoryKey] || [];
            if (categoryTasks.length === 0) return null;
            
            return (
              <div key={categoryKey} className="task-category">
                <div className="category-header">
                  <span className="category-icon">{category.icon}</span>
                  <h2>{category.name}</h2>
                  <span className="category-description">{category.description}</span>
                </div>
                
                <div className="tasks-grid">
                  {categoryTasks.map(task => {
                    const isRunning = runningTasks.has(task.task_type) || 
                      schedulerStatus?.activeTasks?.some(t => t.type === task.task_type);
                    const count = getTaskCount(task.task_type);
                    
                    return (
                      <div 
                        key={task.id} 
                        className={`task-card ${task.enabled ? 'enabled' : 'disabled'} ${isRunning ? 'running' : ''}`}
                      >
                        <div className="task-header">
                          <span className="task-icon">{task.meta.icon}</span>
                          <div className="task-title">
                            <h3>{task.meta.name}</h3>
                            <span className="task-description">{task.meta.description}</span>
                          </div>
                          <label className="toggle-switch" title={task.enabled ? 'Disable schedule' : 'Enable schedule'}>
                            <input 
                              type="checkbox" 
                              checked={task.enabled}
                              onChange={(e) => toggleTask(task.task_type, e.target.checked)}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                        </div>
                        
                        {count !== null && (
                          <div className="task-count">
                            <span className="count-value">{count.toLocaleString()}</span>
                            <span className="count-label">records</span>
                          </div>
                        )}
                        
                        <div className="task-details">
                          <div className="detail-row">
                            <span className="label">Interval:</span>
                            {editingInterval === task.task_type ? (
                              <span className="value editing">
                                <input 
                                  type="number" 
                                  value={newInterval}
                                  onChange={(e) => setNewInterval(e.target.value)}
                                  min="1"
                                  max="10080"
                                  className="interval-input"
                                  autoFocus
                                />
                                <span className="unit">min</span>
                                <button className="btn-save" onClick={() => saveInterval(task.task_type)}>✓</button>
                                <button className="btn-cancel" onClick={() => setEditingInterval(null)}>✕</button>
                              </span>
                            ) : (
                              <span 
                                className="value editable" 
                                onClick={() => { setEditingInterval(task.task_type); setNewInterval(task.interval_minutes.toString()); }}
                                title="Click to edit"
                              >
                                {formatInterval(task.interval_minutes)}
                                <span className="edit-icon">✏️</span>
                              </span>
                            )}
                          </div>
                          <div className="detail-row">
                            <span className="label">Last Run:</span>
                            <span className="value">{formatDate(task.last_run_at)}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Status:</span>
                            <span className={`value status ${isRunning ? 'running' : getStatusClass(task.last_status)}`}>
                              {isRunning ? '⏳ Running' : (task.last_status || 'Never')}
                            </span>
                          </div>
                          {task.enabled && (
                            <div className="detail-row">
                              <span className="label">Next Run:</span>
                              <span className="value">{formatDate(task.next_run_at)}</span>
                            </div>
                          )}
                        </div>
                        
                        {task.last_error && (
                          <div className="task-error">
                            <small>⚠️ {task.last_error}</small>
                          </div>
                        )}
                        
                        <div className="task-stats">
                          <span className="stat success">✓ {task.run_count || 0}</span>
                          <span className="stat error">✕ {task.fail_count || 0}</span>
                          {task.last_duration_seconds && (
                            <span className="stat duration">⏱ {formatDuration(task.last_duration_seconds)}</span>
                          )}
                        </div>
                        
                        <div className="task-actions">
                          <button 
                            className="btn-run"
                            onClick={() => runTask(task.task_type)}
                            disabled={isRunning}
                          >
                            {isRunning ? (
                              <><span className="ntx-spinner small"></span> Running...</>
                            ) : (
                              <>▶ Run Now</>
                            )}
                          </button>
                          <button 
                            className="btn-expand"
                            onClick={() => setExpandedTask(expandedTask === task.task_type ? null : task.task_type)}
                          >
                            {expandedTask === task.task_type ? '▲' : '▼'}
                          </button>
                        </div>
                        
                        {expandedTask === task.task_type && (
                          <div className="task-expanded">
                            <h4>Configuration</h4>
                            {task.config && (() => {
                              try {
                                const config = JSON.parse(task.config);
                                const supportsMode = Object.prototype.hasOwnProperty.call(config, 'mode') || ['sync_users', 'sync_groups', 'sync_courses', 'impartner_sync', 'sync_to_impartner', 'sync_leads'].includes(task.task_type);
                                
                                return (
                                  <>
                                    {supportsMode && (
                                      <div className="config-controls">
                                        <label className="config-label">Sync Mode:</label>
                                        <div className="mode-toggle-group">
                                          <button
                                            className={`mode-toggle-btn ${(config.mode || 'incremental') === 'incremental' ? 'active' : ''}`}
                                            onClick={() => updateTaskMode(task.task_type, 'incremental')}
                                            title="Incremental: Only sync changed records since last run"
                                          >
                                            🔄 Incremental
                                          </button>
                                          <button
                                            className={`mode-toggle-btn ${config.mode === 'full' ? 'active' : ''}`}
                                            onClick={() => updateTaskMode(task.task_type, 'full')}
                                            title="Full: Sync all records every time"
                                          >
                                            📦 Full
                                          </button>
                                        </div>
                                        <div className="mode-description">
                                          {(config.mode || 'incremental') === 'incremental' ? (
                                            <small>✓ Only syncs changed records since last run (faster, recommended)</small>
                                          ) : (
                                            <small>⚠ Syncs all records every time (slower, use for troubleshooting)</small>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    <pre>{JSON.stringify(config, null, 2)}</pre>
                                  </>
                                );
                              } catch {
                                return <pre>{task.config}</pre>;
                              }
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="history-container">
          <div className="panel">
            <div className="panel-header">
              <h2>📜 Sync History</h2>
              <span className="log-count">{syncHistory.length} records</span>
            </div>
            
            <div className="log-content">
              {syncHistory.length === 0 ? (
                <div className="empty-state">No sync history available</div>
              ) : (
                <table className="log-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Task</th>
                      <th>Source</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Records</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncHistory.map(log => {
                      const meta = TASK_METADATA[log.sync_type] || { icon: '📋', name: log.sync_type };
                      return (
                        <>
                          <tr key={`${log.source}-${log.id}`} className={`log-row ${getStatusClass(log.status)}`}>
                            <td className="log-time">{formatDate(log.started_at)}</td>
                            <td className="log-task">
                              <span className="task-icon">{meta.icon}</span>
                              <span>{meta.name}</span>
                            </td>
                            <td className="log-source">
                              <span className={`source-badge ${log.source === 'scheduled_task' ? 'scheduled' : 'manual'}`}>
                                {log.source === 'scheduled_task' ? '⏰' : '👤'}
                              </span>
                            </td>
                            <td>
                              <span className={`status-badge ${getStatusClass(log.status)}`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="log-duration">{formatDuration(log.duration_seconds)}</td>
                            <td className="log-records">{log.records_processed?.toLocaleString() || 0}</td>
                            <td>
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
                              <td colSpan="7">
                                <div className="log-details">
                                  {formatSyncSummary(log.details || log.result_summary, log)}
                                  {log.error_message && (
                                    <div className="error-details">
                                      <strong>Error:</strong>
                                      <pre>{log.error_message}</pre>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer Stats */}
      <footer className="dashboard-footer">
        <div className="footer-stats">
          <div className="footer-stat">
            <span className="stat-label">Total Tasks:</span>
            <span className="stat-value">{tasks.length}</span>
          </div>
          <div className="footer-stat">
            <span className="stat-label">Enabled:</span>
            <span className="stat-value success">{tasks.filter(t => t.enabled).length}</span>
          </div>
          <div className="footer-stat">
            <span className="stat-label">Today's Runs:</span>
            <span className="stat-value">{syncStats?.today?.syncs || 0}</span>
          </div>
          {syncStats?.today?.failed > 0 && (
            <div className="footer-stat error">
              <span className="stat-label">Failed:</span>
              <span className="stat-value">{syncStats.today.failed}</span>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

export default SyncDashboard;
