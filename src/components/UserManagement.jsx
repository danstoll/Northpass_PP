import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import './UserManagement.css';
import northpassApi from '../services/northpassApi';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  Checkbox,
  FormControlLabel,
  Tabs,
  Tab,
  Collapse,
  IconButton,
  Chip,
  LinearProgress,
  TableSortLabel,
} from '@mui/material';
import {
  PersonSearch,
  Search as SearchIcon,
  Domain as DomainIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  GroupAdd as GroupAddIcon,
  Business as BusinessIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  AddCircleOutline as AddCircleOutlineIcon,
  Link as LinkIcon,
  GroupWork as GroupWorkIcon,
  Build as BuildIcon,
  Public as PublicIcon,
  PersonOff as PersonOffIcon,
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
  DataTable,
  StatusChip,
  TierBadge,
} from './ui/NintexUI';

// Common personal/public email domains to exclude
const EXCLUDED_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'google.com',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.es', 'hotmail.it',
  'outlook.com', 'outlook.co.uk', 'outlook.fr', 'outlook.de', 'outlook.es', 'outlook.it',
  'msn.com', 'live.com', 'live.co.uk', 'live.fr', 'live.de',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it', 'yahoo.ca',
  'ymail.com', 'rocketmail.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'protonmail.com', 'proton.me', 'zoho.com', 'mail.com', 'gmx.com', 'gmx.net', 'gmx.de',
  'web.de', 'freenet.de', 't-online.de', 'orange.fr', 'wanadoo.fr', 'laposte.net',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'cox.net', 'charter.net',
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com'
]);

const isExcludedDomain = (email) => {
  if (!email) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? EXCLUDED_EMAIL_DOMAINS.has(domain) : true;
};

// ============================================
// Add Users Modal Component
// ============================================
const AddUsersModal = ({ isOpen, onClose, selectedContacts, onConfirm, isAdding, progress, results }) => {
  // Group contacts by account for summary display
  const contactsByAccount = useMemo(() => {
    if (!selectedContacts) return [];
    const byAccount = {};
    selectedContacts.forEach(contact => {
      const accountName = contact.accountName || 'Unknown Company';
      if (!byAccount[accountName]) {
        byAccount[accountName] = {
          accountName,
          partnerTier: contact.partnerTier,
          contacts: []
        };
      }
      byAccount[accountName].contacts.push(contact);
    });
    return Object.values(byAccount).sort((a, b) => b.contacts.length - a.contacts.length);
  }, [selectedContacts]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content add-users-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>➕ Add Users to LMS</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {results ? (
            <div className="results-view text-center">
              <div className={`result-icon mb-4 ${results.failed > 0 ? 'partial' : 'success'}`}>
                {results.failed > 0 ? '⚠️' : '✅'}
              </div>
              <h4 className="mb-4">Operation Complete</h4>
              <div className="results-grid mb-4">
                <div className="result-item d-flex justify-between align-center">
                  <span className="result-label">Users Created:</span>
                  <span className="result-value success font-semibold">{results.created}</span>
                </div>
                <div className="result-item d-flex justify-between align-center">
                  <span className="result-label">Added to Partner Groups:</span>
                  <span className="result-value success font-semibold">{results.addedToGroup}</span>
                </div>
                <div className="result-item d-flex justify-between align-center">
                  <span className="result-label">Added to All Partners:</span>
                  <span className="result-value success font-semibold">{results.addedToGroup}</span>
                </div>
                <div className="result-item d-flex justify-between align-center">
                  <span className="result-label">Already Existed:</span>
                  <span className="result-value warning font-semibold">{results.alreadyExisted}</span>
                </div>
                <div className="result-item d-flex justify-between align-center">
                  <span className="result-label">Failed:</span>
                  <span className="result-value error font-semibold">{results.failed}</span>
                </div>
              </div>
              {results.errors && results.errors.length > 0 && (
                <div className="error-details mb-4">
                  <h4 className="mb-2">Errors:</h4>
                  <ul className="text-left">
                    {results.errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>{err.email}: {err.error}</li>
                    ))}
                    {results.errors.length > 5 && (
                      <li className="opacity-70">...and {results.errors.length - 5} more errors</li>
                    )}
                  </ul>
                </div>
              )}
              <div className="modal-actions d-flex justify-center gap-3">
                <ActionButton variant="contained" color="primary" onClick={onClose}>
                  Close
                </ActionButton>
              </div>
            </div>
          ) : isAdding ? (
            <div className="adding-progress text-center">
              <div className="ntx-spinner mb-4"></div>
              <p className="mb-3">{progress.stage}</p>
              <div className="progress-bar mb-2">
                <div 
                  className="progress-fill"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                ></div>
              </div>
              <p className="progress-detail opacity-70">{progress.current} of {progress.total}</p>
            </div>
          ) : (
            <>
              <div className="confirm-summary mb-5">
                <p className="mb-3">You are about to add <strong>{selectedContacts.length}</strong> users to the LMS.</p>
                <p className="info-text opacity-80">
                  Each user will be:
                  <br />• Created in Northpass with their email
                  <br />• Added to their partner's group (if it exists)
                  <br />• Added to the "All Partners" group
                </p>
              </div>
              
              <div className="accounts-preview mb-5">
                <h4 className="mb-3">Users by Partner ({contactsByAccount.length} partners):</h4>
                <div className="accounts-list">
                  {contactsByAccount.slice(0, 10).map((account, idx) => (
                    <div key={idx} className="account-preview-item d-flex align-center gap-3">
                      <span className="account-name flex-1 truncate">{account.accountName}</span>
                      <span className={`tier-badge tier-${(account.partnerTier || '').toLowerCase().replace(/\s+/g, '-')}`}>
                        {account.partnerTier || 'Unknown'}
                      </span>
                      <span className="contact-count opacity-70">{account.contacts.length} users</span>
                    </div>
                  ))}
                  {contactsByAccount.length > 10 && (
                    <div className="more-accounts text-center opacity-70 py-2">
                      ...and {contactsByAccount.length - 10} more partners
                    </div>
                  )}
                </div>
              </div>
              
              <div className="modal-actions d-flex justify-center gap-3">
                <ActionButton variant="outlined" color="inherit" onClick={onClose}>
                  Cancel
                </ActionButton>
                <ActionButton variant="contained" color="primary" onClick={onConfirm}>
                  ➕ Add {selectedContacts.length} Users
                </ActionButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ============================================
// Add to Group Modal Component
// ============================================
const AddToGroupModal = ({ isOpen, onClose, selectedUsers, groupName, onConfirm, isAdding, progress, results }) => {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content add-users-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3><GroupAddIcon sx={{ mr: 1, verticalAlign: 'middle' }} /> Add Users to Group</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {results ? (
            <div className="results-view text-center">
              <div className={`result-icon mb-4 ${results.failed > 0 ? 'partial' : 'success'}`}>
                {results.failed > 0 ? '⚠️' : '✅'}
              </div>
              <h4 className="mb-4">Operation Complete</h4>
              <div className="results-grid mb-4">
                <div className="result-item d-flex justify-between align-center">
                  <span className="result-label">Added to Group:</span>
                  <span className="result-value success font-semibold">{results.success}</span>
                </div>
                <div className="result-item d-flex justify-between align-center">
                  <span className="result-label">Already Members:</span>
                  <span className="result-value warning font-semibold">{results.alreadyMember}</span>
                </div>
                <div className="result-item d-flex justify-between align-center">
                  <span className="result-label">Failed:</span>
                  <span className="result-value error font-semibold">{results.failed}</span>
                </div>
              </div>
              {results.errors && results.errors.length > 0 && (
                <div className="error-details mb-4">
                  <h4 className="mb-2">Errors:</h4>
                  <ul className="text-left">
                    {results.errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>{err.email}: {err.error}</li>
                    ))}
                    {results.errors.length > 5 && (
                      <li className="opacity-70">...and {results.errors.length - 5} more errors</li>
                    )}
                  </ul>
                </div>
              )}
              <div className="modal-actions d-flex justify-center gap-3">
                <ActionButton variant="contained" color="primary" onClick={onClose}>
                  Close
                </ActionButton>
              </div>
            </div>
          ) : isAdding ? (
            <div className="adding-progress text-center">
              <div className="ntx-spinner mb-4"></div>
              <p className="mb-3">{progress.stage}</p>
              <div className="progress-bar mb-2">
                <div 
                  className="progress-fill"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                ></div>
              </div>
              <p className="progress-detail opacity-70">{progress.current} of {progress.total}</p>
            </div>
          ) : (
            <>
              <div className="confirm-summary mb-5">
                <p className="mb-3">
                  You are about to add <strong>{selectedUsers.length}</strong> users to group:
                </p>
                <Typography variant="h6" sx={{ color: 'primary.main', mb: 2 }}>
                  {groupName}
                </Typography>
                <p className="info-text opacity-80">
                  Users will be added via the Northpass API.
                </p>
              </div>
              
              <div className="accounts-preview mb-5">
                <h4 className="mb-3">Users to add ({selectedUsers.length}):</h4>
                <div className="accounts-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {selectedUsers.slice(0, 20).map((user, idx) => (
                    <div key={idx} className="account-preview-item d-flex align-center gap-3">
                      <span className="account-name flex-1 truncate">{user.email}</span>
                      <span className="opacity-70">{user.firstName} {user.lastName}</span>
                    </div>
                  ))}
                  {selectedUsers.length > 20 && (
                    <div className="more-accounts text-center opacity-70 py-2">
                      ...and {selectedUsers.length - 20} more users
                    </div>
                  )}
                </div>
              </div>
              
              <div className="modal-actions d-flex justify-center gap-3">
                <ActionButton variant="outlined" color="inherit" onClick={onClose}>
                  Cancel
                </ActionButton>
                <ActionButton variant="contained" color="primary" onClick={onConfirm}>
                  <GroupAddIcon sx={{ mr: 1 }} /> Add {selectedUsers.length} Users
                </ActionButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ============================================
