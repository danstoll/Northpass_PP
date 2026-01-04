import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import './GroupAnalysisDB.css';
import northpassApi from '../services/northpassApi';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  Checkbox,
  FormControlLabel,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  Groups,
  Sync as SyncIcon,
  Search as SearchIcon,
  Refresh,
} from '@mui/icons-material';
import {
  PageHeader,
  PageContent,
  StatsRow,
  StatCard,
  SectionCard,
  SearchInput,
  ActionButton,
  RefreshButton,
  LoadingState,
  EmptyState,
  StatusChip,
  TierBadge,
  LabeledProgress,
} from './ui/NintexUI';

/**
 * GroupAnalysisDB - Group Analysis powered by local MariaDB
 * Theme matches DataSync dashboard (light theme)
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
  
  // Selected group for details panel
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetails, setGroupDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  // Sorting
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  
  // View mode
  const [viewMode, setViewMode] = useState('groups');
  
  // Missing partners
  const [partnersWithoutGroups, setPartnersWithoutGroups] = useState([]);
  
  // Modal states
  const [editingGroup, setEditingGroup] = useState(null);
  const [showAddUsersModal, setShowAddUsersModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [createGroupPartner, setCreateGroupPartner] = useState(null);
  const [showDomainModal, setShowDomainModal] = useState(null); // { groupId, type: 'custom'|'block' }
  
  // Bulk analysis state
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [bulkResults, setBulkResults] = useState(null);
  
  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);

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
      const response = await fetch(`/api/db/group-analysis/partners-without-groups`);
      if (response.ok) {
        const data = await response.json();
        setPartnersWithoutGroups(data);
      }
    } catch (err) {
      console.error('Partners without groups error:', err);
    }
  }, []);

  // Load group details and save analysis to database
  const loadGroupDetails = useCallback(async (groupId) => {
    setLoadingDetails(true);
    try {
      const response = await fetch(`/api/db/group-analysis/groups/${groupId}`);
      if (response.ok) {
        const data = await response.json();
        setGroupDetails(data);
        
        // Save analysis to database
        const potentialCount = data.potentialUsers?.length || 0;
        const totalNpcu = data.stats?.totalNpcu || 0;
        
        try {
          await fetch(`/api/db/group-analysis/groups/${groupId}/save-analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              potential_users: potentialCount,
              total_npcu: totalNpcu
            })
          });
          
          // Update local state to reflect saved data
          setGroups(prev => prev.map(g => 
            g.id === groupId 
              ? { ...g, potential_users: potentialCount, total_npcu: totalNpcu, last_analyzed: new Date().toISOString() }
              : g
          ));
        } catch (saveErr) {
          console.warn('Failed to save analysis:', saveErr);
        }
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
    loadPartnersWithoutGroups();
  }, [loadGroups, loadSyncStatus, loadPartnersWithoutGroups]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadGroups();
      loadSyncStatus();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadGroups, loadSyncStatus]);

  // Handle group selection
  const handleSelectGroup = useCallback((group) => {
    setSelectedGroup(group);
    loadGroupDetails(group.id);
  }, [loadGroupDetails]);

  // Domain management handlers
  const handleBlockDomain = async (groupId, domain) => {
    try {
      const response = await fetch(`/api/db/group-analysis/groups/${groupId}/block-domain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });
      if (!response.ok) throw new Error('Failed to block domain');
      // Refresh group details
      await loadGroupDetails(groupId);
    } catch (err) {
      setError('Failed to block domain: ' + err.message);
    }
  };

  const handleUnblockDomain = async (groupId, domain) => {
    try {
      const response = await fetch(`/api/db/group-analysis/groups/${groupId}/block-domain/${encodeURIComponent(domain)}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to unblock domain');
      // Refresh group details
      await loadGroupDetails(groupId);
    } catch (err) {
      setError('Failed to unblock domain: ' + err.message);
    }
  };

  const handleAddCustomDomain = async (groupId, domain) => {
    try {
      const response = await fetch(`/api/db/group-analysis/groups/${groupId}/custom-domain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });
      if (!response.ok) throw new Error('Failed to add custom domain');
      setShowDomainModal(null);
      // Refresh group details
      await loadGroupDetails(groupId);
    } catch (err) {
      setError('Failed to add custom domain: ' + err.message);
    }
  };

  const handleRemoveCustomDomain = async (groupId, domain) => {
    try {
      const response = await fetch(`/api/db/group-analysis/groups/${groupId}/custom-domain/${encodeURIComponent(domain)}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to remove custom domain');
      // Refresh group details
      await loadGroupDetails(groupId);
    } catch (err) {
      setError('Failed to remove custom domain: ' + err.message);
    }
  };

  // Sync all groups
  const handleSync = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/db/sync/groups', { method: 'POST' });
      const data = await response.json();
      
      if (!response.ok) {
        // Check if it's a conflict (sync already running)
        if (response.status === 409) {
          setError(`Sync blocked: ${data.error}. Use "Clear Sync Lock" to reset.`);
        } else {
          setError(data.error || 'Sync failed');
        }
        return;
      }
      
      await loadGroups();
      await loadSyncStatus();
    } catch (err) {
      setError('Sync failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset/clear sync lock
  const handleResetSync = async () => {
    try {
      const response = await fetch('/api/db/sync/reset', { method: 'POST' });
      if (response.ok) {
        setError(null);
        await loadSyncStatus();
      } else {
        const data = await response.json();
        setError('Failed to reset sync: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      setError('Failed to reset sync: ' + err.message);
    }
  };

  // Sync single group
  const syncSingleGroup = async (groupId, showFeedback = false) => {
    if (showFeedback) {
      setLoadingDetails(true);
    }
    try {
      const response = await fetch(`/api/db/group-analysis/sync-group/${groupId}`, { method: 'POST' });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Sync failed');
      }
      const result = await response.json();
      console.log('Group sync result:', result);
      
      await loadGroups();
      if (selectedGroup?.id === groupId) {
        await loadGroupDetails(groupId);
      }
      
      return result;
    } catch (err) {
      console.error('Single group sync failed:', err);
      if (showFeedback) {
        setError('Sync failed: ' + err.message);
      }
      throw err;
    } finally {
      if (showFeedback) {
        setLoadingDetails(false);
      }
    }
  };

  // Bulk analyze all groups
  const handleBulkAnalyze = async () => {
    setBulkAnalyzing(true);
    const startTime = Date.now();
    setBulkProgress({ current: 0, total: groups.length, stage: 'Starting...' });
    setBulkResults(null);
    
    const results = {
      totalGroups: groups.length,
      groupsWithPotentialUsers: 0,
      totalPotentialUsers: 0,
      groupsNeedingSync: 0,
      errors: 0,
      details: []
    };
    
    // Collect analyses to bulk save at end
    const analysesToSave = [];
    const updatedGroups = [...groups];
    
    try {
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        setBulkProgress({ 
          current: i + 1, 
          total: groups.length, 
          stage: `Analyzing ${group.name}...` 
        });
        
        try {
          const response = await fetch(`/api/db/group-analysis/groups/${group.id}`);
          if (response.ok) {
            const details = await response.json();
            const potentialCount = details.potentialUsers?.length || 0;
            const pendingCount = details.members?.filter(m => m.pending_source === 'local')?.length || 0;
            const totalNpcu = details.stats?.totalNpcu || 0;
            
            // Queue for bulk save
            analysesToSave.push({
              group_id: group.id,
              potential_users: potentialCount,
              total_npcu: totalNpcu
            });
            
            // Update local state
            const idx = updatedGroups.findIndex(g => g.id === group.id);
            if (idx !== -1) {
              updatedGroups[idx] = {
                ...updatedGroups[idx],
                potential_users: potentialCount,
                total_npcu: totalNpcu,
                last_analyzed: new Date().toISOString()
              };
            }
            
            if (potentialCount > 0 || pendingCount > 0) {
              results.details.push({
                groupId: group.id,
                groupName: details.group?.name || group.name || '(Unknown)',
                memberCount: details.stats?.memberCount || group.user_count || 0,
                potentialUsers: potentialCount,
                pendingSync: pendingCount,
                tier: details.group?.partner_tier || group.partner_tier
              });
              
              if (potentialCount > 0) {
                results.groupsWithPotentialUsers++;
                results.totalPotentialUsers += potentialCount;
              }
              if (pendingCount > 0) {
                results.groupsNeedingSync++;
              }
            }
          }
        } catch {
          results.errors++;
        }
        
        // Rate limit
        await new Promise(r => setTimeout(r, 50));
      }
      
      // Bulk save all analyses to database
      setBulkProgress({ current: groups.length, total: groups.length, stage: 'Saving to database...' });
      try {
        const saveResponse = await fetch('/api/db/group-analysis/save-bulk-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analyses: analysesToSave })
        });
        if (saveResponse.ok) {
          const saveResult = await saveResponse.json();
          results.savedToDb = saveResult.saved;
        }
      } catch (saveErr) {
        console.warn('Failed to bulk save analyses:', saveErr);
      }
      
      // Update state with new values
      setGroups(updatedGroups);
      
      // Calculate duration
      results.durationSeconds = Math.round((Date.now() - startTime) / 1000);
      results.saved = true;
      
      setBulkResults(results);
    } catch (err) {
      setError('Bulk analyze failed: ' + err.message);
    } finally {
      setBulkAnalyzing(false);
      setBulkProgress(null);
    }
  };

  // Sort handler
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIndicator = (field) => {
    if (sortField !== field) return ' ↕';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  // Groups with analysis data - now comes directly from DB
  const groupsWithCache = useMemo(() => groups, [groups]);

  // Filtered and sorted groups
  const filteredGroups = useMemo(() => {
    let filtered = groupsWithCache;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(g => 
        g.name?.toLowerCase().includes(term) ||
        g.partner_name?.toLowerCase().includes(term)
      );
    }
    
    if (filterMode === 'hasMembers') {
      filtered = filtered.filter(g => g.user_count > 0);
    } else if (filterMode === 'matched') {
      filtered = filtered.filter(g => g.partner_id);
    } else if (filterMode === 'unmatched') {
      filtered = filtered.filter(g => !g.partner_id);
    } else if (filterMode === 'hasPotential') {
      filtered = filtered.filter(g => g.potential_users > 0);
    } else if (filterMode === 'analyzed') {
      filtered = filtered.filter(g => g.last_analyzed);
    } else if (filterMode === 'notAnalyzed') {
      filtered = filtered.filter(g => !g.last_analyzed);
    }
    
    filtered.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      
      if (typeof aVal === 'string') aVal = aVal?.toLowerCase() || '';
      if (typeof bVal === 'string') bVal = bVal?.toLowerCase() || '';
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    return filtered;
  }, [groupsWithCache, searchTerm, filterMode, sortField, sortDirection]);

  // Handle adding users to group
  const handleAddUsersToGroup = async (groupId, userIds) => {
    const results = await northpassApi.addUsersToGroups(groupId, userIds, true);
    
    if (results.primaryGroup?.success) {
      try {
        await fetch(`/api/db/group-analysis/groups/${groupId}/add-members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds })
        });
        console.log('✅ Users added to local database');
      } catch (err) {
        console.error('Failed to add users to local DB:', err);
      }
    }
    
    await loadGroups();
    if (selectedGroup?.id === groupId) {
      await loadGroupDetails(groupId);
    }
    
    return results;
  };

  const handleCreateGroup = async (partnerName, userIds = []) => {
    const newGroup = await northpassApi.createGroup(partnerName);
    
    if (userIds.length > 0 && newGroup?.id) {
      await northpassApi.addUsersToGroups(newGroup.id, userIds, true);
    }
    
    await loadGroups();
    await loadPartnersWithoutGroups();
    return newGroup;
  };

  // Get tier badge class
  const getTierClass = (tier) => {
    if (!tier) return '';
    const t = tier.toLowerCase();
    if (t.includes('premier plus')) return 'tier-premier-plus';
    if (t.includes('premier')) return 'tier-premier';
    if (t.includes('select')) return 'tier-select';
    if (t.includes('certified')) return 'tier-certified';
    if (t.includes('registered')) return 'tier-registered';
    return 'tier-other';
  };

  // Loading state
  if (loading && groups.length === 0) {
    return (
      <PageContent>
        <LoadingState message="Loading group data..." />
      </PageContent>
    );
  }

  return (
    <PageContent>
      {/* Header */}
      <PageHeader 
        icon={<Groups />}
        title="Group Analysis"
        subtitle="LMS group management and partner matching"
        actions={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  size="small"
                />
              }
              label="Auto-refresh"
            />
            <RefreshButton 
              onClick={() => { loadGroups(); loadSyncStatus(); }} 
              loading={loading} 
              tooltip="Refresh"
            />
          </Box>
        }
      />

      {/* Error Banner */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Stats Section */}
      <StatsRow columns={7}>
        <StatCard icon="👥" value={stats.totalGroups || 0} label="Total Groups" variant="default" />
        <StatCard icon="👤" value={stats.withMembers || 0} label="With Members" variant="default" />
        <StatCard icon="✓" value={stats.matched || 0} label="Matched" variant="success" />
        <StatCard icon="?" value={stats.unmatched || 0} label="Unmatched" variant="warning" />
        <StatCard 
          icon="🔍" 
          value={groupsWithCache.filter(g => g.last_analyzed).length} 
          label="Analyzed" 
          variant="default" 
        />
        <StatCard 
          icon="⚡" 
          value={groupsWithCache.filter(g => g.potential_users > 0).length} 
          label="Need Users Added" 
          variant={groupsWithCache.filter(g => g.potential_users > 0).length > 0 ? 'warning' : 'default'} 
        />
        <StatCard icon="⚠️" value={partnersWithoutGroups.length} label="Missing Groups" variant="error" />
      </StatsRow>

      {syncStatus && (
        <Typography variant="body2" sx={{ opacity: 0.7, mb: 3 }}>
          Last sync: {syncStatus.lastSync ? new Date(syncStatus.lastSync).toLocaleString() : 'Never'}
        </Typography>
      )}

      {/* Bulk Analysis Progress */}
      {bulkAnalyzing && bulkProgress && (
        <SectionCard title="Bulk Analysis In Progress" icon="🔍" sx={{ mb: 3 }}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Stage: <strong>{bulkProgress.stage}</strong>
            </Typography>
            <LabeledProgress 
              value={(bulkProgress.current / bulkProgress.total) * 100}
              label={`${bulkProgress.current} / ${bulkProgress.total} groups`}
            />
          </Box>
        </SectionCard>
      )}

      {/* Bulk Analysis Results */}
      {bulkResults && (
        <SectionCard 
          title="Bulk Analysis Complete" 
          icon="✅"
          action={<ActionButton variant="outlined" size="small" onClick={() => setBulkResults(null)}>Dismiss</ActionButton>}
        >
          <StatsRow columns={5}>
            <StatCard value={bulkResults.totalGroups} label="Groups Analyzed" variant="default" size="small" />
            <StatCard value={bulkResults.groupsWithPotentialUsers} label="With Potential Users" variant="success" size="small" />
            <StatCard value={bulkResults.totalPotentialUsers} label="Total Potential" variant="default" size="small" />
            <StatCard value={bulkResults.groupsNeedingSync} label="Pending Sync" variant="warning" size="small" />
            {bulkResults.errors > 0 && (
              <StatCard value={bulkResults.errors} label="Errors" variant="error" size="small" />
            )}
          </StatsRow>
          
          {bulkResults.details.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h3" sx={{ mb: 2 }}>Groups Needing Attention ({bulkResults.details.length})</Typography>
              <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Group Name</TableCell>
                      <TableCell align="center">Tier</TableCell>
                      <TableCell align="center">Members</TableCell>
                      <TableCell align="center">Potential</TableCell>
                      <TableCell align="center">Pending</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bulkResults.details.slice(0, 20).map(d => (
                      <TableRow key={d.groupId}>
                        <TableCell>{d.groupName}</TableCell>
                        <TableCell align="center"><TierBadge tier={d.tier || 'Unknown'} /></TableCell>
                        <TableCell align="center">{d.memberCount}</TableCell>
                        <TableCell align="center" sx={{ color: d.potentialUsers > 0 ? '#43E97B' : 'inherit', fontWeight: d.potentialUsers > 0 ? 600 : 400 }}>{d.potentialUsers}</TableCell>
                        <TableCell align="center" sx={{ color: d.pendingSync > 0 ? '#FFA726' : 'inherit', fontWeight: d.pendingSync > 0 ? 600 : 400 }}>{d.pendingSync}</TableCell>
                        <TableCell align="center">
                          <ActionButton 
                            variant="outlined"
                            size="small"
                            onClick={() => {
                              const group = groups.find(g => g.id === d.groupId);
                              if (group) handleSelectGroup(group);
                              setBulkResults(null);
                            }}
                          >
                            View
                          </ActionButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {bulkResults.details.length > 20 && (
                <Typography variant="body2" sx={{ mt: 2, opacity: 0.7, textAlign: 'center' }}>
                  ...and {bulkResults.details.length - 20} more groups
                </Typography>
              )}
            </Box>
          )}
        </SectionCard>
      )}

      {/* Action Buttons */}
      <SectionCard title="Actions" icon="🚀">
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, opacity: 0.7 }}>Quick Actions</Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <ActionButton 
                variant="contained"
                color="primary"
                onClick={handleSync} 
                loading={loading}
                icon={<SyncIcon />}
              >
                Sync All Groups
              </ActionButton>
              <ActionButton 
                variant="contained"
                color="secondary"
                onClick={handleBulkAnalyze} 
                loading={bulkAnalyzing}
                disabled={loading}
                icon={<SearchIcon />}
              >
                {bulkAnalyzing ? 'Analyzing...' : 'Bulk Analyze'}
              </ActionButton>
              <ActionButton 
                variant="outlined"
                color="warning"
                onClick={handleResetSync}
                disabled={loading}
                size="small"
              >
                🔓 Clear Sync Lock
              </ActionButton>
            </Box>
          </Box>
          
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, opacity: 0.7 }}>View Options</Typography>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(e, newValue) => newValue && setViewMode(newValue)}
              size="small"
            >
              <ToggleButton value="groups">
                LMS Groups ({groups.length})
              </ToggleButton>
              <ToggleButton value="missing">
                Partners Without Groups ({partnersWithoutGroups.length})
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      </SectionCard>

      {/* Filters */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1, minWidth: 250 }}>
          <SearchInput
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search groups or partners..."
            onClear={() => setSearchTerm('')}
          />
        </Box>
        <ToggleButtonGroup
          value={filterMode}
          exclusive
          onChange={(e, newValue) => newValue && setFilterMode(newValue)}
          size="small"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="hasMembers">Has Members</ToggleButton>
          <ToggleButton value="matched">Matched</ToggleButton>
          <ToggleButton value="unmatched">Unmatched</ToggleButton>
          <ToggleButton value="hasPotential" sx={{ color: 'warning.main' }}>⚡ Has Potential</ToggleButton>
        </ToggleButtonGroup>
      </Box>

        {/* Table */}
        <div className="table-column">
            {viewMode === 'groups' ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('name')}>Group Name{getSortIndicator('name')}</th>
                    <th className="sortable text-center" onClick={() => handleSort('user_count')}>Members{getSortIndicator('user_count')}</th>
                    <th className="sortable text-center" onClick={() => handleSort('potential_users')}>Potential{getSortIndicator('potential_users')}</th>
                    <th className="sortable text-center" onClick={() => handleSort('total_npcu')}>NPCU{getSortIndicator('total_npcu')}</th>
                    <th className="sortable text-center" onClick={() => handleSort('partner_tier')}>Tier{getSortIndicator('partner_tier')}</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.length === 0 ? (
                    <tr><td colSpan="6" className="empty-row">No groups found</td></tr>
                  ) : (
                    filteredGroups.map(group => (
                      <tr 
                        key={group.id} 
                        onClick={() => handleSelectGroup(group)}
                        className={`${selectedGroup?.id === group.id ? 'selected' : ''} ${group.potential_users > 0 ? 'has-potential' : ''}`}
                      >
                        <td className="group-name">
                          {group.name}
                          {group.potential_users > 0 && (
                            <span className="indicator-dot warning" title={`${group.potential_users} potential users to add`}>●</span>
                          )}
                        </td>
                        <td className="text-center">{group.user_count || 0}</td>
                        <td className="text-center">
                          {group.last_analyzed ? (
                            group.potential_users > 0 ? (
                              <span className="badge warning" title="CRM contacts with LMS accounts not in this group">
                                +{group.potential_users}
                              </span>
                            ) : (
                              <span className="badge muted">0</span>
                            )
                          ) : (
                            <span className="text-muted" title="Click to analyze this group">-</span>
                          )}
                        </td>
                        <td className="text-center">
                          {group.last_analyzed ? (
                            <span className={group.total_npcu > 0 ? 'text-success' : 'text-muted'}>
                              {group.total_npcu || 0}
                            </span>
                          ) : (
                            <span className="text-muted" title="Click to analyze this group">-</span>
                          )}
                        </td>
                        <td className="text-center">
                          {group.partner_tier && (
                            <span className={`tier-badge ${getTierClass(group.partner_tier)}`}>{group.partner_tier}</span>
                          )}
                        </td>
                        <td className="text-center">
                          <span className={`status-badge ${group.partner_id ? 'success' : 'default'}`}>
                            {group.partner_id ? '✓ Matched' : 'Unmatched'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Partner Name</th>
                    <th className="text-center">Tier</th>
                    <th className="text-center">Region</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {partnersWithoutGroups.length === 0 ? (
                    <tr><td colSpan="4" className="empty-row">All partners have LMS groups!</td></tr>
                  ) : (
                    partnersWithoutGroups.map(partner => (
                      <tr key={partner.id}>
                        <td className="partner-name">{partner.account_name}</td>
                        <td className="text-center">
                          {partner.partner_tier && (
                            <span className={`tier-badge ${getTierClass(partner.partner_tier)}`}>{partner.partner_tier}</span>
                          )}
                        </td>
                        <td className="text-center">{partner.account_region || '-'}</td>
                        <td className="text-center">
                          <button 
                            className="action-btn"
                            onClick={() => { setCreateGroupPartner(partner); setShowCreateGroupModal(true); }}
                          >
                            + Create Group
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

      {/* Slide-out Details Drawer */}
      {selectedGroup && (
        <div 
          className="drawer-overlay visible"
          onClick={() => { setSelectedGroup(null); setGroupDetails(null); }}
        />
      )}
      <div className={`details-column ${selectedGroup ? 'open' : ''}`}>
        {selectedGroup && (
          <div className="details-panel">
            <div className="panel-header">
              <h3>{selectedGroup.name}</h3>
              <div className="panel-actions">
                <button className="icon-btn" onClick={() => syncSingleGroup(selectedGroup.id, true)} disabled={loadingDetails} title="Sync from API">🔄</button>
                <button className="icon-btn" onClick={() => setEditingGroup(selectedGroup)} title="Edit">✏️</button>
                <button className="icon-btn close" onClick={() => { setSelectedGroup(null); setGroupDetails(null); }} title="Close">✕</button>
              </div>
            </div>
            
            {loadingDetails ? (
              <div className="panel-loading"><div className="spinner"></div><span>Loading...</span></div>
            ) : groupDetails ? (
              <div className="panel-content">
                <div className="detail-stats">
                  <div className="stat-item"><span className="stat-value">{groupDetails.stats?.memberCount || groupDetails.members?.length || 0}</span><span className="stat-label">Members</span></div>
                  <div className="stat-item"><span className="stat-value">{groupDetails.domains?.length || 0}</span><span className="stat-label">Domains</span></div>
                  <div className="stat-item highlight"><span className="stat-value">{groupDetails.potentialUsers?.length || 0}</span><span className="stat-label">Potential</span></div>
                  <div className="stat-item"><span className="stat-value">{groupDetails.stats?.totalNpcu || 0}</span><span className="stat-label">NPCU</span></div>
                </div>
                
                {/* Email Domains Section with Block/Add functionality */}
                <div className="detail-section">
                  <div className="section-header">
                    <h4>Email Domains</h4>
                    <button 
                      className="add-btn small" 
                      onClick={() => setShowDomainModal({ groupId: selectedGroup.id, type: 'custom' })}
                      title="Add custom domain to search for users"
                    >
                      + Add Domain
                    </button>
                  </div>
                  
                  {/* Active Search Domains */}
                  {(groupDetails.domains?.length > 0 || groupDetails.customDomains?.length > 0) ? (
                    <div className="domain-tags">
                      {groupDetails.domains?.map(d => {
                        const isBlocked = groupDetails.blockedDomains?.includes(d);
                        return (
                          <span 
                            key={d} 
                            className={`domain-tag ${isBlocked ? 'blocked' : ''}`}
                            title={isBlocked ? 'This domain is blocked' : 'Click to block this domain'}
                          >
                            @{d}
                            {!isBlocked && (
                              <button 
                                className="domain-action block"
                                onClick={(e) => { e.stopPropagation(); handleBlockDomain(selectedGroup.id, d); }}
                                title="Block this domain from potential users"
                              >
                                🚫
                              </button>
                            )}
                          </span>
                        );
                      })}
                      {/* Show custom domains that aren't from members */}
                      {groupDetails.customDomains?.filter(d => !groupDetails.domains?.includes(d)).map(d => (
                        <span key={d} className="domain-tag custom" title="Custom domain (manually added)">
                          @{d}
                          <button 
                            className="domain-action remove"
                            onClick={(e) => { e.stopPropagation(); handleRemoveCustomDomain(selectedGroup.id, d); }}
                            title="Remove custom domain"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="section-hint">No domains detected. Add a custom domain to find potential users.</p>
                  )}
                  
                  {/* Blocked Domains */}
                  {groupDetails.blockedDomains?.length > 0 && (
                    <div className="blocked-domains">
                      <h5>🚫 Blocked Domains</h5>
                      <div className="domain-tags blocked-list">
                        {groupDetails.blockedDomains.map(d => (
                          <span key={d} className="domain-tag blocked">
                            @{d}
                            <button 
                              className="domain-action unblock"
                              onClick={(e) => { e.stopPropagation(); handleUnblockDomain(selectedGroup.id, d); }}
                              title="Unblock this domain"
                            >
                              ✓
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="detail-section">
                  <h4>Members ({groupDetails.members?.length || 0})</h4>
                  <div className="member-list">
                    {groupDetails.members?.slice(0, 10).map(m => (
                      <div key={m.id} className="member-item">
                        <span className="member-name">{m.first_name} {m.last_name}</span>
                        <span className="member-email">{m.email}</span>
                        {m.pending_source === 'local' && <span className="pending-badge">pending</span>}
                      </div>
                    ))}
                    {(groupDetails.members?.length || 0) > 10 && <div className="more-items">+{groupDetails.members.length - 10} more</div>}
                  </div>
                </div>
                
                {groupDetails.potentialUsers?.length > 0 && (
                  <div className="detail-section warning">
                    <div className="section-header">
                      <h4>⚠️ Potential Users ({groupDetails.potentialUsers.length})</h4>
                      <button className="add-btn" onClick={() => setShowAddUsersModal(true)}>+ Add</button>
                    </div>
                    <p className="section-hint">Users with matching domain not in this group</p>
                    <div className="member-list">
                      {groupDetails.potentialUsers.slice(0, 5).map(u => (
                        <div key={u.id} className="member-item">
                          <span className="member-name">{u.first_name} {u.last_name}</span>
                          <span className="member-email">{u.email}</span>
                          {u.crm_match && <span className="crm-badge">CRM</span>}
                        </div>
                      ))}
                      {groupDetails.potentialUsers.length > 5 && <div className="more-items">+{groupDetails.potentialUsers.length - 5} more</div>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="panel-empty">Loading...</div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {editingGroup && <EditGroupModal group={editingGroup} onClose={() => setEditingGroup(null)} onSave={async (updates) => {
        try {
          await fetch(`/api/db/group-analysis/groups/${editingGroup.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
          await loadGroups();
          setEditingGroup(null);
        } catch (err) { setError('Failed to update: ' + err.message); }
      }} />}

      {showAddUsersModal && selectedGroup && groupDetails?.potentialUsers && (
        <AddUsersModal group={selectedGroup} users={groupDetails.potentialUsers} onClose={() => setShowAddUsersModal(false)} onAddUsers={handleAddUsersToGroup} />
      )}

      {showCreateGroupModal && createGroupPartner && (
        <CreateGroupModal partner={createGroupPartner} onClose={() => { setShowCreateGroupModal(false); setCreateGroupPartner(null); }} onCreate={handleCreateGroup} />
      )}

      {showDomainModal && (
        <AddDomainModal 
          groupId={showDomainModal.groupId}
          onClose={() => setShowDomainModal(null)}
          onAdd={handleAddCustomDomain}
        />
      )}
    </PageContent>
  );
}

// Edit Group Modal
function EditGroupModal({ group, onClose, onSave }) {
  const [partnerId, setPartnerId] = useState(group.partner_id || '');
  const [saving, setSaving] = useState(false);
  const handleSave = async () => { setSaving(true); await onSave({ partner_id: partnerId || null }); setSaving(false); };

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Edit Group</h2><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <p className="modal-subtitle">{group.name}</p>
          <div className="form-group">
            <label>Partner ID</label>
            <input type="text" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} placeholder="Enter partner ID to link" />
          </div>
          <div className="modal-actions">
            <button className="cancel-btn" onClick={onClose}>Cancel</button>
            <button className="save-btn" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Add Users Modal
function AddUsersModal({ group, users, onClose, onAddUsers }) {
  const [selectedUsers, setSelectedUsers] = useState(new Set(users.map(u => u.id)));
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState(null);
  const toggleUser = (userId) => { const newSet = new Set(selectedUsers); newSet.has(userId) ? newSet.delete(userId) : newSet.add(userId); setSelectedUsers(newSet); };
  const handleAdd = async () => {
    setAdding(true);
    try { const userIds = Array.from(selectedUsers); const results = await onAddUsers(group.id, userIds); setResult({ success: true, count: userIds.length, results }); }
    catch (err) { setResult({ success: false, error: err.message }); }
    setAdding(false);
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Add Users to Group</h2><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <p className="modal-subtitle">{group.name}</p>
          {result ? (
            <div className={`add-result ${result.success ? 'success' : 'error'}`}>
              {result.success ? (<><h3>✅ Added {result.count} users</h3><p>Users added to group and "All Partners" group.</p></>) : (<><h3>❌ Failed</h3><p>{result.error}</p></>)}
              <button className="close-btn" onClick={onClose}>Close</button>
            </div>
          ) : adding ? (
            <div className="adding-state"><div className="spinner"></div><p>Adding users...</p></div>
          ) : (
            <>
              <div className="selection-controls">
                <button onClick={() => setSelectedUsers(new Set(users.map(u => u.id)))}>Select All</button>
                <button onClick={() => setSelectedUsers(new Set())}>Select None</button>
                <span>{selectedUsers.size} selected</span>
              </div>
              <div className="users-list">
                {users.map(user => (
                  <label key={user.id} className="user-checkbox">
                    <input type="checkbox" checked={selectedUsers.has(user.id)} onChange={() => toggleUser(user.id)} />
                    <div className="user-info"><span className="user-name">{user.first_name} {user.last_name}</span><span className="user-email">{user.email}</span></div>
                  </label>
                ))}
              </div>
              <div className="modal-actions">
                <button className="cancel-btn" onClick={onClose}>Cancel</button>
                <button className="add-btn primary" onClick={handleAdd} disabled={selectedUsers.size === 0}>Add {selectedUsers.size} Users</button>
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
  const [result, setResult] = useState(null);
  const handleCreate = async () => {
    setCreating(true);
    try { const newGroup = await onCreate(partner.account_name, []); setResult({ success: true, group: newGroup }); }
    catch (err) { setResult({ success: false, error: err.message }); }
    setCreating(false);
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Create LMS Group</h2><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          {result ? (
            <div className={`add-result ${result.success ? 'success' : 'error'}`}>
              {result.success ? (<><h3>✅ Group Created</h3><p>LMS group "{partner.account_name}" created.</p></>) : (<><h3>❌ Failed</h3><p>{result.error}</p></>)}
              <button className="close-btn" onClick={onClose}>Close</button>
            </div>
          ) : creating ? (
            <div className="adding-state"><div className="spinner"></div><p>Creating group...</p></div>
          ) : (
            <>
              <div className="partner-info">
                <h3>{partner.account_name}</h3>
                <div className="partner-meta">{partner.partner_tier && <span>Tier: {partner.partner_tier}</span>}{partner.account_region && <span>Region: {partner.account_region}</span>}</div>
              </div>
              <p className="create-info">This will create a new LMS group "{partner.account_name}".</p>
              <div className="modal-actions">
                <button className="cancel-btn" onClick={onClose}>Cancel</button>
                <button className="add-btn primary" onClick={handleCreate}>Create Group</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// Add Domain Modal
function AddDomainModal({ groupId, onClose, onAdd }) {
  const [domain, setDomain] = useState('');
  const [adding, setAdding] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!domain.trim()) return;
    
    setAdding(true);
    await onAdd(groupId, domain.trim());
    setAdding(false);
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Custom Domain</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="modal-subtitle">
            Add a custom email domain to search for potential users.
            This is useful for groups with no members.
          </p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="domain">Email Domain</label>
              <div className="domain-input-wrapper">
                <span className="domain-prefix">@</span>
                <input
                  type="text"
                  id="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value.replace(/^@/, '').toLowerCase())}
                  placeholder="example.com"
                  autoFocus
                  disabled={adding}
                />
              </div>
              <p className="form-hint">
                Enter the domain without the @ symbol (e.g., "acme.com")
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="add-btn primary" disabled={!domain.trim() || adding}>
                {adding ? 'Adding...' : 'Add Domain'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default GroupAnalysisDB;
