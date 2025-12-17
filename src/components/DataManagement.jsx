/**
 * Data Management Page
 * Central hub for importing and managing partner data from Excel
 */

import React, { useState, useEffect } from 'react';
import DataImport from './DataImport';
import NintexButton from './NintexButton';
import { 
  getDatabaseStats, 
  getAccountSummary, 
  searchAccounts,
  exportToJSON,
  deleteContactsByAccountPattern,
  deleteContactsByRegion,
  deleteContactsByTier,
  deleteAccount,
  getAllContacts,
  storeLmsMatchResults,
  getLmsMatchingMetadata,
  getUnmatchedLmsUsers,
  getLmsUserDomainStats,
  hasLmsMatchingData
} from '../services/partnerDatabase';
import northpassApi from '../services/northpassApi';
import './DataManagement.css';

const DataManagement = () => {
  const [stats, setStats] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Active tab for sections
  const [activeTab, setActiveTab] = useState('overview');
  
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
  const [lmsMatching, setLmsMatching] = useState(false);
  const [, setLmsUsers] = useState([]);  // Used internally in handleMatchLmsUsers
  const [matchResults, setMatchResults] = useState(null);
  const [matchProgress, setMatchProgress] = useState(0);
  
  // Unmatched LMS users analysis state
  const [unmatchedUsers, setUnmatchedUsers] = useState([]);
  const [unmatchedSearchTerm, setUnmatchedSearchTerm] = useState('');
  const [domainStats, setDomainStats] = useState([]);
  const [lmsMetadata, setLmsMetadata] = useState(null);
  const [unmatchedSortBy, setUnmatchedSortBy] = useState('name');
  const [showDomainStats, setShowDomainStats] = useState(false);

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
      const dbStats = await getDatabaseStats();
      setStats(dbStats);
      
      if (dbStats?.lastImport) {
        const allAccounts = await getAccountSummary();
        setAccounts(allAccounts);
      }
      
      // Check for existing LMS matching data
      const hasLmsData = await hasLmsMatchingData();
      if (hasLmsData) {
        const metadata = await getLmsMatchingMetadata();
        setLmsMetadata(metadata);
        
        // Load unmatched users
        const unmatched = await getUnmatchedLmsUsers();
        setUnmatchedUsers(unmatched);
        
        // Load domain stats
        const domains = await getLmsUserDomainStats();
        setDomainStats(domains);
        
        // Set match results from stored data
        setMatchResults({
          totalLmsUsers: metadata.totalLmsUsers,
          matched: metadata.matched,
          unmatched: metadata.unmatched,
          matchRate: metadata.matchRate
        });
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImportComplete = async () => {
    await loadData();
  };

  const handleSearch = async (term) => {
    setSearchTerm(term);
    if (term.length >= 2) {
      const results = await searchAccounts(term);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const handleExportJSON = async () => {
    try {
      const data = await exportToJSON();
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

  // Data Cleaning - Delete single account (still used in Browse tab)
  const handleDeleteAccount = async (accountName) => {
    const account = accounts.find(a => a.accountName === accountName);
    if (!window.confirm(`Delete account "${accountName}" and all ${account?.contactCount || 0} contacts?`)) return;
    
    setCleaningInProgress(true);
    try {
      const result = await deleteAccount(accountName);
      setCleaningResult({ type: 'account', value: accountName, deleted: result.deleted });
      setSelectedAccount(null);
      await loadData();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete account');
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
      const allContacts = await getAllContacts();
      let filtered = [];
      
      switch (mode) {
        case 'region':
          filtered = allContacts.filter(c => c.accountRegion === value);
          break;
        case 'tier':
          filtered = allContacts.filter(c => c.partnerTier === value);
          break;
        case 'pattern':
          filtered = allContacts.filter(c => 
            c.accountName?.toLowerCase().includes(value.toLowerCase())
          );
          break;
        default:
          filtered = [];
      }
      
      setPreviewContacts(filtered);
    } catch (err) {
      console.error('Error loading preview:', err);
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
      let result;
      switch (previewMode) {
        case 'region':
          result = await deleteContactsByRegion(previewValue);
          break;
        case 'tier':
          result = await deleteContactsByTier(previewValue);
          break;
        case 'pattern':
          result = await deleteContactsByAccountPattern(previewValue);
          break;
        default:
          return;
      }
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

  // LMS Matching Functions
  const handleMatchLmsUsers = async () => {
    setLmsMatching(true);
    setMatchProgress(0);
    setMatchResults(null);

    try {
      // Get all contacts from database
      setMatchProgress(10);
      const contacts = await getAllContacts();
      
      // Get all LMS users
      setMatchProgress(30);
      const allLmsUsers = await northpassApi.getAllUsers();
      setLmsUsers(allLmsUsers);
      
      // Create contact email lookup (contact email -> contact object)
      setMatchProgress(50);
      const contactEmailMap = new Map();
      contacts.forEach(contact => {
        const email = contact.email?.toLowerCase();
        if (email) {
          contactEmailMap.set(email, contact);
        }
      });
      
      // Store match results in IndexedDB
      setMatchProgress(70);
      await storeLmsMatchResults(allLmsUsers, contactEmailMap);
      
      // Calculate stats for display
      setMatchProgress(90);
      const metadata = await getLmsMatchingMetadata();
      const unmatched = await getUnmatchedLmsUsers();
      const domains = await getLmsUserDomainStats();
      
      setLmsMetadata(metadata);
      setUnmatchedUsers(unmatched);
      setDomainStats(domains);
      
      setMatchProgress(100);
      setMatchResults({
        totalContacts: contacts.length,
        totalLmsUsers: allLmsUsers.length,
        matched: metadata.matched,
        unmatched: metadata.unmatched,
        matchRate: metadata.matchRate
      });
      
    } catch (err) {
      console.error('LMS matching error:', err);
      alert('Failed to match LMS users: ' + err.message);
    } finally {
      setLmsMatching(false);
    }
  };
  
  // Load unmatched users with search/sort
  const handleSearchUnmatched = async (term) => {
    setUnmatchedSearchTerm(term);
    const users = await getUnmatchedLmsUsers({ 
      searchTerm: term, 
      sortBy: unmatchedSortBy 
    });
    setUnmatchedUsers(users);
  };
  
  const handleSortUnmatched = async (sortBy) => {
    setUnmatchedSortBy(sortBy);
    const users = await getUnmatchedLmsUsers({ 
      searchTerm: unmatchedSearchTerm, 
      sortBy: sortBy 
    });
    setUnmatchedUsers(users);
  };

  return (
    <div className="data-management-content">
      <div className="management-header">
        <div className="header-content">
          <h1>💾 Partner Data Management</h1>
          <p>
            Import, clean, and match partner contact data with Northpass LMS users.
          </p>
        </div>
      </div>

      {/* Data Import Component */}
      <DataImport onImportComplete={handleImportComplete} />

      {/* Tabs for different sections */}
      {stats?.lastImport && (
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
              🎓 LMS Matching
            </button>
            <button 
              className={`tab-btn ${activeTab === 'browse' ? 'active' : ''}`}
              onClick={() => setActiveTab('browse')}
            >
              🔍 Browse Data
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
                  <span className="stat-value">{stats.totalAccounts?.toLocaleString()}</span>
                  <span className="stat-label">Partner Accounts</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{Object.keys(stats.tierDistribution || {}).length}</span>
                  <span className="stat-label">Partner Tiers</span>
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
                          if (!byAccount[c.accountName]) {
                            byAccount[c.accountName] = { 
                              accountName: c.accountName,
                              region: c.accountRegion,
                              tier: c.partnerTier,
                              contacts: [] 
                            };
                          }
                          byAccount[c.accountName].contacts.push(c);
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
                                    <span className="contact-name">{contact.firstName} {contact.lastName}</span>
                                    <span className="contact-email">{contact.email}</span>
                                    <span className={`contact-status ${(contact.contactStatus || '').toLowerCase()}`}>
                                      {contact.contactStatus}
                                    </span>
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
                <h2>🎓 LMS User Matching</h2>
              </div>
              
              <p className="section-desc">
                Match your CRM contacts with Northpass LMS users by email address.
                This helps identify which contacts have learning accounts.
              </p>

              {!matchResults && !lmsMetadata && (
                <div className="match-start">
                  <NintexButton 
                    variant="primary" 
                    onClick={handleMatchLmsUsers}
                    disabled={lmsMatching}
                    size="large"
                  >
                    {lmsMatching ? `🔄 Matching... ${matchProgress}%` : '🔗 Match with Northpass LMS'}
                  </NintexButton>
                  
                  {lmsMatching && (
                    <div className="match-progress">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${matchProgress}%` }} />
                      </div>
                      <span className="progress-text">
                        {matchProgress < 30 ? 'Loading contacts...' : 
                         matchProgress < 50 ? 'Fetching LMS users...' :
                         matchProgress < 70 ? 'Storing results...' : 'Analyzing matches...'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {(matchResults || lmsMetadata) && (
                <div className="match-results">
                  {lmsMetadata && (
                    <div className="match-meta">
                      <span>Last matched: {formatDate(lmsMetadata.matchDate)}</span>
                    </div>
                  )}
                  
                  <div className="match-summary">
                    <div className="match-stat">
                      <span className="stat-value">{stats?.totalContacts?.toLocaleString() || '0'}</span>
                      <span className="stat-label">CRM Contacts</span>
                    </div>
                    <div className="match-stat">
                      <span className="stat-value">{(matchResults?.totalLmsUsers || lmsMetadata?.totalLmsUsers || 0).toLocaleString()}</span>
                      <span className="stat-label">LMS Users</span>
                    </div>
                    <div className="match-stat success">
                      <span className="stat-value">{(matchResults?.matched || lmsMetadata?.matched || 0).toLocaleString()}</span>
                      <span className="stat-label">Matched</span>
                    </div>
                    <div className="match-stat warning">
                      <span className="stat-value">{(matchResults?.unmatched || lmsMetadata?.unmatched || 0).toLocaleString()}</span>
                      <span className="stat-label">Unmatched</span>
                    </div>
                    <div className="match-stat rate">
                      <span className="stat-value">{matchResults?.matchRate || lmsMetadata?.matchRate || 0}%</span>
                      <span className="stat-label">Match Rate</span>
                    </div>
                  </div>

                  <div className="match-actions">
                    <NintexButton 
                      variant="secondary" 
                      onClick={handleMatchLmsUsers}
                      disabled={lmsMatching}
                    >
                      {lmsMatching ? `🔄 ${matchProgress}%` : '🔄 Re-run Matching'}
                    </NintexButton>
                    <NintexButton 
                      variant="secondary" 
                      onClick={() => setShowDomainStats(!showDomainStats)}
                    >
                      {showDomainStats ? '📊 Hide Domain Stats' : '📊 Show Domain Stats'}
                    </NintexButton>
                  </div>

                  {/* Domain Stats */}
                  {showDomainStats && domainStats.length > 0 && (
                    <div className="domain-stats-section">
                      <h3>📧 Unmatched Users by Email Domain</h3>
                      <p className="section-note">Top domains with unmatched LMS users (not in CRM)</p>
                      <div className="domain-stats-list">
                        {domainStats.filter(d => d.unmatched > 0).slice(0, 30).map((domain, idx) => (
                          <div key={idx} className="domain-stat-item">
                            <span className="domain-name">@{domain.domain}</span>
                            <div className="domain-counts">
                              <span className="domain-total">{domain.total} total</span>
                              <span className="domain-matched">{domain.matched} matched</span>
                              <span className="domain-unmatched">{domain.unmatched} unmatched</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unmatched LMS Users Section */}
                  <div className="match-list-section unmatched-lms-users">
                    <h3>👤 Unmatched LMS Users ({unmatchedUsers.length.toLocaleString()})</h3>
                    <p className="section-note">LMS users without matching CRM contacts - these may need accounts created or emails corrected</p>
                    
                    <div className="unmatched-controls">
                      <input
                        type="text"
                        placeholder="Search by name or email..."
                        value={unmatchedSearchTerm}
                        onChange={(e) => handleSearchUnmatched(e.target.value)}
                        className="search-input"
                      />
                      <select 
                        value={unmatchedSortBy} 
                        onChange={(e) => handleSortUnmatched(e.target.value)}
                        className="sort-select"
                      >
                        <option value="name">Sort by Name</option>
                        <option value="email">Sort by Email</option>
                        <option value="lastActiveAt">Sort by Last Active</option>
                        <option value="createdAt">Sort by Created</option>
                      </select>
                    </div>
                    
                    <div className="match-list">
                      {unmatchedUsers.slice(0, 50).map((user, idx) => (
                        <div key={idx} className="match-item unmatched-lms">
                          <div className="contact-info">
                            <span className="contact-name">{user.name || 'No name'}</span>
                            <span className="contact-email">{user.email || 'No email'}</span>
                          </div>
                          <div className="lms-dates">
                            <span className="created">Created: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}</span>
                            <span className="last-active">Last Active: {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleDateString() : 'Never'}</span>
                          </div>
                        </div>
                      ))}
                      {unmatchedUsers.length > 50 && (
                        <div className="more-items">+{unmatchedUsers.length - 50} more unmatched LMS users</div>
                      )}
                      {unmatchedUsers.length === 0 && !lmsMatching && (
                        <div className="no-items">No unmatched LMS users found</div>
                      )}
                    </div>
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
                {(searchTerm.length >= 2 ? searchResults : accounts.slice(0, 50)).map((account, idx) => (
                  <div 
                    key={idx} 
                    className={`account-item ${selectedAccount?.accountName === account.accountName ? 'selected' : ''}`}
                    onClick={() => setSelectedAccount(selectedAccount?.accountName === account.accountName ? null : account)}
                  >
                    <div className="account-main">
                      <span className="account-name">{account.accountName}</span>
                      <div className="account-meta">
                        <span className={`tier-badge tier-${(account.partnerTier || '').toLowerCase().replace(' ', '-')}`}>
                          {account.partnerTier || 'Unknown'}
                        </span>
                        <span className="region-badge">{account.accountRegion || 'Unknown'}</span>
                        <span className="contact-count">{account.contactCount} contacts</span>
                      </div>
                    </div>

                    {selectedAccount?.accountName === account.accountName && (
                      <div className="account-details">
                        <div className="account-actions">
                          <button 
                            className="delete-account-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAccount(account.accountName);
                            }}
                          >
                            🗑️ Delete Account
                          </button>
                        </div>
                        <h4>Contacts ({account.contacts.length})</h4>
                        <div className="contacts-list">
                          {account.contacts.slice(0, 20).map((contact, cIdx) => (
                            <div key={cIdx} className="contact-item">
                              <span className="contact-name">
                                {contact.firstName} {contact.lastName}
                              </span>
                              <span className="contact-email">{contact.email}</span>
                              <span className={`contact-status ${(contact.contactStatus || '').toLowerCase()}`}>
                                {contact.contactStatus}
                              </span>
                            </div>
                          ))}
                          {account.contacts.length > 20 && (
                            <div className="more-contacts">
                              +{account.contacts.length - 20} more contacts
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {searchTerm.length >= 2 && searchResults.length === 0 && (
                  <div className="no-results">
                    No accounts found matching "{searchTerm}"
                  </div>
                )}

                {searchTerm.length < 2 && accounts.length > 50 && (
                  <div className="more-hint">
                    Showing first 50 accounts. Use search to find specific partners.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty State */}
      {!loading && !stats?.lastImport && (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <h3>No Data Imported Yet</h3>
          <p>
            Upload your partner contact Excel file above to get started. 
            Once imported, all admin tools will have instant access to the data.
          </p>
        </div>
      )}

      {/* How It Works - only show when no data */}
      {!stats?.lastImport && (
        <div className="how-it-works">
          <h2>ℹ️ How It Works</h2>
          <div className="steps-grid">
            <div className="step">
              <div className="step-number">1</div>
              <h4>Import Excel Data</h4>
              <p>Upload your partner contact export file. Data is stored locally in your browser.</p>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <h4>Clean Data</h4>
              <p>Remove unwanted contacts by region, tier, or account pattern.</p>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <h4>Match with LMS</h4>
              <p>Cross-reference CRM contacts with Northpass learning data.</p>
            </div>
            <div className="step">
              <div className="step-number">4</div>
              <h4>Generate Reports</h4>
              <p>Use cleaned data in Reporting and other admin tools.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataManagement;
