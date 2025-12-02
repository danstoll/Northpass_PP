import React, { useState, useEffect, useCallback } from 'react';
import './GroupAnalysis.css';
import northpassApi from '../services/northpassApi';
import NintexButton from './NintexButton';

// Modal Component for displaying users to add
const UserSelectionModal = ({
  isOpen, 
  onClose, 
  users, 
  groupName, 
  groupId,
  onAddUsers 
}) => {
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

  const selectAll = () => {
    setSelectedUsers(users.map(u => u.id));
  };

  const selectNone = () => {
    setSelectedUsers([]);
  };

  const handleAddUsers = async () => {
    if (selectedUsers.length === 0) return;
    
    setIsAdding(true);
    setAddProgress({ current: 0, total: selectedUsers.length });
    
    try {
      const results = await northpassApi.addUsersToGroups(
        groupId,
        selectedUsers,
        true, // Add to All Partners group
        (current, total) => {
          setAddProgress({ current, total });
        }
      );
      
      setAddResults(results);
      onAddUsers(results);
      
    } catch (error) {
      console.error('Error adding users:', error);
      setAddResults({ error: error.message });
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔍 Users with Matching Domains</h2>
          <p className="modal-subtitle">
            Found {users.length} users not in "{groupName}"
          </p>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-body">
          {addResults ? (
            <div className="add-results">
              <h3>✅ Users Added Successfully</h3>
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
                {!addResults.allPartnersGroup?.skipped && (
                  <>
                    <div className="result-item">
                      <span className="result-label">Added to All Partners:</span>
                      <span className="result-value success">{addResults.allPartnersGroup?.success || 0}</span>
                    </div>
                  </>
                )}
              </div>
              <NintexButton variant="primary" onClick={onClose}>
                Close
              </NintexButton>
            </div>
          ) : isAdding ? (
            <div className="adding-progress">
              <div className="progress-spinner"></div>
              <p>Adding users... {addProgress.current}/{addProgress.total}</p>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${(addProgress.current / addProgress.total) * 100}%` }}
                ></div>
              </div>
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
                      <span className="user-name">{user.name}</span>
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
    </div>
  );
};

// Group Card Component
const GroupCard = ({ group, onAnalyze, isAnalyzing, analysisResult }) => {
  const [showModal, setShowModal] = useState(false);
  
  const handleAddUsers = (results) => {
    console.log('Users added:', results);
    // Could refresh the analysis here if needed
  };

  return (
    <div className="group-card">
      <div className="group-card-header">
        <h3>{group.attributes?.name || 'Unknown Group'}</h3>
        <span className="group-id">ID: {group.id.substring(0, 8)}...</span>
      </div>
      
      <div className="group-card-body">
        {analysisResult ? (
          <div className="analysis-result">
            <div className="analysis-stats">
              <div className="stat">
                <span className="stat-value">{analysisResult.memberCount}</span>
                <span className="stat-label">Members</span>
              </div>
              <div className="stat">
                <span className="stat-value">{analysisResult.domains.length}</span>
                <span className="stat-label">Domains</span>
              </div>
              <div className="stat highlight">
                <span className="stat-value">{analysisResult.potentialUsers.length}</span>
                <span className="stat-label">Missing Users</span>
              </div>
            </div>
            
            {analysisResult.domains.length > 0 && (
              <div className="domains-list">
                <strong>Domains:</strong> {analysisResult.domains.join(', ')}
              </div>
            )}
            
            {analysisResult.potentialUsers.length > 0 ? (
              <NintexButton 
                variant="primary" 
                size="small"
                onClick={() => setShowModal(true)}
              >
                👥 View {analysisResult.potentialUsers.length} Missing Users
              </NintexButton>
            ) : (
              <p className="no-missing">✅ No missing users found</p>
            )}
          </div>
        ) : (
          <NintexButton 
            variant="secondary" 
            size="small"
            onClick={() => onAnalyze(group)}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? '🔄 Analyzing...' : '🔍 Analyze Group'}
          </NintexButton>
        )}
      </div>
      
      <UserSelectionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        users={analysisResult?.potentialUsers || []}
        groupName={group.attributes?.name || 'Unknown'}
        groupId={group.id}
        onAddUsers={handleAddUsers}
      />
    </div>
  );
};

const GroupAnalysis = () => {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [filteredGroups, setFilteredGroups] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [analysisResults, setAnalysisResults] = useState({});
  const [analyzingGroupId, setAnalyzingGroupId] = useState(null);
  
  // Progress for bulk analysis
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const allGroups = await northpassApi.getAllGroups();
      
      // Sort groups alphabetically
      const sorted = allGroups.sort((a, b) => 
        (a.attributes?.name || '').localeCompare(b.attributes?.name || '')
      );
      setGroups(sorted);
      setFilteredGroups(sorted);
    } catch (error) {
      console.error('Error loading groups:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load groups on mount
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (searchTerm) {
      const filtered = groups.filter(g => 
        (g.attributes?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredGroups(filtered);
    } else {
      setFilteredGroups(groups);
    }
  }, [searchTerm, groups]);

  const analyzeGroup = async (group) => {
    setAnalyzingGroupId(group.id);
    
    try {
      // Get group members
      const members = await northpassApi.getGroupUsers(group.id);
      
      // Extract email domains from members
      const domains = [...new Set(
        members
          .map(m => m.attributes?.email?.split('@')[1])
          .filter(Boolean)
          .map(d => d.toLowerCase())
      )];
      
      // Get member IDs as a Set for O(1) lookups
      const memberIds = new Set(members.map(m => m.id));
      
      let potentialUsers = [];
      if (domains.length > 0) {
        // Use domain-based API filtering (more efficient for targeted searches)
        // This only fetches users matching the domains, not all users
        potentialUsers = await northpassApi.searchUsersByEmailDomains(domains, memberIds);
      }
      
      setAnalysisResults(prev => ({
        ...prev,
        [group.id]: {
          memberCount: members.length,
          domains,
          potentialUsers
        }
      }));
      
    } catch (error) {
      console.error('Error analyzing group:', error);
      setAnalysisResults(prev => ({
        ...prev,
        [group.id]: {
          error: error.message,
          memberCount: 0,
          domains: [],
          potentialUsers: []
        }
      }));
    } finally {
      setAnalyzingGroupId(null);
    }
  };

  const analyzeAllGroups = async () => {
    setBulkAnalyzing(true);
    setBulkProgress({ current: 0, total: filteredGroups.length });
    
    for (let i = 0; i < filteredGroups.length; i++) {
      const group = filteredGroups[i];
      setBulkProgress({ current: i + 1, total: filteredGroups.length });
      
      if (!analysisResults[group.id]) {
        await analyzeGroup(group);
        // Delay between groups to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setBulkAnalyzing(false);
  };

  // Summary statistics
  const getSummaryStats = () => {
    const analyzed = Object.values(analysisResults);
    const totalMissing = analyzed.reduce((sum, r) => sum + (r.potentialUsers?.length || 0), 0);
    const groupsWithMissing = analyzed.filter(r => (r.potentialUsers?.length || 0) > 0).length;
    
    return {
      totalGroups: groups.length,
      analyzedGroups: analyzed.length,
      totalMissing,
      groupsWithMissing
    };
  };

  const stats = getSummaryStats();

  return (
    <div className="group-analysis-content">
      <div className="analysis-header">
        <div className="header-content">
          <h1>👥 Group Analysis</h1>
          <p>Analyze groups to find users with matching email domains who are not yet members.</p>
        </div>
        <div className="header-actions">
          <NintexButton 
            variant="secondary" 
            onClick={loadGroups}
            disabled={loading}
          >
            🔄 Refresh Groups
          </NintexButton>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="summary-card">
          <span className="summary-value">{stats.totalGroups}</span>
          <span className="summary-label">Total Groups</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{stats.analyzedGroups}</span>
          <span className="summary-label">Analyzed</span>
        </div>
        <div className="summary-card highlight">
          <span className="summary-value">{stats.groupsWithMissing}</span>
          <span className="summary-label">With Missing Users</span>
        </div>
        <div className="summary-card highlight">
          <span className="summary-value">{stats.totalMissing}</span>
          <span className="summary-label">Total Missing</span>
        </div>
      </div>

      {/* Search and Bulk Actions */}
      <div className="controls-bar">
        <input
          type="text"
          placeholder="🔍 Search groups..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <NintexButton 
          variant="primary"
          onClick={analyzeAllGroups}
          disabled={bulkAnalyzing || filteredGroups.length === 0}
        >
          {bulkAnalyzing 
            ? `Analyzing ${bulkProgress.current}/${bulkProgress.total}...`
            : `🔍 Analyze All ${filteredGroups.length} Groups`
          }
        </NintexButton>
      </div>

      {bulkAnalyzing && (
        <div className="bulk-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
            ></div>
          </div>
          <p>Analyzing group {bulkProgress.current} of {bulkProgress.total}...</p>
        </div>
      )}

      {/* Groups Grid */}
      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading groups...</p>
        </div>
      ) : (
        <div className="groups-grid">
          {filteredGroups.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              onAnalyze={analyzeGroup}
              isAnalyzing={analyzingGroupId === group.id}
              analysisResult={analysisResults[group.id]}
            />
          ))}
        </div>
      )}

      {!loading && filteredGroups.length === 0 && (
        <div className="empty-state">
          <p>No groups found matching "{searchTerm}"</p>
        </div>
      )}
    </div>
  );
};

export default GroupAnalysis;
