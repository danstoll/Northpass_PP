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
  TablePagination,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Autocomplete,
  CircularProgress,
  Tooltip,
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
  LinkOff as LinkOffIcon,
  PersonOff as PersonOffIcon,
  RemoveCircleOutline as RemoveCircleOutlineIcon,
  School as SchoolIcon,
  Badge as BadgeIcon,
  Email as EmailIcon,
  AccessTime as AccessTimeIcon,
  Folder as FolderIcon,
  Add as AddIcon,
  SyncAlt as SyncAltIcon,
  Error as ErrorIcon,
  PersonAdd as PersonAddIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
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
  InfoButton,
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
  isAddingToGroup,
  onCreateCrmContact,
  onDisassociateDomain,
  selectedCrmUsers,
  onCrmUserSelect,
  onSelectAllCrmUsers,
  onBulkCreateCrm,
  isBulkCreatingCrm,
  onRemoveFromGroup,
  removingUserId
}) => {
  const {
    domain,
    userCount,
    inPartnerGroup,
    notInPartnerGroup,
    matchedPartner,
    matchedPartnerId,
    partnerTier,
    partnerIsActive,
    partnerGroupId,
    partnerGroupName,
    users = [],
    isPublicDomain
  } = domainData;

  const usersNotInGroup = users.filter(u => !u.inPartnerGroup);
  const usersNotInCrm = users.filter(u => !u.crmAssociation);
  const allSelected = usersNotInGroup.length > 0 && usersNotInGroup.every(u => selectedUsers.has(u.id));
  const someSelected = usersNotInGroup.some(u => selectedUsers.has(u.id)) && !allSelected;
  
  // CRM selection state for this domain
  const allCrmSelected = usersNotInCrm.length > 0 && usersNotInCrm.every(u => selectedCrmUsers.has(u.id));
  const someCrmSelected = usersNotInCrm.some(u => selectedCrmUsers.has(u.id)) && !allCrmSelected;
  const selectedCrmCount = usersNotInCrm.filter(u => selectedCrmUsers.has(u.id)).length;

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
        <td style={{ textAlign: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            {usersNotInCrm.length > 0 ? (
              <>
                <PersonAddIcon sx={{ color: 'warning.main', fontSize: 16 }} />
                <span style={{ color: 'var(--admin-warning-text)' }}>{usersNotInCrm.length}</span>
              </>
            ) : (
              <span style={{ opacity: 0.5 }}>0</span>
            )}
          </Box>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          {matchedPartner ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <BusinessIcon sx={{ color: partnerIsActive ? 'primary.main' : 'text.disabled', fontSize: 16 }} />
              <span style={{ color: partnerIsActive ? 'inherit' : 'var(--admin-text-muted)' }}>{matchedPartner}</span>
              {partnerTier && <TierBadge tier={partnerTier} size="small" />}
              {partnerIsActive === false && (
                <Chip 
                  label="Inactive" 
                  size="small" 
                  sx={{ 
                    height: 18, 
                    fontSize: '0.65rem',
                    bgcolor: 'error.light',
                    color: 'error.contrastText'
                  }} 
                />
              )}
              <Tooltip title={`Remove @${domain} from ${matchedPartner}`}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDisassociateDomain(domain, matchedPartnerId, matchedPartner);
                  }}
                  sx={{ 
                    ml: 0.5, 
                    p: 0.25,
                    color: 'text.secondary',
                    '&:hover': { color: 'error.main', bgcolor: 'error.lighter' }
                  }}
                >
                  <LinkOffIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
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
          <td colSpan={8}>
            <Box sx={{ p: 2, bgcolor: 'var(--admin-bg-elevated)' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="subtitle2">
                  Users in @{domain} ({users.length})
                  {usersNotInCrm.length > 0 && (
                    <Chip 
                      label={`${usersNotInCrm.length} not in CRM`} 
                      size="small" 
                      color="warning" 
                      sx={{ ml: 1, height: 20, fontSize: '0.7rem' }} 
                    />
                  )}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Bulk Add to CRM - appears when there are users not in CRM and a matched partner */}
                  {usersNotInCrm.length > 0 && matchedPartnerId && (
                    <>
                      <ActionButton 
                        size="small" 
                        variant="text"
                        onClick={(e) => { e.stopPropagation(); onSelectAllCrmUsers(usersNotInCrm, !allCrmSelected); }}
                      >
                        {allCrmSelected ? 'Deselect CRM' : `Select ${usersNotInCrm.length} for CRM`}
                      </ActionButton>
                      {selectedCrmCount > 0 && (
                        <ActionButton 
                          size="small" 
                          variant="contained"
                          color="warning"
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            const selectedUsers = usersNotInCrm.filter(u => selectedCrmUsers.has(u.id));
                            onBulkCreateCrm(selectedUsers, matchedPartnerId, matchedPartner); 
                          }}
                          loading={isBulkCreatingCrm}
                          disabled={isBulkCreatingCrm}
                        >
                          <PersonAddIcon sx={{ fontSize: 16, mr: 0.5 }} />
                          Add {selectedCrmCount} to CRM
                        </ActionButton>
                      )}
                    </>
                  )}
                  {/* Quick Add All to Group button - appears when there are ungrouped users and a partner group exists */}
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
                      <th style={{ width: 30 }}></th>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Groups</th>
                      <th>CRM Partner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr 
                        key={user.id}
                        className={`${selectedUsers.has(user.id) ? 'selected' : ''} ${selectedCrmUsers.has(user.id) ? 'crm-selected' : ''}`}
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
                        {/* CRM Selection checkbox - only for users not in CRM */}
                        <td onClick={(e) => e.stopPropagation()}>
                          {!user.crmAssociation && matchedPartnerId && (
                            <Checkbox
                              size="small"
                              checked={selectedCrmUsers.has(user.id)}
                              onChange={() => onCrmUserSelect(user)}
                              sx={{ p: 0.25 }}
                            />
                          )}
                        </td>
                        <td>{user.email}</td>
                        <td>{[user.firstName, user.lastName].filter(Boolean).join(' ') || '-'}</td>
                        <td>
                          {user.inPartnerGroup ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <StatusChip status="success" label="In Partner Group" />
                              {partnerGroupId && (
                                <Tooltip title={`Remove ${user.email} from ${partnerGroupName || 'partner group'}`}>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRemoveFromGroup(user, partnerGroupId, partnerGroupName);
                                    }}
                                    disabled={removingUserId === user.id}
                                    sx={{
                                      p: 0.25,
                                      color: 'text.secondary',
                                      '&:hover': { color: 'error.main', bgcolor: 'error.lighter' }
                                    }}
                                  >
                                    {removingUserId === user.id ? (
                                      <CircularProgress size={14} />
                                    ) : (
                                      <LinkOffIcon sx={{ fontSize: 16 }} />
                                    )}
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          ) : (
                            <StatusChip status="warning" label="No Partner Group" />
                          )}
                        </td>
                        <td>
                          {user.groupNames?.length > 0 ? (
                            <Tooltip title={user.groupNames.join('\n')}>
                              <span className="opacity-70">
                                {user.groupNames.slice(0, 2).join(', ')}
                                {user.groupNames.length > 2 && ` +${user.groupNames.length - 2} more`}
                              </span>
                            </Tooltip>
                          ) : (
                            <span className="opacity-50">No groups</span>
                          )}
                        </td>
                        <td>
                          {user.crmAssociation ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Tooltip title={`CRM Partner: ${user.crmAssociation.partnerName}${user.crmPartnerMismatch ? ' (differs from domain match!)' : ''}`}>
                                <Chip 
                                  icon={<BusinessIcon sx={{ fontSize: '14px !important' }} />}
                                  label={user.crmAssociation.partnerName.length > 20 
                                    ? user.crmAssociation.partnerName.substring(0, 20) + '...' 
                                    : user.crmAssociation.partnerName}
                                  size="small"
                                  color={user.crmPartnerMismatch ? 'warning' : 'success'}
                                  variant="outlined"
                                  sx={{ fontSize: '0.7rem', height: 22 }}
                                />
                              </Tooltip>
                              {user.crmPartnerMismatch && (
                                <Tooltip title="CRM partner differs from domain-matched partner">
                                  <WarningIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                                </Tooltip>
                              )}
                            </Box>
                          ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <span style={{ opacity: 0.4, fontSize: '0.75rem' }}>Not in CRM</span>
                              {matchedPartnerId && (
                                <Tooltip title={`Add ${user.email} to CRM as ${matchedPartner} contact`}>
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onCreateCrmContact(user.email, user.firstName, user.lastName, matchedPartnerId);
                                    }}
                                    sx={{ p: 0.25 }}
                                  >
                                    <PersonAddIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
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
  // Read initial tab from URL params (e.g., /admin/users?tab=2)
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = parseInt(urlParams.get('tab')) || 0;
  
  // Tab state
  const [activeTab, setActiveTab] = useState(initialTab);
  
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
  const [domainPage, setDomainPage] = useState(0); // pagination - current page
  const [domainRowsPerPage, setDomainRowsPerPage] = useState(50); // rows per page
  const [expandedDomains, setExpandedDomains] = useState(new Set());
  const [domainSelectionMode, setDomainSelectionMode] = useState(false);
  const [selectedDomainUsers, setSelectedDomainUsers] = useState(new Map()); // userId -> user object
  const [selectedCrmUsers, setSelectedCrmUsers] = useState(new Set()); // userId set for CRM bulk add
  const [isBulkCreatingCrm, setIsBulkCreatingCrm] = useState(false);
  const [bulkCrmResults, setBulkCrmResults] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [targetGroup, setTargetGroup] = useState(null);
  const [groupAddProgress, setGroupAddProgress] = useState({ stage: '', current: 0, total: 0 });
  const [groupAddResults, setGroupAddResults] = useState(null);
  const [isAddingToGroup, setIsAddingToGroup] = useState(false);
  const [creatingGroupFor, setCreatingGroupFor] = useState(null); // { partnerId, partnerName, domain }
  const [removingUserId, setRemovingUserId] = useState(null); // User ID being removed from group

  // Tab 2: Orphan Discovery state
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

  // Tab 3: User Search state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState(null);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState(null);
  const [userProfileLoading, setUserProfileLoading] = useState(false);
  const [showCreateLmsDialog, setShowCreateLmsDialog] = useState(false);
  const [showCreateCrmDialog, setShowCreateCrmDialog] = useState(false);
  const [createUserData, setCreateUserData] = useState({ email: '', firstName: '', lastName: '', partnerId: null, title: '' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserResult, setCreateUserResult] = useState(null);
  const [partnersList, setPartnersList] = useState([]);
  const [showAddToGroupDialog, setShowAddToGroupDialog] = useState(false);
  const [addToGroupUserId, setAddToGroupUserId] = useState(null);
  const [selectedGroupToAdd, setSelectedGroupToAdd] = useState(null);
  const [addingToGroup, setAddingToGroup] = useState(false);
  const [dialogGroupsList, setDialogGroupsList] = useState([]);
  const [dialogGroupsLoading, setDialogGroupsLoading] = useState(false);

  // Tab 4: Offboarding state
  const [offboardLoading, setOffboardLoading] = useState(false);
  const [offboardError, setOffboardError] = useState(null);
  const [offboardData, setOffboardData] = useState(null);
  const [selectedOffboardUsers, setSelectedOffboardUsers] = useState(new Set());
  const [offboarding, setOffboarding] = useState(false);
  const [offboardProgress, setOffboardProgress] = useState({ current: 0, total: 0 });
  const [offboardResults, setOffboardResults] = useState(null);
  const [offboardSearchTerm, setOffboardSearchTerm] = useState('');
  const [offboardReasonFilter, setOffboardReasonFilter] = useState('all');

  // Impartner deactivation state
  const [deactivateInImpartner, setDeactivateInImpartner] = useState(false);
  const [deactivateInLms, setDeactivateInLms] = useState(true);
  const [impartnerDeactivating, setImpartnerDeactivating] = useState(false);
  const [impartnerDeactivateResults, setImpartnerDeactivateResults] = useState(null);

  // Bulk offboard state
  const [bulkOffboardMode, setBulkOffboardMode] = useState('search'); // 'search', 'paste', 'partner'
  const [bulkSearchQuery, setBulkSearchQuery] = useState('');
  const [bulkSearchResults, setBulkSearchResults] = useState([]);
  const [bulkSearchLoading, setBulkSearchLoading] = useState(false);
  const [selectedBulkUsers, setSelectedBulkUsers] = useState(new Set());
  const [pastedEmails, setPastedEmails] = useState('');
  const [parsedEmails, setParsedEmails] = useState([]);
  const [bulkPartnerFilter, setBulkPartnerFilter] = useState(null);
  const [partnerUsers, setPartnerUsers] = useState([]);
  const [partnerUsersLoading, setPartnerUsersLoading] = useState(false);
  const [bulkDeactivateInLms, setBulkDeactivateInLms] = useState(true);
  const [bulkDeactivating, setBulkDeactivating] = useState(false);
  const [bulkDeactivateResults, setBulkDeactivateResults] = useState(null);
  const [bulkDeactivateProgress, setBulkDeactivateProgress] = useState({ current: 0, total: 0, currentEmail: '' });

  // Load CRM contacts on mount
  useEffect(() => {
    loadData();
  }, []);

  // Load partners list when switching to bulk partner mode
  useEffect(() => {
    if (activeTab === 4 && bulkOffboardMode === 'partner' && partnersList.length === 0) {
      loadPartnersList();
    }
  }, [activeTab, bulkOffboardMode, partnersList.length]);

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

  // Disassociate a domain from a partner
  const handleDisassociateDomain = async (domain, partnerId, partnerName) => {
    const confirmed = window.confirm(
      `Are you sure you want to disassociate @${domain} from ${partnerName}?\n\n` +
      `This will remove the domain from the partner's associated domains list. ` +
      `Users with this email domain will no longer be automatically matched to this partner.`
    );
    
    if (!confirmed) return;
    
    try {
      const response = await fetch('/api/db/lms/disassociate-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, partnerId })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to disassociate domain');
      }
      
      console.log(`✅ Domain disassociated:`, data);
      alert(`✅ ${data.message}`);
      
      // Refresh domain analysis to reflect the change
      await loadDomainAnalysis();
      
    } catch (error) {
      console.error('Error disassociating domain:', error);
      alert(`❌ Error: ${error.message}`);
    }
  };

  // Load domain analysis when tab changes
  useEffect(() => {
    if (activeTab === 1 && !domainData && !domainLoading) {
      loadDomainAnalysis();
    }
  }, [activeTab, domainData, domainLoading]);

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
        case 'notInCrm':
          aVal = a.users?.filter(u => !u.crmAssociation).length || 0;
          bVal = b.users?.filter(u => !u.crmAssociation).length || 0;
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

  // Reset pagination when filters change
  useEffect(() => {
    setDomainPage(0);
  }, [domainSearchTerm, domainFilter]);

  // Handle sort request for domain table
  const handleDomainSortRequest = (property) => {
    const isAsc = domainOrderBy === property && domainOrder === 'asc';
    setDomainOrder(isAsc ? 'desc' : 'asc');
    setDomainOrderBy(property);
    setDomainPage(0); // Reset to first page on sort change
  };

  // Handle pagination
  const handleDomainPageChange = (event, newPage) => {
    setDomainPage(newPage);
  };

  const handleDomainRowsPerPageChange = (event) => {
    setDomainRowsPerPage(parseInt(event.target.value, 10));
    setDomainPage(0);
  };

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

  // CRM bulk selection handlers
  const toggleCrmUserSelection = (user) => {
    setSelectedCrmUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(user.id)) {
        newSet.delete(user.id);
      } else {
        newSet.add(user.id);
      }
      return newSet;
    });
  };

  const selectAllCrmUsers = (users, select) => {
    setSelectedCrmUsers(prev => {
      const newSet = new Set(prev);
      users.forEach(user => {
        if (select) {
          newSet.add(user.id);
        } else {
          newSet.delete(user.id);
        }
      });
      return newSet;
    });
  };

  // Bulk create CRM contacts
  const handleBulkCreateCrm = async (users, partnerId, partnerName) => {
    if (!users || users.length === 0 || !partnerId) return;
    
    const confirmed = window.confirm(
      `Add ${users.length} users to Impartner CRM as ${partnerName} contacts?\n\n` +
      `This will create contact records in both Impartner and the local database.`
    );
    
    if (!confirmed) return;
    
    setIsBulkCreatingCrm(true);
    setBulkCrmResults(null);
    
    const results = {
      success: 0,
      failed: 0,
      impartnerSuccess: 0,
      localOnly: 0,
      errors: []
    };
    
    try {
      const response = await fetch('/api/db/users/bulk-create-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          users: users.map(u => ({
            email: u.email,
            firstName: u.firstName || '',
            lastName: u.lastName || ''
          })),
          partnerId,
          pushToImpartner: true
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create contacts');
      }
      
      results.success = data.results.success || 0;
      results.failed = data.results.failed || 0;
      results.impartnerSuccess = data.results.impartnerSuccess || 0;
      results.localOnly = data.results.localOnly || 0;
      results.errors = data.results.errors || [];
      
      setBulkCrmResults(results);
      
      // Clear selection for successful users
      setSelectedCrmUsers(new Set());
      
      // Show result
      const message = `✅ Created ${results.success} contacts (${results.impartnerSuccess} in Impartner)` +
        (results.failed > 0 ? `\n❌ ${results.failed} failed` : '') +
        (results.localOnly > 0 ? `\n⚠️ ${results.localOnly} local only (Impartner failed)` : '');
      alert(message);
      
      // Refresh domain analysis
      await loadDomainAnalysis();
      
    } catch (error) {
      console.error('Bulk CRM creation error:', error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsBulkCreatingCrm(false);
    }
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

  // Remove user from partner group
  const handleRemoveFromGroup = async (user, groupId, groupName) => {
    if (!user || !groupId) return;

    const confirmed = window.confirm(
      `Remove ${user.email} from ${groupName || 'partner group'}?\n\nThis will unlink them from the partner in Northpass LMS.`
    );
    if (!confirmed) return;

    setRemovingUserId(user.id);
    try {
      const response = await fetch('/api/impartner/offboard/remove-from-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, groupId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove user from group');
      }

      const result = await response.json();
      console.log(`✅ Removed ${user.email} from ${groupName}:`, result);

      // Update local state - mark user as not in partner group
      setDomainData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          domains: prev.domains.map(d => {
            const updatedUsers = d.users.map(u =>
              u.id === user.id ? { ...u, inPartnerGroup: false } : u
            );
            const inGroup = updatedUsers.filter(u => u.inPartnerGroup).length;
            const notInGroup = updatedUsers.filter(u => !u.inPartnerGroup).length;
            return {
              ...d,
              users: updatedUsers,
              inPartnerGroup: inGroup,
              notInPartnerGroup: notInGroup
            };
          }),
          summary: {
            ...prev.summary,
            usersInPartnerGroups: prev.summary.usersInPartnerGroups - 1,
            usersNotInPartnerGroups: prev.summary.usersNotInPartnerGroups + 1
          }
        };
      });

    } catch (err) {
      console.error('Failed to remove user from group:', err);
      alert(`Failed to remove user: ${err.message}`);
    } finally {
      setRemovingUserId(null);
    }
  };

  // ============================================
  // Tab 2: Orphan Discovery Functions
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
      
      // Add user to the partner group via server-side API (syncs to both Northpass AND local DB)
      const addResponse = await fetch('/api/db/users/add-to-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, groupId: partnerGroup.id })
      });
      
      if (addResponse.ok) {
        const result = await addResponse.json();
        setLinkOrphanResults({ success: true, message: result.message || `Added user to ${partnerGroup.name}` });
        // Refresh the details for this specific partner
        await loadOrphanPartnerDetails(partnerId);
        // Update the summary counts locally instead of full rescan
        setOrphanSummary(prev => {
          if (!prev) return prev;
          const updatedPartners = prev.partners.map(p => {
            if (p.partner_id === partnerId) {
              return { ...p, orphan_count: Math.max(0, p.orphan_count - 1) };
            }
            return p;
          }).filter(p => p.orphan_count > 0); // Remove partners with 0 orphans
          return {
            ...prev,
            totalOrphans: Math.max(0, prev.totalOrphans - 1),
            partnersWithOrphans: updatedPartners.length,
            partners: updatedPartners
          };
        });
      } else {
        const errorData = await addResponse.json().catch(() => ({}));
        setLinkOrphanResults({ success: false, message: errorData.error || 'Failed to add user to group' });
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
      
      // Add all users via server-side API (syncs to both Northpass AND local DB)
      const results = { success: 0, failed: 0, errors: [] };
      for (const orphan of orphans) {
        try {
          const addResponse = await fetch('/api/db/users/add-to-group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: orphan.user_id, groupId: partnerGroup.id })
          });
          if (addResponse.ok) {
            results.success++;
          } else {
            const errorData = await addResponse.json().catch(() => ({}));
            results.failed++;
            results.errors.push({ email: orphan.email, error: errorData.error || 'Failed to add' });
          }
        } catch (err) {
          results.failed++;
          results.errors.push({ email: orphan.email, error: err.message });
        }
      }
      
      setLinkOrphanResults({
        success: results.failed === 0,
        message: `Added ${results.success} users to ${partnerGroup.name}${results.failed > 0 ? ` (${results.failed} failed)` : ''}`
      });
      
      // Refresh the details for this partner
      await loadOrphanPartnerDetails(partnerId);
      // Update summary counts locally instead of full rescan
      const linkedCount = results.success;
      setOrphanSummary(prev => {
        if (!prev) return prev;
        const updatedPartners = prev.partners.map(p => {
          if (p.partner_id === partnerId) {
            return { ...p, orphan_count: Math.max(0, p.orphan_count - linkedCount) };
          }
          return p;
        }).filter(p => p.orphan_count > 0);
        return {
          ...prev,
          totalOrphans: Math.max(0, prev.totalOrphans - linkedCount),
          partnersWithOrphans: updatedPartners.length,
          partners: updatedPartners
        };
      });
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
      
      // Refresh the details for this partner
      await loadOrphanPartnerDetails(partnerId);
      // Update summary counts locally instead of full rescan
      setOrphanSummary(prev => {
        if (!prev) return prev;
        const updatedPartners = prev.partners.map(p => {
          if (p.partner_id === partnerId) {
            return { ...p, orphan_count: Math.max(0, p.orphan_count - 1) };
          }
          return p;
        }).filter(p => p.orphan_count > 0);
        return {
          ...prev,
          totalOrphans: Math.max(0, prev.totalOrphans - 1),
          partnersWithOrphans: updatedPartners.length,
          partners: updatedPartners
        };
      });
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
      // Update summary counts locally instead of full rescan
      const dismissedCount = result.dismissed;
      setOrphanSummary(prev => {
        if (!prev) return prev;
        const updatedPartners = prev.partners.map(p => {
          if (p.partner_id === partnerId) {
            return { ...p, orphan_count: Math.max(0, p.orphan_count - dismissedCount) };
          }
          return p;
        }).filter(p => p.orphan_count > 0);
        return {
          ...prev,
          totalOrphans: Math.max(0, prev.totalOrphans - dismissedCount),
          partnersWithOrphans: updatedPartners.length,
          partners: updatedPartners
        };
      });
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
      await loadOrphanPartnerDetails(partnerId, true); // Include dismissed to show it's restored
      // Restore doesn't change orphan count (user was already counted but dismissed)
    } catch (err) {
      console.error('Error restoring orphan:', err);
      setLinkOrphanResults({ success: false, message: err.message });
    } finally {
      setLinkingOrphan(null);
    }
  };

  // ============================================
  // Tab 3: User Search Functions
  // ============================================

  // Search for users across LMS and CRM
  const searchUsers = async () => {
    if (!userSearchQuery || userSearchQuery.length < 3) return;
    
    setUserSearchLoading(true);
    setUserSearchResults(null);
    setSelectedUserProfile(null);
    
    try {
      const response = await fetch(`/api/db/users/search?q=${encodeURIComponent(userSearchQuery)}`);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setUserSearchResults(data);
    } catch (err) {
      console.error('User search error:', err);
      setUserSearchResults({ error: err.message, results: [] });
    } finally {
      setUserSearchLoading(false);
    }
  };

  // Load user profile details
  const loadUserProfile = async (email) => {
    setUserProfileLoading(true);
    setSelectedUserProfile(null);
    
    try {
      const response = await fetch(`/api/db/users/profile/${encodeURIComponent(email)}`);
      if (!response.ok) throw new Error('Failed to load profile');
      const data = await response.json();
      setSelectedUserProfile(data.profile);
    } catch (err) {
      console.error('Profile load error:', err);
    } finally {
      setUserProfileLoading(false);
    }
  };

  // Load partners list for dropdown
  const loadPartnersList = async () => {
    if (partnersList.length > 0) return;
    try {
      const response = await fetch('/api/db/users/partners-list');
      if (response.ok) {
        const data = await response.json();
        setPartnersList(data);
      }
    } catch (err) {
      console.error('Failed to load partners list:', err);
    }
  };

  // Create user in LMS
  const createLmsUser = async () => {
    if (!createUserData.email) return;
    
    setCreatingUser(true);
    setCreateUserResult(null);
    
    try {
      const response = await fetch('/api/db/users/create-lms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createUserData.email,
          firstName: createUserData.firstName,
          lastName: createUserData.lastName,
          partnerId: createUserData.partnerId
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }
      
      setCreateUserResult({ success: true, message: `User ${data.user.email} created in LMS`, data });
      
      // Refresh profile and search results
      if (createUserData.email) {
        setTimeout(() => loadUserProfile(createUserData.email), 500);
      }
      if (userSearchQuery) {
        setTimeout(() => searchUsers(), 1000);
      }
    } catch (err) {
      setCreateUserResult({ success: false, message: err.message });
    } finally {
      setCreatingUser(false);
    }
  };

  // Create contact in CRM
  const createCrmContact = async () => {
    if (!createUserData.email) return;
    
    setCreatingUser(true);
    setCreateUserResult(null);
    
    try {
      const response = await fetch('/api/db/users/create-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createUserData.email,
          firstName: createUserData.firstName,
          lastName: createUserData.lastName,
          partnerId: createUserData.partnerId,
          title: createUserData.title,
          pushToImpartner: true
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create contact');
      }
      
      // Show success with Impartner status
      const impartnerStatus = data.pushedToImpartner 
        ? '✅ Added to Impartner CRM' 
        : data.impartnerError 
          ? `⚠️ Local only (${data.impartnerError})`
          : '📋 Local database only';
      setCreateUserResult({ 
        success: true, 
        message: `Contact ${data.contact.email} created. ${impartnerStatus}`,
        data 
      });
      
      // Refresh profile and search results
      if (createUserData.email) {
        setTimeout(() => loadUserProfile(createUserData.email), 500);
      }
      if (userSearchQuery) {
        setTimeout(() => searchUsers(), 1000);
      }
      // Refresh domain data if on domain tab
      if (activeTab === 1 && domainData) {
        setTimeout(() => loadDomainAnalysis(), 1500);
      }
    } catch (err) {
      setCreateUserResult({ success: false, message: err.message });
    } finally {
      setCreatingUser(false);
    }
  };

  // Fetch groups when Add to Group dialog opens
  useEffect(() => {
    if (showAddToGroupDialog && dialogGroupsList.length === 0) {
      const fetchGroups = async () => {
        setDialogGroupsLoading(true);
        try {
          const response = await fetch('/api/db/lms/groups');
          if (response.ok) {
            const allGroups = await response.json();
            // Filter out "All Partners" and sort by name
            const filtered = allGroups
              .filter(g => g.name && g.name !== 'All Partners')
              .sort((a, b) => a.name.localeCompare(b.name));
            setDialogGroupsList(filtered);
          }
        } catch (err) {
          console.error('Failed to fetch groups for dialog:', err);
        } finally {
          setDialogGroupsLoading(false);
        }
      };
      fetchGroups();
    }
  }, [showAddToGroupDialog, dialogGroupsList.length]);

  // Add user to a group
  const addUserToGroupAction = async () => {
    if (!addToGroupUserId || !selectedGroupToAdd) return;
    
    setAddingToGroup(true);
    
    try {
      const response = await fetch('/api/db/users/add-to-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: addToGroupUserId,
          groupId: selectedGroupToAdd.id
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to add to group');
      }
      
      // Refresh profile
      if (selectedUserProfile) {
        setTimeout(() => loadUserProfile(selectedUserProfile.email), 500);
      }
      
      setShowAddToGroupDialog(false);
      setSelectedGroupToAdd(null);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setAddingToGroup(false);
    }
  };

  // Open create dialogs with prefilled data
  const openCreateLmsDialog = (email, firstName, lastName, partnerId) => {
    loadPartnersList();
    setCreateUserData({ email, firstName, lastName, partnerId, title: '' });
    setCreateUserResult(null);
    setShowCreateLmsDialog(true);
  };

  const openCreateCrmDialog = (email, firstName, lastName, partnerId) => {
    loadPartnersList();
    setCreateUserData({ email, firstName, lastName, partnerId, title: '' });
    setCreateUserResult(null);
    setShowCreateCrmDialog(true);
  };

  // ============================================
  // Tab 4: Offboarding Functions
  // ============================================

  // Load users that need offboarding
  const loadOffboardData = async () => {
    setOffboardLoading(true);
    setOffboardError(null);
    setOffboardResults(null);
    setSelectedOffboardUsers(new Set());
    
    try {
      const response = await fetch('/api/db/maintenance/users-needing-offboard');
      if (!response.ok) throw new Error('Failed to load offboard data');
      const data = await response.json();
      setOffboardData(data);
    } catch (err) {
      console.error('Error loading offboard data:', err);
      setOffboardError(err.message);
    } finally {
      setOffboardLoading(false);
    }
  };

  // Perform offboarding - remove users from All Partners group
  const offboardSelectedUsers = async () => {
    if (selectedOffboardUsers.size === 0) return;

    const userIds = Array.from(selectedOffboardUsers);

    setOffboarding(true);
    setOffboardProgress({ current: 0, total: userIds.length });
    setOffboardResults(null);

    try {
      const response = await fetch('/api/db/maintenance/offboard-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds })
      });

      if (!response.ok) throw new Error('Offboard operation failed');
      const result = await response.json();

      setOffboardResults(result);
      setSelectedOffboardUsers(new Set());

      // Reload data to show updated list
      await loadOffboardData();
    } catch (err) {
      console.error('Offboard error:', err);
      setOffboardResults({ success: false, error: err.message });
    } finally {
      setOffboarding(false);
    }
  };

  // Full deactivation - Impartner + LMS + local DB
  const deactivateUsersInImpartner = async () => {
    if (selectedOffboardUsers.size === 0) return;

    // Get emails for selected users
    const selectedUserData = filteredOffboardUsers.filter(u => selectedOffboardUsers.has(u.user_id));

    setImpartnerDeactivating(true);
    setImpartnerDeactivateResults(null);

    try {
      const response = await fetch('/api/db/maintenance/deactivate-users-in-impartner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          users: selectedUserData.map(u => ({ email: u.email })),
          deactivateLms: deactivateInLms
        })
      });

      if (!response.ok) throw new Error('Deactivation failed');
      const result = await response.json();

      setImpartnerDeactivateResults(result.results);
      setSelectedOffboardUsers(new Set());

      // Also offboard from All Partners group if successful
      if (result.results.impartnerDeactivated > 0 || result.results.lmsDeactivated > 0) {
        await loadOffboardData();
      }
    } catch (err) {
      console.error('Impartner deactivation error:', err);
      setImpartnerDeactivateResults({ error: err.message });
    } finally {
      setImpartnerDeactivating(false);
    }
  };

  // ============================================
  // Bulk Offboarding Functions
  // ============================================

  // Search for users to bulk offboard
  const searchUsersForBulkOffboard = async () => {
    if (!bulkSearchQuery.trim()) return;

    setBulkSearchLoading(true);
    setBulkSearchResults([]);

    try {
      const response = await fetch(`/api/db/maintenance/users-for-impartner-deactivation?search=${encodeURIComponent(bulkSearchQuery)}&limit=100`);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setBulkSearchResults(data.users || []);
    } catch (err) {
      console.error('Bulk search error:', err);
    } finally {
      setBulkSearchLoading(false);
    }
  };

  // Parse pasted email list
  const parseEmailList = useCallback(() => {
    if (!pastedEmails.trim()) {
      setParsedEmails([]);
      return;
    }

    // Parse emails - support comma, semicolon, newline, space separated
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = pastedEmails.match(emailRegex) || [];
    const uniqueEmails = [...new Set(matches.map(e => e.toLowerCase()))];
    setParsedEmails(uniqueEmails);
    setSelectedBulkUsers(new Set(uniqueEmails));
  }, [pastedEmails]);

  // Load users for a specific partner
  const loadPartnerUsersForOffboard = async (partnerId) => {
    if (!partnerId) {
      setPartnerUsers([]);
      return;
    }

    setPartnerUsersLoading(true);
    try {
      const response = await fetch(`/api/db/maintenance/users-for-impartner-deactivation?partnerId=${partnerId}&limit=500`);
      if (!response.ok) throw new Error('Failed to load partner users');
      const data = await response.json();
      setPartnerUsers(data.users || []);
    } catch (err) {
      console.error('Load partner users error:', err);
      setPartnerUsers([]);
    } finally {
      setPartnerUsersLoading(false);
    }
  };

  // Execute bulk deactivation - processes users one by one with progress
  const executeBulkDeactivation = async () => {
    let usersToDeactivate = [];

    if (bulkOffboardMode === 'search') {
      usersToDeactivate = bulkSearchResults
        .filter(u => selectedBulkUsers.has(u.contact_id))
        .map(u => ({ email: u.email, contactId: u.contact_id, impartnerId: u.impartner_id, lmsUserId: u.lms_user_id }));
    } else if (bulkOffboardMode === 'paste') {
      usersToDeactivate = parsedEmails
        .filter(e => selectedBulkUsers.has(e))
        .map(e => ({ email: e }));
    } else if (bulkOffboardMode === 'partner') {
      usersToDeactivate = partnerUsers
        .filter(u => selectedBulkUsers.has(u.contact_id))
        .map(u => ({ email: u.email, contactId: u.contact_id, impartnerId: u.impartner_id, lmsUserId: u.lms_user_id }));
    }

    if (usersToDeactivate.length === 0) return;

    setBulkDeactivating(true);
    setBulkDeactivateResults(null);
    setBulkDeactivateProgress({ current: 0, total: usersToDeactivate.length, currentEmail: '' });

    // Accumulate results as we process each user
    const results = {
      total: usersToDeactivate.length,
      impartnerDeactivated: 0,
      impartnerFailed: 0,
      impartnerNotFound: 0,
      lmsDeactivated: 0,
      lmsFailed: 0,
      localDbUpdated: 0,
      errors: []
    };

    try {
      for (let i = 0; i < usersToDeactivate.length; i++) {
        const user = usersToDeactivate[i];
        setBulkDeactivateProgress({
          current: i + 1,
          total: usersToDeactivate.length,
          currentEmail: user.email
        });

        try {
          const response = await fetch('/api/db/maintenance/deactivate-single-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              impartnerId: user.impartnerId,
              lmsUserId: user.lmsUserId,
              contactId: user.contactId,
              deactivateLms: bulkDeactivateInLms
            })
          });

          if (response.ok) {
            const data = await response.json();
            if (data.result.impartnerDeactivated) {
              results.impartnerDeactivated++;
            } else if (data.result.errors?.some(e => e.includes('Not found'))) {
              results.impartnerNotFound++;
            } else {
              results.impartnerFailed++;
            }
            if (data.result.lmsDeactivated) {
              results.lmsDeactivated++;
            }
            if (data.result.localDbUpdated) {
              results.localDbUpdated++;
            }
            if (data.result.errors?.length > 0) {
              results.errors.push({ email: user.email, errors: data.result.errors });
            }
          } else {
            results.impartnerFailed++;
            results.errors.push({ email: user.email, errors: ['Request failed'] });
          }
        } catch (err) {
          results.impartnerFailed++;
          results.errors.push({ email: user.email, errors: [err.message] });
        }
      }

      setBulkDeactivateResults(results);
      setSelectedBulkUsers(new Set());

      // Refresh data if successful
      if (results.impartnerDeactivated > 0 || results.lmsDeactivated > 0) {
        if (bulkOffboardMode === 'search' && bulkSearchQuery) {
          await searchUsersForBulkOffboard();
        } else if (bulkOffboardMode === 'partner' && bulkPartnerFilter) {
          await loadPartnerUsersForOffboard(bulkPartnerFilter);
        }
      }
    } catch (err) {
      console.error('Bulk deactivation error:', err);
      setBulkDeactivateResults({ ...results, error: err.message });
    } finally {
      setBulkDeactivating(false);
      setBulkDeactivateProgress({ current: 0, total: 0, currentEmail: '' });
    }
  };

  // Toggle bulk user selection
  const toggleBulkUser = (identifier) => {
    setSelectedBulkUsers(prev => {
      const next = new Set(prev);
      if (next.has(identifier)) {
        next.delete(identifier);
      } else {
        next.add(identifier);
      }
      return next;
    });
  };

  // Select all bulk users
  const selectAllBulkUsers = () => {
    if (bulkOffboardMode === 'search') {
      setSelectedBulkUsers(new Set(bulkSearchResults.map(u => u.contact_id)));
    } else if (bulkOffboardMode === 'paste') {
      setSelectedBulkUsers(new Set(parsedEmails));
    } else if (bulkOffboardMode === 'partner') {
      setSelectedBulkUsers(new Set(partnerUsers.map(u => u.contact_id)));
    }
  };

  // Clear bulk selection
  const clearBulkSelection = () => {
    setSelectedBulkUsers(new Set());
  };

  // Toggle user selection for offboarding
  const toggleOffboardUser = (userId) => {
    setSelectedOffboardUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  // Select all visible offboard users
  const selectAllOffboardUsers = () => {
    const visibleUserIds = filteredOffboardUsers.map(u => u.user_id);
    setSelectedOffboardUsers(new Set(visibleUserIds));
  };

  // Filter offboard users
  const filteredOffboardUsers = useMemo(() => {
    if (!offboardData?.usersToOffboard) return [];
    let filtered = offboardData.usersToOffboard;
    
    if (offboardSearchTerm) {
      const term = offboardSearchTerm.toLowerCase();
      filtered = filtered.filter(u => 
        u.email?.toLowerCase().includes(term) ||
        u.name?.toLowerCase().includes(term) ||
        u.account_name?.toLowerCase().includes(term)
      );
    }
    
    if (offboardReasonFilter !== 'all') {
      filtered = filtered.filter(u => {
        if (offboardReasonFilter === 'partnerInactive') return !u.partner_is_active;
        if (offboardReasonFilter === 'groupDeleted') return !u.group_is_active;
        if (offboardReasonFilter === 'userInactive') return !u.user_is_active;
        return true;
      });
    }
    
    return filtered;
  }, [offboardData, offboardSearchTerm, offboardReasonFilter]);

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
        subtitle="User lifecycle management - onboarding, orphan discovery, search, and offboarding"
      />

      {/* Tabs - Grouped by workflow: Onboard → Match → Search → Groups → Offboard */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto">
          {/* ONBOARDING: Add CRM contacts to LMS */}
          <Tab 
            icon={<PersonAddIcon />} 
            iconPosition="start" 
            label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Add to LMS<InfoButton tooltip="Find CRM contacts who aren't in the LMS yet and add them. Creates user accounts and adds them to their partner's group." /></Box>}
          />
          {/* MATCHING: Link orphaned users to partners */}
          <Tab 
            icon={<DomainIcon />} 
            iconPosition="start" 
            label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Domain Matching<InfoButton tooltip="Match LMS users to partners by email domain. Useful for finding users who registered directly and linking them to the correct partner." /></Box>}
          />
          {/* ORPHANS: Unlinked users needing partner assignment */}
          <Tab 
            icon={<PersonOffIcon />} 
            iconPosition="start" 
            label={<Box sx={{ display: 'flex', alignItems: 'center' }}>{`Orphans${orphanSummary?.totalOrphans > 0 ? ` (${orphanSummary.totalOrphans})` : ''}`}<InfoButton tooltip="Discover LMS users whose email domain matches a partner but aren't linked. These users registered directly in Northpass, bypassing CRM automation." /></Box>}
          />
          {/* SEARCH: Find specific users */}
          <Tab 
            icon={<PersonSearch />} 
            iconPosition="start" 
            label={<Box sx={{ display: 'flex', alignItems: 'center' }}>User Search<InfoButton tooltip="Search for any user by email, name, or partner. View their profile, group memberships, enrollments, and certifications." /></Box>}
          />
          {/* OFFBOARDING: Remove deactivated users */}
          <Tab 
            icon={<RemoveCircleOutlineIcon />} 
            iconPosition="start" 
            label={<Box sx={{ display: 'flex', alignItems: 'center' }}>{`Offboarding${offboardData?.total > 0 ? ` (${offboardData.total})` : ''}`}<InfoButton tooltip="Remove users from LMS groups when they're deactivated in Impartner CRM. Keeps partner groups clean and accurate." /></Box>}
          />
        </Tabs>
      </Box>

      {/* Tab 0: Add to LMS - Find CRM contacts missing from LMS and add them */}
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
            <StatCard icon="📋" value={stats.totalCrm} label="CRM Contacts" variant="default" infoTooltip="Total contacts in the Impartner CRM database that are linked to active partners." />
            <StatCard icon="👥" value={stats.totalLms} label="LMS Users" variant="default" infoTooltip="Total users registered in the Northpass LMS system." />
            <StatCard icon="✅" value={`${stats.matchRate}%`} label="Match Rate" variant="success" infoTooltip="Percentage of CRM contacts that have matching LMS accounts (by email)." />
            <StatCard icon="⚠️" value={stats.totalMissing} label="Missing from LMS" variant="warning" infoTooltip="CRM contacts who don't have an LMS account yet. These can be added using this tool." />
            <StatCard icon="📧" value={stats.personalEmails} label="Personal Emails" variant="default" infoTooltip="Contacts using personal email domains (gmail, yahoo, etc.) - may need manual verification." />
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
                  infoTooltip="Unique email domains extracted from partner contacts (e.g., acme.com, partner.org)."
                />
                <StatCard 
                  icon="👥" 
                  value={domainData.summary.totalUsers.toLocaleString()} 
                  label="Partner Users" 
                  variant="default"
                  infoTooltip="LMS users whose email domain matches a known partner domain."
                />
                <StatCard 
                  icon="✅" 
                  value={domainData.summary.usersInPartnerGroups.toLocaleString()} 
                  label="In Partner Groups" 
                  variant="success"
                  infoTooltip="Users already assigned to their correct partner LMS group."
                />
                <StatCard 
                  icon="⚠️" 
                  value={domainData.summary.usersNotInPartnerGroups.toLocaleString()} 
                  label="No Partner Group" 
                  variant="warning"
                  infoTooltip="Users with partner email domains but not in any partner group. May need to be added."
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
                      <th style={{ textAlign: 'center' }}>
                        <TableSortLabel
                          active={domainOrderBy === 'notInCrm'}
                          direction={domainOrderBy === 'notInCrm' ? domainOrder : 'asc'}
                          onClick={() => handleDomainSortRequest('notInCrm')}
                        >
                          Not in CRM
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
                    {filteredDomains
                      .slice(domainPage * domainRowsPerPage, domainPage * domainRowsPerPage + domainRowsPerPage)
                      .map(domainInfo => (
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
                        onCreateCrmContact={openCreateCrmDialog}
                        onDisassociateDomain={handleDisassociateDomain}
                        selectedCrmUsers={selectedCrmUsers}
                        onCrmUserSelect={toggleCrmUserSelection}
                        onSelectAllCrmUsers={selectAllCrmUsers}
                        onBulkCreateCrm={handleBulkCreateCrm}
                        isBulkCreatingCrm={isBulkCreatingCrm}
                        onRemoveFromGroup={handleRemoveFromGroup}
                        removingUserId={removingUserId}
                      />
                    ))}
                  </tbody>
                </table>
                
                <TablePagination
                  component="div"
                  count={filteredDomains.length}
                  page={domainPage}
                  onPageChange={handleDomainPageChange}
                  rowsPerPage={domainRowsPerPage}
                  onRowsPerPageChange={handleDomainRowsPerPageChange}
                  rowsPerPageOptions={[25, 50, 100, 250]}
                  sx={{ borderTop: '1px solid var(--admin-border-light)' }}
                />
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

      {/* Tab 2: Orphans - LMS users not linked to any partner */}
      {activeTab === 2 && (
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
              <StatCard icon="👥" value={orphanBreakdown.totalUsers.toLocaleString()} label="Total LMS Users" infoTooltip="All users registered in the Northpass LMS system." />
              <StatCard icon="✅" value={orphanBreakdown.linkedPartnerUsers.toLocaleString()} label="Linked Partner Users" variant="success" infoTooltip="Users in a partner group OR matched to a CRM contact." />
              <StatCard icon="📊" value={`${orphanBreakdown.percentageLinked}%`} label="Linked Rate" variant="success" infoTooltip="Percentage of LMS users linked to partners vs total users." />
              <StatCard icon="❓" value={orphanBreakdown.unlinkedUsers.toLocaleString()} label="Unlinked Users" variant="default" infoTooltip="LMS users not in partner groups and not in CRM. May be internal or customer users." />
              <StatCard icon="👻" value={orphanSummary?.totalOrphans?.toLocaleString() || '0'} label="Orphans (Domain Match)" variant="warning" infoTooltip="Unlinked users whose email domain matches a partner. These registered directly, bypassing CRM." />
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

      {/* Tab 3: User Search - Find specific users */}
      {activeTab === 3 && (
        <>
          {/* Search Input */}
          <Card sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              <PersonSearch sx={{ mr: 1, verticalAlign: 'middle' }} />
              Search for Users
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Search across both LMS (Northpass) and CRM (Impartner) systems by email, first name, or last name.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <TextField
                fullWidth
                label="Search by email or name"
                placeholder="Enter email address or name (min 3 characters)"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                }}
              />
              <ActionButton
                variant="contained"
                color="primary"
                onClick={searchUsers}
                loading={userSearchLoading}
                disabled={userSearchQuery.length < 3}
              >
                Search
              </ActionButton>
            </Box>
          </Card>

          {/* Search Results and Profile side by side */}
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {/* Search Results */}
            <Box sx={{ flex: '1 1 400px', minWidth: 350 }}>
              {userSearchLoading && <LoadingState message="Searching..." />}
              
              {userSearchResults && !userSearchLoading && (
                <SectionCard 
                  title={`Search Results (${userSearchResults.totalResults || 0})`}
                  icon="🔍"
                >
                  {userSearchResults.results?.length > 0 ? (
                    <Box sx={{ maxHeight: 500, overflowY: 'auto' }}>
                      {userSearchResults.results.map((user, idx) => (
                        <Card 
                          key={idx} 
                          sx={{ 
                            p: 2, 
                            mb: 1, 
                            cursor: 'pointer',
                            bgcolor: selectedUserProfile?.email === user.email ? 'action.selected' : 'background.paper',
                            '&:hover': { bgcolor: 'action.hover' }
                          }}
                          onClick={() => loadUserProfile(user.email)}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Box>
                              <Typography variant="subtitle2">
                                {user.firstName} {user.lastName}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {user.email}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <Chip 
                                size="small" 
                                icon={user.inLms ? <CheckCircleIcon /> : <ErrorIcon />}
                                label="LMS" 
                                color={user.inLms ? 'success' : 'default'}
                                variant={user.inLms ? 'filled' : 'outlined'}
                              />
                              <Chip 
                                size="small" 
                                icon={user.inCrm ? <CheckCircleIcon /> : <ErrorIcon />}
                                label="CRM" 
                                color={user.inCrm ? 'success' : 'default'}
                                variant={user.inCrm ? 'filled' : 'outlined'}
                              />
                            </Box>
                          </Box>
                          {user.crmContact?.account_name && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                              <BusinessIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                              {user.crmContact.account_name}
                            </Typography>
                          )}
                        </Card>
                      ))}
                    </Box>
                  ) : (
                    <EmptyState
                      icon="🔍"
                      title="No results found"
                      message={`No users found matching "${userSearchResults.query}"`}
                    />
                  )}
                </SectionCard>
              )}
            </Box>

            {/* User Profile Details */}
            <Box sx={{ flex: '2 1 500px', minWidth: 400 }}>
              {userProfileLoading && <LoadingState message="Loading profile..." />}
              
              {selectedUserProfile && !userProfileLoading && (
                <Card sx={{ p: 3 }}>
                  {/* Profile Header */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                    <Box>
                      <Typography variant="h5">
                        {selectedUserProfile.firstName} {selectedUserProfile.lastName}
                      </Typography>
                      <Typography variant="body1" color="text.secondary">
                        <EmailIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                        {selectedUserProfile.email}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      {selectedUserProfile.inLms ? (
                        <Chip icon={<CheckCircleIcon />} label="In LMS" color="success" />
                      ) : (
                        <Chip 
                          icon={<AddIcon />} 
                          label="Add to LMS" 
                          color="warning" 
                          onClick={() => openCreateLmsDialog(
                            selectedUserProfile.email,
                            selectedUserProfile.firstName,
                            selectedUserProfile.lastName,
                            selectedUserProfile.crmContact?.partner_id
                          )}
                          sx={{ cursor: 'pointer' }}
                        />
                      )}
                      {selectedUserProfile.inCrm ? (
                        <Chip icon={<CheckCircleIcon />} label="In CRM" color="success" />
                      ) : (
                        <Chip 
                          icon={<AddIcon />} 
                          label="Add to CRM" 
                          color="warning" 
                          onClick={() => openCreateCrmDialog(
                            selectedUserProfile.email,
                            selectedUserProfile.firstName,
                            selectedUserProfile.lastName,
                            null
                          )}
                          sx={{ cursor: 'pointer' }}
                        />
                      )}
                    </Box>
                  </Box>

                  <Divider sx={{ mb: 3 }} />

                  {/* Stats Row */}
                  <StatsRow columns={4}>
                    <StatCard
                      title="Enrollments"
                      value={selectedUserProfile.stats?.totalEnrollments || 0}
                      icon={<SchoolIcon />}
                      infoTooltip="Total courses the user has enrolled in (started or completed)."
                    />
                    <StatCard
                      title="Completed"
                      value={selectedUserProfile.stats?.completedCourses || 0}
                      icon={<CheckCircleIcon />}
                      variant="success"
                      infoTooltip="Courses the user has finished with 100% progress."
                    />
                    <StatCard
                      title="Certifications"
                      value={selectedUserProfile.stats?.certificationCount || 0}
                      icon={<BadgeIcon />}
                      infoTooltip="Active certifications that haven't expired. Expired certs don't count."
                    />
                    <StatCard
                      title="NPCU"
                      value={selectedUserProfile.stats?.totalNpcu || 0}
                      icon={<SchoolIcon />}
                      variant={selectedUserProfile.stats?.totalNpcu > 0 ? 'success' : 'default'}
                      infoTooltip="Nintex Partner Certification Units earned from active certifications."
                    />
                  </StatsRow>

                  {/* CRM Info */}
                  {selectedUserProfile.crmContact && (
                    <Box sx={{ mt: 3 }}>
                      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                        <BusinessIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        CRM Details
                      </Typography>
                      <Card variant="outlined" sx={{ p: 2 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Partner</Typography>
                            <Typography variant="body2">{selectedUserProfile.crmContact.account_name || '-'}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Tier</Typography>
                            <Typography variant="body2">
                              {selectedUserProfile.crmContact.partner_tier && (
                                <TierBadge tier={selectedUserProfile.crmContact.partner_tier} />
                              )}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Region</Typography>
                            <Typography variant="body2">{selectedUserProfile.crmContact.account_region || '-'}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Title</Typography>
                            <Typography variant="body2">{selectedUserProfile.crmContact.title || '-'}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Account Owner</Typography>
                            <Typography variant="body2">{selectedUserProfile.crmContact.account_owner || '-'}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Phone</Typography>
                            <Typography variant="body2">{selectedUserProfile.crmContact.phone || '-'}</Typography>
                          </Box>
                          <Box sx={{ gridColumn: 'span 2' }}>
                            <Typography variant="caption" color="text.secondary">Partner LMS Group</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                              {selectedUserProfile.crmContact.lms_group_id ? (
                                <>
                                  <Chip 
                                    icon={<FolderIcon />} 
                                    label={selectedUserProfile.crmContact.lms_group_name || 'Group exists'} 
                                    color="success" 
                                    size="small"
                                    variant="outlined"
                                  />
                                  {/* Check if user is in partner's group */}
                                  {selectedUserProfile.inLms && 
                                   !selectedUserProfile.groups?.some(g => g.id === selectedUserProfile.crmContact.lms_group_id) && (
                                    <Chip 
                                      icon={<WarningIcon />}
                                      label="User not in this group"
                                      color="warning"
                                      size="small"
                                    />
                                  )}
                                </>
                              ) : (
                                <Chip icon={<WarningIcon />} label="No LMS group" color="error" size="small" />
                              )}
                            </Box>
                          </Box>
                        </Box>
                      </Card>
                    </Box>
                  )}

                  {/* Warning if user is in LMS but not in partner group - enrollments won't sync */}
                  {selectedUserProfile.inLms && 
                   selectedUserProfile.crmContact?.lms_group_id && 
                   !selectedUserProfile.groups?.some(g => g.id === selectedUserProfile.crmContact.lms_group_id) && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      <strong>User not in partner group!</strong> This user is in the LMS but not assigned to their partner's group 
                      ("{selectedUserProfile.crmContact.lms_group_name}"). Enrollment data is only synced for users in partner groups.
                      <Button 
                        size="small" 
                        variant="contained"
                        color="warning"
                        sx={{ ml: 2 }}
                        onClick={() => {
                          setAddToGroupUserId(selectedUserProfile.lmsUser?.id);
                          // Pre-select the partner's group if available
                          const partnerGroup = selectedUserProfile.crmContact.lms_group_id 
                            ? { id: selectedUserProfile.crmContact.lms_group_id, name: selectedUserProfile.crmContact.lms_group_name }
                            : null;
                          setSelectedGroupToAdd(partnerGroup);
                          setShowAddToGroupDialog(true);
                        }}
                      >
                        Add to Partner Group
                      </Button>
                    </Alert>
                  )}

                  {/* LMS Groups */}
                  {selectedUserProfile.groups?.length > 0 && (
                    <Box sx={{ mt: 3 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          <FolderIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                          LMS Groups ({selectedUserProfile.groups.length})
                        </Typography>
                        {selectedUserProfile.inLms && (
                          <Button 
                            size="small" 
                            startIcon={<AddIcon />}
                            onClick={() => {
                              setAddToGroupUserId(selectedUserProfile.lmsUser?.id);
                              setShowAddToGroupDialog(true);
                            }}
                          >
                            Add to Group
                          </Button>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {selectedUserProfile.groups.map((group, idx) => (
                          <Chip 
                            key={idx}
                            icon={<FolderIcon />}
                            label={group.name}
                            variant="outlined"
                            size="small"
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {selectedUserProfile.inLms && selectedUserProfile.groups?.length === 0 && (
                    <Box sx={{ mt: 3 }}>
                      <Alert severity="warning">
                        This user is not in any LMS groups.
                        <Button 
                          size="small" 
                          sx={{ ml: 2 }}
                          onClick={() => {
                            setAddToGroupUserId(selectedUserProfile.lmsUser?.id);
                            setShowAddToGroupDialog(true);
                          }}
                        >
                          Add to Group
                        </Button>
                      </Alert>
                    </Box>
                  )}

                  {/* Certifications */}
                  {selectedUserProfile.certifications?.length > 0 && (
                    <Box sx={{ mt: 3 }}>
                      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                        <BadgeIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        Certifications ({selectedUserProfile.certifications.length})
                      </Typography>
                      <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                        {selectedUserProfile.certifications.map((cert, idx) => (
                          <Card key={idx} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Box>
                                <Typography variant="body2">{cert.course_name}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  <AccessTimeIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                                  {cert.completed_at ? new Date(cert.completed_at).toLocaleDateString() : '-'}
                                </Typography>
                              </Box>
                              <Chip 
                                size="small" 
                                label={`${cert.npcu_value} NPCU`}
                                color="primary"
                              />
                            </Box>
                          </Card>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Recent Enrollments */}
                  {selectedUserProfile.enrollments?.length > 0 && (
                    <Box sx={{ mt: 3 }}>
                      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                        <SchoolIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        Recent Enrollments
                      </Typography>
                      <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                        {selectedUserProfile.enrollments.slice(0, 10).map((enrollment, idx) => (
                          <Card key={idx} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: enrollment.is_certification ? 600 : 400 }}>
                                  {enrollment.course_name}
                                  {enrollment.is_certification && (
                                    <BadgeIcon sx={{ fontSize: 14, ml: 0.5, color: 'primary.main' }} />
                                  )}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {enrollment.category || 'Uncategorized'}
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                {enrollment.progress_percent !== null && enrollment.status !== 'completed' && (
                                  <Typography variant="caption" color="text.secondary">
                                    {enrollment.progress_percent}%
                                  </Typography>
                                )}
                                <Chip 
                                  size="small" 
                                  label={enrollment.status}
                                  color={enrollment.status === 'completed' ? 'success' : enrollment.status === 'in_progress' ? 'warning' : 'default'}
                                  variant={enrollment.status === 'completed' ? 'filled' : 'outlined'}
                                />
                              </Box>
                            </Box>
                          </Card>
                        ))}
                        {selectedUserProfile.enrollments.length > 10 && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
                            ... and {selectedUserProfile.enrollments.length - 10} more enrollments
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  )}

                  {/* No LMS data message */}
                  {!selectedUserProfile.inLms && (
                    <Box sx={{ mt: 3 }}>
                      <Alert severity="info">
                        <Typography variant="body2">
                          This user does not exist in the LMS (Northpass). 
                          Click "Add to LMS" to create their account.
                        </Typography>
                      </Alert>
                    </Box>
                  )}
                </Card>
              )}

              {/* Empty state when no profile selected */}
              {!selectedUserProfile && !userProfileLoading && userSearchResults && (
                <Card sx={{ p: 4, textAlign: 'center' }}>
                  <PersonSearch sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="h6" color="text.secondary">
                    Select a user to view details
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Click on any search result to see their full profile, enrollments, and group memberships.
                  </Typography>
                </Card>
              )}
            </Box>
          </Box>
        </>
      )}

      {/* Tab 4: Offboarding - Remove deactivated users */}
      {activeTab === 4 && (
        <>
          {/* Action Bar */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <ActionButton
              variant="contained"
              color="primary"
              onClick={loadOffboardData}
              loading={offboardLoading}
              icon={<SearchIcon />}
            >
              {offboardLoading ? 'Scanning...' : 'Scan for Offboarding'}
            </ActionButton>

            {selectedOffboardUsers.size > 0 && (
              <>
                <ActionButton
                  variant="contained"
                  color="error"
                  onClick={offboardSelectedUsers}
                  loading={offboarding}
                  icon={<RemoveCircleOutlineIcon />}
                >
                  {offboarding ? 'Offboarding...' : `Remove from LMS Groups (${selectedOffboardUsers.size})`}
                </ActionButton>

                <ActionButton
                  variant="contained"
                  color="warning"
                  onClick={deactivateUsersInImpartner}
                  loading={impartnerDeactivating}
                  icon={<PersonOffIcon />}
                >
                  {impartnerDeactivating ? 'Deactivating...' : `Deactivate in Impartner (${selectedOffboardUsers.size})`}
                </ActionButton>
              </>
            )}
          </Box>

          {/* Impartner Deactivation Options */}
          {selectedOffboardUsers.size > 0 && (
            <Card sx={{ p: 2, mb: 3, bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.main' }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                <WarningIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle', color: 'warning.main' }} />
                Deactivation Options
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={deactivateInLms}
                    onChange={(e) => setDeactivateInLms(e.target.checked)}
                    size="small"
                  />
                }
                label={<Typography variant="body2">Also deactivate in LMS (Northpass)</Typography>}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
                When checked, users will be fully deactivated in both Impartner and Northpass LMS.
              </Typography>
            </Card>
          )}

          {/* LMS Offboard Results Alert */}
          {offboardResults && (
            <Alert
              severity={offboardResults.success !== false ? 'success' : 'error'}
              sx={{ mb: 3 }}
              onClose={() => setOffboardResults(null)}
            >
              {offboardResults.success !== false ? (
                <>
                  <Typography variant="subtitle2">LMS Offboarding Complete</Typography>
                  <Typography variant="body2">
                    Removed {offboardResults.removed || 0} users from All Partners group.
                    {offboardResults.failed > 0 && ` ${offboardResults.failed} failed.`}
                  </Typography>
                </>
              ) : (
                <Typography variant="body2">{offboardResults.error || 'Operation failed'}</Typography>
              )}
            </Alert>
          )}

          {/* Impartner Deactivation Results Alert */}
          {impartnerDeactivateResults && (
            <Alert
              severity={impartnerDeactivateResults.error ? 'error' : impartnerDeactivateResults.impartnerDeactivated > 0 ? 'success' : 'warning'}
              sx={{ mb: 3 }}
              onClose={() => setImpartnerDeactivateResults(null)}
            >
              {impartnerDeactivateResults.error ? (
                <Typography variant="body2">{impartnerDeactivateResults.error}</Typography>
              ) : (
                <>
                  <Typography variant="subtitle2">Impartner Deactivation Complete</Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2 }}>
                    <li>Impartner: {impartnerDeactivateResults.impartnerDeactivated || 0} deactivated, {impartnerDeactivateResults.impartnerNotFound || 0} not found</li>
                    {deactivateInLms && <li>LMS: {impartnerDeactivateResults.lmsDeactivated || 0} deactivated</li>}
                    <li>Local DB: {impartnerDeactivateResults.localDbUpdated || 0} updated</li>
                  </Box>
                  {impartnerDeactivateResults.errors?.length > 0 && (
                    <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                      {impartnerDeactivateResults.errors.length} error(s) occurred
                    </Typography>
                  )}
                </>
              )}
            </Alert>
          )}

          {/* Error Alert */}
          {offboardError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {offboardError}
            </Alert>
          )}

          {/* Loading State */}
          {offboardLoading && (
            <LoadingState message="Scanning for users that need offboarding..." />
          )}

          {/* Summary Cards */}
          {offboardData && !offboardLoading && (
            <>
              <StatsRow columns={4}>
                <StatCard 
                  title="Total Users" 
                  value={offboardData.total || 0}
                  subtitle="Users needing offboard"
                  variant={offboardData.total > 0 ? 'warning' : 'success'}
                  infoTooltip="Total users that should be removed from LMS groups based on CRM status changes."
                />
                <StatCard 
                  title="Inactive Partners" 
                  value={offboardData.byReason?.partnerInactive || 0}
                  subtitle="Partner deactivated in CRM"
                  variant={offboardData.byReason?.partnerInactive > 0 ? 'warning' : 'default'}
                  infoTooltip="Users whose partner organization was deactivated in Impartner CRM."
                />
                <StatCard 
                  title="Deleted Groups" 
                  value={offboardData.byReason?.groupDeleted || 0}
                  subtitle="Group removed from LMS"
                  variant={offboardData.byReason?.groupDeleted > 0 ? 'warning' : 'default'}
                  infoTooltip="Users in LMS groups that no longer exist (group was deleted)."
                />
                <StatCard 
                  title="Inactive Users" 
                  value={offboardData.byReason?.userInactive || 0}
                  subtitle="User marked inactive"
                  variant={offboardData.byReason?.userInactive > 0 ? 'warning' : 'default'}
                  infoTooltip="Individual contacts marked as inactive in the CRM."
                />
              </StatsRow>

              {/* Filters */}
              {offboardData.total > 0 && (
                <Card sx={{ p: 2, mb: 3 }}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <SearchInput 
                      value={offboardSearchTerm}
                      onChange={setOffboardSearchTerm}
                      placeholder="Search users..."
                      sx={{ flex: '1 1 250px', maxWidth: 300 }}
                    />
                    <FilterSelect
                      value={offboardReasonFilter}
                      onChange={setOffboardReasonFilter}
                      label="Reason"
                      options={[
                        { value: 'all', label: 'All Reasons' },
                        { value: 'partnerInactive', label: 'Inactive Partner' },
                        { value: 'groupDeleted', label: 'Deleted Group' },
                        { value: 'userInactive', label: 'Inactive User' }
                      ]}
                    />
                    <Box sx={{ flex: 1 }} />
                    <Button 
                      variant="outlined" 
                      size="small"
                      onClick={selectAllOffboardUsers}
                      disabled={filteredOffboardUsers.length === 0}
                    >
                      Select All ({filteredOffboardUsers.length})
                    </Button>
                    {selectedOffboardUsers.size > 0 && (
                      <Button 
                        variant="outlined" 
                        size="small"
                        onClick={() => setSelectedOffboardUsers(new Set())}
                      >
                        Clear Selection
                      </Button>
                    )}
                  </Box>
                </Card>
              )}

              {/* Users Table */}
              {filteredOffboardUsers.length > 0 ? (
                <SectionCard 
                  title={`Users to Offboard (${filteredOffboardUsers.length})`} 
                  icon="🚪"
                >
                  <Box sx={{ maxHeight: 600, overflowY: 'auto' }}>
                    {filteredOffboardUsers.map((user) => {
                      const reason = !user.partner_is_active ? 'Partner Inactive' 
                        : !user.group_is_active ? 'Group Deleted' 
                        : !user.user_is_active ? 'User Inactive' 
                        : 'Unknown';
                      const reasonColor = !user.partner_is_active ? 'warning' 
                        : !user.group_is_active ? 'error' 
                        : 'default';
                      
                      return (
                        <Card 
                          key={user.user_id} 
                          sx={{ 
                            p: 2, 
                            mb: 1, 
                            bgcolor: selectedOffboardUsers.has(user.user_id) ? 'action.selected' : 'background.paper',
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' }
                          }}
                          onClick={() => toggleOffboardUser(user.user_id)}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Checkbox 
                              checked={selectedOffboardUsers.has(user.user_id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleOffboardUser(user.user_id)}
                            />
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="subtitle2">{user.name || 'Unknown'}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {user.email}
                              </Typography>
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                              <Typography variant="body2">{user.account_name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {user.partner_group_name}
                              </Typography>
                            </Box>
                            <Chip 
                              size="small" 
                              label={reason}
                              color={reasonColor}
                              variant="outlined"
                            />
                          </Box>
                          {user.partner_deleted_at && (
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 6 }}>
                              Deactivated: {new Date(user.partner_deleted_at).toLocaleDateString()}
                            </Typography>
                          )}
                        </Card>
                      );
                    })}
                  </Box>
                </SectionCard>
              ) : offboardData.total === 0 ? (
                <SectionCard title="All Clear" icon="✅">
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <CheckCircleIcon sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
                    <Typography variant="h6">No Users Need Offboarding</Typography>
                    <Typography variant="body2" color="text.secondary">
                      All partner users are properly configured in the LMS.
                    </Typography>
                  </Box>
                </SectionCard>
              ) : (
                <Alert severity="info">
                  No users match the current filters. Try adjusting your search criteria.
                </Alert>
              )}

              {/* Info Section */}
              <Alert severity="info" sx={{ mt: 3 }}>
                <Typography variant="subtitle2">Offboarding Options</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Remove from LMS Groups:</strong> Removes users from the "All Partners" LMS group,
                  revoking access to partner training content while keeping their account intact.
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Deactivate in Impartner:</strong> Fully deactivates users in Impartner CRM
                  (sets IsActive=No and Contact_Status=Inactive). Use this for terminated employees or
                  users who should no longer have partner portal access.
                </Typography>
                <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                  Tip: For terminated employees, use "Deactivate in Impartner" with LMS deactivation enabled
                  for complete removal from both systems.
                </Typography>
              </Alert>
            </>
          )}

          {/* Empty State - No scan yet */}
          {!offboardData && !offboardLoading && !offboardError && (
            <SectionCard title="Offboarding Management" icon="🚪">
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <RemoveCircleOutlineIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
                  Manage User Offboarding
                </Typography>
                <Alert severity="info" sx={{ textAlign: 'left', maxWidth: 600, mx: 'auto' }}>
                  <Typography variant="body2">
                    Click <strong>"Scan for Offboarding"</strong> to find users who need to be removed 
                    from the "All Partners" group because:
                  </Typography>
                  <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                    <li>Their partner was deactivated in the CRM</li>
                    <li>Their LMS group was deleted</li>
                    <li>They were marked as inactive</li>
                  </ul>
                </Alert>
              </Box>
            </SectionCard>
          )}

          {/* Bulk Offboard Section */}
          <Divider sx={{ my: 4 }} />

          <SectionCard
            title="Bulk User Deactivation"
            icon={<PersonOffIcon />}
            subtitle="Manually deactivate users in Impartner and/or LMS"
          >
            {/* Mode Selection Tabs */}
            <Tabs
              value={bulkOffboardMode}
              onChange={(e, v) => {
                setBulkOffboardMode(v);
                setSelectedBulkUsers(new Set());
                setBulkDeactivateResults(null);
              }}
              sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab value="search" label="Search Users" icon={<SearchIcon />} iconPosition="start" />
              <Tab value="paste" label="Email List" icon={<EmailIcon />} iconPosition="start" />
              <Tab value="partner" label="By Partner" icon={<BusinessIcon />} iconPosition="start" />
            </Tabs>

            {/* Bulk Deactivate Results */}
            {bulkDeactivateResults && (
              <Alert
                severity={bulkDeactivateResults.error ? 'error' : bulkDeactivateResults.impartnerDeactivated > 0 ? 'success' : 'warning'}
                sx={{ mb: 3 }}
                onClose={() => setBulkDeactivateResults(null)}
              >
                {bulkDeactivateResults.error ? (
                  <Typography variant="body2">{bulkDeactivateResults.error}</Typography>
                ) : (
                  <>
                    <Typography variant="subtitle2">Bulk Deactivation Complete</Typography>
                    <Box component="ul" sx={{ m: 0, pl: 2 }}>
                      <li>Impartner: {bulkDeactivateResults.impartnerDeactivated || 0} deactivated, {bulkDeactivateResults.impartnerNotFound || 0} not found</li>
                      {bulkDeactivateInLms && <li>LMS: {bulkDeactivateResults.lmsDeactivated || 0} deactivated</li>}
                      <li>Local DB: {bulkDeactivateResults.localDbUpdated || 0} updated</li>
                    </Box>
                    {bulkDeactivateResults.errors?.length > 0 && (
                      <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                        {bulkDeactivateResults.errors.length} error(s) occurred
                      </Typography>
                    )}
                  </>
                )}
              </Alert>
            )}

            {/* Search Mode */}
            {bulkOffboardMode === 'search' && (
              <Box>
                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                  <SearchInput
                    value={bulkSearchQuery}
                    onChange={(e) => setBulkSearchQuery(e.target.value)}
                    placeholder="Search by email, name, or company..."
                    onKeyDown={(e) => e.key === 'Enter' && searchUsersForBulkOffboard()}
                    sx={{ flex: 1 }}
                  />
                  <ActionButton
                    variant="contained"
                    onClick={searchUsersForBulkOffboard}
                    loading={bulkSearchLoading}
                    icon={<SearchIcon />}
                  >
                    Search
                  </ActionButton>
                </Box>

                {bulkSearchResults.length > 0 && (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Found {bulkSearchResults.length} users
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button size="small" onClick={selectAllBulkUsers}>
                          Select All ({bulkSearchResults.length})
                        </Button>
                        {selectedBulkUsers.size > 0 && (
                          <Button size="small" onClick={clearBulkSelection}>
                            Clear ({selectedBulkUsers.size})
                          </Button>
                        )}
                      </Box>
                    </Box>

                    <Box sx={{ maxHeight: 400, overflowY: 'auto', mb: 3 }}>
                      {bulkSearchResults.map((user) => (
                        <Card
                          key={user.contact_id}
                          sx={{
                            p: 1.5,
                            mb: 1,
                            bgcolor: selectedBulkUsers.has(user.contact_id) ? 'action.selected' : 'background.paper',
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' }
                          }}
                          onClick={() => toggleBulkUser(user.contact_id)}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Checkbox
                              checked={selectedBulkUsers.has(user.contact_id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleBulkUser(user.contact_id)}
                              size="small"
                            />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body2" noWrap>
                                {user.first_name} {user.last_name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {user.email}
                              </Typography>
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                              <Typography variant="body2" noWrap>{user.account_name}</Typography>
                              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                                {user.contact_is_active ? (
                                  <Chip size="small" label="Active" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                                ) : (
                                  <Chip size="small" label="Inactive" color="default" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                                )}
                                {user.lms_id && (
                                  <Chip size="small" label="In LMS" color="info" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                                )}
                              </Box>
                            </Box>
                          </Box>
                        </Card>
                      ))}
                    </Box>
                  </>
                )}
              </Box>
            )}

            {/* Paste Mode */}
            {bulkOffboardMode === 'paste' && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Paste a list of email addresses. Supports comma, semicolon, newline, or space separated.
                </Typography>
                <TextField
                  multiline
                  rows={6}
                  fullWidth
                  placeholder="user1@company.com, user2@company.com&#10;user3@company.com"
                  value={pastedEmails}
                  onChange={(e) => setPastedEmails(e.target.value)}
                  sx={{ mb: 2 }}
                />
                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                  <ActionButton
                    variant="contained"
                    onClick={parseEmailList}
                    icon={<SearchIcon />}
                  >
                    Parse Emails
                  </ActionButton>
                  {parsedEmails.length > 0 && (
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                      Found {parsedEmails.length} valid email addresses
                    </Typography>
                  )}
                </Box>

                {parsedEmails.length > 0 && (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        {selectedBulkUsers.size} of {parsedEmails.length} selected
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button size="small" onClick={selectAllBulkUsers}>
                          Select All
                        </Button>
                        {selectedBulkUsers.size > 0 && (
                          <Button size="small" onClick={clearBulkSelection}>
                            Clear
                          </Button>
                        )}
                      </Box>
                    </Box>

                    <Box sx={{ maxHeight: 300, overflowY: 'auto', mb: 3 }}>
                      {parsedEmails.map((email) => (
                        <Card
                          key={email}
                          sx={{
                            p: 1,
                            mb: 0.5,
                            bgcolor: selectedBulkUsers.has(email) ? 'action.selected' : 'background.paper',
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' }
                          }}
                          onClick={() => toggleBulkUser(email)}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Checkbox
                              checked={selectedBulkUsers.has(email)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleBulkUser(email)}
                              size="small"
                            />
                            <Typography variant="body2">{email}</Typography>
                          </Box>
                        </Card>
                      ))}
                    </Box>
                  </>
                )}
              </Box>
            )}

            {/* Partner Mode */}
            {bulkOffboardMode === 'partner' && (
              <Box>
                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                  <Autocomplete
                    options={partnersList}
                    getOptionLabel={(option) => `${option.account_name} (${option.partner_tier || 'No Tier'})`}
                    value={partnersList.find(p => p.id === bulkPartnerFilter) || null}
                    onChange={(_, newValue) => {
                      setBulkPartnerFilter(newValue?.id || null);
                      setSelectedBulkUsers(new Set());
                      if (newValue?.id) {
                        loadPartnerUsersForOffboard(newValue.id);
                      } else {
                        setPartnerUsers([]);
                      }
                    }}
                    renderInput={(params) => (
                      <TextField {...params} label="Select Partner" placeholder="Search partners..." size="small" />
                    )}
                    sx={{ flex: 1 }}
                    loading={partnerUsersLoading}
                  />
                </Box>

                {partnerUsersLoading && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <CircularProgress size={24} />
                  </Box>
                )}

                {!partnerUsersLoading && partnerUsers.length > 0 && (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        {partnerUsers.length} users in this partner
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button size="small" onClick={selectAllBulkUsers}>
                          Select All ({partnerUsers.length})
                        </Button>
                        {selectedBulkUsers.size > 0 && (
                          <Button size="small" onClick={clearBulkSelection}>
                            Clear ({selectedBulkUsers.size})
                          </Button>
                        )}
                      </Box>
                    </Box>

                    <Box sx={{ maxHeight: 400, overflowY: 'auto', mb: 3 }}>
                      {partnerUsers.map((user) => (
                        <Card
                          key={user.contact_id}
                          sx={{
                            p: 1.5,
                            mb: 1,
                            bgcolor: selectedBulkUsers.has(user.contact_id) ? 'action.selected' : 'background.paper',
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' }
                          }}
                          onClick={() => toggleBulkUser(user.contact_id)}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Checkbox
                              checked={selectedBulkUsers.has(user.contact_id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleBulkUser(user.contact_id)}
                              size="small"
                            />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body2" noWrap>
                                {user.first_name} {user.last_name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {user.email}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              {user.contact_is_active ? (
                                <Chip size="small" label="Active" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                              ) : (
                                <Chip size="small" label="Inactive" color="default" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                              )}
                              {user.lms_id && (
                                <Chip size="small" label="In LMS" color="info" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                              )}
                            </Box>
                          </Box>
                        </Card>
                      ))}
                    </Box>
                  </>
                )}

                {!partnerUsersLoading && bulkPartnerFilter && partnerUsers.length === 0 && (
                  <Alert severity="info">
                    No users found for this partner.
                  </Alert>
                )}
              </Box>
            )}

            {/* Action Bar */}
            {selectedBulkUsers.size > 0 && !bulkDeactivating && (
              <Card sx={{ p: 2, bgcolor: 'error.50', border: '1px solid', borderColor: 'error.main' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                  <Box>
                    <Typography variant="subtitle2" color="error">
                      {selectedBulkUsers.size} user(s) selected for deactivation
                    </Typography>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={bulkDeactivateInLms}
                          onChange={(e) => setBulkDeactivateInLms(e.target.checked)}
                          size="small"
                        />
                      }
                      label={<Typography variant="body2">Also deactivate in LMS (Northpass)</Typography>}
                    />
                  </Box>
                  <ActionButton
                    variant="contained"
                    color="error"
                    onClick={executeBulkDeactivation}
                    loading={bulkDeactivating}
                    icon={<PersonOffIcon />}
                  >
                    Deactivate {selectedBulkUsers.size} User(s)
                  </ActionButton>
                </Box>
              </Card>
            )}

            {/* Progress Indicator */}
            {bulkDeactivating && (
              <Card sx={{ p: 3, bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.main' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <CircularProgress size={24} color="warning" />
                  <Typography variant="subtitle1" color="warning.dark">
                    Deactivating Users...
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Progress: {bulkDeactivateProgress.current} of {bulkDeactivateProgress.total}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {bulkDeactivateProgress.total > 0
                        ? Math.round((bulkDeactivateProgress.current / bulkDeactivateProgress.total) * 100)
                        : 0}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={bulkDeactivateProgress.total > 0
                      ? (bulkDeactivateProgress.current / bulkDeactivateProgress.total) * 100
                      : 0}
                    color="warning"
                    sx={{ height: 8, borderRadius: 1 }}
                  />
                </Box>
                {bulkDeactivateProgress.currentEmail && (
                  <Typography variant="body2" color="text.secondary" noWrap>
                    Processing: {bulkDeactivateProgress.currentEmail}
                  </Typography>
                )}
              </Card>
            )}

            {/* Info */}
            <Alert severity="warning" sx={{ mt: 3 }}>
              <Typography variant="subtitle2">Bulk Deactivation Warning</Typography>
              <Typography variant="body2">
                This will permanently deactivate users in Impartner CRM (IsActive=No, Contact_Status=Inactive).
                {bulkDeactivateInLms && ' Users will also be deactivated in Northpass LMS.'}
              </Typography>
            </Alert>
          </SectionCard>
        </>
      )}

      {/* Create LMS User Dialog */}
      <Dialog open={showCreateLmsDialog} onClose={() => setShowCreateLmsDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <PersonAddIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Create User in LMS (Northpass)
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Email"
              value={createUserData.email}
              onChange={(e) => setCreateUserData({ ...createUserData, email: e.target.value })}
              fullWidth
              required
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="First Name"
                value={createUserData.firstName}
                onChange={(e) => setCreateUserData({ ...createUserData, firstName: e.target.value })}
                fullWidth
              />
              <TextField
                label="Last Name"
                value={createUserData.lastName}
                onChange={(e) => setCreateUserData({ ...createUserData, lastName: e.target.value })}
                fullWidth
              />
            </Box>
            <Autocomplete
              options={partnersList}
              getOptionLabel={(option) => `${option.account_name} (${option.partner_tier || 'No Tier'})`}
              value={partnersList.find(p => p.id === createUserData.partnerId) || null}
              onChange={(_, newValue) => setCreateUserData({ ...createUserData, partnerId: newValue?.id || null })}
              renderInput={(params) => (
                <TextField {...params} label="Partner (optional)" placeholder="Select partner to add to group" />
              )}
              isOptionEqualToValue={(option, value) => option.id === value.id}
            />
            <Alert severity="info" sx={{ mt: 1 }}>
              Creating a user in LMS will:
              <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                <li>Create account in Northpass</li>
                {createUserData.partnerId && <li>Add to partner's LMS group</li>}
                {createUserData.partnerId && <li>Add to "All Partners" group</li>}
              </ul>
            </Alert>
            {createUserResult && (
              <Alert severity={createUserResult.success ? 'success' : 'error'}>
                {createUserResult.message}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateLmsDialog(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={createLmsUser}
            disabled={!createUserData.email || creatingUser}
            startIcon={creatingUser ? <CircularProgress size={16} /> : <PersonAddIcon />}
          >
            {creatingUser ? 'Creating...' : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create CRM Contact Dialog */}
      <Dialog open={showCreateCrmDialog} onClose={() => setShowCreateCrmDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <PersonAddIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Create Contact in CRM (Database)
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Email"
              value={createUserData.email}
              onChange={(e) => setCreateUserData({ ...createUserData, email: e.target.value })}
              fullWidth
              required
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="First Name"
                value={createUserData.firstName}
                onChange={(e) => setCreateUserData({ ...createUserData, firstName: e.target.value })}
                fullWidth
              />
              <TextField
                label="Last Name"
                value={createUserData.lastName}
                onChange={(e) => setCreateUserData({ ...createUserData, lastName: e.target.value })}
                fullWidth
              />
            </Box>
            <TextField
              label="Title"
              value={createUserData.title}
              onChange={(e) => setCreateUserData({ ...createUserData, title: e.target.value })}
              fullWidth
            />
            <Autocomplete
              options={partnersList}
              getOptionLabel={(option) => `${option.account_name} (${option.partner_tier || 'No Tier'})`}
              value={partnersList.find(p => p.id === createUserData.partnerId) || null}
              onChange={(_, newValue) => setCreateUserData({ ...createUserData, partnerId: newValue?.id || null })}
              renderInput={(params) => (
                <TextField {...params} label="Partner" placeholder="Select partner company" />
              )}
              isOptionEqualToValue={(option, value) => option.id === value.id}
            />
            {createUserResult && (
              <Alert severity={createUserResult.success ? 'success' : 'error'}>
                {createUserResult.message}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateCrmDialog(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={createCrmContact}
            disabled={!createUserData.email || creatingUser}
            startIcon={creatingUser ? <CircularProgress size={16} /> : <PersonAddIcon />}
          >
            {creatingUser ? 'Creating...' : 'Create Contact'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add to Group Dialog */}
      <Dialog open={showAddToGroupDialog} onClose={() => setShowAddToGroupDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <GroupAddIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Add User to LMS Group
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            {dialogGroupsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <Autocomplete
                options={dialogGroupsList}
                getOptionLabel={(option) => option?.name || ''}
                value={selectedGroupToAdd}
                onChange={(_, newValue) => setSelectedGroupToAdd(newValue)}
                renderInput={(params) => (
                  <TextField {...params} label="Select Group" placeholder="Search for a group..." />
                )}
                isOptionEqualToValue={(option, value) => option?.id === value?.id}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddToGroupDialog(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={addUserToGroupAction}
            disabled={!selectedGroupToAdd || addingToGroup || dialogGroupsLoading}
            startIcon={addingToGroup ? <CircularProgress size={16} /> : <GroupAddIcon />}
          >
            {addingToGroup ? 'Adding...' : 'Add to Group'}
          </Button>
        </DialogActions>
      </Dialog>

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
