/**
 * Data Management Page
 * Central hub for importing and managing partner data from Excel
 * Uses MariaDB for persistent storage via server API
 */

import React, { useState, useEffect, useCallback } from 'react';
import NintexButton from './NintexButton';
import './DataManagement.css';

const API_BASE = '/api/db/import';

const DataManagement = () => {
  const [stats, setStats] = useState(null);
  const [partners, setPartners] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [selectedPartnerContacts, setSelectedPartnerContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Active tab for sections
  const [activeTab, setActiveTab] = useState('overview');
  
  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  
  // Data cleaning state
  const [cleaningInProgress, setCleaningInProgress] = useState(false);
  const [cleaningResult, setCleaningResult] = useState(null);
  const [accountPatternToDelete, setAccountPatternToDelete] = useState('');
  
  // Preview state for data cleaning
  const [previewMode, setPreviewMode] = useState(null); // 'region', 'tier', 'pattern', 'account'
  const [previewValue, setPreviewValue] = useState('');
  const [previewContacts, setPreviewContacts] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // LMS matching state
  const [matchStats, setMatchStats] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleString();
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, matchRes] = await Promise.all([
        fetch(`${API_BASE}/stats`),
        fetch(`${API_BASE}/match-stats`)
      ]);
      
      const statsData = await statsRes.json();
      const matchData = await matchRes.json();
      
      setStats(statsData);
      setMatchStats(matchData);
      
      if (statsData.totalContacts > 0) {
        const partnersRes = await fetch(`${API_BASE}/partners?limit=100`);
        const partnersData = await partnersRes.json();
        setPartners(partnersData);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  // File handling for drag and drop
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      alert('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        
        // Send to server
        const response = await fetch(`${API_BASE}/excel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: base64,
            fileName: file.name,
            clearExisting: true
          })
        });

        const result = await response.json();
        setImportResult(result);
        
        if (result.success) {
          await loadData();
        }
        
        setImporting(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Import error:', err);
      setImportResult({ success: false, error: err.message });
      setImporting(false);
    }
  };

  // Search partners
  const handleSearch = async (term) => {
    setSearchTerm(term);
    if (term.length >= 2) {
      const res = await fetch(`${API_BASE}/partners?search=${encodeURIComponent(term)}`);
      const data = await res.json();
      setPartners(data);
    } else if (term.length === 0) {
      const res = await fetch(`${API_BASE}/partners?limit=100`);
      const data = await res.json();
      setPartners(data);
    }
  };

  // Load partner contacts
  const loadPartnerContacts = async (partnerId) => {
    const res = await fetch(`${API_BASE}/partners/${partnerId}/contacts`);
    const data = await res.json();
    setSelectedPartnerContacts(data);
  };

  // Export JSON
  const handleExportJSON = async () => {
    try {
      const [partnersRes, contactsRes] = await Promise.all([
        fetch(`${API_BASE}/partners?limit=10000`),
        fetch(`${API_BASE}/contacts/search?q=@&limit=50000`)
      ]);
      
      const data = {
        exportDate: new Date().toISOString(),
        stats,
        partners: await partnersRes.json()
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `partner-database-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export database');
    }
  };

  // Delete partner
  const handleDeletePartner = async (partnerId, partnerName) => {
    if (!window.confirm(`Delete partner "${partnerName}" and all contacts?`)) return;
    
    setCleaningInProgress(true);
    try {
      const res = await fetch(`${API_BASE}/partners/${partnerId}`, { method: 'DELETE' });
      const result = await res.json();
      setCleaningResult({ type: 'partner', value: partnerName, deleted: result.deleted || 1 });
      setSelectedPartner(null);
      setSelectedPartnerContacts([]);
      await loadData();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete partner');
    } finally {
      setCleaningInProgress(false);
    }
  };

  // Preview Functions for Data Cleaning
  const loadPreview = async (mode, value) => {
    setPreviewLoading(true);
    setPreviewMode(mode);
    setPreviewValue(value);
    
    try {
      const res = await fetch(`${API_BASE}/preview/${mode}/${encodeURIComponent(value)}`);
      const data = await res.json();
      setPreviewContacts(data);
    } catch (err) {
      console.error('Error loading preview:', err);
      setPreviewContacts([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewMode(null);
    setPreviewValue('');
    setPreviewContacts([]);
  };

  const handleDeleteFromPreview = async () => {
    if (!previewMode || !previewValue) return;
    
    const count = previewContacts.length;
    if (!window.confirm(`Delete ${count} contacts?`)) return;
    
    setCleaningInProgress(true);
    try {
      let endpoint;
      switch (previewMode) {
        case 'region':
          endpoint = `${API_BASE}/by-region/${encodeURIComponent(previewValue)}`;
          break;
        case 'tier':
          endpoint = `${API_BASE}/by-tier/${encodeURIComponent(previewValue)}`;
          break;
        case 'pattern':
          endpoint = `${API_BASE}/by-pattern/${encodeURIComponent(previewValue)}`;
          break;
        default:
          return;
      }
      
      const res = await fetch(endpoint, { method: 'DELETE' });
      const result = await res.json();
      
      setCleaningResult({ type: previewMode, value: previewValue, deleted: result.deleted });
      closePreview();
      await loadData();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete contacts');
    } finally {
      setCleaningInProgress(false);
    }
  };

  // Re-link contacts to LMS users
  const handleRelink = async () => {
    try {
      const res = await fetch(`${API_BASE}/link`, { method: 'POST' });
      const result = await res.json();
      alert(`Linked ${result.linked} contacts to LMS users`);
      await loadData();
    } catch (err) {
      console.error('Link error:', err);
      alert('Failed to link contacts');
    }
  };

  return (
    <div className="data-management-content">
      <div className="management-header">
        <div className="header-content">
          <h1>💾 Partner Data Management</h1>
          <p>
            Import partner contact data from Excel into MariaDB. Data is stored persistently on the server.
          </p>
        </div>
      </div>

      {/* File Upload Area */}
      <div className="import-section">
        <div 
          className={`drop-zone ${dragActive ? 'drag-active' : ''} ${importing ? 'importing' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {importing ? (
            <div className="importing-state">
              <div className="spinner" />
              <p>Importing data to MariaDB...</p>
            </div>
          ) : (
            <>
              <div className="upload-icon">📊</div>
              <h3>Import Partner Contacts</h3>
              <p>Drag & drop Excel file here, or click to browse</p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileInput}
                className="file-input"
              />
              <NintexButton variant="secondary">
                📁 Choose File
              </NintexButton>
              <p className="hint">Supported: .xlsx, .xls files with partner contact data</p>
            </>
          )}
        </div>

        {/* Import Result */}
        {importResult && (
          <div className={`import-result ${importResult.success ? 'success' : 'error'}`}>
            {importResult.success ? (
              <>
                <span className="result-icon">✅</span>
                <div className="result-details">
                  <strong>Import Successful!</strong>
                  <p>
                    {importResult.stats?.partnersCreated || 0} partners, {' '}
                    {importResult.stats?.contactsCreated || 0} contacts imported in {importResult.duration}s
                  </p>
                  {importResult.linkResult && (
                    <p className="link-result">
                      🔗 {importResult.linkResult.linked || 0} contacts linked to LMS users
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="result-icon">❌</span>
                <div className="result-details">
                  <strong>Import Failed</strong>
                  <p>{importResult.error}</p>
                </div>
              </>
            )}
            <button className="dismiss-btn" onClick={() => setImportResult(null)}>×</button>
          </div>
        )}
      </div>

      {/* Tabs for different sections */}
      {stats?.totalContacts > 0 && (
        <>
          <div className="data-tabs">
            <button 
              className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              📊 Overview
            </button>
            <button 
              className={`tab-btn ${activeTab === 'cleaning' ? 'active' : ''}`}
              onClick={() => setActiveTab('cleaning')}
            >
              🧹 Data Cleaning
            </button>
            <button 
              className={`tab-btn ${activeTab === 'lms' ? 'active' : ''}`}
              onClick={() => setActiveTab('lms')}
            >
              🔗 LMS Matching
            </button>
            <button 
              className={`tab-btn ${activeTab === 'browse' ? 'active' : ''}`}
              onClick={() => setActiveTab('browse')}
            >
              🔍 Browse
            </button>
          </div>

          {/* Cleaning Result Toast */}
          {cleaningResult && (
            <div className="cleaning-result">
              <span className="result-icon">✅</span>
              <span className="result-text">
                Deleted {cleaningResult.deleted} contacts 
                {cleaningResult.type === 'region' && ` from region "${cleaningResult.value}"`}
                {cleaningResult.type === 'tier' && ` from tier "${cleaningResult.value}"`}
                {cleaningResult.type === 'pattern' && ` matching "${cleaningResult.value}"`}
                {cleaningResult.type === 'account' && ` from "${cleaningResult.value}"`}
              </span>
              <button className="dismiss-btn" onClick={() => setCleaningResult(null)}>×</button>
            </div>
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="data-stats-section">
              <div className="section-header">
                <h2>📊 Database Overview</h2>
                <div className="header-actions">
                  <NintexButton variant="secondary" onClick={handleExportJSON}>
                    📥 Export JSON
                  </NintexButton>
                </div>
              </div>

              <div className="stats-overview">
                <div className="stat-card large">
                  <span className="stat-value">{stats.totalContacts?.toLocaleString()}</span>
                  <span className="stat-label">Total Contacts</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{stats.totalPartners?.toLocaleString()}</span>
                  <span className="stat-label">Partner Accounts</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{stats.linkedToLms?.toLocaleString() || 0}</span>
                  <span className="stat-label">Linked to LMS</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{Object.keys(stats.regionDistribution || {}).length}</span>
                  <span className="stat-label">Regions</span>
                </div>
              </div>

              {/* Tier Distribution */}
              <div className="distribution-section">
                <h3>Contacts by Tier</h3>
                <div className="distribution-list">
                  {Object.entries(stats.tierDistribution || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([tier, count]) => (
                      <div key={tier} className="distribution-item">
                        <span className={`tier-badge tier-${(tier || '').toLowerCase().replace(' ', '-')}`}>{tier}</span>
                        <span className="distribution-count">{count.toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Region Distribution */}
              <div className="distribution-section">
                <h3>Contacts by Region</h3>
                <div className="distribution-list">
                  {Object.entries(stats.regionDistribution || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([region, count]) => (
                      <div key={region} className="distribution-item">
                        <span className="region-name">{region}</span>
                        <span className="distribution-count">{count.toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Data Cleaning Tab */}
          {activeTab === 'cleaning' && (
            <div className="data-cleaning-section">
              <div className="section-header">
                <h2>🧹 Data Cleaning Tools</h2>
              </div>
              
              <p className="section-desc">
                Click any item to preview the data. Review contacts before deciding to delete.
                Changes cannot be undone - re-import to restore.
              </p>

              {/* Preview Panel - Show when a preview is active */}
              {previewMode && (
                <div className="preview-panel">
                  <div className="preview-header">
                    <h3>
                      {previewMode === 'region' && `📍 Region: ${previewValue}`}
                      {previewMode === 'tier' && `🏷️ Tier: ${previewValue}`}
                      {previewMode === 'pattern' && `🔍 Pattern: "${previewValue}"`}
                    </h3>
                    <div className="preview-actions">
                      <span className="preview-count">{previewContacts.length} contacts</span>
                      <NintexButton 
                        variant="danger" 
                        onClick={handleDeleteFromPreview}
                        disabled={cleaningInProgress || previewContacts.length === 0}
                        size="small"
                      >
                        {cleaningInProgress ? '🔄 Deleting...' : '🗑️ Delete All'}
                      </NintexButton>
                      <button className="close-preview-btn" onClick={closePreview}>×</button>
                    </div>
                  </div>
                  
                  {previewLoading ? (
                    <div className="preview-loading">Loading contacts...</div>
                  ) : (
                    <div className="preview-contacts">
                      {/* Group by Account */}
                      {(() => {
                        const byAccount = {};
                        previewContacts.forEach(c => {
                          const name = c.account_name || 'Unknown';
                          if (!byAccount[name]) {
                            byAccount[name] = { 
                              accountName: name,
                              region: c.account_region,
                              tier: c.partner_tier,
                              contacts: [] 
                            };
                          }
                          byAccount[name].contacts.push(c);
                        });
                        return Object.values(byAccount)
                          .sort((a, b) => b.contacts.length - a.contacts.length)
                          .map((account, idx) => (
                            <div key={idx} className="preview-account">
                              <div className="preview-account-header">
                                <span className="account-name">{account.accountName}</span>
                                <span className="account-meta">
                                  <span className={`tier-badge tier-${(account.tier || '').toLowerCase().replace(' ', '-')}`}>
                                    {account.tier || 'Unknown'}
                                  </span>
                                  <span className="contact-count">{account.contacts.length} contacts</span>
                                </span>
                              </div>
                              <div className="preview-contact-list">
                                {account.contacts.slice(0, 10).map((contact, cIdx) => (
                                  <div key={cIdx} className="preview-contact">
                                    <span className="contact-name">{contact.first_name} {contact.last_name}</span>
                                    <span className="contact-email">{contact.email}</span>
                                  </div>
                                ))}
                                {account.contacts.length > 10 && (
                                  <div className="more-contacts-note">
                                    +{account.contacts.length - 10} more contacts
                                  </div>
                                )}
                              </div>
                            </div>
                          ));
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Selection Interface - Show when no preview */}
              {!previewMode && (
                <>
                  {/* Search by Account Pattern */}
                  <div className="cleaning-tool">
                    <h3>🔍 Search by Account Name</h3>
                    <p>Find and preview contacts from accounts matching a pattern.</p>
                    <div className="cleaning-input-group">
                      <input
                        type="text"
                        placeholder="e.g., Nintex, Test, Demo..."
                        value={accountPatternToDelete}
                        onChange={(e) => setAccountPatternToDelete(e.target.value)}
                        className="cleaning-input"
                      />
                      <NintexButton 
                        variant="primary" 
                        onClick={() => loadPreview('pattern', accountPatternToDelete)}
                        disabled={!accountPatternToDelete.trim()}
                      >
                        👁️ Preview
                      </NintexButton>
                    </div>
                    {accountPatternToDelete && (
                      <div className="pattern-preview">
                        Will match: {accounts.filter(a => 
                          a.accountName.toLowerCase().includes(accountPatternToDelete.toLowerCase())
                        ).length} accounts
                        ({accounts.filter(a => 
                          a.accountName.toLowerCase().includes(accountPatternToDelete.toLowerCase())
                        ).reduce((sum, a) => sum + a.contactCount, 0)} contacts)
                      </div>
                    )}
                  </div>

                  {/* Preview by Region */}
                  <div className="cleaning-tool">
                    <h3>📍 Preview by Region</h3>
                    <p>Click a region to preview all contacts from that area.</p>
                    <div className="cleaning-buttons">
                      {Object.entries(stats.regionDistribution || {})
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([region, count]) => (
                          <button 
                            key={region}
                            className="preview-region-btn"
                            onClick={() => loadPreview('region', region)}
                          >
                            <span className="region-name">{region}</span>
                            <span className="region-count">{count}</span>
                            <span className="preview-icon">👁️</span>
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Preview by Tier */}
                  <div className="cleaning-tool">
                    <h3>🏷️ Preview by Tier</h3>
                    <p>Click a tier to preview all contacts from that partner level.</p>
                    <div className="cleaning-buttons">
                      {Object.entries(stats.tierDistribution || {})
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([tier, count]) => (
                          <button 
                            key={tier}
                            className={`preview-tier-btn tier-${(tier || '').toLowerCase().replace(' ', '-')}`}
                            onClick={() => loadPreview('tier', tier)}
                          >
                            <span className="tier-name">{tier}</span>
                            <span className="tier-count">{count}</span>
                            <span className="preview-icon">👁️</span>
                          </button>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* LMS Matching Tab */}
          {activeTab === 'lms' && (
            <div className="lms-matching-section">
              <div className="section-header">
                <h2>🔗 LMS User Matching</h2>
              </div>
              
              <p className="section-desc">
                Contacts are automatically matched to Northpass LMS users by email address.
                Run a re-link after syncing LMS users to update matches.
              </p>

              {matchStats && (
                <div className="match-results">
                  <div className="match-summary">
                    <div className="match-stat">
                      <span className="stat-value">{matchStats.totalContacts?.toLocaleString()}</span>
                      <span className="stat-label">CRM Contacts</span>
                    </div>
                    <div className="match-stat">
                      <span className="stat-value">{matchStats.totalLmsUsers?.toLocaleString()}</span>
                      <span className="stat-label">LMS Users</span>
                    </div>
                    <div className="match-stat success">
                      <span className="stat-value">{matchStats.matchedContacts?.toLocaleString()}</span>
                      <span className="stat-label">Matched</span>
                    </div>
                    <div className="match-stat warning">
                      <span className="stat-value">{matchStats.unmatchedContacts?.toLocaleString()}</span>
                      <span className="stat-label">Unmatched</span>
                    </div>
                    <div className="match-stat rate">
                      <span className="stat-value">{matchStats.matchRate}%</span>
                      <span className="stat-label">Match Rate</span>
                    </div>
                  </div>

                  <div className="match-actions">
                    <NintexButton variant="primary" onClick={handleRelink}>
                      🔄 Re-link Contacts to LMS
                    </NintexButton>
                    <p className="action-hint">
                      This will re-match contacts to LMS users by email. Run after LMS user sync.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Browse Tab */}
          {activeTab === 'browse' && (
            <div className="account-browser">
              <div className="section-header">
                <h2>🔍 Browse Partner Accounts</h2>
              </div>

              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search accounts by name..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="search-input"
                />
                {searchTerm && (
                  <button className="clear-search" onClick={() => handleSearch('')}>×</button>
                )}
              </div>

              <div className="accounts-list">
                {partners.map((partner) => (
                  <div 
                    key={partner.id} 
                    className={`account-item ${selectedPartner?.id === partner.id ? 'selected' : ''}`}
                    onClick={() => {
                      if (selectedPartner?.id === partner.id) {
                        setSelectedPartner(null);
                        setSelectedPartnerContacts([]);
                      } else {
                        setSelectedPartner(partner);
                        loadPartnerContacts(partner.id);
                      }
                    }}
                  >
                    <div className="account-main">
                      <span className="account-name">{partner.account_name}</span>
                      <div className="account-meta">
                        <span className={`tier-badge tier-${(partner.partner_tier || '').toLowerCase().replace(' ', '-')}`}>
                          {partner.partner_tier || 'Unknown'}
                        </span>
                        <span className="region-badge">{partner.account_region || 'Unknown'}</span>
                        <span className="contact-count">{partner.contact_count} contacts</span>
                        {partner.lms_linked_count > 0 && (
                          <span className="lms-count">🔗 {partner.lms_linked_count} LMS</span>
                        )}
                      </div>
                    </div>

                    {selectedPartner?.id === partner.id && (
                      <div className="account-details">
                        <div className="account-actions">
                          <button 
                            className="delete-account-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePartner(partner.id, partner.account_name);
                            }}
                          >
                            🗑️ Delete Partner
                          </button>
                        </div>
                        <h4>Contacts ({selectedPartnerContacts.length})</h4>
                        <div className="contacts-list">
                          {selectedPartnerContacts.slice(0, 20).map((contact) => (
                            <div key={contact.id} className="contact-item">
                              <span className="contact-name">
                                {contact.first_name} {contact.last_name}
                              </span>
                              <span className="contact-email">{contact.email}</span>
                              {contact.lms_user_id && (
                                <span className="lms-linked">🔗 LMS</span>
                              )}
                            </div>
                          ))}
                          {selectedPartnerContacts.length > 20 && (
                            <div className="more-contacts">
                              +{selectedPartnerContacts.length - 20} more contacts
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {partners.length === 0 && !loading && (
                  <div className="no-results">
                    {searchTerm ? `No partners found matching "${searchTerm}"` : 'No partners imported yet'}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty State */}
      {!loading && (!stats || stats.totalContacts === 0) && (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <h3>No Data Imported Yet</h3>
          <p>
            Upload your partner contact Excel file above to get started. 
            Data will be stored in MariaDB and available across all admin tools.
          </p>
        </div>
      )}

      {/* How It Works - only show when no data */}
      {(!stats || stats.totalContacts === 0) && (
        <div className="how-it-works">
          <h2>ℹ️ How It Works</h2>
          <div className="steps-grid">
            <div className="step">
              <div className="step-number">1</div>
              <h4>Import Excel Data</h4>
              <p>Upload your partner contact export file. Data is stored in MariaDB.</p>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <h4>Auto-Link to LMS</h4>
              <p>Contacts are automatically matched to Northpass users by email.</p>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <h4>Clean & Organize</h4>
              <p>Remove unwanted contacts by region, tier, or account pattern.</p>
            </div>
            <div className="step">
              <div className="step-number">4</div>
              <h4>Use Everywhere</h4>
              <p>Data is available in Reports, Group Analysis, and other tools.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataManagement;
