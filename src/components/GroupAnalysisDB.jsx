import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import './GroupAnalysis.css';
import NintexButton from './NintexButton';
import northpassApi from '../services/northpassApi';

/**
 * GroupAnalysisDB - Group Analysis powered by local MariaDB
 * Reads from local database for fast analysis, writes through API proxy
 */
function GroupAnalysisDB() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groups, setGroups] = useState([]);
  const [stats, setStats] = useState({});
  const [syncStatus, setSyncStatus] = useState(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  
  // Selected group for details
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetails, setGroupDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  // View mode
  const [viewMode, setViewMode] = useState('groups');
  
  // Missing partners
  const [partnersWithoutGroups, setPartnersWithoutGroups] = useState([]);
  const [missingPartnersSearch, setMissingPartnersSearch] = useState('');
  const [missingPartnersSort, setMissingPartnersSort] = useState('name');
  
  // Modal states
  const [editingGroup, setEditingGroup] = useState(null);
  const [showAddUsersModal, setShowAddUsersModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [createGroupPartner, setCreateGroupPartner] = useState(null);

  // Load groups from local DB
  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/db/group-analysis/groups?filter=${filterMode}&search=${encodeURIComponent(searchTerm)}`);
      if (!response.ok) throw new Error('Failed to load groups');
      
      const data = await response.json();
      setGroups(data.groups || []);
      setStats(data.stats || {});
    } catch (err) {
      console.error('Load groups error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterMode, searchTerm]);

  // Load sync status
  const loadSyncStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/db/group-analysis/sync-status');
      if (response.ok) {
        const data = await response.json();
        setSyncStatus(data);
      }
    } catch (err) {
      console.error('Sync status error:', err);
    }
  }, []);

  // Load partners without groups
  const loadPartnersWithoutGroups = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (missingPartnersSearch) params.append('search', missingPartnersSearch);
      if (missingPartnersSort) params.append('sort', missingPartnersSort);
      
      const response = await fetch(`/api/db/group-analysis/partners-without-groups?${params}`);
      if (response.ok) {
        const data = await response.json();
        setPartnersWithoutGroups(data);
      }
    } catch (err) {
      console.error('Partners without groups error:', err);
    }
  }, [missingPartnersSearch, missingPartnersSort]);

  // Load group details
  const loadGroupDetails = useCallback(async (groupId) => {
    setLoadingDetails(true);
    try {
      const response = await fetch(`/api/db/group-analysis/groups/${groupId}`);
      if (response.ok) {
        const data = await response.json();
        setGroupDetails(data);
      }
    } catch (err) {
      console.error('Group details error:', err);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadGroups();
    loadSyncStatus();
  }, [loadGroups, loadSyncStatus]);

  // Load missing partners when view changes
  useEffect(() => {
    if (viewMode === 'missingPartners') {
      loadPartnersWithoutGroups();
    }
  }, [viewMode, loadPartnersWithoutGroups]);

  // Handle group selection
  const handleGroupClick = (group) => {
    setSelectedGroup(group);
    loadGroupDetails(group.id);
  };

  // Trigger sync (groups only)
  const handleSync = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/db/sync/groups', { method: 'POST' });
      if (response.ok) {
        await loadGroups();
        await loadSyncStatus();
      }
    } catch (err) {
      setError('Sync failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Sync a single group to local DB after changes
  const syncSingleGroup = async (groupId) => {
    try {
      // Quick sync just the changed group
      await fetch('/api/db/sync/groups', { method: 'POST' });
      await loadGroups();
      if (selectedGroup?.id === groupId) {
        await loadGroupDetails(groupId);
      }
    } catch (err) {
      console.error('Single group sync failed:', err);
    }
  };

  // ========== WRITE OPERATIONS (via API proxy) ==========

  // Update group name
  const handleUpdateGroup = async (groupId, newName) => {
    try {
      await northpassApi.updateGroupName(groupId, newName);
      await syncSingleGroup(groupId);
      setEditingGroup(null);
      return true;
    } catch (err) {
      throw err;
    }
  };

  // Delete group
  const handleDeleteGroup = async (groupId) => {
    try {
      await northpassApi.deleteGroup(groupId);
      setEditingGroup(null);
      setSelectedGroup(null);
      setGroupDetails(null);
      await loadGroups();
      return true;
    } catch (err) {
      throw err;
    }
  };

  // Add users to group
  const handleAddUsersToGroup = async (groupId, userIds) => {
    try {
      const results = await northpassApi.addUsersToGroups(groupId, userIds, true);
      await syncSingleGroup(groupId);
      return results;
    } catch (err) {
      throw err;
    }
  };

  // Create group for partner
  const handleCreateGroup = async (partnerName, userIds = []) => {
    try {
      const newGroup = await northpassApi.createGroup(partnerName);
      
      if (userIds.length > 0 && newGroup?.id) {
        await northpassApi.addUsersToGroups(newGroup.id, userIds, true);
      }
      
      await loadGroups();
      await loadPartnersWithoutGroups();
      return newGroup;
    } catch (err) {
      throw err;
    }
  };

  // Filtered groups
  const filteredGroups = useMemo(() => {
    let filtered = groups;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(g => 
        g.name?.toLowerCase().includes(term) ||
        g.partner_name?.toLowerCase().includes(term)
      );
    }
    
    if (filterMode === 'matched') {
      filtered = filtered.filter(g => g.partner_id);
    } else if (filterMode === 'unmatched') {
      filtered = filtered.filter(g => !g.partner_id);
    }
    
    return filtered;
  }, [groups, searchTerm, filterMode]);

  return (
    <div className="group-analysis-content">
      <div className="analysis-header">
        <div className="header-content">
          <h1>👥 Group Analysis <span className="db-badge">📊 Local DB + Live API</span></h1>
          <p>Fast analysis from local DB • Write operations via API</p>
        </div>
        <div className="header-actions">
          <NintexButton variant="secondary" onClick={handleSync} disabled={loading}>
            🔄 Sync Groups
          </NintexButton>
          <NintexButton variant="secondary" onClick={loadGroups} disabled={loading}>
            ♻️ Refresh
          </NintexButton>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatus && (
        <div className="sync-status-banner">
          <span className="sync-info">
            📦 {syncStatus.groupCount} groups • {syncStatus.memberCount} memberships
          </span>
          <span className="sync-time">
            Last sync: {syncStatus.lastSync ? new Date(syncStatus.lastSync).toLocaleString() : 'Never'}
          </span>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* View Mode Tabs */}
      <div className="view-mode-tabs">
        <button 
          className={`view-tab ${viewMode === 'groups' ? 'active' : ''}`}
          onClick={() => setViewMode('groups')}
        >
          📋 LMS Groups ({stats.totalGroups || 0})
        </button>
        <button 
          className={`view-tab ${viewMode === 'missingPartners' ? 'active' : ''}`}
          onClick={() => setViewMode('missingPartners')}
        >
          ➕ Partners Without Groups ({stats.partnersWithoutGroups || 0})
        </button>
      </div>

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="summary-card">
          <span className="summary-value">{stats.totalGroups || 0}</span>
          <span className="summary-label">Total Groups</span>
        </div>
        <div className="summary-card success">
          <span className="summary-value">{stats.matched || 0}</span>
          <span className="summary-label">Matched</span>
        </div>
        <div className="summary-card error">
          <span className="summary-value">{stats.unmatched || 0}</span>
          <span className="summary-label">Unmatched</span>
        </div>
        <div className="summary-card warning">
          <span className="summary-value">{stats.partnersWithoutGroups || 0}</span>
          <span className="summary-label">Partners Without Groups</span>
        </div>
      </div>

      {/* GROUPS VIEW */}
      {viewMode === 'groups' && (
        <>
          {/* Filters */}
          <div className="controls-bar">
            <input
              type="text"
              placeholder="🔍 Search groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            
            <div className="filter-buttons">
              <button 
                className={`filter-btn ${filterMode === 'all' ? 'active' : ''}`}
                onClick={() => setFilterMode('all')}
              >
                All
              </button>
              <button 
                className={`filter-btn ${filterMode === 'matched' ? 'active' : ''}`}
                onClick={() => setFilterMode('matched')}
              >
                ✅ Matched
              </button>
              <button 
                className={`filter-btn ${filterMode === 'unmatched' ? 'active' : ''}`}
                onClick={() => setFilterMode('unmatched')}
              >
                ❌ Unmatched
              </button>
            </div>
          </div>

          {/* Groups List */}
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading groups from database...</p>
            </div>
          ) : (
            <div className="groups-list-container">
              <div className="groups-list">
                {filteredGroups.map(group => (
                  <div 
                    key={group.id} 
                    className={`group-list-item ${group.partner_id ? 'matched' : 'unmatched'} ${selectedGroup?.id === group.id ? 'selected' : ''}`}
                    onClick={() => handleGroupClick(group)}
                  >
                    <div className="group-main">
                      <span className="group-name">{group.name}</span>
                      <span className="group-members">{group.user_count} members</span>
                    </div>
                    {group.partner_id ? (
                      <div className="group-match">
                        <span className="match-badge exact">✅ Matched</span>
                        <span className={`tier-badge tier-${(group.partner_tier || '').toLowerCase().replace(/\s+/g, '-')}`}>
                          {group.partner_tier}
                        </span>
                      </div>
                    ) : (
                      <span className="match-badge none">❌ No Match</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Group Details Panel */}
              {selectedGroup && (
                <div className="group-details-panel">
                  <div className="details-header">
                    <h3>{selectedGroup.name}</h3>
                    <div className="header-buttons">
                      <button 
                        className="edit-btn" 
                        onClick={() => setEditingGroup(selectedGroup)}
                        title="Edit or Delete Group"
                      >
                        ✏️
                      </button>
                      <button className="close-btn" onClick={() => setSelectedGroup(null)}>✕</button>
                    </div>
                  </div>
                  
                  {loadingDetails ? (
                    <div className="loading-details">Loading...</div>
                  ) : groupDetails ? (
                    <div className="details-content">
                      {/* Stats */}
                      <div className="detail-stats">
                        <div className="detail-stat">
                          <span className="value">{groupDetails.stats?.memberCount || 0}</span>
                          <span className="label">Members</span>
                        </div>
                        <div className="detail-stat">
                          <span className="value">{groupDetails.stats?.domainCount || 0}</span>
                          <span className="label">Domains</span>
                        </div>
                        <div className="detail-stat highlight">
                          <span className="value">{groupDetails.stats?.potentialCount || 0}</span>
                          <span className="label">Potential Users</span>
                        </div>
                        <div className="detail-stat warning">
                          <span className="value">{groupDetails.stats?.crmNotInLmsCount || 0}</span>
                          <span className="label">CRM Not in LMS</span>
                        </div>
                      </div>

                      {/* Domains */}
                      {groupDetails.domains?.length > 0 && (
                        <div className="detail-section">
                          <h4>Email Domains</h4>
                          <div className="domains-list">
                            {groupDetails.domains.map(d => (
                              <span key={d} className="domain-tag">@{d}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Members */}
                      <div className="detail-section">
                        <h4>Members ({groupDetails.members?.length || 0})</h4>
                        <div className="members-list">
                          {groupDetails.members?.slice(0, 20).map(m => (
                            <div key={m.id} className="member-item">
                              <span className="member-name">{m.first_name} {m.last_name}</span>
                              <span className="member-email">{m.email}</span>
                            </div>
                          ))}
                          {(groupDetails.members?.length || 0) > 20 && (
                            <div className="more-items">...and {groupDetails.members.length - 20} more</div>
                          )}
                        </div>
                      </div>

                      {/* Potential Users - with Add button */}
                      {groupDetails.potentialUsers?.length > 0 && (
                        <div className="detail-section">
                          <div className="section-header">
                            <h4>🔍 Potential Users ({groupDetails.potentialUsers.length})</h4>
                            <NintexButton 
                              variant="primary" 
                              size="small"
                              onClick={() => setShowAddUsersModal(true)}
                            >
                              ➕ Add Users
                            </NintexButton>
                          </div>
                          <p className="helper-text">Users with same email domain not in this group</p>
                          <div className="potential-list">
                            {groupDetails.potentialUsers.slice(0, 10).map(u => (
                              <div key={u.id} className="potential-item">
                                <span>{u.first_name} {u.last_name}</span>
                                <span className="email">{u.email}</span>
                              </div>
                            ))}
                            {groupDetails.potentialUsers.length > 10 && (
                              <div className="more-items">...and {groupDetails.potentialUsers.length - 10} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* CRM Contacts Not in LMS */}
                      {groupDetails.crmContactsNotInLms?.length > 0 && (
                        <div className="detail-section warning-section">
                          <h4>📋 CRM Contacts Not in LMS ({groupDetails.crmContactsNotInLms.length})</h4>
                          <p className="helper-text">CRM contacts for this partner without LMS accounts</p>
                          <div className="crm-list">
                            {groupDetails.crmContactsNotInLms.slice(0, 10).map((c, i) => (
                              <div key={i} className="crm-item">
                                <span>{c.first_name} {c.last_name}</span>
                                <span className="email">{c.email}</span>
                              </div>
                            ))}
                            {groupDetails.crmContactsNotInLms.length > 10 && (
                              <div className="more-items">...and {groupDetails.crmContactsNotInLms.length - 10} more</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p>Select a group to view details</p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MISSING PARTNERS VIEW */}
      {viewMode === 'missingPartners' && (
        <div className="missing-partners-view">
          <div className="controls-bar">
            <input
              type="text"
              placeholder="🔍 Search partners..."
              value={missingPartnersSearch}
              onChange={(e) => setMissingPartnersSearch(e.target.value)}
              className="search-input"
            />
            <div className="sort-controls">
              <label>Sort by:</label>
              <select 
                value={missingPartnersSort} 
                onChange={(e) => setMissingPartnersSort(e.target.value)}
                className="sort-select"
              >
                <option value="name">📝 Name</option>
                <option value="tier">🏆 Tier</option>
                <option value="region">🌍 Region</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading partners...</p>
            </div>
          ) : (
            <div className="partners-grid">
              {partnersWithoutGroups.map(partner => (
                <div key={partner.id} className="partner-card">
                  <div className="partner-card-header">
                    <h3>{partner.account_name}</h3>
                    <span className={`tier-badge tier-${(partner.partner_tier || '').toLowerCase().replace(/\s+/g, '-')}`}>
                      {partner.partner_tier || 'Unknown'}
                    </span>
                  </div>
                  <div className="partner-card-body">
                    <div className="partner-info">
                      <span className="info-item">👥 {partner.contact_count} contacts</span>
                      <span className="info-item">💻 {partner.lms_user_count} in LMS</span>
                      <span className="info-item">🌍 {partner.account_region || 'Unknown'}</span>
                    </div>
                    <NintexButton 
                      variant="primary" 
                      size="small"
                      onClick={() => {
                        setCreateGroupPartner(partner);
                        setShowCreateGroupModal(true);
                      }}
                    >
                      ➕ Create Group
                    </NintexButton>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && partnersWithoutGroups.length === 0 && (
            <div className="empty-state">
              <p>🎉 All partners have matching groups!</p>
            </div>
          )}
        </div>
      )}

      {/* MODALS */}
      
      {/* Edit Group Modal */}
      {editingGroup && (
        <EditGroupModal
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSave={handleUpdateGroup}
          onDelete={handleDeleteGroup}
        />
      )}

      {/* Add Users Modal */}
      {showAddUsersModal && groupDetails && (
        <AddUsersModal
          isOpen={showAddUsersModal}
          onClose={() => setShowAddUsersModal(false)}
          users={groupDetails.potentialUsers || []}
          groupName={selectedGroup?.name}
          groupId={selectedGroup?.id}
          onAddUsers={handleAddUsersToGroup}
        />
      )}

      {/* Create Group Modal */}
      {showCreateGroupModal && createGroupPartner && (
        <CreateGroupModal
          partner={createGroupPartner}
          onClose={() => {
            setShowCreateGroupModal(false);
            setCreateGroupPartner(null);
          }}
          onCreate={handleCreateGroup}
        />
      )}
    </div>
  );
}

// ========== MODAL COMPONENTS ==========

// Edit Group Modal
function EditGroupModal({ group, onClose, onSave, onDelete }) {
  const [newName, setNewName] = useState(group?.name || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    if (!newName.trim() || newName === group?.name) {
      onClose();
      return;
    }
    
    setSaving(true);
    setError(null);
    try {
      await onSave(group.id, newName.trim());
    } catch (err) {
      setError('Failed to update group: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onDelete(group.id);
    } catch (err) {
      setError('Failed to delete group: ' + err.message);
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content edit-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>✏️ Edit Group</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-body">
          {error && <div className="modal-error">{error}</div>}
          
          <div className="edit-form">
            <label>Current Name:</label>
            <div className="current-name">{group?.name}</div>
            
            <label>New Name:</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter new group name..."
              className="name-input"
            />
          </div>
          
          {showDeleteConfirm ? (
            <div className="delete-confirm">
              <p>⚠️ Are you sure you want to delete this group?</p>
              <p className="delete-warning">This action cannot be undone!</p>
              <div className="confirm-actions">
                <NintexButton variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </NintexButton>
                <NintexButton 
                  variant="danger" 
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? '🔄 Deleting...' : '🗑️ Yes, Delete'}
                </NintexButton>
              </div>
            </div>
          ) : (
            <div className="modal-actions">
              <NintexButton 
                variant="danger" 
                onClick={() => setShowDeleteConfirm(true)}
              >
                🗑️ Delete Group
              </NintexButton>
              <div className="right-actions">
                <NintexButton variant="secondary" onClick={onClose}>
                  Cancel
                </NintexButton>
                <NintexButton 
                  variant="primary" 
                  onClick={handleSave}
                  disabled={saving || !newName.trim() || newName === group?.name}
                >
                  {saving ? '🔄 Saving...' : '💾 Save Changes'}
                </NintexButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// Add Users Modal
function AddUsersModal({ isOpen, onClose, users, groupName, groupId, onAddUsers }) {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [addProgress, setAddProgress] = useState({ current: 0, total: 0 });
  const [addResults, setAddResults] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedUsers([]);
      setAddResults(null);
    }
  }, [isOpen]);

  const toggleUser = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAll = () => setSelectedUsers(users.map(u => u.id));
  const selectNone = () => setSelectedUsers([]);

  const handleAddUsers = async () => {
    if (selectedUsers.length === 0) return;
    
    setIsAdding(true);
    setAddProgress({ current: 0, total: selectedUsers.length });
    
    try {
      const results = await onAddUsers(groupId, selectedUsers);
      setAddResults(results);
    } catch (err) {
      setAddResults({ error: err.message });
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>➕ Add Users to Group</h2>
          <p className="modal-subtitle">
            Select users to add to "{groupName}"
          </p>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-body">
          {addResults ? (
            <div className="add-results">
              {addResults.error ? (
                <>
                  <h3>❌ Error Adding Users</h3>
                  <p className="error-message">{addResults.error}</p>
                </>
              ) : (
                <h3>✅ Users Added Successfully</h3>
              )}
              <div className="results-grid">
                <div className="result-item">
                  <span className="result-label">Added to {groupName}:</span>
                  <span className="result-value success">{addResults.primaryGroup?.success || 0}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Already in group:</span>
                  <span className="result-value warning">{addResults.primaryGroup?.alreadyExists || 0}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Failed:</span>
                  <span className="result-value error">{addResults.primaryGroup?.failed || 0}</span>
                </div>
              </div>
              <NintexButton variant="primary" onClick={onClose}>
                Close
              </NintexButton>
            </div>
          ) : isAdding ? (
            <div className="adding-progress">
              <div className="progress-spinner"></div>
              <p>Adding users... {addProgress.current}/{addProgress.total}</p>
            </div>
          ) : (
            <>
              <div className="selection-controls">
                <button onClick={selectAll} className="selection-btn">Select All</button>
                <button onClick={selectNone} className="selection-btn">Select None</button>
                <span className="selection-count">
                  {selectedUsers.length} of {users.length} selected
                </span>
              </div>
              
              <div className="users-list-modal">
                {users.map(user => (
                  <label key={user.id} className="user-item-modal">
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(user.id)}
                      onChange={() => toggleUser(user.id)}
                    />
                    <div className="user-info-modal">
                      <span className="user-name">{user.first_name} {user.last_name}</span>
                      <span className="user-email">{user.email}</span>
                    </div>
                  </label>
                ))}
              </div>
              
              <div className="modal-actions">
                <NintexButton variant="secondary" onClick={onClose}>
                  Cancel
                </NintexButton>
                <NintexButton 
                  variant="primary" 
                  onClick={handleAddUsers}
                  disabled={selectedUsers.length === 0}
                >
                  Add {selectedUsers.length} Users to Group
                </NintexButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// Create Group Modal
function CreateGroupModal({ partner, onClose, onCreate }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    
    try {
      // Get LMS user IDs for this partner's contacts
      const response = await fetch(`/api/db/group-analysis/partner-lms-users/${partner.id}`);
      let userIds = [];
      if (response.ok) {
        const data = await response.json();
        userIds = data.map(u => u.id);
      }
      
      await onCreate(partner.account_name, userIds);
      setSuccess(true);
      
      // Auto close after success
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError('Failed to create group: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content create-group-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>➕ Create Group for Partner</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-body">
          {error && <div className="modal-error">{error}</div>}
          
          {success ? (
            <div className="success-message">
              <span className="success-icon">✅</span>
              <h3>Group Created Successfully!</h3>
              <p>Group "{partner.account_name}" has been created.</p>
            </div>
          ) : (
            <>
              <div className="partner-summary">
                <h3>{partner.account_name}</h3>
                <div className="partner-meta">
                  <span className={`tier-badge tier-${(partner.partner_tier || '').toLowerCase().replace(/\s+/g, '-')}`}>
                    {partner.partner_tier || 'Unknown'}
                  </span>
                  <span>{partner.contact_count} contacts</span>
                  <span>{partner.lms_user_count} in LMS</span>
                  <span>{partner.account_region || 'Unknown region'}</span>
                </div>
              </div>
              
              <div className="create-info">
                <p>This will:</p>
                <ul>
                  <li>Create a new group named "{partner.account_name}"</li>
                  <li>Add {partner.lms_user_count} existing LMS users to the group</li>
                  <li>Add users to the "All Partners" group</li>
                </ul>
              </div>
              
              <div className="modal-actions">
                <NintexButton variant="secondary" onClick={onClose} disabled={creating}>
                  Cancel
                </NintexButton>
                <NintexButton 
                  variant="primary" 
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating ? '🔄 Creating...' : `➕ Create Group`}
                </NintexButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default GroupAnalysisDB;
