import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './GroupManagement.css';
import northpassApi from '../services/northpassApi';
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
  Build as BuildIcon,
  GroupAdd as GroupAddIcon,
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

// ============================================
// Tab Panel Component
// ============================================
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
const FamilyCard = ({ family, onEdit, onDelete, onDetectConflicts }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <FamilyIcon color="primary" />
              <Typography variant="h6">{family.display_name || family.family_name}</Typography>
              {family.is_gsi && <Chip label="GSI" size="small" color="secondary" />}
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Chip icon={<BusinessIcon />} label={`${family.member_count || 0} Partners`} size="small" variant="outlined" />
              {family.head_partner_name && (
                <Chip icon={<PublicIcon />} label={`HQ: ${family.head_partner_name}`} size="small" color="primary" variant="outlined" />
              )}
              {family.allow_cross_group_users && (
                <Chip icon={<SupervisedUserCircleIcon />} label="Shared Users Allowed" size="small" color="info" variant="outlined" />
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Detect Conflicts">
              <IconButton size="small" onClick={() => onDetectConflicts(family)}><WarningIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Edit Family">
              <IconButton size="small" onClick={() => onEdit(family)}><EditIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Delete Family">
              <IconButton size="small" color="error" onClick={() => onDelete(family)}><DeleteIcon /></IconButton>
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
              <Typography variant="body2" color="text.secondary">No members assigned yet.</Typography>
            )}
            {family.notes && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">Notes: {family.notes}</Typography>
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
  const [selectedMembers, setSelectedMembers] = useState(detection.members?.map(m => m.id) || []);

  const handleMemberToggle = (memberId) => {
    setSelectedMembers(prev => prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]);
  };

  const familyName = detection.suggestedName || detection.prefix || detection.family_name;
  const memberCount = detection.memberCount || detection.member_count || 0;
  const regionsText = Array.isArray(detection.regions) ? detection.regions.join(', ') : detection.regions;

  return (
    <Card sx={{ mb: 2, opacity: selected ? 1 : 0.6 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Checkbox checked={selected} onChange={(e) => setSelected(e.target.checked)} />
              <AutoDetectIcon color="secondary" />
              <Typography variant="h6">{familyName}</Typography>
              <Chip label={`${memberCount} Partners`} size="small" color="secondary" />
            </Box>
            {regionsText && (
              <Box sx={{ mb: 1, ml: 5 }}>
                <Typography variant="caption" color="text.secondary">Regions: {regionsText}</Typography>
              </Box>
            )}
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
const ConflictCard = ({ conflict, onResolve, onMarkShared }) => (
  <Card sx={{ mb: 2, borderLeft: '4px solid', borderColor: 'warning.main' }}>
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <WarningIcon color="warning" />
            <Typography variant="subtitle1">{conflict.email}</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {conflict.name} is a member of multiple groups:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {conflict.groups?.map((group) => (
              <Chip key={group.id} label={group.group_name} size="small" variant="outlined" color="warning" />
            ))}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <ActionButton variant="outlined" size="small" onClick={() => onMarkShared(conflict)} startIcon={<SupervisedUserCircleIcon />}>
            Mark Shared
          </ActionButton>
          <ActionButton variant="contained" color="warning" size="small" onClick={() => onResolve(conflict)} startIcon={<LinkIcon />}>
            Resolve
          </ActionButton>
        </Box>
      </Box>
    </CardContent>
  </Card>
);

// ============================================
// Main Group Management Component
// ============================================
const GroupManagement = () => {
  // ========== URL Parameter for Tab ==========
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = parseInt(urlParams.get('tab')) || 0;

  // ========== Global State ==========
  const [tabIndex, setTabIndex] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // ========== Tab 0: Create Groups State ==========
  const [partnersWithoutGroups, setPartnersWithoutGroups] = useState([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnerSearchTerm, setPartnerSearchTerm] = useState('');
  const [partnerTierFilter, setPartnerTierFilter] = useState('all');
  const [partnerStatusFilter, setPartnerStatusFilter] = useState('all');
  const [selectedPartnersForGroup, setSelectedPartnersForGroup] = useState(new Set());
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, currentPartner: '' });
  const [creatingGroupFor, setCreatingGroupFor] = useState(null);

  // ========== Tab 1: Group Audit State ==========
  const [auditLoading, setAuditLoading] = useState(false);
  const [audit, setAudit] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [fixProgress, setFixProgress] = useState(null);
  const [fixResults, setFixResults] = useState(null);
  const [renaming, setRenaming] = useState(null);

  // ========== Tab 2: All Partners Sync State ==========
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncAudit, setSyncAudit] = useState(null);
  const [syncFixing, setSyncFixing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncResults, setSyncResults] = useState(null);

  // ========== Tab 3: Partner Families State ==========
  const [families, setFamilies] = useState([]);
  const [familySearchTerm, setFamilySearchTerm] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFamily, setEditingFamily] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingFamily, setDeletingFamily] = useState(null);

  // ========== Tab 4: Auto-Detect State ==========
  const [detectedFamilies, setDetectedFamilies] = useState([]);
  const [minMembers, setMinMembers] = useState(3);
  const [detecting, setDetecting] = useState(false);
  const [creatingFamily, setCreatingFamily] = useState(null);

  // ========== Tab 5: Conflicts State ==========
  const [conflicts, setConflicts] = useState([]);
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolvingConflict, setResolvingConflict] = useState(null);

  // ========== Stats ==========
  const [stats, setStats] = useState({
    partnersWithoutGroups: 0,
    auditIssues: 0,
    allPartnersMissing: 0,
    totalFamilies: 0,
    totalConflicts: 0,
  });

  // ========== Load Data on Mount ==========
  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========== Load Data When Tab Changes ==========
  useEffect(() => {
    if (tabIndex === 0 && partnersWithoutGroups.length === 0 && !partnersLoading) {
      loadPartnersWithoutGroups();
    }
    if (tabIndex === 3 && families.length === 0) {
      loadFamilies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabIndex]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadPartnersWithoutGroups(), loadFamilies()]);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // TAB 0: CREATE GROUPS - Functions
  // ============================================

  const loadPartnersWithoutGroups = async () => {
    try {
      setPartnersLoading(true);
      const response = await fetch('/api/db/group-analysis/partners-without-groups');
      if (!response.ok) throw new Error('Failed to load partners without groups');
      const data = await response.json();
      setPartnersWithoutGroups(data);
      setStats(prev => ({ ...prev, partnersWithoutGroups: data.length }));
      console.log(`🏢 Found ${data.length} partners without LMS groups`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPartnersLoading(false);
    }
  };

  const createGroupForPartner = async (partner, skipRefresh = false) => {
    const groupName = `ptr_${partner.account_name}`;
    const isInactive = partner.is_active === false || partner.account_status === 'Inactive';
    
    if (isInactive && !skipRefresh) {
      const confirmed = window.confirm(
        `⚠️ Warning: "${partner.account_name}" is INACTIVE in Impartner.\n\nDo you want to proceed anyway?`
      );
      if (!confirmed) return { success: false, error: 'User cancelled - partner is inactive' };
    }
    
    try {
      if (!skipRefresh) setCreatingGroupFor({ partnerId: partner.id, partnerName: partner.account_name });
      
      const createdGroup = await northpassApi.createGroup(groupName, `Partner group for ${partner.account_name}`);
      if (!createdGroup?.id) throw new Error('Failed to create group in LMS');
      
      await fetch('/api/db/lms/groups/sync-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: createdGroup.id, groupName, partnerId: partner.id })
      });
      
      if (!skipRefresh) {
        await loadPartnersWithoutGroups();
        setSuccess(`✅ Created partner group: ${groupName}`);
      }
      return { success: true, group: createdGroup };
    } catch (err) {
      if (!skipRefresh) setError(`❌ Error creating group: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      if (!skipRefresh) setCreatingGroupFor(null);
    }
  };

  const bulkCreateGroups = async () => {
    const selectedPartners = filteredPartnersWithoutGroups.filter(p => selectedPartnersForGroup.has(p.id));
    if (selectedPartners.length === 0) return;
    
    // Filter out inactive partners
    const activePartners = selectedPartners.filter(p => p.is_active !== false && p.account_status !== 'Inactive');
    const inactiveCount = selectedPartners.length - activePartners.length;
    
    if (inactiveCount > 0) {
      const confirmed = window.confirm(
        `⚠️ ${inactiveCount} selected partners are INACTIVE and will be skipped.\n\nProceed with ${activePartners.length} active partners?`
      );
      if (!confirmed) return;
    }
    
    if (activePartners.length === 0) {
      setError('No active partners selected.');
      return;
    }
    
    setBulkCreating(true);
    setBulkProgress({ current: 0, total: activePartners.length, currentPartner: '' });
    
    const results = { created: 0, failed: 0, errors: [] };
    
    for (let i = 0; i < activePartners.length; i++) {
      const partner = activePartners[i];
      setBulkProgress({ current: i + 1, total: activePartners.length, currentPartner: partner.account_name });
      
      const result = await createGroupForPartner(partner, true);
      if (result.success) {
        results.created++;
      } else {
        results.failed++;
        results.errors.push({ partner: partner.account_name, error: result.error });
      }
      await new Promise(r => setTimeout(r, 300));
    }
    
    setBulkCreating(false);
    setSelectedPartnersForGroup(new Set());
    await loadPartnersWithoutGroups();
    setSuccess(`✅ Created ${results.created} groups${results.failed > 0 ? `, ${results.failed} failed` : ''}`);
  };

  const togglePartnerSelection = (partnerId) => {
    setSelectedPartnersForGroup(prev => {
      const newSet = new Set(prev);
      newSet.has(partnerId) ? newSet.delete(partnerId) : newSet.add(partnerId);
      return newSet;
    });
  };

  const selectAllPartners = () => {
    const visibleIds = filteredPartnersWithoutGroups.slice(0, 100).map(p => p.id);
    setSelectedPartnersForGroup(new Set(visibleIds));
  };

  const filteredPartnersWithoutGroups = useMemo(() => {
    let filtered = partnersWithoutGroups;
    if (partnerSearchTerm) {
      const term = partnerSearchTerm.toLowerCase();
      filtered = filtered.filter(p => p.account_name?.toLowerCase().includes(term));
    }
    if (partnerTierFilter !== 'all') {
      filtered = filtered.filter(p => p.partner_tier === partnerTierFilter);
    }
    if (partnerStatusFilter !== 'all') {
      filtered = filtered.filter(p => {
        const isActive = p.is_active !== false && p.account_status !== 'Inactive';
        return partnerStatusFilter === 'active' ? isActive : !isActive;
      });
    }
    return filtered;
  }, [partnersWithoutGroups, partnerSearchTerm, partnerTierFilter, partnerStatusFilter]);

  const partnerTierOptions = useMemo(() => {
    const tierSet = new Set();
    partnersWithoutGroups.forEach(p => { if (p.partner_tier) tierSet.add(p.partner_tier); });
    return ['all', ...Array.from(tierSet).sort()];
  }, [partnersWithoutGroups]);

  // ============================================
  // TAB 1: GROUP AUDIT - Functions
  // ============================================

  const runAudit = useCallback(async () => {
    setAuditLoading(true);
    setAudit(null);
    setFixResults(null);
    try {
      const response = await fetch('/api/db/maintenance/partner-contact-audit');
      if (!response.ok) throw new Error('Failed to run audit');
      const data = await response.json();
      setAudit(data);
      setStats(prev => ({ ...prev, auditIssues: data.partnersWithIssues?.length || 0 }));
    } catch (err) {
      setError(err.message);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const fixPartnerMemberships = async (partnerId) => {
    const partner = audit?.byPartner?.[partnerId] || audit?.byPartner?.[String(partnerId)];
    if (!partner) {
      setError(`Partner not found for ID: ${partnerId}`);
      return;
    }
    
    setFixing(true);
    setFixProgress({ current: 0, total: 0, stage: 'preparing' });
    
    const results = {
      partnerGroup: { success: 0, failed: 0, errors: [] },
      allPartnersGroup: { success: 0, failed: 0, errors: [] }
    };
    
    try {
      // Fix partner group memberships
      if (partner.partnerGroupId && partner.missingPartnerGroup?.length > 0) {
        setFixProgress({ current: 0, total: partner.missingPartnerGroup.length, stage: 'partnerGroup' });
        for (let i = 0; i < partner.missingPartnerGroup.length; i++) {
          const user = partner.missingPartnerGroup[i];
          try {
            await northpassApi.addUserToGroup(partner.partnerGroupId, user.userId);
            await fetch(`/api/db/groups/${partner.partnerGroupId}/members/${user.userId}/record`, { method: 'POST' });
            results.partnerGroup.success++;
          } catch (err) {
            results.partnerGroup.failed++;
            results.partnerGroup.errors.push({ user: user.email, error: err.message });
          }
          setFixProgress({ current: i + 1, total: partner.missingPartnerGroup.length, stage: 'partnerGroup' });
        }
      }
      
      // Fix All Partners group memberships
      if (audit.allPartnersGroupId && partner.missingAllPartnersGroup?.length > 0) {
        setFixProgress({ current: 0, total: partner.missingAllPartnersGroup.length, stage: 'allPartnersGroup' });
        for (let i = 0; i < partner.missingAllPartnersGroup.length; i++) {
          const user = partner.missingAllPartnersGroup[i];
          try {
            await northpassApi.addUserToGroup(audit.allPartnersGroupId, user.userId);
            await fetch(`/api/db/groups/${audit.allPartnersGroupId}/members/${user.userId}/record`, { method: 'POST' });
            results.allPartnersGroup.success++;
          } catch (err) {
            results.allPartnersGroup.failed++;
            results.allPartnersGroup.errors.push({ user: user.email, error: err.message });
          }
          setFixProgress({ current: i + 1, total: partner.missingAllPartnersGroup.length, stage: 'allPartnersGroup' });
        }
      }
      
      setFixResults(results);
      setTimeout(() => runAudit(), 2000);
    } catch (err) {
      setError('Fix failed: ' + err.message);
    } finally {
      setFixing(false);
      setFixProgress(null);
    }
  };

  const fixAllMemberships = async () => {
    if (!audit?.partnersWithIssues?.length) return;
    
    setFixing(true);
    setFixProgress({ current: 0, total: audit.partnersWithIssues.length, stage: 'all' });
    
    const allResults = { partnersFixed: 0, partnerGroupAdded: 0, allPartnersGroupAdded: 0, errors: [] };
    
    try {
      for (let i = 0; i < audit.partnersWithIssues.length; i++) {
        const partner = audit.partnersWithIssues[i];
        setFixProgress({ current: i + 1, total: audit.partnersWithIssues.length, stage: 'all', currentPartner: partner.partnerName });
        
        if (partner.partnerGroupId && partner.missingPartnerGroup?.length > 0) {
          for (const user of partner.missingPartnerGroup) {
            try {
              await northpassApi.addUserToGroup(partner.partnerGroupId, user.userId);
              allResults.partnerGroupAdded++;
            } catch (err) {
              allResults.errors.push({ partner: partner.partnerName, user: user.email, error: err.message });
            }
          }
        }
        
        if (audit.allPartnersGroupId && partner.missingAllPartnersGroup?.length > 0) {
          for (const user of partner.missingAllPartnersGroup) {
            try {
              await northpassApi.addUserToGroup(audit.allPartnersGroupId, user.userId);
              allResults.allPartnersGroupAdded++;
            } catch (err) {
              allResults.errors.push({ partner: partner.partnerName, user: user.email, error: err.message });
            }
          }
        }
        allResults.partnersFixed++;
      }
      
      setFixResults(allResults);
      setTimeout(() => runAudit(), 2000);
    } catch (err) {
      setError('Bulk fix failed: ' + err.message);
    } finally {
      setFixing(false);
      setFixProgress(null);
    }
  };

  const renamePartnerGroup = async (groupId, newName) => {
    setRenaming(groupId);
    try {
      await northpassApi.updateGroupName(groupId, newName);
      await fetch(`/api/db/lms/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });
      await runAudit();
      setSuccess(`Renamed group to ${newName}`);
    } catch (err) {
      setError(`Failed to rename group: ${err.message}`);
    } finally {
      setRenaming(null);
    }
  };

  // ============================================
  // TAB 2: ALL PARTNERS SYNC - Functions
  // ============================================

  const runSyncAudit = useCallback(async () => {
    setSyncLoading(true);
    setSyncAudit(null);
    setSyncResults(null);
    try {
      const response = await fetch('/api/db/maintenance/all-partners-sync-audit');
      if (!response.ok) throw new Error('Failed to run sync audit');
      const data = await response.json();
      setSyncAudit(data);
      setStats(prev => ({ ...prev, allPartnersMissing: data.allMissingUsers?.length || 0 }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncLoading(false);
    }
  }, []);

  const fixAllPartnersSync = async () => {
    if (!syncAudit?.allMissingUsers?.length) return;
    
    setSyncFixing(true);
    setSyncProgress({ current: 0, total: syncAudit.allMissingUsers.length });
    
    try {
      const userIds = [...new Set(syncAudit.allMissingUsers.map(u => u.userId))];
      const response = await fetch('/api/db/maintenance/add-to-all-partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds, allPartnersGroupId: syncAudit.allPartnersGroupId })
      });
      
      const result = await response.json();
      if (response.ok) {
        setSyncResults({
          added: result.results.apiAdded,
          failed: result.results.apiFailed,
          dbAdded: result.results.dbAdded,
          errors: result.results.errors
        });
        setSuccess(`Added ${result.results.apiAdded} users to All Partners group`);
      } else {
        setError(result.error || 'Failed to add users');
      }
      setTimeout(() => runSyncAudit(), 1000);
    } catch (err) {
      setError('Fix failed: ' + err.message);
    } finally {
      setSyncFixing(false);
      setSyncProgress(null);
    }
  };

  // ============================================
  // TAB 3: PARTNER FAMILIES - Functions
  // ============================================

  const loadFamilies = async () => {
    try {
      const response = await fetch('/api/db/families');
      if (!response.ok) throw new Error('Failed to load families');
      const data = await response.json();
      setFamilies(data.families || []);
      setStats(prev => ({
        ...prev,
        totalFamilies: data.families?.length || 0,
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEditFamily = (family) => {
    setEditingFamily({ ...family });
    setEditDialogOpen(true);
  };

  const handleSaveFamily = async () => {
    if (!editingFamily) return;
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
    try {
      const response = await fetch(`/api/db/families/${deletingFamily.family_name}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete family');
      setSuccess(`Deleted family "${deletingFamily.family_name}"`);
      setDeleteDialogOpen(false);
      setDeletingFamily(null);
      loadFamilies();
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredFamilies = useMemo(() => {
    if (!familySearchTerm) return families;
    const term = familySearchTerm.toLowerCase();
    return families.filter(f => f.family_name?.toLowerCase().includes(term) || f.display_name?.toLowerCase().includes(term));
  }, [families, familySearchTerm]);

  // ============================================
  // TAB 4: AUTO-DETECT - Functions
  // ============================================

  const detectFamilies = async () => {
    setDetecting(true);
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
    try {
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

  // ============================================
  // TAB 5: CONFLICTS - Functions
  // ============================================

  const detectConflicts = async (family) => {
    setSelectedFamily(family);
    setTabIndex(5);
    try {
      const response = await fetch(`/api/db/families/${family.family_name}/conflicts`);
      if (!response.ok) throw new Error('Failed to detect conflicts');
      const data = await response.json();
      setConflicts(data.conflicts || []);
      setStats(prev => ({ ...prev, totalConflicts: data.conflicts?.length || 0 }));
      if (data.conflicts?.length === 0) {
        setSuccess(`No conflicts found in ${family.family_name} family`);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleMarkShared = async (conflict) => {
    try {
      const response = await fetch(`/api/db/families/${selectedFamily.family_name}/shared-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: conflict.user_id, userEmail: conflict.email, reason: 'Marked as shared via admin UI' }),
      });
      if (!response.ok) throw new Error('Failed to mark as shared');
      setSuccess(`${conflict.email} marked as shared resource`);
      setConflicts(prev => prev.filter(c => c.user_id !== conflict.user_id));
    } catch (err) {
      setError(err.message);
    }
  };

  const resolveToGroup = async (groupId) => {
    if (!resolvingConflict || !selectedFamily) return;
    try {
      const response = await fetch(`/api/db/families/${selectedFamily.family_name}/resolve-conflict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resolvingConflict.user_id, targetGroupId: groupId }),
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

  // ============================================
  // RENDER
  // ============================================

  if (loading && partnersWithoutGroups.length === 0 && families.length === 0) {
    return <LoadingState message="Loading group management..." />;
  }

  return (
    <PageContent>
      <PageHeader
        icon={<GroupWorkIcon />}
        title="Group Management"
        subtitle="Create LMS groups, audit memberships, and manage partner families"
      />

      {/* Stats Row */}
      <StatsRow columns={5}>
        <StatCard
          icon="🏢"
          value={stats.partnersWithoutGroups}
          label="Partners Without Groups"
          variant={stats.partnersWithoutGroups > 0 ? 'warning' : 'success'}
        />
        <StatCard
          icon="🔍"
          value={stats.auditIssues}
          label="Audit Issues"
          variant={stats.auditIssues > 0 ? 'warning' : 'success'}
        />
        <StatCard
          icon="🌐"
          value={stats.allPartnersMissing}
          label="Missing from All Partners"
          variant={stats.allPartnersMissing > 0 ? 'warning' : 'success'}
        />
        <StatCard
          icon="👨‍👩‍👧‍👦"
          value={stats.totalFamilies}
          label="Partner Families"
        />
        <StatCard
          icon="⚠️"
          value={stats.totalConflicts}
          label="Conflicts"
          variant={stats.totalConflicts > 0 ? 'warning' : 'success'}
        />
      </StatsRow>

      {/* Alerts */}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)} variant="scrollable" scrollButtons="auto">
          <Tab icon={<GroupAddIcon />} iconPosition="start" label={`Create Groups${stats.partnersWithoutGroups > 0 ? ` (${stats.partnersWithoutGroups})` : ''}`} />
          <Tab icon={<BuildIcon />} iconPosition="start" label="Group Audit" />
          <Tab icon={<PublicIcon />} iconPosition="start" label="All Partners Sync" />
          <Tab icon={<FamilyIcon />} iconPosition="start" label="Partner Families" />
          <Tab icon={<AutoDetectIcon />} iconPosition="start" label="Auto-Detect" />
          <Tab icon={<WarningIcon />} iconPosition="start" label={<Badge badgeContent={stats.totalConflicts} color="warning">Conflicts</Badge>} />
        </Tabs>
      </Box>

      {/* ========== TAB 0: CREATE GROUPS ========== */}
      <TabPanel value={tabIndex} index={0}>
        <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
          <ActionButton variant="contained" onClick={loadPartnersWithoutGroups} loading={partnersLoading} icon={<RefreshIcon />}>
            Refresh Partners
          </ActionButton>
        </Box>

        <StatsRow columns={4}>
          <StatCard icon="🏢" value={partnersWithoutGroups.length} label="Partners Without Groups" variant={partnersWithoutGroups.length > 0 ? 'warning' : 'success'} />
          <StatCard icon="✅" value={partnersWithoutGroups.filter(p => p.is_active !== false && p.account_status !== 'Inactive').length} label="Active Partners" variant="success" />
          <StatCard icon="⚠️" value={partnersWithoutGroups.filter(p => p.is_active === false || p.account_status === 'Inactive').length} label="Inactive Partners" variant="error" />
          <StatCard icon="⭐" value={partnersWithoutGroups.filter(p => p.partner_tier?.includes('Premier')).length} label="Premier Partners" />
        </StatsRow>

        {partnersLoading ? (
          <LoadingState message="Loading partners..." />
        ) : partnersWithoutGroups.length === 0 ? (
          <Alert severity="success" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>All Partners Have LMS Groups! 🎉</Typography>
          </Alert>
        ) : (
          <>
            {/* Bulk Progress */}
            {bulkCreating && (
              <Card sx={{ mb: 3, p: 2 }}>
                <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle1">🏗️ Creating groups... {bulkProgress.currentPartner}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>{bulkProgress.current} / {bulkProgress.total}</Typography>
                </Box>
                <LinearProgress variant="determinate" value={(bulkProgress.current / bulkProgress.total) * 100} sx={{ height: 8, borderRadius: 4 }} />
              </Card>
            )}

            {/* Controls */}
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
              <Box sx={{ flex: 1, minWidth: 250 }}>
                <SearchInput value={partnerSearchTerm} onChange={(e) => setPartnerSearchTerm(e.target.value)} placeholder="Search partners..." onClear={() => setPartnerSearchTerm('')} />
              </Box>
              <FilterSelect
                label="Status"
                value={partnerStatusFilter === 'all' ? '' : partnerStatusFilter}
                onChange={(val) => setPartnerStatusFilter(val || 'all')}
                options={[{ value: 'active', label: '✅ Active Only' }, { value: 'inactive', label: '⚠️ Inactive Only' }]}
                minWidth={150}
              />
              <FilterSelect
                label="Tier"
                value={partnerTierFilter === 'all' ? '' : partnerTierFilter}
                onChange={(val) => setPartnerTierFilter(val || 'all')}
                options={partnerTierOptions.filter(t => t !== 'all').map(t => ({ value: t, label: t }))}
                minWidth={150}
              />
            </Box>

            {/* Selection Controls */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selectedPartnersForGroup.size > 0 && selectedPartnersForGroup.size === Math.min(filteredPartnersWithoutGroups.length, 100)}
                      indeterminate={selectedPartnersForGroup.size > 0 && selectedPartnersForGroup.size < Math.min(filteredPartnersWithoutGroups.length, 100)}
                      onChange={(e) => e.target.checked ? selectAllPartners() : setSelectedPartnersForGroup(new Set())}
                      disabled={bulkCreating}
                    />
                  }
                  label={<Typography variant="body2">Select All ({Math.min(filteredPartnersWithoutGroups.length, 100)})</Typography>}
                />
                {selectedPartnersForGroup.size > 0 && (
                  <Chip label={`${selectedPartnersForGroup.size} selected`} onDelete={() => setSelectedPartnersForGroup(new Set())} size="small" color="primary" />
                )}
              </Box>
              {selectedPartnersForGroup.size > 0 && (
                <ActionButton variant="contained" color="primary" onClick={bulkCreateGroups} loading={bulkCreating} disabled={bulkCreating}>
                  <GroupAddIcon sx={{ mr: 1 }} /> Create {selectedPartnersForGroup.size} Groups
                </ActionButton>
              )}
            </Box>

            {/* Partners Table */}
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox"></TableCell>
                    <TableCell>Partner Name</TableCell>
                    <TableCell align="center">Tier</TableCell>
                    <TableCell align="center">Region</TableCell>
                    <TableCell align="center">Contacts</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPartnersWithoutGroups.slice(0, 100).map(partner => (
                    <TableRow key={partner.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox size="small" checked={selectedPartnersForGroup.has(partner.id)} onChange={() => togglePartnerSelection(partner.id)} disabled={bulkCreating} />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <BusinessIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
                          <Box>
                            <strong>{partner.account_name}</strong>
                            {partner.account_owner && <Typography variant="caption" sx={{ display: 'block', opacity: 0.6 }}>Owner: {partner.account_owner}</Typography>}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell align="center">{partner.partner_tier ? <TierBadge tier={partner.partner_tier} size="small" /> : '-'}</TableCell>
                      <TableCell align="center">{partner.account_region || '-'}</TableCell>
                      <TableCell align="center">{partner.contact_count || 0}</TableCell>
                      <TableCell align="center">
                        {(partner.is_active === false || partner.account_status === 'Inactive') 
                          ? <Chip label="Inactive" size="small" color="error" />
                          : <Chip label="Active" size="small" color="success" variant="outlined" />
                        }
                      </TableCell>
                      <TableCell align="center">
                        <ActionButton
                          size="small"
                          variant="outlined"
                          color="primary"
                          onClick={() => createGroupForPartner(partner)}
                          loading={creatingGroupFor?.partnerId === partner.id}
                          disabled={creatingGroupFor !== null || bulkCreating}
                          sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
                        >
                          Create
                        </ActionButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {filteredPartnersWithoutGroups.length > 100 && (
              <Typography variant="body2" sx={{ mt: 2, textAlign: 'center', opacity: 0.7 }}>
                Showing first 100 of {filteredPartnersWithoutGroups.length} partners. Use filters to narrow down.
              </Typography>
            )}
          </>
        )}
      </TabPanel>

      {/* ========== TAB 1: GROUP AUDIT ========== */}
      <TabPanel value={tabIndex} index={1}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Audit contacts to ensure they're in their partner's LMS group and the All Partners group.
          </Typography>
          <ActionButton onClick={runAudit} loading={auditLoading} disabled={fixing}>
            {auditLoading ? '🔄 Auditing...' : '🔍 Run Audit'}
          </ActionButton>
        </Box>

        {/* Fix Progress */}
        {fixProgress && (
          <Card sx={{ mb: 3, p: 2 }}>
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="subtitle1">
                {fixProgress.stage === 'partnerGroup' && '👥 Adding to Partner Group...'}
                {fixProgress.stage === 'allPartnersGroup' && '🌐 Adding to All Partners Group...'}
                {fixProgress.stage === 'all' && `🔄 Processing: ${fixProgress.currentPartner || ''}`}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.7 }}>{fixProgress.current} / {fixProgress.total}</Typography>
            </Box>
            <LinearProgress variant="determinate" value={(fixProgress.current / fixProgress.total) * 100} sx={{ height: 8, borderRadius: 4 }} />
          </Card>
        )}

        {/* Fix Results */}
        {fixResults && (
          <Alert severity="success" onClose={() => setFixResults(null)} sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>✅ Fix Complete</Typography>
            {fixResults.partnersFixed !== undefined ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                <span>Partners Processed: <strong>{fixResults.partnersFixed}</strong></span>
                <span>Added to Partner Groups: <strong style={{ color: '#28a745' }}>{fixResults.partnerGroupAdded}</strong></span>
                <span>Added to All Partners: <strong style={{ color: '#28a745' }}>{fixResults.allPartnersGroupAdded}</strong></span>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                <span>Partner Group: +{fixResults.partnerGroup?.success || 0}</span>
                <span>All Partners: +{fixResults.allPartnersGroup?.success || 0}</span>
              </Box>
            )}
          </Alert>
        )}

        {/* Audit Results */}
        {audit && (
          <>
            <StatsRow columns={4}>
              <StatCard icon="📊" value={audit.totalContacts || 0} label="Total Contacts" />
              <StatCard icon="✅" value={audit.inBothGroups || 0} label="Fully Synced" variant="success" />
              <StatCard icon="⚠️" value={audit.missingFromPartnerGroup || 0} label="Missing Partner Group" variant="warning" />
              <StatCard icon="🌐" value={audit.missingFromAllPartners || 0} label="Missing All Partners" variant="warning" />
            </StatsRow>

            {audit.partnersWithIssues?.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">Partners with Issues ({audit.partnersWithIssues.length})</Typography>
                  <ActionButton variant="contained" onClick={fixAllMemberships} loading={fixing} disabled={fixing}>
                    Fix All Issues
                  </ActionButton>
                </Box>
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Partner</TableCell>
                        <TableCell align="center">Missing Partner Group</TableCell>
                        <TableCell align="center">Missing All Partners</TableCell>
                        <TableCell align="center">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {audit.partnersWithIssues.slice(0, 50).map(p => (
                        <TableRow key={p.partnerId} hover>
                          <TableCell><strong>{p.partnerName}</strong></TableCell>
                          <TableCell align="center">{p.missingPartnerGroup?.length || 0}</TableCell>
                          <TableCell align="center">{p.missingAllPartnersGroup?.length || 0}</TableCell>
                          <TableCell align="center">
                            <ActionButton size="small" variant="outlined" onClick={() => fixPartnerMemberships(p.partnerId)} disabled={fixing}>
                              Fix
                            </ActionButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {audit.groupsToRename?.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="h6" gutterBottom>Groups Needing Rename ({audit.groupsToRename.length})</Typography>
                <Alert severity="info" sx={{ mb: 2 }}>These groups should use the ptr_ prefix for consistency.</Alert>
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Current Name</TableCell>
                        <TableCell>Suggested Name</TableCell>
                        <TableCell align="center">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {audit.groupsToRename.map(g => (
                        <TableRow key={g.groupId} hover>
                          <TableCell>{g.groupName}</TableCell>
                          <TableCell><code>{g.suggestedName}</code></TableCell>
                          <TableCell align="center">
                            <ActionButton
                              size="small"
                              variant="outlined"
                              onClick={() => renamePartnerGroup(g.groupId, g.suggestedName)}
                              loading={renaming === g.groupId}
                              disabled={renaming !== null}
                            >
                              Rename
                            </ActionButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </>
        )}

        {!audit && !auditLoading && (
          <EmptyState icon={<BuildIcon />} title="Run Audit" description="Click 'Run Audit' to check contact group memberships." />
        )}
      </TabPanel>

      {/* ========== TAB 2: ALL PARTNERS SYNC ========== */}
      <TabPanel value={tabIndex} index={2}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Ensure all partner users are members of the "All Partners" group.
          </Typography>
          <ActionButton onClick={runSyncAudit} loading={syncLoading} disabled={syncFixing}>
            {syncLoading ? '🔄 Checking...' : '🔍 Check Sync'}
          </ActionButton>
        </Box>

        {/* Sync Progress */}
        {syncProgress && (
          <Card sx={{ mb: 3, p: 2 }}>
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="subtitle1">🌐 Adding users to All Partners...</Typography>
              <Typography variant="body2" sx={{ opacity: 0.7 }}>{syncProgress.current} / {syncProgress.total}</Typography>
            </Box>
            <LinearProgress variant="determinate" value={(syncProgress.current / syncProgress.total) * 100} sx={{ height: 8, borderRadius: 4 }} />
          </Card>
        )}

        {/* Sync Results */}
        {syncResults && (
          <Alert severity="success" onClose={() => setSyncResults(null)} sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>✅ Sync Complete</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              <span>Added: <strong style={{ color: '#28a745' }}>{syncResults.added}</strong></span>
              {syncResults.failed > 0 && <span>Failed: <strong style={{ color: '#dc3545' }}>{syncResults.failed}</strong></span>}
            </Box>
          </Alert>
        )}

        {/* Sync Audit Results */}
        {syncAudit && (
          <>
            <StatsRow columns={3}>
              <StatCard icon="👥" value={syncAudit.totalPartnerUsers || 0} label="Total Partner Users" />
              <StatCard icon="✅" value={syncAudit.inAllPartnersGroup || 0} label="In All Partners" variant="success" />
              <StatCard icon="⚠️" value={syncAudit.allMissingUsers?.length || 0} label="Missing" variant={syncAudit.allMissingUsers?.length > 0 ? 'warning' : 'success'} />
            </StatsRow>

            {syncAudit.allMissingUsers?.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">Users Missing from All Partners ({syncAudit.allMissingUsers.length})</Typography>
                  <ActionButton variant="contained" onClick={fixAllPartnersSync} loading={syncFixing} disabled={syncFixing}>
                    Add All to All Partners
                  </ActionButton>
                </Box>
                <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Email</TableCell>
                        <TableCell>Name</TableCell>
                        <TableCell>Partner</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {syncAudit.allMissingUsers.slice(0, 100).map(u => (
                        <TableRow key={u.userId} hover>
                          <TableCell>{u.email}</TableCell>
                          <TableCell>{u.name || '-'}</TableCell>
                          <TableCell>{u.partnerName || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {syncAudit.allMissingUsers.length > 100 && (
                  <Typography variant="body2" sx={{ mt: 1, opacity: 0.7 }}>Showing first 100 of {syncAudit.allMissingUsers.length}</Typography>
                )}
              </Box>
            )}
          </>
        )}

        {!syncAudit && !syncLoading && (
          <EmptyState icon={<PublicIcon />} title="Check Sync" description="Click 'Check Sync' to see which users are missing from the All Partners group." />
        )}
      </TabPanel>

      {/* ========== TAB 3: PARTNER FAMILIES ========== */}
      <TabPanel value={tabIndex} index={3}>
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <SearchInput value={familySearchTerm} onChange={setFamilySearchTerm} placeholder="Search families..." sx={{ flex: 1 }} />
          <ActionButton
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditingFamily({ family_name: '', display_name: '', is_gsi: false, allow_cross_group_users: false, aggregate_reporting: true, notes: '' });
              setEditDialogOpen(true);
            }}
          >
            New Family
          </ActionButton>
          <ActionButton variant="outlined" startIcon={<RefreshIcon />} onClick={loadFamilies}>Refresh</ActionButton>
        </Box>

        {filteredFamilies.length === 0 ? (
          <EmptyState icon={<FamilyIcon />} title="No Partner Families" description="Create families manually or use Auto-Detect to find partners with similar names." />
        ) : (
          filteredFamilies.map((family) => (
            <FamilyCard
              key={family.family_name}
              family={family}
              onEdit={handleEditFamily}
              onDelete={(f) => { setDeletingFamily(f); setDeleteDialogOpen(true); }}
              onDetectConflicts={detectConflicts}
            />
          ))
        )}
      </TabPanel>

      {/* ========== TAB 4: AUTO-DETECT ========== */}
      <TabPanel value={tabIndex} index={4}>
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
            <ActionButton variant="contained" color="secondary" startIcon={<SearchIcon />} onClick={detectFamilies} loading={detecting}>
              Detect Families
            </ActionButton>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Finds partners with similar name prefixes (e.g., "Protiviti Inc", "Protiviti UK" → "Protiviti" family).
          </Typography>
        </SectionCard>

        {detecting && <LoadingState message="Detecting potential families..." />}

        {!detecting && detectedFamilies.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>Detected Families ({detectedFamilies.length})</Typography>
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
          <EmptyState icon={<AutoDetectIcon />} title="No Families Detected" description="Click 'Detect Families' to find partners that could be grouped together." />
        )}
      </TabPanel>

      {/* ========== TAB 5: CONFLICTS ========== */}
      <TabPanel value={tabIndex} index={5}>
        {selectedFamily ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Typography variant="h6">Conflicts in {selectedFamily.display_name || selectedFamily.family_name}</Typography>
              <Chip label={`${conflicts.length} conflicts`} color={conflicts.length > 0 ? 'warning' : 'success'} size="small" />
            </Box>

            {conflicts.length === 0 ? (
              <EmptyState icon={<CheckIcon />} title="No Conflicts" description="All users belong to exactly one group in this family." />
            ) : (
              conflicts.map((conflict) => (
                <ConflictCard
                  key={conflict.user_id}
                  conflict={conflict}
                  onResolve={(c) => { setResolvingConflict(c); setResolveDialogOpen(true); }}
                  onMarkShared={handleMarkShared}
                />
              ))
            )}
          </>
        ) : (
          <EmptyState icon={<FamilyIcon />} title="Select a Family" description="Choose a family from the Partner Families tab and click 'Detect Conflicts' to find users in multiple groups." />
        )}
      </TabPanel>

      {/* ========== DIALOGS ========== */}

      {/* Edit Family Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingFamily?.family_name ? 'Edit Family' : 'Create New Family'}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Family Name (ID)"
              value={editingFamily?.family_name || ''}
              onChange={(e) => setEditingFamily(prev => ({ ...prev, family_name: e.target.value }))}
              disabled={!!editingFamily?.family_name && families.some(f => f.family_name === editingFamily.family_name)}
              fullWidth
              helperText="Unique identifier"
            />
            <TextField
              label="Display Name"
              value={editingFamily?.display_name || ''}
              onChange={(e) => setEditingFamily(prev => ({ ...prev, display_name: e.target.value }))}
              fullWidth
            />
            <FormControlLabel
              control={<Switch checked={editingFamily?.is_gsi || false} onChange={(e) => setEditingFamily(prev => ({ ...prev, is_gsi: e.target.checked }))} />}
              label="Global System Integrator (GSI)"
            />
            <FormControlLabel
              control={<Switch checked={editingFamily?.allow_cross_group_users || false} onChange={(e) => setEditingFamily(prev => ({ ...prev, allow_cross_group_users: e.target.checked }))} />}
              label="Allow users in multiple groups"
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
          <Button variant="contained" onClick={handleSaveFamily} startIcon={<SaveIcon />}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Family?</DialogTitle>
        <DialogContent>
          <Typography>Delete the "{deletingFamily?.family_name}" family? This will remove family assignments from all members.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteFamily}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Resolve Conflict Dialog */}
      <Dialog open={resolveDialogOpen} onClose={() => setResolveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Resolve User Conflict</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>Choose which group <strong>{resolvingConflict?.email}</strong> should belong to:</Typography>
          <Box sx={{ mt: 2 }}>
            {resolvingConflict?.groups?.map((group) => (
              <Button key={group.id} variant="outlined" fullWidth sx={{ mb: 1, justifyContent: 'flex-start' }} onClick={() => resolveToGroup(group.id)} startIcon={<BusinessIcon />}>
                {group.group_name}
              </Button>
            ))}
          </Box>
          <Alert severity="info" sx={{ mt: 2 }}>User will be removed from all other groups in this family.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </PageContent>
  );
};

export default GroupManagement;
