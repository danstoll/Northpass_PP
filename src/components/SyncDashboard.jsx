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
  maintenance: { name: 'Maintenance', icon: '🔧', description: 'System maintenance tasks' }
};

// Task type metadata
const TASK_METADATA = {
  sync_users: { icon: '👥', name: 'Users', category: 'sync', description: 'LMS users from Northpass', apiEndpoint: '/api/db/sync/users' },
  sync_groups: { icon: '🏢', name: 'Groups', category: 'sync', description: 'LMS groups and memberships', apiEndpoint: '/api/db/sync/groups' },
  sync_courses: { icon: '📚', name: 'Courses', category: 'sync', description: 'Course catalog', apiEndpoint: '/api/db/sync/courses' },
  sync_npcu: { icon: '🎓', name: 'NPCU', category: 'sync', description: 'Course certification values', apiEndpoint: '/api/db/sync/course-properties' },
  sync_enrollments: { icon: '📊', name: 'Enrollments', category: 'sync', description: 'User completions & progress', apiEndpoint: '/api/db/sync/enrollments' },
  lms_sync: { icon: '📦', name: 'LMS Bundle', category: 'sync', description: 'All syncs combined (Users, Groups, Courses, NPCU, Enrollments)', apiEndpoint: null },
  impartner_sync: { icon: '🔄', name: 'Impartner CRM', category: 'sync', description: 'Sync partners & contacts from Impartner PRM', apiEndpoint: '/api/impartner/sync/all' },
  group_analysis: { icon: '🔍', name: 'Group Analysis', category: 'analysis', description: 'Find potential users by domain', apiEndpoint: null },
  group_members_sync: { icon: '👥', name: 'Member Sync', category: 'analysis', description: 'Confirm pending group members', apiEndpoint: null },
  cleanup: { icon: '🧹', name: 'Cleanup', category: 'maintenance', description: 'Remove old logs and data', apiEndpoint: null }
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
        response = await fetch(meta.apiEndpoint, { method: 'POST' });
      } else {
        // For other tasks, use the scheduler trigger
        response = await fetch(`/api/db/tasks/${taskType}/run`, { method: 'POST' });
      }
      
      const { ok: parseOk, data, error: parseError } = await safeJsonParse(response);
      
      if (!parseOk) {
        throw new Error(parseError);
      }
      
      if (response.ok) {
        setSuccessMessage(`${meta.name} started successfully`);
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
  const formatSyncSummary = (details) => {
    if (!details) return null;
    
    let data = details;
    if (typeof details === 'string') {
      try {
        data = JSON.parse(details);
      } catch {
        return <span className="summary-text">{details}</span>;
      }
    }
    
    if (!data || typeof data !== 'object') {
      return <span className="summary-text">{String(data)}</span>;
    }
    
    const metrics = [];
    if (data.total !== undefined) metrics.push({ label: 'Total', value: data.total });
    if (data.processed !== undefined) metrics.push({ label: 'Processed', value: data.processed });
    if (data.created !== undefined) metrics.push({ label: 'Created', value: data.created, highlight: data.created > 0 });
    if (data.updated !== undefined) metrics.push({ label: 'Updated', value: data.updated, highlight: data.updated > 0 });
    if (data.synced !== undefined) metrics.push({ label: 'Synced', value: data.synced });
    if (data.errors !== undefined) metrics.push({ label: 'Errors', value: data.errors, error: data.errors > 0 });
    if (data.skipped !== undefined) metrics.push({ label: 'Skipped', value: data.skipped });
    if (data.recordsProcessed !== undefined) metrics.push({ label: 'Processed', value: data.recordsProcessed });
    
    // Handle nested details
    if (data.details && typeof data.details === 'object') {
      Object.entries(data.details).forEach(([key, val]) => {
        if (val && typeof val === 'object' && val.processed !== undefined) {
          metrics.push({ label: key, value: val.processed });
        }
      });
    }
    
    if (metrics.length > 0) {
      return (
        <div className="summary-metrics">
          {metrics.map((m, i) => (
            <div key={i} className={`summary-metric ${m.highlight ? 'highlight' : ''} ${m.error ? 'error' : ''}`}>
              <span className="metric-value">{typeof m.value === 'number' ? m.value.toLocaleString() : m.value}</span>
              <span className="metric-label">{m.label}</span>
            </div>
          ))}
        </div>
      );
    }
    
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

      {/* Active Tasks Banner */}
      {schedulerStatus?.activeTasks?.length > 0 && (
        <div className="active-tasks-banner">
          <div className="banner-header">
            <span className="banner-icon">⚡</span>
            <span className="banner-title">Running ({schedulerStatus.activeTasks.length})</span>
          </div>
          <div className="active-tasks-list">
            {schedulerStatus.activeTasks.map((task, idx) => {
              const meta = TASK_METADATA[task.type] || { icon: '📋', name: task.type };
              return (
                <div key={idx} className="active-task-item">
                  <span className="task-icon">{meta.icon}</span>
                  <div className="task-info">
                    <div className="task-name">{meta.name}</div>
                    {task.progress && (
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
                    )}
                  </div>
                  <div className="task-runtime">{formatDuration(task.runningSeconds)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                            <span className={`value status ${getStatusClass(task.last_status)}`}>
                              {task.last_status || 'Never'}
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
                            <pre>{JSON.stringify(task.config ? JSON.parse(task.config) : {}, null, 2)}</pre>
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
                                  {formatSyncSummary(log.details || log.result_summary)}
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