// Domain Row Component (expandable)
// ============================================
const DomainRow = ({ 
  domainData, 
  isExpanded, 
  onToggle, 
  selectedUsers, 
  onUserSelect, 
  onSelectAll, 
  selectionMode,
  onCreateGroup,
  isCreatingGroup,
  onAddAllToGroup,
  isAddingToGroup
}) => {
  const {
    domain,
    userCount,
    inPartnerGroup,
    notInPartnerGroup,
    matchedPartner,
    matchedPartnerId,
    partnerTier,
    partnerGroupId,
    partnerGroupName,
    users = [],
    isPublicDomain
  } = domainData;

  const usersNotInGroup = users.filter(u => !u.inPartnerGroup);
  const allSelected = usersNotInGroup.length > 0 && usersNotInGroup.every(u => selectedUsers.has(u.id));
  const someSelected = usersNotInGroup.some(u => selectedUsers.has(u.id)) && !allSelected;

  return (
    <>
      <tr 
        className={`domain-row ${isExpanded ? 'expanded' : ''} ${matchedPartner ? 'has-partner' : ''}`}
        onClick={onToggle}
        style={{ cursor: 'pointer' }}
      >
        <td style={{ width: 40 }}>
          <IconButton size="small">
            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </td>
        <td className="domain-cell">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DomainIcon sx={{ color: matchedPartner ? 'primary.main' : 'text.secondary', fontSize: 18 }} />
            <strong>@{domain}</strong>
            {isPublicDomain && (
              <Chip label="Public" size="small" sx={{ ml: 1, height: 20 }} />
            )}
          </Box>
        </td>
        <td style={{ textAlign: 'center' }}>{userCount}</td>
        <td style={{ textAlign: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <CheckCircleIcon sx={{ color: 'success.main', fontSize: 16 }} />
            {inPartnerGroup}
          </Box>
        </td>
        <td style={{ textAlign: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            {notInPartnerGroup > 0 ? (
              <>
                <WarningIcon sx={{ color: 'warning.main', fontSize: 16 }} />
                <span style={{ color: 'var(--admin-warning-text)' }}>{notInPartnerGroup}</span>
              </>
            ) : (
              <span style={{ opacity: 0.5 }}>0</span>
            )}
          </Box>
        </td>
        <td>
          {matchedPartner ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <BusinessIcon sx={{ color: 'primary.main', fontSize: 16 }} />
              <span>{matchedPartner}</span>
              {partnerTier && <TierBadge tier={partnerTier} size="small" />}
            </Box>
          ) : (
            <span style={{ opacity: 0.5 }}>-</span>
          )}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          {partnerGroupName ? (
            <StatusChip status="success" label={partnerGroupName} />
          ) : matchedPartner ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ActionButton
                size="small"
                variant="contained"
                color="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateGroup(matchedPartnerId, matchedPartner);
                }}
                loading={isCreatingGroup}
                disabled={isCreatingGroup}
                sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
              >
                <AddCircleOutlineIcon sx={{ fontSize: 16, mr: 0.5 }} />
                Create Group
              </ActionButton>
            </Box>
          ) : (
            <span style={{ opacity: 0.5 }}>-</span>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="domain-users-row">
          <td colSpan={7}>
            <Box sx={{ p: 2, bgcolor: 'var(--admin-bg-elevated)' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="subtitle2">
                  Users in @{domain} ({users.length})
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  {/* Quick Add All button - appears when there are ungrouped users and a partner group exists */}
                  {notInPartnerGroup > 0 && partnerGroupId && (
                    <ActionButton 
                      size="small" 
                      variant="contained"
                      color="primary"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onAddAllToGroup(usersNotInGroup, partnerGroupId, partnerGroupName); 
                      }}
                      loading={isAddingToGroup}
                      disabled={isAddingToGroup}
                    >
                      <GroupAddIcon sx={{ fontSize: 16, mr: 0.5 }} />
                      Add All {notInPartnerGroup} to Group
                    </ActionButton>
                  )}
                  {selectionMode && notInPartnerGroup > 0 && (
                    <>
                      <ActionButton 
                        size="small" 
                        variant="text"
                        onClick={(e) => { e.stopPropagation(); onSelectAll(usersNotInGroup, true); }}
                      >
                        Select All ({notInPartnerGroup})
                      </ActionButton>
                      {(someSelected || allSelected) && (
                        <ActionButton 
                          size="small" 
                          variant="text"
                          color="inherit"
                          onClick={(e) => { e.stopPropagation(); onSelectAll(usersNotInGroup, false); }}
                        >
                          Clear
                        </ActionButton>
                      )}
                    </>
                  )}
                </Box>
              </Box>
              <div className="domain-users-table">
                <table className="contacts-table small">
                  <thead>
                    <tr>
                      {selectionMode && <th style={{ width: 40 }}></th>}
                      <th>Email</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Groups</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr 
                        key={user.id}
                        className={selectedUsers.has(user.id) ? 'selected' : ''}
                        onClick={(e) => { e.stopPropagation(); selectionMode && onUserSelect(user); }}
                      >
                        {selectionMode && (
                          <td>
                            <Checkbox
                              size="small"
                              checked={selectedUsers.has(user.id)}
                              onChange={() => onUserSelect(user)}
                              onClick={(e) => e.stopPropagation()}
                              disabled={user.inPartnerGroup}
                            />
                          </td>
                        )}
                        <td>{user.email}</td>
                        <td>{[user.firstName, user.lastName].filter(Boolean).join(' ') || '-'}</td>
                        <td>
                          {user.inPartnerGroup ? (
                            <StatusChip status="success" label="In Partner Group" />
                          ) : (
                            <StatusChip status="warning" label="No Partner Group" />
                          )}
                        </td>
                        <td>
                          {user.groupNames?.length > 0 ? (
                            <span className="opacity-70">
                              {user.groupNames.slice(0, 3).join(', ')}
                              {user.groupNames.length > 3 && ` +${user.groupNames.length - 3} more`}
                            </span>
                          ) : (
                            <span className="opacity-50">No groups</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Box>
          </td>
        </tr>
      )}
    </>
  );
};

// ============================================
// Main Component
// ============================================
const UserManagement = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState(0);
  
  // Common state
  const [loading, setLoading] = useState(true);
  const [crmContacts, setCrmContacts] = useState([]);
  const [lmsUsers, setLmsUsers] = useState(new Map()); // email -> user
  const [groups, setGroups] = useState(new Map()); // name -> group
  const [hasPartnerData, setHasPartnerData] = useState(false);

  // Tab 0: Missing CRM Users state
  const [missingContacts, setMissingContacts] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ stage: '', current: 0, total: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [excludePersonalEmails, setExcludePersonalEmails] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addProgress, setAddProgress] = useState({ stage: '', current: 0, total: 0 });
  const [addResults, setAddResults] = useState(null);

  // Tab 1: Domain Analysis state
  const [domainData, setDomainData] = useState(null);
  const [domainLoading, setDomainLoading] = useState(false);
  const [domainSearchTerm, setDomainSearchTerm] = useState('');
  const [domainFilter, setDomainFilter] = useState('all'); // all, matched, unmatched, hasUngrouped
  const [domainOrderBy, setDomainOrderBy] = useState('userCount'); // column to sort by
  const [domainOrder, setDomainOrder] = useState('desc'); // 'asc' or 'desc'
  const [expandedDomains, setExpandedDomains] = useState(new Set());
  const [domainSelectionMode, setDomainSelectionMode] = useState(false);
  const [selectedDomainUsers, setSelectedDomainUsers] = useState(new Map()); // userId -> user object
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [targetGroup, setTargetGroup] = useState(null);
  const [groupAddProgress, setGroupAddProgress] = useState({ stage: '', current: 0, total: 0 });
  const [groupAddResults, setGroupAddResults] = useState(null);
  const [isAddingToGroup, setIsAddingToGroup] = useState(false);
  const [creatingGroupFor, setCreatingGroupFor] = useState(null); // { partnerId, partnerName, domain }

  // Tab 2: Partners Without Groups state
  const [partnersWithoutGroups, setPartnersWithoutGroups] = useState([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnerSearchTerm, setPartnerSearchTerm] = useState('');
  const [partnerTierFilter, setPartnerTierFilter] = useState('all');
  const [selectedPartnersForGroup, setSelectedPartnersForGroup] = useState(new Set());
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, currentPartner: '' });
  const [bulkResults, setBulkResults] = useState(null);

  // Tab 3: Contact Group Audit state
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [audit, setAudit] = useState(null);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [fixProgress, setFixProgress] = useState(null);
  const [fixResults, setFixResults] = useState(null);
  
  // Tab 4: All Partners Sync state
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [syncAudit, setSyncAudit] = useState(null);
  const [syncFixing, setSyncFixing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncResults, setSyncResults] = useState(null);

  // Tab 5: Orphan Discovery state
  const [orphanLoading, setOrphanLoading] = useState(false);
  const [orphanError, setOrphanError] = useState(null);
  const [orphanSummary, setOrphanSummary] = useState(null);
  const [orphanBreakdown, setOrphanBreakdown] = useState(null);
  const [selectedOrphanPartner, setSelectedOrphanPartner] = useState(null);
  const [orphanPartnerDetails, setOrphanPartnerDetails] = useState(null);
  const [orphanSearchTerm, setOrphanSearchTerm] = useState('');
  const [orphanTierFilter, setOrphanTierFilter] = useState('all');
  const [orphanRegionFilter, setOrphanRegionFilter] = useState('all');
  const [linkingOrphan, setLinkingOrphan] = useState(null);
  const [linkOrphanResults, setLinkOrphanResults] = useState(null);
  const [showDismissed, setShowDismissed] = useState(false);

  // Load CRM contacts on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch CRM contacts from server database
      const response = await fetch('/api/db/contacts/all');
      if (!response.ok) throw new Error('Failed to load contacts');
      
      const contacts = await response.json();
      console.log(`📋 Loaded ${contacts.length} CRM contacts from server`);
      
      // Normalize contacts for display
      const normalizedContacts = contacts.map(c => ({
        id: c.id,
        email: c.email,
        firstName: c.first_name || c.firstName,
        lastName: c.last_name || c.lastName,
        accountName: c.account_name || c.accountName,
        partnerTier: c.partner_tier || c.partnerTier,
        accountRegion: c.account_region || c.accountRegion,
        title: c.title
      }));
      
      setCrmContacts(normalizedContacts);
      setHasPartnerData(normalizedContacts.length > 0);
    } catch (error) {
      console.error('Error loading CRM data:', error);
      setHasPartnerData(false);
    } finally {
      setLoading(false);
    }
  };

  // Missing CRM Users Analysis
  const analyzeContacts = async () => {
    try {
      setAnalyzing(true);
      setMissingContacts([]);
      
      // Step 1: Get all LMS users from server
      setAnalysisProgress({ stage: 'Loading LMS users...', current: 1, total: 3 });
      const lmsResponse = await fetch('/api/db/lms/users?all=true');
      if (!lmsResponse.ok) throw new Error('Failed to load LMS users');
      const allLmsUsers = await lmsResponse.json();
      
      // Build email -> user map
      const emailMap = new Map();
      allLmsUsers.forEach(user => {
        const email = user.email?.toLowerCase();
        if (email) emailMap.set(email, user);
      });
      setLmsUsers(emailMap);
      console.log(`👤 Loaded ${emailMap.size} LMS users from database`);
      
      // Step 2: Get all groups from server
      setAnalysisProgress({ stage: 'Loading groups...', current: 2, total: 3 });
      const groupsResponse = await fetch('/api/db/lms/groups');
      if (!groupsResponse.ok) throw new Error('Failed to load groups');
      const allGroups = await groupsResponse.json();
      
      // Build group lookup map (by normalized name)
      const groupMap = new Map();
      allGroups.forEach(group => {
        const name = (group.name || '').toLowerCase().trim();
        if (name) {
          groupMap.set(name, group);
          if (name.startsWith('ptr_')) {
            const nameWithoutPrefix = name.substring(4);
            groupMap.set(nameWithoutPrefix, group);
          }
        }
      });
      setGroups(groupMap);
      console.log(`👥 Loaded ${groupMap.size} groups from database`);
      
      // Step 3: Find contacts missing from LMS
      setAnalysisProgress({ stage: 'Comparing contacts...', current: 3, total: 3 });
      const missing = crmContacts.filter(contact => {
        const email = contact.email?.toLowerCase();
        if (!email) return false;
        return !emailMap.has(email);
      });
      
      setMissingContacts(missing);
      console.log(`🔍 Found ${missing.length} CRM contacts not in LMS`);
      
    } catch (error) {
      console.error('Error analyzing contacts:', error);
      alert('Error analyzing contacts: ' + error.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Extract partner domains from CRM contacts
  const extractPartnerDomains = async () => {
    try {
      setDomainLoading(true);
      const response = await fetch('/api/db/partners/extract-domains', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to extract domains');
      const result = await response.json();
      alert(`✅ ${result.message}\n\nTotal domains: ${result.totalDomains}\nAvg per partner: ${result.avgDomainsPerPartner}`);
      // Refresh domain analysis after extraction
      await loadDomainAnalysis();
    } catch (error) {
      console.error('Error extracting domains:', error);
      alert('Error extracting domains: ' + error.message);
    } finally {
      setDomainLoading(false);
    }
  };

  // Domain Analysis - Partners Only
  const loadDomainAnalysis = async () => {
    try {
      setDomainLoading(true);
      // Use partner-only endpoint to filter to known partner domains
      const response = await fetch('/api/db/lms/partner-domain-analysis');
      if (!response.ok) throw new Error('Failed to load domain analysis');
      const data = await response.json();
      setDomainData(data);
      if (data.error) {
        console.warn('⚠️ Domain analysis:', data.error);
      } else {
        console.log(`🔍 Partner domain analysis: ${data.summary.totalDomains} domains, ${data.summary.totalUsers} partner users (skipped ${data.summary.skippedNonPartnerUsers} non-partner users)`);
      }
    } catch (error) {
      console.error('Error loading domain analysis:', error);
      alert('Error loading domain analysis: ' + error.message);
    } finally {
      setDomainLoading(false);
    }
  };

  // Create partner group in LMS and link to partner
  const createPartnerGroup = async (partnerId, partnerName) => {
    const groupName = `ptr_${partnerName}`;
    
    try {
      setCreatingGroupFor({ partnerId, partnerName });
      
      // Step 1: Create group in LMS via Northpass API
      console.log(`Creating group: ${groupName}`);
      const createdGroup = await northpassApi.createGroup(groupName, `Partner group for ${partnerName}`);
      
      if (!createdGroup?.id) {
        throw new Error('Failed to create group in LMS');
      }
      
      console.log(`✅ Group created in LMS: ${createdGroup.id}`);
      
      // Step 2: Sync the new group to our database
      const syncResponse = await fetch('/api/db/lms/groups/sync-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: createdGroup.id,
          groupName: groupName,
          partnerId: partnerId
        })
      });
      
      if (!syncResponse.ok) {
        console.warn('Group created but failed to sync to database');
      }
      
      // Refresh domain analysis to show the new group
      await loadDomainAnalysis();
      // Also refresh partners without groups if on that tab
      if (activeTab === 2) {
        await loadPartnersWithoutGroups();
      }
      
      alert(`✅ Created partner group: ${groupName}`);
      return createdGroup;
      
    } catch (error) {
      console.error('Error creating partner group:', error);
      alert(`❌ Error creating group: ${error.message}`);
      throw error;
    } finally {
      setCreatingGroupFor(null);
    }
  };

  // Load partners without groups
  const loadPartnersWithoutGroups = async () => {
    try {
      setPartnersLoading(true);
      const response = await fetch('/api/db/group-analysis/partners-without-groups');
      if (!response.ok) throw new Error('Failed to load partners without groups');
      const data = await response.json();
      setPartnersWithoutGroups(data);
      console.log(`🏢 Found ${data.length} partners without LMS groups`);
    } catch (error) {
      console.error('Error loading partners without groups:', error);
    } finally {
      setPartnersLoading(false);
    }
  };

  // Create group for partner (from Tab 2)
  const createGroupForPartner = async (partner, skipRefresh = false) => {
    const groupName = `ptr_${partner.account_name}`;
    
    try {
      if (!skipRefresh) {
        setCreatingGroupFor({ partnerId: partner.id, partnerName: partner.account_name });
      }
      
      // Create group in LMS
      const createdGroup = await northpassApi.createGroup(groupName, `Partner group for ${partner.account_name}`);
      
      if (!createdGroup?.id) {
        throw new Error('Failed to create group in LMS');
      }
      
      // Sync to database
      await fetch('/api/db/lms/groups/sync-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: createdGroup.id,
          groupName: groupName,
          partnerId: partner.id
        })
      });
      
      if (!skipRefresh) {
        // Refresh partners list
        await loadPartnersWithoutGroups();
        alert(`✅ Created partner group: ${groupName}`);
      }
      
      return { success: true, group: createdGroup };
      
    } catch (error) {
      console.error('Error creating partner group:', error);
      if (!skipRefresh) {
        alert(`❌ Error creating group: ${error.message}`);
      }
      return { success: false, error: error.message };
    } finally {
      if (!skipRefresh) {
        setCreatingGroupFor(null);
      }
    }
  };

  // Bulk create groups for selected partners
  const bulkCreateGroups = async () => {
    const selectedPartners = filteredPartnersWithoutGroups.filter(p => selectedPartnersForGroup.has(p.id));
    if (selectedPartners.length === 0) return;
    
    setBulkCreating(true);
    setBulkProgress({ current: 0, total: selectedPartners.length, currentPartner: '' });
    setBulkResults(null);
    
    const results = { created: 0, failed: 0, errors: [] };
    
    for (let i = 0; i < selectedPartners.length; i++) {
      const partner = selectedPartners[i];
      setBulkProgress({ current: i + 1, total: selectedPartners.length, currentPartner: partner.account_name });
      
      const result = await createGroupForPartner(partner, true);
      
      if (result.success) {
        results.created++;
      } else {
        results.failed++;
        results.errors.push({ partner: partner.account_name, error: result.error });
      }
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300));
    }
    
    setBulkResults(results);
    setBulkCreating(false);
    setSelectedPartnersForGroup(new Set());
    
    // Refresh list
    await loadPartnersWithoutGroups();
  };

  // Toggle partner selection for bulk creation
  const togglePartnerSelection = (partnerId) => {
    setSelectedPartnersForGroup(prev => {
      const newSet = new Set(prev);
      if (newSet.has(partnerId)) {
        newSet.delete(partnerId);
      } else {
        newSet.add(partnerId);
      }
      return newSet;
    });
  };

  // Select all visible partners
  const selectAllPartners = () => {
    const visibleIds = filteredPartnersWithoutGroups.slice(0, 100).map(p => p.id);
    setSelectedPartnersForGroup(new Set(visibleIds));
  };

  // Clear partner selection
  const clearPartnerSelection = () => {
    setSelectedPartnersForGroup(new Set());
  };

  // Load domain analysis when tab changes
  useEffect(() => {
    if (activeTab === 1 && !domainData && !domainLoading) {
      loadDomainAnalysis();
    }
    if (activeTab === 2 && partnersWithoutGroups.length === 0 && !partnersLoading) {
      loadPartnersWithoutGroups();
    }
  }, [activeTab, domainData, domainLoading, partnersWithoutGroups.length, partnersLoading]);

  // Get unique tiers and regions for filters
  const { tiers, regions } = useMemo(() => {
    const tierSet = new Set();
    const regionSet = new Set();
    
    missingContacts.forEach(contact => {
      if (contact.partnerTier) tierSet.add(contact.partnerTier);
      if (contact.accountRegion) regionSet.add(contact.accountRegion);
    });
    
    return {
      tiers: ['all', ...Array.from(tierSet).sort()],
      regions: ['all', ...Array.from(regionSet).sort()]
    };
  }, [missingContacts]);

  // Filter missing contacts
  const filteredContacts = useMemo(() => {
    let filtered = missingContacts;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c => 
        c.email?.toLowerCase().includes(term) ||
        c.firstName?.toLowerCase().includes(term) ||
        c.lastName?.toLowerCase().includes(term) ||
        c.accountName?.toLowerCase().includes(term)
      );
    }
    
    if (tierFilter !== 'all') {
      filtered = filtered.filter(c => c.partnerTier === tierFilter);
    }
    
    if (regionFilter !== 'all') {
      filtered = filtered.filter(c => c.accountRegion === regionFilter);
    }
    
    if (excludePersonalEmails) {
      filtered = filtered.filter(c => !isExcludedDomain(c.email));
    }
    
    return filtered;
  }, [missingContacts, searchTerm, tierFilter, regionFilter, excludePersonalEmails]);

  // Filter and sort domains
  const filteredDomains = useMemo(() => {
    if (!domainData) return [];
    let filtered = domainData.domains;
    
    if (domainSearchTerm) {
      const term = domainSearchTerm.toLowerCase();
      filtered = filtered.filter(d => 
        d.domain.toLowerCase().includes(term) ||
        d.matchedPartner?.toLowerCase().includes(term)
      );
    }
    
    if (domainFilter === 'hasGroup') {
      filtered = filtered.filter(d => d.partnerGroupId);
    } else if (domainFilter === 'noGroup') {
      filtered = filtered.filter(d => !d.partnerGroupId);
    } else if (domainFilter === 'hasUngrouped') {
      filtered = filtered.filter(d => d.notInPartnerGroup > 0);
    }
    
    // Sort the results
    filtered = [...filtered].sort((a, b) => {
      let aVal, bVal;
      switch (domainOrderBy) {
        case 'domain':
          aVal = a.domain?.toLowerCase() || '';
          bVal = b.domain?.toLowerCase() || '';
          break;
        case 'userCount':
          aVal = a.userCount || 0;
          bVal = b.userCount || 0;
          break;
        case 'inPartnerGroup':
          aVal = a.inPartnerGroup || 0;
          bVal = b.inPartnerGroup || 0;
          break;
        case 'notInPartnerGroup':
          aVal = a.notInPartnerGroup || 0;
          bVal = b.notInPartnerGroup || 0;
          break;
        case 'matchedPartner':
          aVal = a.matchedPartner?.toLowerCase() || '';
          bVal = b.matchedPartner?.toLowerCase() || '';
          break;
        case 'partnerGroupName':
          aVal = a.partnerGroupName?.toLowerCase() || '';
          bVal = b.partnerGroupName?.toLowerCase() || '';
          break;
        default:
          return 0;
      }
      
      if (typeof aVal === 'string') {
        return domainOrder === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      return domainOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
    
    return filtered;
  }, [domainData, domainSearchTerm, domainFilter, domainOrderBy, domainOrder]);

  // Handle sort request for domain table
  const handleDomainSortRequest = (property) => {
    const isAsc = domainOrderBy === property && domainOrder === 'asc';
    setDomainOrder(isAsc ? 'desc' : 'asc');
    setDomainOrderBy(property);
  };

  // Filter partners without groups
  const filteredPartnersWithoutGroups = useMemo(() => {
    let filtered = partnersWithoutGroups;
    
    if (partnerSearchTerm) {
      const term = partnerSearchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.account_name?.toLowerCase().includes(term)
      );
    }
    
    if (partnerTierFilter !== 'all') {
      filtered = filtered.filter(p => p.partner_tier === partnerTierFilter);
    }
    
    return filtered;
  }, [partnersWithoutGroups, partnerSearchTerm, partnerTierFilter]);

  // Get unique partner tiers for filter
  const partnerTierOptions = useMemo(() => {
    const tierSet = new Set();
    partnersWithoutGroups.forEach(p => {
      if (p.partner_tier) tierSet.add(p.partner_tier);
    });
    return ['all', ...Array.from(tierSet).sort()];
  }, [partnersWithoutGroups]);

  // Selection handlers for missing contacts
  const toggleContactSelection = (contactId) => {
    setSelectedContacts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) {
        newSet.delete(contactId);
      } else {
        newSet.add(contactId);
      }
      return newSet;
    });
  };

  const selectAllVisible = () => {
    setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
  };

  const clearSelection = () => {
    setSelectedContacts(new Set());
  };

  // Selection handlers for domain users
  const toggleDomainUserSelection = (user) => {
    setSelectedDomainUsers(prev => {
      const newMap = new Map(prev);
      if (newMap.has(user.id)) {
        newMap.delete(user.id);
      } else {
        newMap.set(user.id, user);
      }
      return newMap;
    });
  };

  const selectDomainUsers = (users, select) => {
    setSelectedDomainUsers(prev => {
      const newMap = new Map(prev);
      users.forEach(user => {
        if (select) {
          newMap.set(user.id, user);
        } else {
          newMap.delete(user.id);
        }
      });
      return newMap;
    });
  };

  const clearDomainSelection = () => {
    setSelectedDomainUsers(new Map());
  };

  // Get selected contact objects for modal
  const selectedContactObjects = useMemo(() => 
    filteredContacts.filter(c => selectedContacts.has(c.id)),
    [filteredContacts, selectedContacts]
  );

  // Stats for tab 0
  const stats = useMemo(() => {
    const personalEmails = missingContacts.filter(c => isExcludedDomain(c.email)).length;
    return {
      totalCrm: crmContacts.length,
      totalLms: lmsUsers.size,
      totalMissing: missingContacts.length,
      matchRate: crmContacts.length > 0 
        ? Math.round(((crmContacts.length - missingContacts.length) / crmContacts.length) * 100) 
        : 0,
      personalEmails
    };
  }, [crmContacts, lmsUsers, missingContacts]);

  // Add users to LMS
  const handleAddUsers = async () => {
    if (selectedContactObjects.length === 0) return;
    
    setIsAdding(true);
    setAddProgress({ stage: 'Starting...', current: 0, total: selectedContactObjects.length });
    
    const results = {
      created: 0,
      alreadyExisted: 0,
      addedToGroup: 0,
      failed: 0,
      errors: []
    };

    // Find "All Partners" group
    const allPartnersGroup = Array.from(groups.values()).find(g => 
      g.name?.toLowerCase() === 'all partners' || g.name?.toLowerCase() === 'ptr_all partners'
    );

    for (let i = 0; i < selectedContactObjects.length; i++) {
      const contact = selectedContactObjects[i];
      setAddProgress({ 
        stage: `Adding ${contact.email}...`, 
        current: i + 1, 
        total: selectedContactObjects.length 
      });

      try {
        // Create user in Northpass using the proper API method
        const createResult = await northpassApi.createPerson({
          email: contact.email,
          firstName: contact.firstName || '',
          lastName: contact.lastName || ''
        });

        if (createResult.success && createResult.userId) {
          if (createResult.alreadyExists) {
            results.alreadyExisted++;
          } else {
            results.created++;
          }
          
          const userId = createResult.userId;

          // Try to add to partner group
          const partnerGroupName = contact.accountName?.toLowerCase().trim();
          const partnerGroup = groups.get('ptr_' + partnerGroupName) || groups.get(partnerGroupName);
          
          if (partnerGroup) {
            try {
              await northpassApi.addUserToGroup(partnerGroup.id, userId);
              results.addedToGroup++;
            } catch (groupError) {
              console.warn(`Failed to add to partner group: ${groupError.message}`);
            }
          }

          // Add to All Partners group
          if (allPartnersGroup) {
            try {
              await northpassApi.addUserToGroup(allPartnersGroup.id, userId);
            } catch (groupError) {
              console.warn(`Failed to add to All Partners: ${groupError.message}`);
            }
          }
        } else {
          results.failed++;
          results.errors.push({ email: contact.email, error: createResult.error || 'Unknown error' });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ email: contact.email, error: error.message });
      }
    }

    setAddResults(results);
    setIsAdding(false);
    
    // Clear selection and refresh analysis
    setSelectedContacts(new Set());
    if (results.created > 0) {
      await analyzeContacts();
    }
  };

  // Add users to group (Domain Analysis)
  const handleAddToGroup = async () => {
    if (!targetGroup || selectedDomainUsers.size === 0) return;
    
    setIsAddingToGroup(true);
    setGroupAddProgress({ stage: 'Adding users to group...', current: 0, total: selectedDomainUsers.size });
    
    try {
      const userIds = Array.from(selectedDomainUsers.keys());
      
      const response = await fetch(`/api/db/lms/groups/${targetGroup.id}/add-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds })
      });
      
      if (!response.ok) throw new Error('Failed to add users to group');
      
      const result = await response.json();
      setGroupAddResults(result.results);
      
      // Clear selection and refresh domain analysis
      setSelectedDomainUsers(new Map());
      await loadDomainAnalysis();
    } catch (error) {
      console.error('Error adding users to group:', error);
      setGroupAddResults({ success: 0, failed: selectedDomainUsers.size, errors: [{ error: error.message }] });
    } finally {
      setIsAddingToGroup(false);
    }
  };

  // Quick Add All users from a domain to their partner group
  const handleAddAllToGroup = async (users, groupId, groupName) => {
    if (!users || users.length === 0 || !groupId) return;
    
    // Set target group and show modal for confirmation
    setTargetGroup({ id: groupId, name: groupName });
    
    // Select all the users 
    const usersMap = new Map();
    users.forEach(u => usersMap.set(u.id, u));
    setSelectedDomainUsers(usersMap);
    
    // Open the modal
    setShowGroupModal(true);
  };

  // Toggle domain expansion
  const toggleDomainExpansion = (domain) => {
    setExpandedDomains(prev => {
      const newSet = new Set(prev);
      if (newSet.has(domain)) {
        newSet.delete(domain);
      } else {
        newSet.add(domain);
      }
      return newSet;
    });
  };

  // ============================================
  // Tab 3: Contact Group Audit Functions
  // ============================================
  
  // Run the contact group audit
  const runAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    setAudit(null);
    setSelectedPartner(null);
    setFixResults(null);
    
    try {
      const response = await fetch('/api/db/maintenance/partner-contact-audit');
      if (!response.ok) throw new Error('Failed to run audit');
      const data = await response.json();
      setAudit(data);
    } catch (err) {
      setAuditError(err.message);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  // Fix missing group memberships for a specific partner
  const fixPartnerMemberships = async (partnerId) => {
    const partner = audit?.byPartner?.[partnerId];
    if (!partner) return;
    
    setFixing(true);
    setFixProgress({ current: 0, total: 0, stage: 'preparing' });
    setFixResults(null);
    
    const results = {
      partnerGroup: { success: 0, failed: 0, errors: [] },
      allPartnersGroup: { success: 0, failed: 0, errors: [] }
    };
    
    try {
      // Fix partner group memberships
      if (partner.partnerGroupId && partner.missingPartnerGroup.length > 0) {
        setFixProgress({ 
          current: 0, 
          total: partner.missingPartnerGroup.length, 
          stage: 'partnerGroup' 
        });
        
        for (let i = 0; i < partner.missingPartnerGroup.length; i++) {
          const user = partner.missingPartnerGroup[i];
          try {
            await northpassApi.addUserToGroup(partner.partnerGroupId, user.userId);
            results.partnerGroup.success++;
          } catch (err) {
            results.partnerGroup.failed++;
            results.partnerGroup.errors.push({ user: user.email, error: err.message });
          }
          setFixProgress({ 
            current: i + 1, 
            total: partner.missingPartnerGroup.length, 
            stage: 'partnerGroup' 
          });
        }
      }
      
      // Fix All Partners group memberships
      if (audit.allPartnersGroupId && partner.missingAllPartnersGroup.length > 0) {
        setFixProgress({ 
          current: 0, 
          total: partner.missingAllPartnersGroup.length, 
          stage: 'allPartnersGroup' 
        });
        
        for (let i = 0; i < partner.missingAllPartnersGroup.length; i++) {
          const user = partner.missingAllPartnersGroup[i];
          try {
            await northpassApi.addUserToGroup(audit.allPartnersGroupId, user.userId);
            results.allPartnersGroup.success++;
          } catch (err) {
            results.allPartnersGroup.failed++;
            results.allPartnersGroup.errors.push({ user: user.email, error: err.message });
          }
          setFixProgress({ 
            current: i + 1, 
            total: partner.missingAllPartnersGroup.length, 
            stage: 'allPartnersGroup' 
          });
        }
      }
      
      setFixResults(results);
      
      // Refresh audit after fixes
      setTimeout(() => runAudit(), 2000);
      
    } catch (err) {
      setAuditError('Fix failed: ' + err.message);
    } finally {
      setFixing(false);
      setFixProgress(null);
    }
  };

  // Fix ALL missing memberships
  const fixAllMemberships = async () => {
    if (!audit?.partnersWithIssues?.length) return;
    
    setFixing(true);
    setFixProgress({ current: 0, total: audit.partnersWithIssues.length, stage: 'all' });
    
    const allResults = {
      partnersFixed: 0,
      partnerGroupAdded: 0,
      allPartnersGroupAdded: 0,
      errors: []
    };
    
    try {
      for (let i = 0; i < audit.partnersWithIssues.length; i++) {
        const partner = audit.partnersWithIssues[i];
        setFixProgress({ 
          current: i + 1, 
          total: audit.partnersWithIssues.length, 
          stage: 'all',
          currentPartner: partner.partnerName
        });
        
        // Add to partner group
        if (partner.partnerGroupId && partner.missingPartnerGroup.length > 0) {
          for (const user of partner.missingPartnerGroup) {
            try {
              await northpassApi.addUserToGroup(partner.partnerGroupId, user.userId);
              allResults.partnerGroupAdded++;
            } catch (err) {
              allResults.errors.push({ partner: partner.partnerName, user: user.email, error: err.message });
            }
          }
        }
        
        // Add to All Partners group
        if (audit.allPartnersGroupId && partner.missingAllPartnersGroup.length > 0) {
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
      
      // Refresh audit
      setTimeout(() => runAudit(), 2000);
      
    } catch (err) {
      setAuditError('Bulk fix failed: ' + err.message);
    } finally {
      setFixing(false);
      setFixProgress(null);
    }
  };

  // ============================================
  // Tab 4: All Partners Sync Functions
  // ============================================

  // Run the All Partners sync audit
  const runSyncAudit = useCallback(async () => {
    setSyncLoading(true);
    setSyncError(null);
    setSyncAudit(null);
    setSyncResults(null);
    
    try {
      const response = await fetch('/api/db/maintenance/all-partners-sync-audit');
      if (!response.ok) throw new Error('Failed to run sync audit');
      const data = await response.json();
      setSyncAudit(data);
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncLoading(false);
    }
  }, []);

  // Fix all users missing from All Partners group
  // Uses server-side endpoint that updates both Northpass API AND local database
  const fixAllPartnersSync = async () => {
    if (!syncAudit?.allMissingUsers?.length) return;
    
    setSyncFixing(true);
    setSyncProgress({ current: 0, total: syncAudit.allMissingUsers.length });
    
    try {
      // Get unique user IDs
      const userIds = [...new Set(syncAudit.allMissingUsers.map(u => u.userId))];
      
      // Call server endpoint that handles both API and DB updates
      const response = await fetch('/api/db/maintenance/add-to-all-partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds,
          allPartnersGroupId: syncAudit.allPartnersGroupId
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setSyncResults({
          added: result.results.apiAdded,
          failed: result.results.apiFailed,
          dbAdded: result.results.dbAdded,
          errors: result.results.errors
        });
      } else {
        setSyncError(result.error || 'Failed to add users');
      }
      
      // Refresh audit - local DB is already updated so this should show correct results
      setTimeout(() => runSyncAudit(), 1000);
      
    } catch (err) {
      setSyncError('Fix failed: ' + err.message);
    } finally {
      setSyncFixing(false);
      setSyncProgress(null);
    }
  };

  // ============================================
  // Tab 5: Orphan Discovery Functions
  // ============================================

  // Load orphan summary - partners with users who registered directly in Northpass
  const loadOrphanSummary = useCallback(async () => {
    setOrphanLoading(true);
    setOrphanError(null);
    
    try {
      // Get breakdown first
      const breakdownResponse = await fetch('/api/db/users/breakdown');
      if (!breakdownResponse.ok) throw new Error('Failed to load user breakdown');
      const breakdown = await breakdownResponse.json();
      setOrphanBreakdown(breakdown);
      
      // Get orphan summary by partner
      const summaryResponse = await fetch('/api/db/users/orphans/summary');
      if (!summaryResponse.ok) throw new Error('Failed to load orphan summary');
      const summary = await summaryResponse.json();
      setOrphanSummary(summary);
      
      console.log(`👻 Orphan scan: ${summary.totalOrphans} orphaned users across ${summary.partnersWithOrphans} partners`);
    } catch (err) {
      setOrphanError(err.message);
    } finally {
      setOrphanLoading(false);
    }
  }, []);

  // Load orphan details for a specific partner
  const loadOrphanPartnerDetails = async (partnerId, includeDismissed = false) => {
    if (selectedOrphanPartner === partnerId && !includeDismissed) {
      setSelectedOrphanPartner(null);
      setOrphanPartnerDetails(null);
      return;
    }
    
    setSelectedOrphanPartner(partnerId);
    
    try {
      const url = `/api/db/users/orphans/partner/${partnerId}${showDismissed || includeDismissed ? '?includeDismissed=true' : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load partner orphans');
      const details = await response.json();
      setOrphanPartnerDetails(details);
    } catch (err) {
      console.error('Error loading partner orphans:', err);
      setOrphanPartnerDetails({ error: err.message });
    }
  };

  // Link an orphan user to the partner by adding them to the partner's group
  const linkOrphanToPartner = async (userId, partnerId, partnerName) => {
    setLinkingOrphan(userId);
    
    try {
      // Find the partner's group
      const groupsResponse = await fetch('/api/db/lms/groups');
      if (!groupsResponse.ok) throw new Error('Failed to load groups');
      const allGroups = await groupsResponse.json();
      
      // Look for ptr_<partnername> group
      const partnerGroup = allGroups.find(g => 
        g.partner_id === partnerId || 
        g.name?.toLowerCase() === `ptr_${partnerName.toLowerCase()}`
      );
      
      if (!partnerGroup) {
        alert(`❌ No partner group found for "${partnerName}". Create the group first.`);
        setLinkingOrphan(null);
        return;
      }
      
      // Add user to the partner group via Northpass API
      const addResult = await northpassApi.addUserToGroup(partnerGroup.id, userId);
      
      if (addResult) {
        setLinkOrphanResults({ success: true, message: `Added user to ${partnerGroup.name}` });
        // Refresh the details
        await loadOrphanPartnerDetails(partnerId);
        // Refresh summary after a short delay
        setTimeout(() => loadOrphanSummary(), 1000);
      } else {
        setLinkOrphanResults({ success: false, message: 'Failed to add user to group' });
      }
    } catch (err) {
      console.error('Error linking orphan:', err);
      setLinkOrphanResults({ success: false, message: err.message });
    } finally {
      setLinkingOrphan(null);
    }
  };

  // Bulk link all orphans for a partner
  const bulkLinkOrphans = async (partnerId, partnerName, orphans) => {
    setLinkingOrphan('bulk');
    
    try {
      // Find the partner's group
      const groupsResponse = await fetch('/api/db/lms/groups');
      if (!groupsResponse.ok) throw new Error('Failed to load groups');
      const allGroups = await groupsResponse.json();
      
      const partnerGroup = allGroups.find(g => 
        g.partner_id === partnerId || 
        g.name?.toLowerCase() === `ptr_${partnerName.toLowerCase()}`
      );
      
      if (!partnerGroup) {
        alert(`❌ No partner group found for "${partnerName}". Create the group first.`);
        setLinkingOrphan(null);
        return;
      }
      
      // Add all users
      const results = { success: 0, failed: 0, errors: [] };
      for (const orphan of orphans) {
        try {
          await northpassApi.addUserToGroup(partnerGroup.id, orphan.user_id);
          results.success++;
        } catch (err) {
          results.failed++;
          results.errors.push({ email: orphan.email, error: err.message });
        }
      }
      
      setLinkOrphanResults({
        success: results.failed === 0,
        message: `Added ${results.success} users to ${partnerGroup.name}${results.failed > 0 ? ` (${results.failed} failed)` : ''}`
      });
      
      // Refresh
      await loadOrphanPartnerDetails(partnerId);
      setTimeout(() => loadOrphanSummary(), 1000);
    } catch (err) {
      setLinkOrphanResults({ success: false, message: err.message });
    } finally {
      setLinkingOrphan(null);
    }
  };

  // Dismiss an orphan user (mark as not belonging to matched partner)
  const dismissOrphan = async (userId, partnerId, reason = 'Not a match') => {
    setLinkingOrphan(userId);
    
    try {
      const response = await fetch('/api/db/users/orphans/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, partnerId, reason })
      });
      
      if (!response.ok) throw new Error('Failed to dismiss orphan');
      
      setLinkOrphanResults({ success: true, message: 'User dismissed from orphan list' });
      
      // Refresh the details
      await loadOrphanPartnerDetails(partnerId);
      setTimeout(() => loadOrphanSummary(), 500);
    } catch (err) {
      console.error('Error dismissing orphan:', err);
      setLinkOrphanResults({ success: false, message: err.message });
    } finally {
      setLinkingOrphan(null);
    }
  };

  // Bulk dismiss all orphans for a partner
  const bulkDismissOrphans = async (partnerId, orphans) => {
    if (!confirm(`Dismiss all ${orphans.length} users from this partner's orphan list? This marks them as not belonging to this partner.`)) {
      return;
    }
    
    setLinkingOrphan('bulk-dismiss');
    
    try {
      const userIds = orphans.filter(o => !o.isDismissed).map(o => o.user_id);
      
      const response = await fetch('/api/db/users/orphans/dismiss-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds, partnerId, reason: 'Bulk dismissed' })
      });
      
      if (!response.ok) throw new Error('Failed to dismiss orphans');
      const result = await response.json();
      
      setLinkOrphanResults({ 
        success: true, 
        message: `Dismissed ${result.dismissed} users from orphan list` 
      });
      
      await loadOrphanPartnerDetails(partnerId);
      setTimeout(() => loadOrphanSummary(), 500);
    } catch (err) {
      setLinkOrphanResults({ success: false, message: err.message });
    } finally {
      setLinkingOrphan(null);
    }
  };

  // Restore a dismissed orphan
  const restoreOrphan = async (userId, partnerId) => {
    setLinkingOrphan(userId);
    
    try {
      const response = await fetch('/api/db/users/orphans/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, partnerId })
      });
      
      if (!response.ok) throw new Error('Failed to restore orphan');
      
      setLinkOrphanResults({ success: true, message: 'User restored to orphan list' });
      await loadOrphanPartnerDetails(partnerId);
      setTimeout(() => loadOrphanSummary(), 500);
    } catch (err) {
      console.error('Error restoring orphan:', err);
      setLinkOrphanResults({ success: false, message: err.message });
    } finally {
      setLinkingOrphan(null);
    }
  };

  // Filter orphan partners
  const filteredOrphanPartners = useMemo(() => {
    if (!orphanSummary?.partners) return [];
    let filtered = orphanSummary.partners;
    
    if (orphanSearchTerm) {
      const term = orphanSearchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.account_name?.toLowerCase().includes(term) ||
        p.account_owner?.toLowerCase().includes(term)
      );
    }
    
    if (orphanTierFilter !== 'all') {
      filtered = filtered.filter(p => p.partner_tier === orphanTierFilter);
    }
    
    if (orphanRegionFilter !== 'all') {
      filtered = filtered.filter(p => p.account_region === orphanRegionFilter);
    }
    
    return filtered;
  }, [orphanSummary, orphanSearchTerm, orphanTierFilter, orphanRegionFilter]);

  // Get unique tiers/regions from orphan data
  const orphanFilterOptions = useMemo(() => {
    if (!orphanSummary?.partners) return { tiers: ['all'], regions: ['all'] };
    const tiers = new Set();
    const regions = new Set();
    orphanSummary.partners.forEach(p => {
      if (p.partner_tier) tiers.add(p.partner_tier);
      if (p.account_region) regions.add(p.account_region);
    });
    return {
      tiers: ['all', ...Array.from(tiers).sort()],
      regions: ['all', ...Array.from(regions).sort()]
    };
  }, [orphanSummary]);

  // Render loading state
  if (loading) {
    return (
      <PageContent>
        <PageHeader 
          icon={<PersonSearch />}
          title="User Management"
          subtitle="Find CRM contacts missing from the LMS and add them with proper group assignments."
        />
        <LoadingState message="Loading partner data..." />
      </PageContent>
    );
  }

  if (!hasPartnerData) {
    return (
      <PageContent>
        <PageHeader 
          icon={<PersonSearch />}
          title="User Management"
          subtitle="Find CRM contacts missing from the LMS and add them with proper group assignments."
        />
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>No Partner Data Loaded</Typography>
          <Typography variant="body2">
            Import partner contact data in the <a href="/admin/data">Data Management</a> page first.
          </Typography>
        </Alert>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <PageHeader 
        icon={<PersonSearch />}
        title="User Management"
        subtitle="Manage LMS users - find missing CRM contacts or analyze users by domain"
      />

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab 
            icon={<SearchIcon />} 
            iconPosition="start" 
            label="Missing CRM Users" 
          />
          <Tab 
            icon={<DomainIcon />} 
            iconPosition="start" 
            label="Domain Analysis" 
          />
          <Tab 
            icon={<GroupWorkIcon />} 
            iconPosition="start" 
            label={`Partners Without Groups${partnersWithoutGroups.length > 0 ? ` (${partnersWithoutGroups.length})` : ''}`}
          />
          <Tab 
            icon={<BuildIcon />} 
            iconPosition="start" 
            label="Contact Group Audit" 
          />
          <Tab 
            icon={<PublicIcon />} 
            iconPosition="start" 
            label="All Partners Sync" 
          />
          <Tab 
            icon={<PersonOffIcon />} 
            iconPosition="start" 
            label={`Orphan Discovery${orphanSummary?.totalOrphans > 0 ? ` (${orphanSummary.totalOrphans})` : ''}`}
          />
        </Tabs>
      </Box>

      {/* Tab 0: Missing CRM Users */}
      {activeTab === 0 && (
        <>
          <Box sx={{ mb: 3 }}>
            <ActionButton 
              variant="contained"
              color="primary"
              onClick={analyzeContacts}
              loading={analyzing}
              icon={<SearchIcon />}
            >
              {analyzing ? 'Analyzing...' : 'Analyze Missing Users'}
            </ActionButton>
          </Box>

          {analyzing && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Box sx={{ mb: 2 }}>
                  <LinearProgress 
                    variant="determinate" 
                    value={(analysisProgress.current / analysisProgress.total) * 100} 
                  />
                </Box>
                <Typography variant="body2" align="center">{analysisProgress.stage}</Typography>
              </CardContent>
            </Card>
          )}

          {/* Summary Stats */}
          <StatsRow columns={5}>
            <StatCard icon="📋" value={stats.totalCrm} label="CRM Contacts" variant="default" />
            <StatCard icon="👥" value={stats.totalLms} label="LMS Users" variant="default" />
            <StatCard icon="✅" value={`${stats.matchRate}%`} label="Match Rate" variant="success" />
            <StatCard icon="⚠️" value={stats.totalMissing} label="Missing from LMS" variant="warning" />
            <StatCard icon="📧" value={stats.personalEmails} label="Personal Emails" variant="default" />
          </StatsRow>

          {missingContacts.length > 0 && (
            <>
              {/* Selection Toolbar */}
              {selectionMode && (
                <Card sx={{ mb: 3, bgcolor: 'rgba(255,107,53,0.1)' }}>
                  <CardContent sx={{ py: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedContacts.size} selected</Typography>
                        <ActionButton variant="text" color="primary" onClick={selectAllVisible} size="small">
                          Select All Visible ({filteredContacts.length})
                        </ActionButton>
                        <ActionButton variant="text" color="inherit" onClick={clearSelection} size="small">
                          Clear Selection
                        </ActionButton>
                      </Box>
                      <ActionButton 
                        variant="contained"
                        color="primary"
                        onClick={() => setShowAddModal(true)}
                        disabled={selectedContacts.size === 0}
                      >
                        ➕ Add {selectedContacts.size} Users to LMS
                      </ActionButton>
                    </Box>
                  </CardContent>
                </Card>
              )}

              {/* Controls */}
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
                <Box sx={{ flex: 1, minWidth: 250 }}>
                  <SearchInput
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by email, name, or company..."
                    onClear={() => setSearchTerm('')}
                  />
                </Box>
                
                <FilterSelect
                  label="Tier"
                  value={tierFilter === 'all' ? '' : tierFilter}
                  onChange={(val) => setTierFilter(val || 'all')}
                  options={tiers.filter(t => t !== 'all').map(t => ({ value: t, label: t }))}
                  minWidth={140}
                />
                
                <FilterSelect
                  label="Region"
                  value={regionFilter === 'all' ? '' : regionFilter}
                  onChange={(val) => setRegionFilter(val || 'all')}
                  options={regions.filter(r => r !== 'all').map(r => ({ value: r, label: r }))}
                  minWidth={140}
                />
                
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={excludePersonalEmails}
                      onChange={(e) => setExcludePersonalEmails(e.target.checked)}
                      size="small"
                    />
                  }
                  label="Exclude personal emails"
                  sx={{ mx: 1 }}
                />
                
                <ActionButton 
                  variant={selectionMode ? 'contained' : 'outlined'}
                  color={selectionMode ? 'primary' : 'inherit'}
                  onClick={() => setSelectionMode(!selectionMode)}
                >
                  {selectionMode ? '✓ Selection Mode' : '☐ Select Users'}
                </ActionButton>
              </Box>

              <Typography variant="body2" sx={{ mb: 2, opacity: 0.7 }}>
                Showing {filteredContacts.length} of {missingContacts.length} missing contacts
              </Typography>

              {/* Contacts Table */}
              <div className="contacts-table-container">
                <table className="contacts-table">
                  <thead>
                    <tr>
                      {selectionMode && (
                        <th className="checkbox-col">
                          <input
                            type="checkbox"
                            checked={selectedContacts.size === filteredContacts.length && filteredContacts.length > 0}
                            onChange={(e) => e.target.checked ? selectAllVisible() : clearSelection()}
                          />
                        </th>
                      )}
                      <th>Email</th>
                      <th>Name</th>
                      <th>Company</th>
                      <th>Tier</th>
                      <th>Region</th>
                      <th>Group Exists</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.slice(0, 100).map(contact => {
                      const partnerGroupName = contact.accountName?.toLowerCase().trim();
                      const hasGroup = groups.has(partnerGroupName) || groups.has('ptr_' + partnerGroupName);
                      
                      return (
                        <tr 
                          key={contact.id}
                          className={selectedContacts.has(contact.id) ? 'selected' : ''}
                          onClick={() => selectionMode && toggleContactSelection(contact.id)}
                        >
                          {selectionMode && (
                            <td className="checkbox-col">
                              <input
                                type="checkbox"
                                checked={selectedContacts.has(contact.id)}
                                onChange={() => toggleContactSelection(contact.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                          )}
                          <td className="email-col">{contact.email}</td>
                          <td>{[contact.firstName, contact.lastName].filter(Boolean).join(' ') || '-'}</td>
                          <td className="company-col">{contact.accountName || '-'}</td>
                          <td>
                            <TierBadge tier={contact.partnerTier || 'Unknown'} />
                          </td>
                          <td>{contact.accountRegion || '-'}</td>
                          <td>
                            {hasGroup ? (
                              <StatusChip status="success" label="✓ Yes" />
                            ) : (
                              <StatusChip status="warning" label="✗ No" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                
                {filteredContacts.length > 100 && (
                  <div className="table-footer text-center py-3 opacity-70">
                    Showing first 100 of {filteredContacts.length} contacts. Use filters to narrow down.
                  </div>
                )}
              </div>
            </>
          )}

          {missingContacts.length === 0 && !analyzing && lmsUsers.size > 0 && (
            <EmptyState 
              icon="✅" 
              title="All CRM contacts are in the LMS!" 
              message="No missing users found."
            />
          )}

          {missingContacts.length === 0 && !analyzing && lmsUsers.size === 0 && (
            <EmptyState 
              icon="🔍" 
              title="Click 'Analyze Missing Users' to start" 
              message="This will compare your CRM contacts with LMS users to find who's missing."
            />
          )}
        </>
      )}

      {/* Tab 1: Domain Analysis (Partners Only) */}
      {activeTab === 1 && (
        <>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              This analysis shows only <strong>Partner users</strong> - LMS users whose email domain matches a known partner from CRM data.
              Non-partner/customer users are filtered out.
            </Typography>
          </Alert>

          <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <ActionButton 
              variant="contained"
              color="primary"
              onClick={loadDomainAnalysis}
              loading={domainLoading}
              icon={<DomainIcon />}
            >
              {domainLoading ? 'Analyzing...' : 'Analyze Partner Users'}
            </ActionButton>
            <ActionButton 
              variant="outlined"
              color="secondary"
              onClick={extractPartnerDomains}
              loading={domainLoading}
              icon={<BusinessIcon />}
            >
              Extract Partner Domains from CRM
            </ActionButton>
          </Box>

          {domainLoading && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, py: 2 }}>
                  <div className="ntx-spinner"></div>
                  <Typography>Analyzing partner users by domain...</Typography>
                </Box>
              </CardContent>
            </Card>
          )}

          {domainData?.error && !domainLoading && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>No Partner Domains Found</Typography>
              <Typography variant="body2">
                {domainData.error}
              </Typography>
            </Alert>
          )}

          {domainData && !domainData.error && !domainLoading && (
            <>
              {/* Domain Summary Stats */}
              <StatsRow columns={4}>
                <StatCard 
                  icon="🌐" 
                  value={domainData.summary.totalDomains} 
                  label="Partner Domains" 
                  variant="default" 
                />
                <StatCard 
                  icon="👥" 
                  value={domainData.summary.totalUsers.toLocaleString()} 
                  label="Partner Users" 
                  variant="default" 
                />
                <StatCard 
                  icon="✅" 
                  value={domainData.summary.usersInPartnerGroups.toLocaleString()} 
                  label="In Partner Groups" 
                  variant="success" 
                />
                <StatCard 
                  icon="⚠️" 
                  value={domainData.summary.usersNotInPartnerGroups.toLocaleString()} 
                  label="No Partner Group" 
                  variant="warning" 
                />
              </StatsRow>

              {domainData.summary.skippedNonPartnerUsers > 0 && (
                <StatsRow columns={2}>
                  <StatCard 
                    icon="🚫" 
                    value={domainData.summary.skippedNonPartnerUsers.toLocaleString()} 
                    label="Non-Partner Users (filtered out)" 
                    variant="default" 
                  />
                  <StatCard 
                    icon="📌" 
                    value={domainData.summary.domainsWithGroupRecommendation} 
                    label="Domains with Partner Groups" 
                    variant="primary" 
                  />
                </StatsRow>
              )}

              {/* Selection Toolbar */}
              {domainSelectionMode && selectedDomainUsers.size > 0 && (
                <Card sx={{ mb: 3, bgcolor: 'rgba(255,107,53,0.1)' }}>
                  <CardContent sx={{ py: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {selectedDomainUsers.size} users selected
                        </Typography>
                        <ActionButton variant="text" color="inherit" onClick={clearDomainSelection} size="small">
                          Clear Selection
                        </ActionButton>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 2 }}>
                        <ActionButton 
                          variant="contained"
                          color="primary"
                          onClick={() => {
                            // Find first domain with selected users that has a group
                            const firstUser = Array.from(selectedDomainUsers.values())[0];
                            const userDomain = firstUser.email.split('@')[1];
                            const domainInfo = domainData.domains.find(d => d.domain === userDomain);
                            if (domainInfo?.partnerGroupId) {
                              setTargetGroup({ id: domainInfo.partnerGroupId, name: domainInfo.partnerGroupName });
                              setShowGroupModal(true);
                            } else {
                              alert('No partner group found for selected users. Create the group first.');
                            }
                          }}
                          disabled={selectedDomainUsers.size === 0}
                        >
                          <GroupAddIcon sx={{ mr: 1 }} /> Add to Partner Group
                        </ActionButton>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              )}

              {/* Controls */}
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
                <Box sx={{ flex: 1, minWidth: 250 }}>
                  <SearchInput
                    value={domainSearchTerm}
                    onChange={(e) => setDomainSearchTerm(e.target.value)}
                    placeholder="Search domains or partners..."
                    onClear={() => setDomainSearchTerm('')}
                  />
                </Box>
                
                <FilterSelect
                  label="Filter"
                  value={domainFilter === 'all' ? '' : domainFilter}
                  onChange={(val) => setDomainFilter(val || 'all')}
                  options={[
                    { value: 'hasGroup', label: 'Has Partner Group' },
                    { value: 'noGroup', label: 'No Partner Group' },
                    { value: 'hasUngrouped', label: 'Has Ungrouped Users' }
                  ]}
                  minWidth={200}
                />
                
                <ActionButton 
                  variant={domainSelectionMode ? 'contained' : 'outlined'}
                  color={domainSelectionMode ? 'primary' : 'inherit'}
                  onClick={() => setDomainSelectionMode(!domainSelectionMode)}
                >
                  {domainSelectionMode ? '✓ Selection Mode' : '☐ Select Users'}
                </ActionButton>
              </Box>

              <Typography variant="body2" sx={{ mb: 2, opacity: 0.7 }}>
                Showing {filteredDomains.length} of {domainData.domains.length} domains
              </Typography>

              {/* Domains Table */}
              <div className="contacts-table-container">
                <table className="contacts-table domain-analysis-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th>
                        <TableSortLabel
                          active={domainOrderBy === 'domain'}
                          direction={domainOrderBy === 'domain' ? domainOrder : 'asc'}
                          onClick={() => handleDomainSortRequest('domain')}
                        >
                          Domain
                        </TableSortLabel>
                      </th>
                      <th style={{ textAlign: 'center' }}>
                        <TableSortLabel
                          active={domainOrderBy === 'userCount'}
                          direction={domainOrderBy === 'userCount' ? domainOrder : 'asc'}
                          onClick={() => handleDomainSortRequest('userCount')}
                        >
                          Users
                        </TableSortLabel>
                      </th>
                      <th style={{ textAlign: 'center' }}>
                        <TableSortLabel
                          active={domainOrderBy === 'inPartnerGroup'}
                          direction={domainOrderBy === 'inPartnerGroup' ? domainOrder : 'asc'}
                          onClick={() => handleDomainSortRequest('inPartnerGroup')}
                        >
                          In Group
                        </TableSortLabel>
                      </th>
                      <th style={{ textAlign: 'center' }}>
                        <TableSortLabel
                          active={domainOrderBy === 'notInPartnerGroup'}
                          direction={domainOrderBy === 'notInPartnerGroup' ? domainOrder : 'asc'}
                          onClick={() => handleDomainSortRequest('notInPartnerGroup')}
                        >
                          Not in Group
                        </TableSortLabel>
                      </th>
                      <th>
                        <TableSortLabel
                          active={domainOrderBy === 'matchedPartner'}
                          direction={domainOrderBy === 'matchedPartner' ? domainOrder : 'asc'}
                          onClick={() => handleDomainSortRequest('matchedPartner')}
                        >
                          Matched Partner
                        </TableSortLabel>
                      </th>
                      <th>
                        <TableSortLabel
                          active={domainOrderBy === 'partnerGroupName'}
                          direction={domainOrderBy === 'partnerGroupName' ? domainOrder : 'asc'}
                          onClick={() => handleDomainSortRequest('partnerGroupName')}
                        >
                          Partner Group
                        </TableSortLabel>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDomains.slice(0, 100).map(domainInfo => (
                      <DomainRow
                        key={domainInfo.domain}
                        domainData={domainInfo}
                        isExpanded={expandedDomains.has(domainInfo.domain)}
                        onToggle={() => toggleDomainExpansion(domainInfo.domain)}
                        selectedUsers={selectedDomainUsers}
                        onUserSelect={toggleDomainUserSelection}
                        onSelectAll={selectDomainUsers}
                        selectionMode={domainSelectionMode}
                        onCreateGroup={createPartnerGroup}
                        isCreatingGroup={creatingGroupFor?.partnerId === domainInfo.matchedPartnerId}
                        onAddAllToGroup={handleAddAllToGroup}
                        isAddingToGroup={isAddingToGroup}
                      />
                    ))}
                  </tbody>
                </table>
                
                {filteredDomains.length > 100 && (
                  <div className="table-footer text-center py-3 opacity-70">
                    Showing first 100 of {filteredDomains.length} domains. Use filters to narrow down.
                  </div>
                )}
              </div>
            </>
          )}

          {!domainData && !domainLoading && (
            <EmptyState 
              icon="�" 
              title="Extract Partner Domains First" 
              message="Click 'Extract Partner Domains from CRM' to identify which email domains belong to partners, then 'Analyze Partner Users' to see partner LMS users."
            />
          )}
        </>
      )}

      {/* Tab 2: Partners Without Groups */}
      {activeTab === 2 && (
        <>
          <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
            <ActionButton 
              variant="contained"
              color="primary"
              onClick={loadPartnersWithoutGroups}
              loading={partnersLoading}
              icon={<SearchIcon />}
            >
              Refresh Partners
            </ActionButton>
          </Box>

          {/* Summary Stats */}
          <StatsRow columns={4}>
            <StatCard 
              icon="🏢" 
              value={partnersWithoutGroups.length} 
              label="Partners Without Groups" 
              variant={partnersWithoutGroups.length > 0 ? 'warning' : 'success'} 
            />
            <StatCard 
              icon="⭐" 
              value={partnersWithoutGroups.filter(p => p.partner_tier?.includes('Premier')).length} 
              label="Premier Partners" 
              variant="default" 
            />
            <StatCard 
              icon="✓" 
              value={partnersWithoutGroups.filter(p => p.partner_tier?.includes('Select')).length} 
              label="Select Partners" 
              variant="default" 
            />
            <StatCard 
              icon="📋" 
              value={partnersWithoutGroups.filter(p => !p.partner_tier?.includes('Premier') && !p.partner_tier?.includes('Select')).length} 
              label="Other Tiers" 
              variant="default" 
            />
          </StatsRow>

          {partnersLoading ? (
            <LoadingState message="Loading partners..." />
          ) : partnersWithoutGroups.length === 0 ? (
            <Alert severity="success" sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>All Partners Have LMS Groups! 🎉</Typography>
              <Typography variant="body2">
                Every partner in the CRM has a corresponding LMS group.
              </Typography>
            </Alert>
          ) : (
            <>
              {/* Bulk Progress */}
              {bulkCreating && (
                <Card sx={{ mb: 3, p: 2 }}>
                  <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle1">
                      🏗️ Creating groups... {bulkProgress.currentPartner}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.7 }}>
                      {bulkProgress.current} / {bulkProgress.total}
                    </Typography>
                  </Box>
                  <LinearProgress 
                    variant="determinate" 
                    value={(bulkProgress.current / bulkProgress.total) * 100} 
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Card>
              )}

              {/* Bulk Results */}
              {bulkResults && (
                <Alert 
                  severity={bulkResults.failed === 0 ? 'success' : 'warning'} 
                  onClose={() => setBulkResults(null)} 
                  sx={{ mb: 3 }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    ✅ Bulk Group Creation Complete
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    <span>Created: <strong style={{ color: '#28a745' }}>{bulkResults.created}</strong></span>
                    {bulkResults.failed > 0 && (
                      <span>Failed: <strong style={{ color: '#dc3545' }}>{bulkResults.failed}</strong></span>
                    )}
                  </Box>
                  {bulkResults.errors?.length > 0 && (
                    <Box sx={{ mt: 1, fontSize: '0.85rem', opacity: 0.8 }}>
                      {bulkResults.errors.slice(0, 3).map((e, i) => (
                        <div key={i}>• {e.partner}: {e.error}</div>
                      ))}
                      {bulkResults.errors.length > 3 && <div>...and {bulkResults.errors.length - 3} more errors</div>}
                    </Box>
                  )}
                </Alert>
              )}

              {/* Controls */}
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
                <Box sx={{ flex: 1, minWidth: 250 }}>
                  <SearchInput
                    value={partnerSearchTerm}
                    onChange={(e) => setPartnerSearchTerm(e.target.value)}
                    placeholder="Search partners..."
                    onClear={() => setPartnerSearchTerm('')}
                  />
                </Box>
                
                <FilterSelect
                  label="Tier"
                  value={partnerTierFilter === 'all' ? '' : partnerTierFilter}
                  onChange={(val) => setPartnerTierFilter(val || 'all')}
                  options={partnerTierOptions.filter(t => t !== 'all').map(t => ({ value: t, label: t }))}
                  minWidth={150}
                />
              </Box>

              {/* Selection Controls & Bulk Actions */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={selectedPartnersForGroup.size > 0 && selectedPartnersForGroup.size === Math.min(filteredPartnersWithoutGroups.length, 100)}
                        indeterminate={selectedPartnersForGroup.size > 0 && selectedPartnersForGroup.size < Math.min(filteredPartnersWithoutGroups.length, 100)}
                        onChange={(e) => e.target.checked ? selectAllPartners() : clearPartnerSelection()}
                        disabled={bulkCreating}
                      />
                    }
                    label={<Typography variant="body2">Select All ({Math.min(filteredPartnersWithoutGroups.length, 100)})</Typography>}
                  />
                  {selectedPartnersForGroup.size > 0 && (
                    <Chip 
                      label={`${selectedPartnersForGroup.size} selected`}
                      onDelete={clearPartnerSelection}
                      size="small"
                      color="primary"
                    />
                  )}
                </Box>
                
                {selectedPartnersForGroup.size > 0 && (
                  <ActionButton
                    variant="contained"
                    color="primary"
                    onClick={bulkCreateGroups}
                    loading={bulkCreating}
                    disabled={bulkCreating}
                  >
                    <GroupAddIcon sx={{ mr: 1 }} />
                    Create {selectedPartnersForGroup.size} Groups
                  </ActionButton>
                )}
              </Box>

              <Typography variant="body2" sx={{ mb: 2, opacity: 0.7 }}>
                Showing {filteredPartnersWithoutGroups.length} of {partnersWithoutGroups.length} partners
              </Typography>

              {/* Partners Table */}
              <div className="contacts-table-container">
                <table className="contacts-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th>Partner Name</th>
                      <th style={{ textAlign: 'center' }}>Tier</th>
                      <th style={{ textAlign: 'center' }}>Region</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPartnersWithoutGroups.slice(0, 100).map(partner => (
                      <tr key={partner.id}>
                        <td>
                          <Checkbox
                            size="small"
                            checked={selectedPartnersForGroup.has(partner.id)}
                            onChange={() => togglePartnerSelection(partner.id)}
                            disabled={bulkCreating}
                          />
                        </td>
                        <td>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <BusinessIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
                            <strong>{partner.account_name}</strong>
                          </Box>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {partner.partner_tier ? (
                            <TierBadge tier={partner.partner_tier} size="small" />
                          ) : (
                            <span style={{ opacity: 0.5 }}>-</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>{partner.account_region || '-'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <ActionButton
                            size="small"
                            variant="outlined"
                            color="primary"
                            onClick={() => createGroupForPartner(partner)}
                            loading={creatingGroupFor?.partnerId === partner.id}
                            disabled={creatingGroupFor !== null || bulkCreating}
                            sx={{ fontSize: '0.75rem', py: 0.5, px: 1.5 }}
                          >
                            Create
                          </ActionButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {filteredPartnersWithoutGroups.length > 100 && (
                  <div className="table-footer text-center py-3 opacity-70">
                    Showing first 100 of {filteredPartnersWithoutGroups.length} partners. Use filters to narrow down.
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Tab 3: Contact Group Audit */}
      {activeTab === 3 && (
        <>
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <ActionButton 
              onClick={runAudit} 
              loading={auditLoading}
              disabled={fixing}
            >
              {auditLoading ? '🔄 Auditing...' : '🔍 Run Audit'}
            </ActionButton>
          </Box>

          {auditError && (
            <Alert severity="error" onClose={() => setAuditError(null)} sx={{ mb: 3 }}>
              {auditError}
            </Alert>
          )}

          {/* Fix Progress */}
          {fixProgress && (
            <SectionCard>
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="subtitle1">
                  {fixProgress.stage === 'partnerGroup' && '👥 Adding to Partner Group...'}
                  {fixProgress.stage === 'allPartnersGroup' && '🌐 Adding to All Partners Group...'}
                  {fixProgress.stage === 'all' && `🔄 Processing: ${fixProgress.currentPartner || ''}`}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.7 }}>
                  {fixProgress.current} / {fixProgress.total}
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={(fixProgress.current / fixProgress.total) * 100} 
                sx={{ height: 8, borderRadius: 4 }}
              />
            </SectionCard>
          )}

          {/* Fix Results */}
          {fixResults && (
            <Alert severity="success" onClose={() => setFixResults(null)} sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>✅ Fix Complete</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {fixResults.partnersFixed !== undefined ? (
                  <>
                    <span>Partners Processed: <strong>{fixResults.partnersFixed}</strong></span>
                    <span>Added to Partner Groups: <strong style={{ color: '#28a745' }}>{fixResults.partnerGroupAdded}</strong></span>
                    <span>Added to All Partners: <strong style={{ color: '#28a745' }}>{fixResults.allPartnersGroupAdded}</strong></span>
                    {fixResults.errors.length > 0 && (
                      <span>Errors: <strong style={{ color: '#dc3545' }}>{fixResults.errors.length}</strong></span>
                    )}
                  </>
                ) : (
                  <>
                    <span>Partner Group: <strong style={{ color: '#28a745' }}>{fixResults.partnerGroup?.success || 0} added</strong>
                      {fixResults.partnerGroup?.failed > 0 && (
                        <span style={{ color: '#dc3545' }}>, {fixResults.partnerGroup.failed} failed</span>
                      )}
                    </span>
                    <span>All Partners Group: <strong style={{ color: '#28a745' }}>{fixResults.allPartnersGroup?.success || 0} added</strong>
                      {fixResults.allPartnersGroup?.failed > 0 && (
                        <span style={{ color: '#dc3545' }}>, {fixResults.allPartnersGroup.failed} failed</span>
                      )}
                    </span>
                  </>
                )}
              </Box>
            </Alert>
          )}

          {/* Audit Results */}
          {audit && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard icon="👥" value={audit.totalContacts} label="Total Contacts" />
                <StatCard icon="📚" value={audit.withLmsAccount} label="With LMS Account" variant="success" />
                <StatCard icon="⚠️" value={audit.withoutLmsAccount} label="No LMS Account" variant="warning" />
                <StatCard icon="✅" value={audit.inPartnerGroup} label="In Partner Group" variant="success" />
              </StatsRow>
              <StatsRow columns={3}>
                <StatCard icon="❌" value={audit.missingPartnerGroup} label="Missing Partner Group" variant="error" />
                <StatCard icon="🌐" value={audit.inAllPartnersGroup} label="In All Partners" variant="success" />
                <StatCard icon="❌" value={audit.missingAllPartnersGroup} label="Missing All Partners" variant="error" />
              </StatsRow>

              {/* All Partners Group Info */}
              {audit.allPartnersGroupId && (
                <Alert severity="info" sx={{ mb: 3 }}>
                  🌐 All Partners Group: <strong>{audit.allPartnersGroupName}</strong>
                  <Typography variant="caption" sx={{ ml: 1, opacity: 0.6 }}>({audit.allPartnersGroupId})</Typography>
                </Alert>
              )}

              {/* Fix All Button */}
              {audit.partnersWithIssues?.length > 0 && (
                <SectionCard>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        ⚠️ {audit.partnersWithIssues.length} partners have membership issues
                      </Typography>
                      <Typography variant="body2" sx={{ opacity: 0.6 }}>
                        {audit.missingPartnerGroup} missing partner group, {audit.missingAllPartnersGroup} missing All Partners
                      </Typography>
                    </Box>
                    <ActionButton 
                      onClick={fixAllMemberships}
                      loading={fixing}
                    >
                      🔧 Fix All Missing Memberships
                    </ActionButton>
                  </Box>
                </SectionCard>
              )}

              {/* Partners with Issues */}
              {audit.partnersWithIssues?.length > 0 ? (
                <SectionCard title="Partners with Membership Issues" icon="⚠️">
                  {audit.partnersWithIssues.map(partner => (
                    <Box 
                      key={partner.partnerId}
                      sx={{ 
                        mb: 2,
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'var(--admin-bg-elevated)',
                        border: '1px solid var(--admin-border-light)',
                      }}
                    >
                      <Box 
                        sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedPartner(
                          selectedPartner === partner.partnerId ? null : partner.partnerId
                        )}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{partner.partnerName}</Typography>
                          <TierBadge tier={partner.tier || 'Unknown'} size="small" />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {partner.missingPartnerGroup.length > 0 && (
                            <Typography variant="caption" sx={{ color: '#856404' }}>
                              👥 {partner.missingPartnerGroup.length} missing partner group
                            </Typography>
                          )}
                          {partner.missingAllPartnersGroup.length > 0 && (
                            <Typography variant="caption" sx={{ color: '#856404' }}>
                              🌐 {partner.missingAllPartnersGroup.length} missing All Partners
                            </Typography>
                          )}
                          <Typography sx={{ opacity: 0.5 }}>
                            {selectedPartner === partner.partnerId ? '▼' : '▶'}
                          </Typography>
                        </Box>
                      </Box>
                      
                      <Collapse in={selectedPartner === partner.partnerId}>
                        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid var(--admin-border-light)' }}>
                          <Typography variant="body2" sx={{ opacity: 0.7, mb: 2 }}>
                            Total Contacts: {partner.totalContacts} | With LMS: {partner.withLms} | Without LMS: {partner.withoutLms}
                            {partner.partnerGroupName && ` | Partner Group: ${partner.partnerGroupName}`}
                          </Typography>
                          
                          {/* Missing Partner Group */}
                          {partner.missingPartnerGroup.length > 0 && (
                            <Box sx={{ mb: 2 }}>
                              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                👥 Missing from Partner Group ({partner.missingPartnerGroup.length})
                              </Typography>
                              {partner.missingPartnerGroup.slice(0, 10).map(user => (
                                <Box key={user.userId} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                  <Typography variant="body2">{user.name || 'Unknown'}</Typography>
                                  <Typography variant="caption" sx={{ opacity: 0.5 }}>{user.email}</Typography>
                                </Box>
                              ))}
                              {partner.missingPartnerGroup.length > 10 && (
                                <Typography variant="caption" sx={{ opacity: 0.5, display: 'block', textAlign: 'center', mt: 1 }}>
                                  ...and {partner.missingPartnerGroup.length - 10} more
                                </Typography>
                              )}
                            </Box>
                          )}
                          
                          {/* Missing All Partners Group */}
                          {partner.missingAllPartnersGroup.length > 0 && (
                            <Box sx={{ mb: 2 }}>
                              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                🌐 Missing from All Partners Group ({partner.missingAllPartnersGroup.length})
                              </Typography>
                              {partner.missingAllPartnersGroup.slice(0, 10).map(user => (
                                <Box key={user.userId} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                  <Typography variant="body2">{user.name || 'Unknown'}</Typography>
                                  <Typography variant="caption" sx={{ opacity: 0.5 }}>{user.email}</Typography>
                                </Box>
                              ))}
                              {partner.missingAllPartnersGroup.length > 10 && (
                                <Typography variant="caption" sx={{ opacity: 0.5, display: 'block', textAlign: 'center', mt: 1 }}>
                                  ...and {partner.missingAllPartnersGroup.length - 10} more
                                </Typography>
                              )}
                            </Box>
                          )}
                          
                          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid var(--admin-border-light)' }}>
                            <ActionButton 
                              size="small"
                              onClick={() => fixPartnerMemberships(partner.partnerId)}
                              loading={fixing}
                            >
                              🔧 Fix This Partner's Memberships
                            </ActionButton>
                          </Box>
                        </Box>
                      </Collapse>
                    </Box>
                  ))}
                </SectionCard>
              ) : audit.totalContacts > 0 ? (
                <EmptyState
                  icon="✅"
                  title="All group memberships are correct!"
                  message="All partner contacts with LMS accounts are in their proper groups."
                />
              ) : null}
            </>
          )}

          {/* Initial State */}
          {!auditLoading && !audit && (
            <SectionCard title="Partner Contact Group Audit" icon="🔍">
              <Box sx={{ textAlign: 'center', py: 4, maxWidth: 500, mx: 'auto' }}>
                <Typography variant="body1" sx={{ mb: 2, opacity: 0.8 }}>
                  This tool audits all partner contacts to ensure they are properly assigned to:
                </Typography>
                <Box sx={{ textAlign: 'left', pl: 4, mb: 3 }}>
                  <Typography variant="body2" sx={{ mb: 1, opacity: 0.8 }}>
                    • <strong>Partner Group</strong> - Their specific partner's LMS group
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    • <strong>All Partners Group</strong> - The master group for all partner users
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ opacity: 0.7 }}>
                  Click "Run Audit" to scan for missing group memberships.
                </Typography>
              </Box>
            </SectionCard>
          )}

          {/* Loading State */}
          {auditLoading && (
            <LoadingState message="Running audit... Checking contacts, LMS accounts, and group memberships..." />
          )}
        </>
      )}

      {/* Tab 4: All Partners Sync */}
      {activeTab === 4 && (
        <>
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <ActionButton 
              onClick={runSyncAudit} 
              loading={syncLoading}
              disabled={syncFixing}
            >
              {syncLoading ? '🔄 Scanning...' : '🔍 Scan Partner Groups'}
            </ActionButton>
          </Box>

          {syncError && (
            <Alert severity="error" onClose={() => setSyncError(null)} sx={{ mb: 3 }}>
              {syncError}
            </Alert>
          )}

          {/* Sync Progress */}
          {syncProgress && (
            <SectionCard>
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="subtitle1">🌐 Adding users to All Partners group...</Typography>
                <Typography variant="body2" sx={{ opacity: 0.7 }}>
                  {syncProgress.current} / {syncProgress.total}
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={(syncProgress.current / syncProgress.total) * 100} 
                sx={{ height: 8, borderRadius: 4 }}
              />
            </SectionCard>
          )}

          {/* Sync Results */}
          {syncResults && (
            <Alert severity={syncResults.failed === 0 ? 'success' : 'warning'} onClose={() => setSyncResults(null)} sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>✅ Sync Complete</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                <span>Added: <strong style={{ color: '#28a745' }}>{syncResults.added}</strong></span>
                {syncResults.failed > 0 && (
                  <span>Failed: <strong style={{ color: '#dc3545' }}>{syncResults.failed}</strong></span>
                )}
              </Box>
            </Alert>
          )}

          {/* Sync Audit Results */}
          {syncAudit && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={5}>
                <StatCard icon="🏢" value={syncAudit.totalPartnerGroups} label="Partner Groups" />
                <StatCard icon="👥" value={syncAudit.totalUsersChecked} label="Users Checked" />
                <StatCard icon="✅" value={syncAudit.usersAlreadyInAllPartners} label="Already Synced" variant="success" />
                <StatCard icon="⚠️" value={syncAudit.usersMissingFromAllPartners} label="Missing (Need to Add)" variant={syncAudit.usersMissingFromAllPartners > 0 ? 'error' : 'success'} />
                <StatCard icon="🚫" value={syncAudit.usersToRemoveFromAllPartners || 0} label="Shouldn't Be In (Remove)" variant={syncAudit.usersToRemoveFromAllPartners > 0 ? 'warning' : 'success'} />
              </StatsRow>

              {/* All Partners Group Info */}
              <Alert severity="info" sx={{ mb: 3 }}>
                🌐 All Partners Group: <strong>{syncAudit.allPartnersGroupName}</strong>
                <Typography variant="caption" sx={{ ml: 1, opacity: 0.6 }}>
                  ({syncAudit.allPartnersMemberCount} members)
                </Typography>
              </Alert>

              {/* Fix Button */}
              {syncAudit.usersMissingFromAllPartners > 0 && (
                <SectionCard>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        ⚠️ {syncAudit.usersMissingFromAllPartners} users need to be added to "All Partners"
                      </Typography>
                      <Typography variant="body2" sx={{ opacity: 0.6 }}>
                        These users are in partner groups but not in the All Partners group (needed for LMS content access)
                      </Typography>
                    </Box>
                    <ActionButton 
                      onClick={fixAllPartnersSync}
                      loading={syncFixing}
                    >
                      🌐 Add All to "All Partners"
                    </ActionButton>
                  </Box>
                </SectionCard>
              )}

              {/* Groups with Issues */}
              {syncAudit.partnerGroupsWithIssues?.length > 0 ? (
                <SectionCard title="Partner Groups with Missing Users" icon="⚠️">
                  {syncAudit.partnerGroupsWithIssues.map(group => (
                    <Box 
                      key={group.groupId}
                      sx={{ 
                        mb: 2,
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'var(--admin-bg-elevated)',
                        border: '1px solid var(--admin-border-light)',
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{group.partnerName}</Typography>
                          <TierBadge tier={group.partnerTier || 'Unknown'} size="small" />
                        </Box>
                        <Typography variant="caption" sx={{ color: '#856404' }}>
                          {group.missingUsers.length} of {group.totalMembers} missing from All Partners
                        </Typography>
                      </Box>
                      <Box sx={{ mt: 1 }}>
                        {group.missingUsers.slice(0, 5).map(user => (
                          <Typography key={user.userId} variant="body2" sx={{ opacity: 0.7 }}>
                            • {user.name} ({user.email})
                          </Typography>
                        ))}
                        {group.missingUsers.length > 5 && (
                          <Typography variant="caption" sx={{ opacity: 0.5 }}>
                            ...and {group.missingUsers.length - 5} more
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </SectionCard>
              ) : syncAudit.totalPartnerGroups > 0 ? (
                <EmptyState
                  icon="✅"
                  title="All partner group members are synced!"
                  message="All users in partner groups are also in the All Partners group."
                />
              ) : null}

              {/* Users who shouldn't be in All Partners */}
              {syncAudit.usersToRemoveFromAllPartners > 0 && (
                <SectionCard title="Users to Remove from All Partners" icon="🚫">
                  <Box sx={{ mb: 2 }}>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      <Typography variant="body2">
                        <strong>{syncAudit.usersToRemoveFromAllPartners} users</strong> are in the "All Partners" group but are <strong>not</strong> members of any partner group.
                        These users may have access to partner-only content without being affiliated with a partner.
                      </Typography>
                    </Alert>
                  </Box>
                  <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--admin-border-default)' }}>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Email</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Name</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syncAudit.allUsersToRemove?.slice(0, 100).map(user => (
                          <tr key={user.userId} style={{ borderBottom: '1px solid var(--admin-border-light)' }}>
                            <td style={{ padding: '8px' }}>{user.email}</td>
                            <td style={{ padding: '8px' }}>{user.name?.trim() || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {syncAudit.allUsersToRemove?.length > 100 && (
                      <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.6, textAlign: 'center' }}>
                        Showing first 100 of {syncAudit.allUsersToRemove.length} users
                      </Typography>
                    )}
                  </Box>
                </SectionCard>
              )}
            </>
          )}

          {/* Initial State */}
          {!syncLoading && !syncAudit && (
            <SectionCard title="All Partners Group Sync" icon="🌐">
              <Box sx={{ textAlign: 'center', py: 4, maxWidth: 600, mx: 'auto' }}>
                <Typography variant="body1" sx={{ mb: 2, opacity: 0.8 }}>
                  This tool ensures all users in partner-specific groups are also in the <strong>"All Partners"</strong> group.
                </Typography>
                <Alert severity="info" sx={{ mb: 3 }}>
                  <Typography variant="body2">
                    <strong>Why is this important?</strong><br />
                    The "All Partners" group grants access to partner content on the LMS. Users who are only in their partner's group
                    but not in "All Partners" won't see partner-specific courses and content.
                  </Typography>
                </Alert>
                <Typography variant="body2" sx={{ opacity: 0.7 }}>
                  Click "Scan Partner Groups" to find users who need to be added.
                </Typography>
              </Box>
            </SectionCard>
          )}

          {/* Loading State */}
          {syncLoading && (
            <LoadingState message="Scanning partner groups... Checking group members against All Partners..." />
          )}
        </>
      )}

      {/* Tab 5: Orphan Discovery */}
      {activeTab === 5 && (
        <>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>Orphan Discovery</strong> finds LMS users who registered directly in Northpass (bypassing CRM automation).
              These users' email domains match a partner, but they're not yet linked to that partner.
            </Typography>
          </Alert>

          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <ActionButton 
              onClick={loadOrphanSummary} 
              loading={orphanLoading}
            >
              {orphanLoading ? '🔄 Scanning...' : '👻 Scan for Orphaned Users'}
            </ActionButton>
          </Box>

          {orphanError && (
            <Alert severity="error" onClose={() => setOrphanError(null)} sx={{ mb: 3 }}>
              {orphanError}
            </Alert>
          )}

          {linkOrphanResults && (
            <Alert 
              severity={linkOrphanResults.success ? 'success' : 'error'} 
              onClose={() => setLinkOrphanResults(null)} 
              sx={{ mb: 3 }}
            >
              {linkOrphanResults.message}
            </Alert>
          )}

          {/* User Breakdown Stats */}
          {orphanBreakdown && (
            <StatsRow columns={5}>
              <StatCard icon="👥" value={orphanBreakdown.totalUsers.toLocaleString()} label="Total LMS Users" />
              <StatCard icon="✅" value={orphanBreakdown.linkedPartnerUsers.toLocaleString()} label="Linked Partner Users" variant="success" />
              <StatCard icon="📊" value={`${orphanBreakdown.percentageLinked}%`} label="Linked Rate" variant="success" />
              <StatCard icon="❓" value={orphanBreakdown.unlinkedUsers.toLocaleString()} label="Unlinked Users" variant="default" />
              <StatCard icon="👻" value={orphanSummary?.totalOrphans?.toLocaleString() || '0'} label="Orphans (Domain Match)" variant="warning" />
            </StatsRow>
          )}

          {orphanSummary && (
            <>
              {/* Summary */}
              <SectionCard>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      👻 Found {orphanSummary.totalOrphans.toLocaleString()} orphaned partner users across {orphanSummary.partnersWithOrphans} partners
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.6 }}>
                      These users registered directly in Northpass. Their email domain matches a partner but they're not in partner groups.
                    </Typography>
                  </Box>
                </Box>
              </SectionCard>

              {/* Filters */}
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3, mt: 3 }}>
                <Box sx={{ flex: 1, minWidth: 250 }}>
                  <SearchInput
                    value={orphanSearchTerm}
                    onChange={(e) => setOrphanSearchTerm(e.target.value)}
                    placeholder="Search partners or owners..."
                    onClear={() => setOrphanSearchTerm('')}
                  />
                </Box>
                
                <FilterSelect
                  label="Tier"
                  value={orphanTierFilter === 'all' ? '' : orphanTierFilter}
                  onChange={(val) => setOrphanTierFilter(val || 'all')}
                  options={orphanFilterOptions.tiers.filter(t => t !== 'all').map(t => ({ value: t, label: t }))}
                  minWidth={140}
                />
                
                <FilterSelect
                  label="Region"
                  value={orphanRegionFilter === 'all' ? '' : orphanRegionFilter}
                  onChange={(val) => setOrphanRegionFilter(val || 'all')}
                  options={orphanFilterOptions.regions.filter(r => r !== 'all').map(r => ({ value: r, label: r }))}
                  minWidth={140}
                />
              </Box>

              <Typography variant="body2" sx={{ mb: 2, opacity: 0.7 }}>
                Showing {filteredOrphanPartners.length} of {orphanSummary.partnersWithOrphans} partners with orphans
              </Typography>

              {/* Partners List */}
              {filteredOrphanPartners.length > 0 ? (
                <SectionCard title="Partners with Orphaned Users" icon="👻">
                  {filteredOrphanPartners.slice(0, 50).map(partner => (
                    <Box 
                      key={partner.partner_id}
                      sx={{ 
                        mb: 2,
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'var(--admin-bg-elevated)',
                        border: '1px solid var(--admin-border-light)',
                      }}
                    >
                      <Box 
                        sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          cursor: 'pointer',
                        }}
                        onClick={() => loadOrphanPartnerDetails(partner.partner_id)}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{partner.account_name}</Typography>
                          <TierBadge tier={partner.partner_tier || 'Unknown'} size="small" />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Chip 
                            label={`${partner.orphan_count} orphans`}
                            size="small"
                            color="warning"
                          />
                          <Typography variant="caption" sx={{ opacity: 0.6 }}>
                            {partner.account_region} • {partner.account_owner}
                          </Typography>
                          <Typography sx={{ opacity: 0.5 }}>
                            {selectedOrphanPartner === partner.partner_id ? '▼' : '▶'}
                          </Typography>
                        </Box>
                      </Box>
                      
                      <Collapse in={selectedOrphanPartner === partner.partner_id}>
                        {orphanPartnerDetails?.error ? (
                          <Alert severity="error" sx={{ mt: 2 }}>{orphanPartnerDetails.error}</Alert>
                        ) : orphanPartnerDetails?.partner?.id === partner.partner_id ? (
                          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid var(--admin-border-light)' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Typography variant="subtitle2">
                                  Orphaned Users ({orphanPartnerDetails.orphanCount})
                                </Typography>
                                {orphanPartnerDetails.dismissedCount > 0 && (
                                  <Chip
                                    label={`${orphanPartnerDetails.dismissedCount} dismissed`}
                                    size="small"
                                    variant={showDismissed ? "filled" : "outlined"}
                                    color="default"
                                    onClick={() => {
                                      setShowDismissed(!showDismissed);
                                      loadOrphanPartnerDetails(partner.partner_id, !showDismissed);
                                    }}
                                    sx={{ cursor: 'pointer' }}
                                  />
                                )}
                              </Box>
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                {orphanPartnerDetails.orphanCount > 0 && (
                                  <>
                                    <ActionButton
                                      size="small"
                                      variant="outlined"
                                      color="default"
                                      onClick={() => bulkDismissOrphans(
                                        partner.partner_id,
                                        orphanPartnerDetails.orphans
                                      )}
                                      loading={linkingOrphan === 'bulk-dismiss'}
                                      disabled={linkingOrphan !== null}
                                      sx={{ fontSize: '0.75rem' }}
                                    >
                                      Dismiss All
                                    </ActionButton>
                                    <ActionButton
                                      size="small"
                                      variant="contained"
                                      color="primary"
                                      onClick={() => bulkLinkOrphans(
                                        partner.partner_id, 
                                        partner.account_name,
                                        orphanPartnerDetails.orphans.filter(o => !o.isDismissed)
                                      )}
                                      loading={linkingOrphan === 'bulk'}
                                      disabled={linkingOrphan !== null}
                                    >
                                      <GroupAddIcon sx={{ fontSize: 16, mr: 0.5 }} />
                                      Add All to Partner Group
                                    </ActionButton>
                                  </>
                                )}
                              </Box>
                            </Box>
                            
                            <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ borderBottom: '2px solid var(--admin-border-default)' }}>
                                    <th style={{ padding: '8px', textAlign: 'left' }}>Email</th>
                                    <th style={{ padding: '8px', textAlign: 'left' }}>Name</th>
                                    <th style={{ padding: '8px', textAlign: 'left' }}>Domain</th>
                                    <th style={{ padding: '8px', textAlign: 'left' }}>Registered</th>
                                    <th style={{ padding: '8px', textAlign: 'center' }}>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {orphanPartnerDetails.orphans?.map(orphan => (
                                    <tr 
                                      key={orphan.user_id} 
                                      style={{ 
                                        borderBottom: '1px solid var(--admin-border-light)',
                                        opacity: orphan.isDismissed ? 0.5 : 1,
                                        backgroundColor: orphan.isDismissed ? 'var(--admin-bg-elevated)' : 'transparent'
                                      }}
                                    >
                                      <td style={{ padding: '8px' }}>
                                        {orphan.email}
                                        {orphan.isDismissed && (
                                          <Chip label="Dismissed" size="small" sx={{ ml: 1, fontSize: '0.65rem', height: 18 }} />
                                        )}
                                      </td>
                                      <td style={{ padding: '8px' }}>
                                        {[orphan.first_name, orphan.last_name].filter(Boolean).join(' ') || '-'}
                                      </td>
                                      <td style={{ padding: '8px' }}>@{orphan.domain}</td>
                                      <td style={{ padding: '8px' }}>
                                        {orphan.created_at_lms ? new Date(orphan.created_at_lms).toLocaleDateString() : '-'}
                                      </td>
                                      <td style={{ padding: '8px', textAlign: 'center' }}>
                                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                          {orphan.isDismissed ? (
                                            <ActionButton
                                              size="small"
                                              variant="outlined"
                                              color="info"
                                              onClick={() => restoreOrphan(orphan.user_id, partner.partner_id)}
                                              loading={linkingOrphan === orphan.user_id}
                                              disabled={linkingOrphan !== null}
                                              sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}
                                            >
                                              Restore
                                            </ActionButton>
                                          ) : (
                                            <>
                                              <ActionButton
                                                size="small"
                                                variant="outlined"
                                                color="primary"
                                                onClick={() => linkOrphanToPartner(
                                                  orphan.user_id, 
                                                  partner.partner_id,
                                                  partner.account_name
                                                )}
                                                loading={linkingOrphan === orphan.user_id}
                                                disabled={linkingOrphan !== null}
                                                sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}
                                              >
                                                Link
                                              </ActionButton>
                                              <ActionButton
                                                size="small"
                                                variant="text"
                                                color="default"
                                                onClick={() => dismissOrphan(orphan.user_id, partner.partner_id)}
                                                loading={linkingOrphan === orphan.user_id}
                                                disabled={linkingOrphan !== null}
                                                sx={{ fontSize: '0.7rem', py: 0.25, px: 1, minWidth: 'auto' }}
                                                title="Dismiss - this user doesn't belong to this partner"
                                              >
                                                ✕
                                              </ActionButton>
                                            </>
                                          )}
                                        </Box>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </Box>
                          </Box>
                        ) : (
                          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                            <div className="ntx-spinner"></div>
                          </Box>
                        )}
                      </Collapse>
                    </Box>
                  ))}
                  
                  {filteredOrphanPartners.length > 50 && (
                    <Typography variant="body2" sx={{ textAlign: 'center', opacity: 0.6, mt: 2 }}>
                      Showing first 50 partners. Use filters to narrow down.
                    </Typography>
                  )}
                </SectionCard>
              ) : (
                <EmptyState
                  icon="✅"
                  title="No orphaned users found!"
                  message="All LMS users with partner email domains are properly linked to their partners."
                />
              )}
            </>
          )}

          {/* Initial State */}
          {!orphanLoading && !orphanSummary && !orphanBreakdown && (
            <SectionCard title="Orphan Discovery" icon="👻">
              <Box sx={{ textAlign: 'center', py: 4, maxWidth: 600, mx: 'auto' }}>
                <Typography variant="body1" sx={{ mb: 2, opacity: 0.8 }}>
                  This tool discovers <strong>"orphaned" partner users</strong> - people who registered directly in Northpass LMS
                  without going through CRM automation.
                </Typography>
                <Alert severity="info" sx={{ mb: 3 }}>
                  <Typography variant="body2">
                    <strong>How it works:</strong><br />
                    • Scans all LMS users' email domains<br />
                    • Matches domains against known partner contacts<br />
                    • Identifies users who should be linked to a partner but aren't<br />
                    • Allows you to add them to their partner's group
                  </Typography>
                </Alert>
                <Typography variant="body2" sx={{ opacity: 0.7 }}>
                  Click "Scan for Orphaned Users" to find users who need to be linked.
                </Typography>
              </Box>
            </SectionCard>
          )}

          {/* Loading State */}
          {orphanLoading && (
            <LoadingState message="Scanning LMS users... Matching email domains against partner contacts..." />
          )}
        </>
      )}

      {/* Add Users Modal (Tab 0) */}
      <AddUsersModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setAddResults(null);
        }}
        selectedContacts={selectedContactObjects}
        onConfirm={handleAddUsers}
        isAdding={isAdding}
        progress={addProgress}
        results={addResults}
      />

      {/* Add to Group Modal (Tab 1) */}
      <AddToGroupModal
        isOpen={showGroupModal}
        onClose={() => {
          setShowGroupModal(false);
          setGroupAddResults(null);
        }}
        selectedUsers={Array.from(selectedDomainUsers.values())}
        groupId={targetGroup?.id}
        groupName={targetGroup?.name}
        onConfirm={handleAddToGroup}
        isAdding={isAddingToGroup}
        progress={groupAddProgress}
        results={groupAddResults}
      />
    </PageContent>
  );
};

export default UserManagement;
