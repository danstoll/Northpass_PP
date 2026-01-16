import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './GroupManagement.css';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  Tabs,
  Tab,
  Collapse,
  IconButton,
  Chip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Switch,
  Tooltip,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  FamilyRestroom as FamilyIcon,
  Business as BusinessIcon,
  Public as PublicIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Check as CheckIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  AutoAwesome as AutoDetectIcon,
  GroupWork as GroupWorkIcon,
  Person as PersonIcon,
  SupervisedUserCircle as SupervisedUserCircleIcon,
  LinkOff as LinkOffIcon,
  Link as LinkIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import {
  PageHeader,
  PageContent,
  StatsRow,
  StatCard,
  SectionCard,
  SearchInput,
  FilterSelect,
  ActionButton,
  LoadingState,
  EmptyState,
  StatusChip,
  TierBadge,
} from './ui/NintexUI';

// Tab Panel component
function TabPanel({ children, value, index, ...other }) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

// ============================================
// Partner Family Card Component
// ============================================
const FamilyCard = ({ family, onEdit, onDelete, onViewMembers, onDetectConflicts }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <FamilyIcon color="primary" />
              <Typography variant="h6">{family.display_name || family.family_name}</Typography>
              {family.is_gsi && (
                <Chip label="GSI" size="small" color="secondary" />
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Chip
                icon={<BusinessIcon />}
                label={`${family.member_count || 0} Partners`}
                size="small"
                variant="outlined"
              />
              {family.head_partner_name && (
                <Chip
                  icon={<PublicIcon />}
                  label={`HQ: ${family.head_partner_name}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
              {family.allow_cross_group_users && (
                <Chip
                  icon={<SupervisedUserCircleIcon />}
                  label="Shared Users Allowed"
                  size="small"
                  color="info"
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Detect Conflicts">
              <IconButton size="small" onClick={() => onDetectConflicts(family)}>
                <WarningIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Edit Family">
              <IconButton size="small" onClick={() => onEdit(family)}>
                <EditIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete Family">
              <IconButton size="small" color="error" onClick={() => onDelete(family)}>
                <DeleteIcon />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
        </Box>
        
        <Collapse in={expanded}>
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" gutterBottom>Family Members:</Typography>
            {family.members?.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {family.members.map((member) => (
                  <Chip
                    key={member.id}
                    label={member.account_name}
                    size="small"
                    variant={member.is_family_head ? 'filled' : 'outlined'}
                    color={member.is_family_head ? 'primary' : 'default'}
                    icon={member.is_family_head ? <PublicIcon /> : <BusinessIcon />}
                  />
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No members assigned yet. Use "Add Partners" to build this family.
              </Typography>
            )}
            {family.notes && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Notes: {family.notes}
                </Typography>
              </Box>
            )}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
};

// ============================================
// Detected Family Card (for auto-detection)
// ============================================
const DetectedFamilyCard = ({ detection, onCreateFamily, isCreating }) => {
  const [selected, setSelected] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState(
    detection.members?.map(m => m.id) || []
  );

  const handleMemberToggle = (memberId) => {
    setSelectedMembers(prev => 
      prev.includes(memberId) 
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  // Use API field names: suggestedName, memberCount, regions (array)
  const familyName = detection.suggestedName || detection.prefix || detection.family_name;
  const memberCount = detection.memberCount || detection.member_count || 0;
  const regionsText = Array.isArray(detection.regions) 
    ? detection.regions.join(', ') 
    : detection.regions;

  return (
    <Card sx={{ mb: 2, opacity: selected ? 1 : 0.6 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Checkbox 
                checked={selected}
                onChange={(e) => setSelected(e.target.checked)}
              />
              <AutoDetectIcon color="secondary" />
              <Typography variant="h6">{familyName}</Typography>
              <Chip
                label={`${memberCount} Partners`}
                size="small"
                color="secondary"
              />
            </Box>
            
            {/* Regions */}
            {regionsText && (
              <Box sx={{ mb: 1, ml: 5 }}>
                <Typography variant="caption" color="text.secondary">
                  Regions: {regionsText}
                </Typography>
              </Box>
            )}
            
            {/* Member selection */}
            <Box sx={{ ml: 5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {detection.members?.map((member) => (
                <Chip
                  key={member.id}
                  label={member.name || member.account_name}
                  size="small"
                  variant={selectedMembers.includes(member.id) ? 'filled' : 'outlined'}
                  onClick={() => handleMemberToggle(member.id)}
                  onDelete={selectedMembers.includes(member.id) ? () => handleMemberToggle(member.id) : undefined}
                  deleteIcon={<CheckIcon />}
                />
              ))}
            </Box>
          </Box>
          
          <ActionButton
            variant="contained"
            color="primary"
            size="small"
            disabled={!selected || selectedMembers.length === 0 || isCreating}
            loading={isCreating}
            onClick={() => onCreateFamily(detection, selectedMembers)}
            startIcon={<AddIcon />}
          >
            Create Family
          </ActionButton>
        </Box>
      </CardContent>
    </Card>
  );
};

// ============================================
// Conflict Card Component
// ============================================
const ConflictCard = ({ conflict, family, onResolve, onMarkShared }) => {
  const [resolving, setResolving] = useState(false);

  return (
    <Card sx={{ mb: 2, borderLeft: '4px solid', borderColor: 'warning.main' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <WarningIcon color="warning" />
              <Typography variant="subtitle1">{conflict.email}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {conflict.name} is a member of multiple groups in this family:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {conflict.groups?.map((group) => (
                <Chip
                  key={group.id}
                  label={group.group_name}
                  size="small"
                  variant="outlined"
                  color="warning"
                />
              ))}
            </Box>
          </Box>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Tooltip title="Mark as Shared Resource (allowed to be in multiple groups)">
              <ActionButton
                variant="outlined"
                size="small"
                onClick={() => onMarkShared(conflict)}
                startIcon={<SupervisedUserCircleIcon />}
              >
                Mark Shared
              </ActionButton>
            </Tooltip>
            <Tooltip title="Choose which group this user should belong to">
              <ActionButton
                variant="contained"
                color="warning"
                size="small"
                onClick={() => onResolve(conflict)}
                startIcon={<LinkIcon />}
              >
                Resolve
              </ActionButton>
            </Tooltip>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

// ============================================
// Main Group Management Component
// ============================================
const GroupManagement = () => {
  // State
  const [tabIndex, setTabIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Data state
  const [families, setFamilies] = useState([]);
  const [detectedFamilies, setDetectedFamilies] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [stats, setStats] = useState({
    totalFamilies: 0,
    totalGsi: 0,
    partnersInFamilies: 0,
    totalConflicts: 0,
  });
  
  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [minMembers, setMinMembers] = useState(3);
  const [detecting, setDetecting] = useState(false);
  const [creatingFamily, setCreatingFamily] = useState(null);
  const [selectedFamily, setSelectedFamily] = useState(null);
  
  // Dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFamily, setEditingFamily] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingFamily, setDeletingFamily] = useState(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolvingConflict, setResolvingConflict] = useState(null);

  // Load families on mount
  useEffect(() => {
    loadFamilies();
  }, []);

  const loadFamilies = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/db/families');
      if (!response.ok) throw new Error('Failed to load families');
      const data = await response.json();
      setFamilies(data.families || []);
      setStats({
        totalFamilies: data.families?.length || 0,
        totalGsi: data.families?.filter(f => f.is_gsi).length || 0,
        partnersInFamilies: data.families?.reduce((sum, f) => sum + (f.member_count || 0), 0) || 0,
        totalConflicts: 0,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const detectFamilies = async () => {
    setDetecting(true);
    setError(null);
    try {
      const response = await fetch(`/api/db/families/detect/by-name?minMembers=${minMembers}`);
      if (!response.ok) throw new Error('Failed to detect families');
      const data = await response.json();
      setDetectedFamilies(data.potentialFamilies || []);
      setSuccess(`Found ${data.potentialFamilies?.length || 0} potential families`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetecting(false);
    }
  };

  const createFamilyFromDetection = async (detection, memberIds) => {
    const familyName = detection.suggestedName || detection.prefix;
    setCreatingFamily(familyName);
    setError(null);
    try {
      // Create family
      const createResponse = await fetch('/api/db/families', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family_name: familyName,
          display_name: familyName,
          is_gsi: (detection.memberCount || detection.member_count) >= 5,
        }),
      });
      if (!createResponse.ok) throw new Error('Failed to create family');
      
      // Add members
      const membersResponse = await fetch(`/api/db/families/${encodeURIComponent(familyName)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerIds: memberIds }),
      });
      if (!membersResponse.ok) throw new Error('Failed to add members');
      
      setSuccess(`Created family "${familyName}" with ${memberIds.length} members`);
      setDetectedFamilies(prev => prev.filter(d => (d.suggestedName || d.prefix) !== familyName));
      loadFamilies();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingFamily(null);
    }
  };

  const handleEditFamily = (family) => {
    setEditingFamily({ ...family });
    setEditDialogOpen(true);
  };

  const handleSaveFamily = async () => {
    if (!editingFamily) return;
    
    setError(null);
    try {
      const response = await fetch('/api/db/families', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family_name: editingFamily.family_name,
          display_name: editingFamily.display_name,
          is_gsi: editingFamily.is_gsi,
          allow_cross_group_users: editingFamily.allow_cross_group_users,
          aggregate_reporting: editingFamily.aggregate_reporting,
          notes: editingFamily.notes,
        }),
      });
      if (!response.ok) throw new Error('Failed to save family');
      
      setSuccess('Family saved successfully');
      setEditDialogOpen(false);
      setEditingFamily(null);
      loadFamilies();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteFamily = async () => {
    if (!deletingFamily) return;
    
    setError(null);
    try {
      const response = await fetch(`/api/db/families/${deletingFamily.family_name}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete family');
      
      setSuccess(`Deleted family "${deletingFamily.family_name}"`);
      setDeleteDialogOpen(false);
      setDeletingFamily(null);
      loadFamilies();
    } catch (err) {
      setError(err.message);
    }
  };

  const detectConflicts = async (family) => {
    setSelectedFamily(family);
    setError(null);
    setTabIndex(2); // Switch to conflicts tab
    
    try {
      const response = await fetch(`/api/db/families/${family.family_name}/conflicts`);
      if (!response.ok) throw new Error('Failed to detect conflicts');
      const data = await response.json();
      setConflicts(data.conflicts || []);
      setStats(prev => ({ ...prev, totalConflicts: data.conflicts?.length || 0 }));
      
      if (data.conflicts?.length === 0) {
        setSuccess(`No conflicts found in ${family.family_name} family`);
      } else {
        setSuccess(`Found ${data.conflicts.length} users in multiple groups`);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleMarkShared = async (conflict) => {
    setError(null);
    try {
      const response = await fetch(`/api/db/families/${selectedFamily.family_name}/shared-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: conflict.user_id,
          userEmail: conflict.email,
          reason: 'Marked as shared resource via admin UI',
        }),
      });
      if (!response.ok) throw new Error('Failed to mark as shared');
      
      setSuccess(`${conflict.email} marked as shared resource`);
      setConflicts(prev => prev.filter(c => c.user_id !== conflict.user_id));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResolveConflict = (conflict) => {
    setResolvingConflict(conflict);
    setResolveDialogOpen(true);
  };

  const resolveToGroup = async (groupId) => {
    if (!resolvingConflict || !selectedFamily) return;
    
    setError(null);
    try {
      const response = await fetch(`/api/db/families/${selectedFamily.family_name}/resolve-conflict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: resolvingConflict.user_id,
          targetGroupId: groupId,
        }),
      });
      if (!response.ok) throw new Error('Failed to resolve conflict');
      
      setSuccess(`Assigned ${resolvingConflict.email} to selected group`);
      setConflicts(prev => prev.filter(c => c.user_id !== resolvingConflict.user_id));
      setResolveDialogOpen(false);
      setResolvingConflict(null);
    } catch (err) {
      setError(err.message);
    }
  };

  // Filter families by search
  const filteredFamilies = useMemo(() => {
    if (!searchTerm) return families;
    const term = searchTerm.toLowerCase();
    return families.filter(f => 
      f.family_name?.toLowerCase().includes(term) ||
      f.display_name?.toLowerCase().includes(term)
    );
  }, [families, searchTerm]);

  if (loading && families.length === 0) {
    return <LoadingState message="Loading partner families..." />;
  }

  return (
    <PageContent>
      <PageHeader
        icon={<GroupWorkIcon />}
        title="Group Management"
        subtitle="Manage partner families, GSI accounts, and cross-group conflicts"
      />

      {/* Stats Row */}
      <StatsRow columns={4}>
        <StatCard
          title="Partner Families"
          value={stats.totalFamilies}
          icon={<FamilyIcon />}
          variant="primary"
        />
        <StatCard
          title="GSI Partners"
          value={stats.totalGsi}
          icon={<PublicIcon />}
          variant="secondary"
        />
        <StatCard
          title="Partners in Families"
          value={stats.partnersInFamilies}
          icon={<BusinessIcon />}
        />
        <StatCard
          title="Active Conflicts"
          value={stats.totalConflicts}
          icon={<WarningIcon />}
          variant={stats.totalConflicts > 0 ? 'warning' : 'success'}
        />
      </StatsRow>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Quick Link to Create Groups */}
      <Alert severity="info" sx={{ mb: 2 }} icon={<GroupWorkIcon />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2">
            <strong>Need to create LMS groups for partners?</strong> Use the User Management tool.
          </Typography>
          <Button 
            size="small" 
            variant="outlined" 
            onClick={() => window.location.href = '/admin/users?tab=2'}
            startIcon={<GroupWorkIcon />}
          >
            Create Partner Groups
          </Button>
        </Box>
      </Alert>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)}>
          <Tab label="Partner Families" icon={<FamilyIcon />} iconPosition="start" />
          <Tab label="Auto-Detect" icon={<AutoDetectIcon />} iconPosition="start" />
          <Tab 
            label={
              <Badge badgeContent={stats.totalConflicts} color="warning">
                Conflicts
              </Badge>
            } 
            icon={<WarningIcon />} 
            iconPosition="start" 
          />
        </Tabs>
      </Box>

      {/* Tab: Partner Families */}
      <TabPanel value={tabIndex} index={0}>
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search families..."
            sx={{ flex: 1 }}
          />
          <ActionButton
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditingFamily({
                family_name: '',
                display_name: '',
                is_gsi: false,
                allow_cross_group_users: false,
                aggregate_reporting: true,
                notes: '',
              });
              setEditDialogOpen(true);
            }}
          >
            New Family
          </ActionButton>
          <ActionButton
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadFamilies}
          >
            Refresh
          </ActionButton>
        </Box>

        {filteredFamilies.length === 0 ? (
          <EmptyState
            icon={<FamilyIcon />}
            title="No Partner Families"
            description="Create families manually or use Auto-Detect to find partners with similar names."
          />
        ) : (
          filteredFamilies.map((family) => (
            <FamilyCard
              key={family.family_name}
              family={family}
              onEdit={handleEditFamily}
              onDelete={(f) => { setDeletingFamily(f); setDeleteDialogOpen(true); }}
              onViewMembers={() => {}}
              onDetectConflicts={detectConflicts}
            />
          ))
        )}
      </TabPanel>

      {/* Tab: Auto-Detect */}
      <TabPanel value={tabIndex} index={1}>
        <SectionCard title="Detection Settings" icon={<AutoDetectIcon />}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
            <TextField
              label="Minimum Members"
              type="number"
              size="small"
              value={minMembers}
              onChange={(e) => setMinMembers(parseInt(e.target.value) || 2)}
              sx={{ width: 150 }}
              helperText="Partners needed to form a family"
            />
            <ActionButton
              variant="contained"
              color="secondary"
              startIcon={<SearchIcon />}
              onClick={detectFamilies}
              loading={detecting}
            >
              Detect Families
            </ActionButton>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Auto-detection finds partners with similar name prefixes (e.g., "Protiviti Inc", "Protiviti UK", "Protiviti Australia" → "Protiviti" family).
          </Typography>
        </SectionCard>

        {detecting && <LoadingState message="Detecting potential families..." />}

        {!detecting && detectedFamilies.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Detected Families ({detectedFamilies.length})
            </Typography>
            {detectedFamilies.map((detection, index) => (
              <DetectedFamilyCard
                key={detection.suggestedName || index}
                detection={detection}
                onCreateFamily={createFamilyFromDetection}
                isCreating={creatingFamily === detection.suggestedName}
              />
            ))}
          </Box>
        )}

        {!detecting && detectedFamilies.length === 0 && (
          <EmptyState
            icon={<AutoDetectIcon />}
            title="No Families Detected"
            description="Click 'Detect Families' to find partners that could be grouped together."
          />
        )}
      </TabPanel>

      {/* Tab: Conflicts */}
      <TabPanel value={tabIndex} index={2}>
        {selectedFamily ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Typography variant="h6">
                Conflicts in {selectedFamily.display_name || selectedFamily.family_name}
              </Typography>
              <Chip
                label={`${conflicts.length} conflicts`}
                color={conflicts.length > 0 ? 'warning' : 'success'}
                size="small"
              />
            </Box>

            {conflicts.length === 0 ? (
              <EmptyState
                icon={<CheckIcon />}
                title="No Conflicts"
                description="All users in this family belong to exactly one group."
              />
            ) : (
              conflicts.map((conflict) => (
                <ConflictCard
                  key={conflict.user_id}
                  conflict={conflict}
                  family={selectedFamily}
                  onResolve={handleResolveConflict}
                  onMarkShared={handleMarkShared}
                />
              ))
            )}
          </>
        ) : (
          <EmptyState
            icon={<FamilyIcon />}
            title="Select a Family"
            description="Choose a family from the Partner Families tab and click 'Detect Conflicts' to find users in multiple groups."
          />
        )}
      </TabPanel>

      {/* Edit Family Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingFamily?.family_name ? 'Edit Family' : 'Create New Family'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Family Name (ID)"
              value={editingFamily?.family_name || ''}
              onChange={(e) => setEditingFamily(prev => ({ ...prev, family_name: e.target.value }))}
              disabled={!!editingFamily?.family_name && families.some(f => f.family_name === editingFamily.family_name)}
              fullWidth
              helperText="Unique identifier (e.g., 'Protiviti')"
            />
            <TextField
              label="Display Name"
              value={editingFamily?.display_name || ''}
              onChange={(e) => setEditingFamily(prev => ({ ...prev, display_name: e.target.value }))}
              fullWidth
              helperText="Friendly name shown in UI"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editingFamily?.is_gsi || false}
                  onChange={(e) => setEditingFamily(prev => ({ ...prev, is_gsi: e.target.checked }))}
                />
              }
              label="Global System Integrator (GSI)"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editingFamily?.allow_cross_group_users || false}
                  onChange={(e) => setEditingFamily(prev => ({ ...prev, allow_cross_group_users: e.target.checked }))}
                />
              }
              label="Allow users in multiple groups"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editingFamily?.aggregate_reporting !== false}
                  onChange={(e) => setEditingFamily(prev => ({ ...prev, aggregate_reporting: e.target.checked }))}
                />
              }
              label="Aggregate reporting across family"
            />
            <TextField
              label="Notes"
              value={editingFamily?.notes || ''}
              onChange={(e) => setEditingFamily(prev => ({ ...prev, notes: e.target.value }))}
              fullWidth
              multiline
              rows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveFamily} startIcon={<SaveIcon />}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Family?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the "{deletingFamily?.family_name}" family?
            This will remove family assignments from all member partners.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteFamily}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Resolve Conflict Dialog */}
      <Dialog open={resolveDialogOpen} onClose={() => setResolveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Resolve User Conflict</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Choose which group <strong>{resolvingConflict?.email}</strong> should belong to:
          </Typography>
          <Box sx={{ mt: 2 }}>
            {resolvingConflict?.groups?.map((group) => (
              <Button
                key={group.id}
                variant="outlined"
                fullWidth
                sx={{ mb: 1, justifyContent: 'flex-start' }}
                onClick={() => resolveToGroup(group.id)}
                startIcon={<BusinessIcon />}
              >
                {group.group_name}
              </Button>
            ))}
          </Box>
          <Alert severity="info" sx={{ mt: 2 }}>
            The user will be removed from all other groups in this family.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </PageContent>
  );
};

export default GroupManagement;
