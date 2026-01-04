import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import './DataSync.css';

/**
 * DataSync Component
 * Admin interface for managing MariaDB database sync with Northpass LMS
 */
function DataSync() {
  // Database stats
  const [stats, setStats] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncHistory, setSyncHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  
  // Auto-refresh interval
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Scheduled sync state
  const [schedule, setSchedule] = useState(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState(24);
  
  // Salesforce import state
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [clearBeforeImport, setClearBeforeImport] = useState(false);
  const fileInputRef = useRef(null);

  // Fetch schedule configuration
  const fetchSchedule = useCallback(async () => {
    try {
      const response = await fetch('/api/db/schedule');
      if (response.ok) {
        const data = await response.json();
        setSchedule(data);
        setScheduleEnabled(data.enabled);
        setScheduleInterval(data.interval_hours);
      }
    } catch (err) {
      console.error('Failed to fetch schedule:', err);
    }
  }, []);

  // Fetch database statistics
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/db/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
        setError(null);
      } else if (response.status === 503) {
        setError('Database not available');
      }
    } catch {
      setError('Failed to connect to database');
    }
  }, []);

  // Fetch sync status
  const fetchSyncStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/db/sync/status');
      if (response.ok) {
        const data = await response.json();
        setSyncStatus(data.currentSync);
        
        // Update syncing state based on status
        if (data.currentSync?.status === 'running') {
          setSyncing(true);
        } else {
          setSyncing(false);
        }
      }
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    }
  }, []);

  // Fetch sync history
  const fetchSyncHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/db/sync/history');
      if (response.ok) {
        const data = await response.json();
        // Handle both array and object with value property
        setSyncHistory(Array.isArray(data) ? data : (data.value || []));
      }
    } catch {
      console.error('Failed to fetch sync history');
    }
  }, []);

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchSyncStatus(), fetchSyncHistory(), fetchSchedule()]);
    setLoading(false);
  }, [fetchStats, fetchSyncStatus, fetchSyncHistory, fetchSchedule]);

  // Initial load and auto-refresh
  useEffect(() => {
    loadData();
    
    let interval;
    if (autoRefresh) {
      // Refresh more frequently when syncing
      const refreshRate = syncing ? 1000 : 5000;
      interval = setInterval(() => {
        fetchStats();
        fetchSyncStatus();
        fetchSchedule();
        if (syncing) {
          fetchSyncHistory(); // Also refresh history during sync
        }
      }, refreshRate);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loadData, fetchStats, fetchSyncStatus, fetchSyncHistory, fetchSchedule, autoRefresh, syncing]);

  // Update schedule settings
  const updateSchedule = async () => {
    try {
      const response = await fetch('/api/db/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: scheduleEnabled,
          interval_hours: scheduleInterval,
          sync_types: ['users', 'groups', 'courses', 'enrollments']
        })
      });
      
      if (response.ok) {
        fetchSchedule();
      }
    } catch {
      setError('Failed to update schedule');
    }
  };

  // Trigger manual scheduled sync
  const runScheduledSyncNow = async () => {
    try {
      await fetch('/api/db/schedule/run', { method: 'POST' });
      setSyncing(true);
      setTimeout(fetchSyncStatus, 1000);
    } catch {
      setError('Failed to trigger sync');
    }
  };

  // Start a sync operation
  const startSync = async (type) => {
    setSyncing(true);
    setError(null);
    
    // Immediately set a pending status
    setSyncStatus({
      type,
      status: 'running',
      progress: { stage: 'starting', current: 0, total: 0 },
      startedAt: new Date().toISOString()
    });
    
    try {
      const response = await fetch(`/api/db/sync/${type}`, { method: 'POST' });
      const data = await response.json();
      
      if (response.ok) {
        // For full sync, we get status back
        if (data.sync) {
          setSyncStatus(data.sync);
        } else if (data.result) {
          // For individual syncs, show result immediately
          setSyncStatus({
            type,
            status: 'completed',
            result: data.result,
            completedAt: new Date().toISOString()
          });
          setSyncing(false);
        }
        // Refresh data after a short delay
        setTimeout(() => {
          fetchStats();
          fetchSyncStatus();
          fetchSyncHistory();
        }, 500);
      } else {
        setError(data.error || 'Sync failed');
        setSyncing(false);
        setSyncStatus(null);
      }
    } catch {
      setError('Failed to start sync');
      setSyncing(false);
      setSyncStatus(null);
    }
  };

  // Format number with commas
  const formatNumber = (num) => {
    return num?.toLocaleString() || '0';
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Get status badge color
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'running': return 'info';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <div className="data-sync">
        <div className="loading d-flex flex-column align-center justify-center gap-4 py-12">
          <div className="ntx-spinner"></div>
          <span>Loading database status...</span>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="data-sync">
        <div className="error-panel text-center py-12">
          <h2 className="text-error mb-4">⚠️ Database Unavailable</h2>
          <p className="mb-2">{error}</p>
          <p className="hint text-sm opacity-60 mb-5">Make sure the server is running with database support enabled.</p>
          <button onClick={loadData} className="ntx-btn-primary">Retry Connection</button>
        </div>
      </div>
    );
  }

  return (
    <div className="data-sync">
      <header className="sync-header d-flex justify-between align-center mb-6">
        <h1>📊 Database Sync Management</h1>
        <div className="header-actions d-flex align-center gap-4">
          <label className="auto-refresh d-flex align-center gap-2 cursor-pointer text-sm">
            <input 
              type="checkbox" 
              checked={autoRefresh} 
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button onClick={loadData} className="ntx-btn-secondary" disabled={loading}>
            🔄 Refresh
          </button>
        </div>
      </header>

      {/* Database Stats */}
      <section className="stats-section mb-6">
        <h2 className="text-lg mb-4">📈 Database Statistics</h2>
        <div className="stats-grid grid gap-4 mb-4">
          <div className="stat-card text-center">
            <div className="stat-value">{formatNumber(stats?.lmsUsers)}</div>
            <div className="stat-label text-sm opacity-60">LMS Users</div>
          </div>
          <div className="stat-card text-center">
            <div className="stat-value">{formatNumber(stats?.lmsGroups)}</div>
            <div className="stat-label text-sm opacity-60">LMS Groups</div>
          </div>
          <div className="stat-card text-center">
            <div className="stat-value">{formatNumber(stats?.lmsCourses)}</div>
            <div className="stat-label text-sm opacity-60">Courses</div>
          </div>
          <div className="stat-card text-center">
            <div className="stat-value">{formatNumber(stats?.partners)}</div>
            <div className="stat-label text-sm opacity-60">Partners</div>
          </div>
          <div className="stat-card text-center">
            <div className="stat-value">{formatNumber(stats?.contacts)}</div>
            <div className="stat-label text-sm opacity-60">Contacts</div>
          </div>
          <div className="stat-card text-center">
            <div className="stat-value">{formatNumber(stats?.linkedContacts)}</div>
            <div className="stat-label text-sm opacity-60">Linked to LMS</div>
          </div>
        </div>
        {stats?.lastSync && (
          <div className="last-sync d-flex align-center gap-3">
            <span className="label opacity-60">Last sync:</span>
            <span className="value font-medium">{formatDate(stats.lastSync.completed_at)}</span>
            <span className={`status-badge ${getStatusColor(stats.lastSync.status)}`}>
              {stats.lastSync.status}
            </span>
          </div>
        )}
      </section>

      {/* Current Sync Status - Show when syncing or recently completed */}
      {(syncing || syncStatus?.status === 'running') && (
        <section className="sync-progress mb-6">
          <h2 className="mb-4">🔄 Sync In Progress</h2>
          <div className="progress-info d-flex flex-column gap-3">
            <div className="progress-details d-flex gap-5 text-sm">
              <span className="sync-type opacity-90">Type: <strong className="capitalize">{syncStatus?.type || 'sync'}</strong></span>
              <span className="sync-stage opacity-90">Stage: <strong className="capitalize">{syncStatus?.progress?.stage || 'Initializing...'}</strong></span>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill animated"
                style={{ 
                  width: syncStatus?.progress?.total > 0 
                    ? `${Math.min(100, (syncStatus.progress.current / syncStatus.progress.total) * 100)}%`
                    : '100%'
                }}
              ></div>
            </div>
            <div className="progress-text text-sm text-right opacity-90">
              {syncStatus?.progress?.total > 0 
                ? `${syncStatus.progress.current} / ${syncStatus.progress.total} records`
                : 'Processing...'}
            </div>
            {syncStatus?.startedAt && (
              <div className="sync-started text-xs text-right opacity-80">
                Started: {formatDate(syncStatus.startedAt)}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Recent Sync Result */}
      {syncStatus?.status === 'completed' && syncStatus?.result && !syncing && (
        <section className="sync-result mb-6">
          <h2 className="text-lg text-success mb-4">✅ Sync Completed</h2>
          <div className="result-summary d-flex flex-wrap gap-5 mb-4">
            <div className="result-item text-center">
              <span className="result-value d-block">{syncStatus.result.processed || 0}</span>
              <span className="result-label d-block text-xs opacity-60">Processed</span>
            </div>
            <div className="result-item success text-center">
              <span className="result-value d-block">{syncStatus.result.created || 0}</span>
              <span className="result-label d-block text-xs opacity-60">Created</span>
            </div>
            <div className="result-item info text-center">
              <span className="result-value d-block">{syncStatus.result.updated || 0}</span>
              <span className="result-label d-block text-xs opacity-60">Updated</span>
            </div>
            {syncStatus.result.failed > 0 && (
              <div className="result-item error text-center">
                <span className="result-value d-block">{syncStatus.result.failed}</span>
                <span className="result-label d-block text-xs opacity-60">Failed</span>
              </div>
            )}
          </div>
          <button className="ntx-btn-secondary" onClick={() => setSyncStatus(null)}>
            Dismiss
          </button>
        </section>
      )}

      {/* Sync Controls */}
      <section className="sync-controls mb-6">
        <h2 className="text-lg mb-4">🚀 Sync Actions</h2>
        <div className="sync-buttons grid gap-5">
          <div className="sync-group ntx-card">
            <h3 className="text-base mb-4">Quick Sync (Individual)</h3>
            <div className="button-row d-flex flex-wrap gap-3">
              <button 
                onClick={() => startSync('users')} 
                disabled={syncing}
                className="sync-btn users flex-1"
              >
                👥 Sync Users
              </button>
              <button 
                onClick={() => startSync('groups')} 
                disabled={syncing}
                className="sync-btn groups flex-1"
              >
                🏢 Sync Groups
              </button>
              <button 
                onClick={() => startSync('courses')} 
                disabled={syncing}
                className="sync-btn courses flex-1"
              >
                📚 Sync Courses
              </button>
            </div>
          </div>
          
          <div className="sync-group full ntx-card">
            <h3 className="text-base mb-4">Full Sync</h3>
            <p className="sync-description text-sm opacity-70 mb-4">
              Syncs all users, groups, group memberships, courses, course properties, and enrollments from the LMS.
              This may take several minutes.
            </p>
            <button 
              onClick={() => startSync('full')} 
              disabled={syncing}
              className="sync-btn full w-full"
            >
              {syncing ? '⏳ Syncing...' : '🔄 Run Full Sync'}
            </button>
          </div>
        </div>
      </section>

      {/* Scheduled Sync */}
      <section className="schedule-section">
        <h2>⏰ Scheduled Sync</h2>
        <p className="section-description">
          Automatically sync data from Northpass at regular intervals to keep certification data up to date.
        </p>
        
        <div className="schedule-controls">
          <div className="schedule-toggle">
            <label className="toggle-label">
              <input 
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
              />
              <span className="toggle-text">Enable Scheduled Sync</span>
            </label>
          </div>
          
          <div className="schedule-interval">
            <label>
              Sync every
              <select 
                value={scheduleInterval} 
                onChange={(e) => setScheduleInterval(Number(e.target.value))}
                disabled={!scheduleEnabled}
              >
                <option value={1}>1 hour</option>
                <option value={2}>2 hours</option>
                <option value={4}>4 hours</option>
                <option value={6}>6 hours</option>
                <option value={12}>12 hours</option>
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
              </select>
            </label>
          </div>
          
          <div className="schedule-actions">
            <button 
              className="save-schedule-btn"
              onClick={updateSchedule}
            >
              💾 Save Schedule
            </button>
            <button 
              className="run-now-btn"
              onClick={runScheduledSyncNow}
              disabled={syncing}
            >
              ▶️ Run Now
            </button>
          </div>
        </div>
        
        {schedule && (
          <div className="schedule-status">
            <div className="status-item">
              <span className="label">Status:</span>
              <span className={`value ${schedule.enabled ? 'enabled' : 'disabled'}`}>
                {schedule.enabled ? '✅ Active' : '⏸️ Disabled'}
              </span>
            </div>
            {schedule.last_scheduled_run && (
              <div className="status-item">
                <span className="label">Last Run:</span>
                <span className="value">{formatDate(schedule.last_scheduled_run)}</span>
              </div>
            )}
            {schedule.next_scheduled_run && schedule.enabled && (
              <div className="status-item">
                <span className="label">Next Run:</span>
                <span className="value">{formatDate(schedule.next_scheduled_run)}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Sync History */}
      <section className="sync-history">
        <h2>📜 Sync History</h2>
        {syncHistory.length === 0 ? (
          <p className="no-history">No sync history available.</p>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Records</th>
              </tr>
            </thead>
            <tbody>
              {syncHistory.map((log) => (
                <tr key={log.id}>
                  <td className="type">{log.sync_type}</td>
                  <td>
                    <span className={`status-badge ${getStatusColor(log.status)}`}>
                      {log.status}
                    </span>
                  </td>
                  <td>{formatDate(log.started_at)}</td>
                  <td>
                    {log.completed_at 
                      ? formatDuration(Math.round((new Date(log.completed_at) - new Date(log.started_at)) / 1000))
                      : '-'}
                  </td>
                  <td>
                    {log.records_processed > 0 && (
                      <span className="records">
                        {formatNumber(log.records_processed)} processed
                        {log.records_failed > 0 && (
                          <span className="failed"> ({log.records_failed} failed)</span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Salesforce Import Section */}
      <section className="import-section">
        <h2>📥 Import Salesforce Data</h2>
        <p className="section-description">
          Import partner contacts from Salesforce CSV/Excel export. Partners will be 
          automatically extracted from the Account Name column. <strong>Existing records 
          are updated, new records are added</strong> - no data is lost unless you check 
          the clear option.
        </p>
        
        <div className="import-content">
          <div className="import-panel">
            <h3>Import Partner Contacts</h3>
            <p className="import-hint">
              Expected columns: <code>Email</code>, <code>First Name</code>, <code>Last Name</code>,
              <code>Account Name</code>, <code>Title</code>
            </p>
            <p className="import-hint secondary">
              Partners will be auto-created from unique Account Name values.
            </p>
            <div className="file-upload">
              <input 
                type="file" 
                ref={fileInputRef}
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                id="contact-file"
              />
              <label htmlFor="contact-file" className="upload-btn">
                📁 Select Contacts File
              </label>
              {importFile && (
                <span className="file-name">{importFile.name}</span>
              )}
            </div>
          </div>

          {/* Preview */}
          {importPreview && (
            <div className="import-preview">
              <h4>Preview: {importPreview.contacts.length} Contacts, {importPreview.partners.length} Partners</h4>
              
              <div className="preview-summary">
                <div className="summary-box">
                  <span className="label">Contacts</span>
                  <span className="value">{importPreview.contacts.length}</span>
                </div>
                <div className="summary-box">
                  <span className="label">Unique Partners</span>
                  <span className="value">{importPreview.partners.length}</span>
                </div>
              </div>

              <div className="preview-table-wrapper">
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>First Name</th>
                      <th>Last Name</th>
                      <th>Account Name</th>
                      <th>Partner Tier</th>
                      <th>Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.contacts.slice(0, 10).map((row, idx) => {
                      // Find the partner tier for this contact
                      const partner = importPreview.partners.find(p => p.name === row.partner_name);
                      return (
                        <tr key={idx}>
                          <td>{row.email || '-'}</td>
                          <td>{row.first_name || '-'}</td>
                          <td>{row.last_name || '-'}</td>
                          <td>{row.partner_name || '-'}</td>
                          <td>{partner?.tier || '-'}</td>
                          <td>{row.title || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {importPreview.contacts.length > 10 && (
                  <p className="preview-more">...and {importPreview.contacts.length - 10} more contacts</p>
                )}
              </div>
              
              <div className="import-options">
                <p className="import-note">✨ Existing contacts will be updated with new data. New contacts will be added.</p>
                <label className="clear-option warning">
                  <input 
                    type="checkbox" 
                    checked={clearBeforeImport}
                    onChange={(e) => setClearBeforeImport(e.target.checked)}
                  />
                  ⚠️ Clear ALL existing data before import (use only for full refresh)
                </label>
              </div>

              <div className="import-actions">
                <button 
                  className="cancel-btn"
                  onClick={() => { setImportPreview(null); setImportFile(null); }}
                >
                  Cancel
                </button>
                <button 
                  className="import-btn"
                  onClick={handleImport}
                  disabled={importing}
                >
                  {importing ? '⏳ Importing...' : `📥 Import ${importPreview.contacts.length} Contacts`}
                </button>
              </div>
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <div className={`import-result ${importResult.success ? 'success' : 'error'}`}>
              <h4>{importResult.success ? '✅ Import Complete' : '❌ Import Failed'}</h4>
              {importResult.success ? (
                <div className="result-stats">
                  <span>Partners: {importResult.partnersCreated} created, {importResult.partnersUpdated} updated</span>
                  <span>Contacts: {importResult.contactsCreated} created, {importResult.contactsUpdated} updated</span>
                  {importResult.contactsLinked > 0 && <span className="linked">Linked to LMS: {importResult.contactsLinked}</span>}
                </div>
              ) : (
                <p>{importResult.error}</p>
              )}
              <button className="dismiss-btn" onClick={() => setImportResult(null)}>Dismiss</button>
            </div>
          )}
        </div>
      </section>

      {/* Error Display */}
      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
    </div>
  );

  // Handle file selection and parse - extract contacts and unique partners
  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    setImportFile({ name: file.name });
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        if (jsonData.length === 0) {
          setError('No data found in file');
          return;
        }

        // Map columns to normalized names (handle Salesforce export format)
        const contacts = [];
        const partnerMap = new Map();

        jsonData.forEach(row => {
          // Extract contact fields (exact Salesforce column names)
          const email = row['Email'] || row['Email Address'] || '';
          const firstName = row['First Name'] || row['FirstName'] || '';
          const lastName = row['Last Name'] || row['LastName'] || '';
          const accountName = row['Account Name'] || row['AccountName'] || '';
          const title = row['Title'] || row['Job Title'] || '';
          const phone = row['Phone'] || row['Mobile'] || '';
          const contactStatus = row['Contact Status'] || '';
          const city = row['Mailing City'] || '';
          const country = row['Mailing Country'] || '';

          // Extract partner fields from the same row
          const partnerTier = row['Partner Tier'] || '';
          const accountRegion = row['Account Region'] || '';
          const accountOwner = row['Account Owner'] || '';
          const accountId = row['Account ID'] || '';
          const accountStatus = row['Account Status'] || '';

          if (email && accountName) {
            contacts.push({
              email: email.trim().toLowerCase(),
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              partner_name: accountName.trim(),
              title: title.trim(),
              phone: phone.trim(),
              contact_status: contactStatus.trim(),
              city: city.trim(),
              country: country.trim()
            });

            // Track unique partners with their metadata
            const partnerKey = accountName.trim();
            if (!partnerMap.has(partnerKey)) {
              partnerMap.set(partnerKey, {
                name: partnerKey,
                tier: partnerTier.trim(),
                region: accountRegion.trim(),
                owner: accountOwner.trim(),
                salesforce_id: accountId.trim(),
                status: accountStatus.trim()
              });
            }
          }
        });

        if (contacts.length === 0) {
          setError('No valid contacts found. Make sure file has Email and Account Name columns.');
          return;
        }

        setImportPreview({ 
          contacts, 
          partners: Array.from(partnerMap.values()),
          rawCount: jsonData.length
        });
      } catch (err) {
        setError('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Handle import - sends both partners and contacts
  async function handleImport() {
    if (!importPreview) return;

    setImporting(true);
    try {
      const payload = {
        clearExisting: clearBeforeImport,
        partners: importPreview.partners,
        contacts: importPreview.contacts
      };

      const response = await fetch('/api/db/partners/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        setImportResult({
          success: true,
          partnersCreated: result.results.partners?.created || 0,
          partnersUpdated: result.results.partners?.updated || 0,
          contactsCreated: result.results.contacts?.created || 0,
          contactsUpdated: result.results.contacts?.updated || 0,
          contactsLinked: result.results.linked || 0
        });
        setImportPreview(null);
        setImportFile(null);
        fetchStats(); // Refresh stats
      } else {
        setImportResult({ success: false, error: result.error });
      }
    } catch (err) {
      setImportResult({ success: false, error: err.message });
    } finally {
      setImporting(false);
    }
  }
}

export default DataSync;
