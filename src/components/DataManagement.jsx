/**
 * Data Management Page
 * Central hub for managing partner data - cleaning, browsing, and LMS linking
 * Impartner CRM sync has been moved to the LMS Sync Dashboard
 * Uses MariaDB for persistent storage via server API
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  TextField,
  InputAdornment,
  Chip,
} from '@mui/material';
import {
  Storage,
  Sync,
  CleaningServices,
  Link,
  Search,
  Download,
} from '@mui/icons-material';
import { 
  PageHeader, 
  PageContent, 
  StatsRow, 
  StatCard, 
  SectionCard,
  ActionButton,
  LoadingState,
  ResultAlert,
  TierBadge,
  TabPanel,
  InfoButton,
} from './ui/NintexUI';
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
  
  // Quick sync state (for LMS sync redirect)
  const [syncing, setSyncing] = useState(false);
  const [syncType, setSyncType] = useState(null);
  const [syncResult, setSyncResult] = useState(null);

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

  // Quick sync functions
  const startSync = async (type) => {
    setSyncing(true);
    setSyncType(type);
    setSyncResult(null);
    
    try {
      const response = await fetch(`/api/db/sync/${type}`, { method: 'POST' });
      const data = await response.json();
      
      if (response.ok) {
        setSyncResult({
          success: true,
          type,
          ...data.result
        });
        // Reload stats after sync
        await loadData();
      } else {
        setSyncResult({
          success: false,
          type,
          error: data.error || 'Sync failed'
        });
      }
    } catch (err) {
      setSyncResult({
        success: false,
        type,
        error: err.message
      });
    } finally {
      setSyncing(false);
      setSyncType(null);
    }
  };

  // Reset sync lock
  const resetSyncLock = async () => {
    try {
      const response = await fetch('/api/db/sync/reset', { method: 'POST' });
      const data = await response.json();
      
      if (response.ok) {
        setSyncResult({
          success: true,
          type: 'reset',
          message: 'Sync lock cleared successfully'
        });
      } else {
        setSyncResult({
          success: false,
          type: 'reset',
          error: data.error || 'Failed to reset sync lock'
        });
      }
    } catch (err) {
      setSyncResult({
        success: false,
        type: 'reset',
        error: err.message
      });
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

  // Tab value mapping
  const tabMap = { 'overview': 0, 'sync': 1, 'cleaning': 2, 'lms': 3, 'browse': 4 };
  const tabValueFromName = tabMap[activeTab] || 0;
  const handleTabChange = (event, newValue) => {
    const names = ['overview', 'sync', 'cleaning', 'lms', 'browse'];
    setActiveTab(names[newValue]);
  };

  return (
    <PageContent>
      <PageHeader
        icon={<Storage />}
        title="Partner Data Management"
        subtitle="Browse partner data and manage data cleaning tasks"
      />

      {/* Impartner Sync Redirect Notice */}
      <Box sx={{ 
        p: 3, 
        mb: 3, 
        bgcolor: 'rgba(107, 76, 154, 0.1)', 
        border: '1px solid rgba(107, 76, 154, 0.3)',
        borderRadius: 2 
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Sync sx={{ fontSize: 32, color: 'var(--nintex-purple)' }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Looking for Impartner CRM Sync?
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              Impartner sync operations have been moved to the{' '}
              <a href="/admin/sync" style={{ color: 'var(--nintex-orange)', fontWeight: 600 }}>
                LMS Sync Dashboard
              </a>
              {' '}where all sync tasks are managed in one place.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Tabs for different sections */}
      {stats?.totalContacts > 0 && (
        <>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs value={tabValueFromName} onChange={handleTabChange}>
              <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Overview<InfoButton tooltip="View database statistics - total partners, contacts, regions, and tiers in the system." /></Box>} icon={<Storage />} iconPosition="start" />
              <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Quick Sync<InfoButton tooltip="Quickly sync partners or contacts between the database and LMS. Refresh data without running full sync." /></Box>} icon={<Sync />} iconPosition="start" />
              <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Data Cleaning<InfoButton tooltip="Clean up duplicate or invalid data. Remove contacts by email pattern, region, or tier." /></Box>} icon={<CleaningServices />} iconPosition="start" />
              <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>LMS Matching<InfoButton tooltip="Link database partners to their LMS groups. View and fix partners without matching LMS groups." /></Box>} icon={<Link />} iconPosition="start" />
              <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Browse<InfoButton tooltip="Browse and search partner data. View partner details, contacts, and their LMS status." /></Box>} icon={<Search />} iconPosition="start" />
            </Tabs>
          </Box>

          {/* Cleaning Result Toast */}
          {cleaningResult && (
            <ResultAlert
              type="success"
              message={`Deleted ${cleaningResult.deleted} contacts ${cleaningResult.type === 'region' ? `from region "${cleaningResult.value}"` : cleaningResult.type === 'tier' ? `from tier "${cleaningResult.value}"` : `matching "${cleaningResult.value}"`}`}
              onClose={() => setCleaningResult(null)}
            />
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h2">Database Overview</Typography>
                <ActionButton 
                  variant="outlined" 
                  icon={<Download />}
                  onClick={handleExportJSON}
                >
                  Export JSON
                </ActionButton>
              </Box>

              <StatsRow columns={4}>
                <StatCard
                  icon="👤"
                  value={stats.totalContacts || 0}
                  label="Total Contacts"
                  variant="primary"
                />
                <StatCard
                  icon="🏢"
                  value={stats.totalPartners || 0}
                  label="Partner Accounts"
                  variant="default"
                />
                <StatCard
                  icon="🔗"
                  value={stats.linkedToLms || 0}
                  label="Linked to LMS"
                  variant="success"
                />
                <StatCard
                  icon="🌍"
                  value={Object.keys(stats.regionDistribution || {}).length}
                  label="Regions"
                  variant="default"
                />
              </StatsRow>

              {/* Tier Distribution */}
              <SectionCard title="Contacts by Tier" icon="📊">
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {Object.entries(stats.tierDistribution || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([tier, count]) => (
                      <Box key={tier} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TierBadge tier={tier} />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{count.toLocaleString()}</Typography>
                      </Box>
                    ))}
                </Box>
              </SectionCard>

              {/* Region Distribution */}
              <SectionCard title="Contacts by Region" icon="🌍">
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {Object.entries(stats.regionDistribution || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([region, count]) => (
                      <Chip 
                        key={region} 
                        label={`${region}: ${count.toLocaleString()}`}
                        variant="outlined"
                      />
                    ))}
                </Box>
              </SectionCard>
            </Box>
          )}

          {/* Quick Sync Tab - Redirect to LMS Sync Dashboard */}
          {activeTab === 'sync' && (
            <div className="quick-sync-section">
              <div className="section-header mb-4">
                <h2>🔄 LMS Sync</h2>
              </div>
              
              <div style={{ 
                textAlign: 'center', 
                padding: '60px 20px',
                background: 'var(--admin-bg-elevated)',
                borderRadius: '12px',
                border: '1px solid var(--admin-border-light)'
              }}>
                <span style={{ fontSize: '4rem', display: 'block', marginBottom: '20px' }}>🔄</span>
                <h3 style={{ margin: '0 0 12px', color: 'var(--admin-text-primary)' }}>
                  Sync operations have moved!
                </h3>
                <p style={{ color: 'var(--admin-text-secondary)', marginBottom: '24px', maxWidth: '500px', margin: '0 auto 24px' }}>
                  All sync operations (Users, Groups, Courses, Enrollments) are now consolidated in the 
                  <strong> LMS Sync Dashboard</strong> for better organization and scheduling capabilities.
                </p>
                <ActionButton 
                  variant="primary"
                  onClick={() => window.location.href = '/admin/sync'}
                  style={{ padding: '12px 32px', fontSize: '1rem' }}
                >
                  Go to LMS Sync Dashboard →
                </ActionButton>
              </div>

              {/* Sync Lock Reset - Keep this here for convenience */}
              <div className="sync-lock-reset mt-5 p-4" style={{ 
                background: 'var(--admin-bg-elevated)', 
                borderRadius: '8px',
                border: '1px solid var(--admin-border-light)'
              }}>
                <div className="d-flex align-center gap-3">
                  <span style={{ fontSize: '1.5rem' }}>🔓</span>
                  <div className="flex-1">
                    <h4 style={{ margin: 0 }}>Clear Sync Lock</h4>
                    <p className="text-sm opacity-70" style={{ margin: '4px 0 0' }}>
                      If a sync gets stuck or shows "Sync already in progress" error, use this to clear the lock.
                    </p>
                  </div>
                  <ActionButton 
                    variant="secondary"
                    onClick={resetSyncLock}
                    disabled={syncing}
                    size="small"
                  >
                    Clear Lock
                  </ActionButton>
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
                      <ActionButton 
                        variant="danger" 
                        onClick={handleDeleteFromPreview}
                        disabled={cleaningInProgress || previewContacts.length === 0}
                        size="small"
                      >
                        {cleaningInProgress ? '🔄 Deleting...' : '🗑️ Delete All'}
                      </ActionButton>
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
                      <ActionButton 
                        variant="primary" 
                        onClick={() => loadPreview('pattern', accountPatternToDelete)}
                        disabled={!accountPatternToDelete.trim()}
                      >
                        👁️ Preview
                      </ActionButton>
                    </div>
                    {accountPatternToDelete && partners.length > 0 && (
                      <div className="pattern-preview">
                        Will match: {partners.filter(p => 
                          p.account_name?.toLowerCase().includes(accountPatternToDelete.toLowerCase())
                        ).length} accounts
                        ({partners.filter(p => 
                          p.account_name?.toLowerCase().includes(accountPatternToDelete.toLowerCase())
                        ).reduce((sum, p) => sum + (p.contact_count || 0), 0)} contacts)
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
              <div className="section-header mb-4">
                <h2>🔗 LMS User Matching</h2>
              </div>
              
              <p className="section-desc opacity-70 mb-5">
                Contacts are automatically matched to Northpass LMS users by email address.
                Run a re-link after syncing LMS users to update matches.
              </p>

              {matchStats && (
                <div className="match-results">
                  <div className="match-summary d-flex flex-wrap gap-4 mb-6">
                    <div className="match-stat flex-1 text-center">
                      <span className="stat-value d-block font-semibold">{matchStats.totalContacts?.toLocaleString()}</span>
                      <span className="stat-label text-sm opacity-70">CRM Contacts</span>
                    </div>
                    <div className="match-stat flex-1 text-center">
                      <span className="stat-value d-block font-semibold">{matchStats.totalLmsUsers?.toLocaleString()}</span>
                      <span className="stat-label text-sm opacity-70">LMS Users</span>
                    </div>
                    <div className="match-stat success flex-1 text-center">
                      <span className="stat-value d-block font-semibold">{matchStats.matchedContacts?.toLocaleString()}</span>
                      <span className="stat-label text-sm opacity-70">Matched</span>
                    </div>
                    <div className="match-stat warning flex-1 text-center">
                      <span className="stat-value d-block font-semibold">{matchStats.unmatchedContacts?.toLocaleString()}</span>
                      <span className="stat-label text-sm opacity-70">Unmatched</span>
                    </div>
                    <div className="match-stat rate flex-1 text-center">
                      <span className="stat-value d-block font-semibold">{matchStats.matchRate}%</span>
                      <span className="stat-label text-sm opacity-70">Match Rate</span>
                    </div>
                  </div>

                  <div className="match-actions text-center">
                    <ActionButton variant="primary" onClick={handleRelink}>
                      🔄 Re-link Contacts to LMS
                    </ActionButton>
                    <p className="action-hint text-sm opacity-70 mt-3">
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
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography sx={{ fontSize: '3rem', mb: 2 }}>📁</Typography>
          <Typography variant="h3" sx={{ mb: 1 }}>No Data Synced Yet</Typography>
          <Typography variant="body2" sx={{ opacity: 0.7 }}>
            Run an Impartner sync above to pull partners and contacts from CRM.
          </Typography>
        </Box>
      )}

      {/* How It Works - only show when no data */}
      {(!stats || stats.totalContacts === 0) && (
        <SectionCard title="How It Works" icon="ℹ️">
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 3,
          }}>
            {[
              { step: 1, title: 'Sync from Impartner', desc: 'Pull partners & contacts from CRM API.' },
              { step: 2, title: 'Auto-Link to LMS', desc: 'Contacts matched to Northpass users.' },
              { step: 3, title: 'Clean & Organize', desc: 'Remove unwanted contacts by filter.' },
              { step: 4, title: 'Use Everywhere', desc: 'Data available in all admin tools.' },
            ].map(item => (
              <Card key={item.step} sx={{ textAlign: 'center' }}>
                <CardContent>
                  <Box sx={{ 
                    width: 40, 
                    height: 40, 
                    borderRadius: '50%', 
                    bgcolor: 'primary.main',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    mx: 'auto',
                    mb: 2,
                  }}>
                    {item.step}
                  </Box>
                  <Typography variant="h6" sx={{ mb: 1 }}>{item.title}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>{item.desc}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </SectionCard>
      )}
    </PageContent>
  );
};

export default DataManagement;
