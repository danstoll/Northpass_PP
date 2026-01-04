import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import './GroupAnalysis.css';
import northpassApi from '../services/northpassApi';
import { 
  getAccountSummary, 
  getDatabaseStats,
  storeGroupsCache,
  getCachedGroups,
  getGroupsCacheMetadata,
  hasValidGroupsCache,
  clearGroupsCache,
  removeGroupFromCache,
  removeGroupsFromCache,
  getContactsByAccount
} from '../services/partnerDatabase';
import NintexButton from './NintexButton';

// Common personal/public email domains to exclude from group analysis
const EXCLUDED_EMAIL_DOMAINS = new Set([
  // Gmail/Google
  'gmail.com', 'googlemail.com', 'google.com',
  // Microsoft
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.es', 'hotmail.it',
  'outlook.com', 'outlook.co.uk', 'outlook.fr', 'outlook.de', 'outlook.es', 'outlook.it',
  'msn.com', 'live.com', 'live.co.uk', 'live.fr', 'live.de',
  // Yahoo
  'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it', 'yahoo.ca',
  'ymail.com', 'rocketmail.com',
  // Apple
  'icloud.com', 'me.com', 'mac.com',
  // AOL
  'aol.com', 'aim.com',
  // Other common providers
  'protonmail.com', 'proton.me', 'zoho.com', 'mail.com', 'gmx.com', 'gmx.net', 'gmx.de',
  'web.de', 'freenet.de', 't-online.de', 'orange.fr', 'wanadoo.fr', 'laposte.net',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'cox.net', 'charter.net',
  // Temporary/disposable
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com'
]);

// Helper to check if a domain should be excluded
const isExcludedDomain = (domain) => {
  if (!domain) return true;
  const lowerDomain = domain.toLowerCase();
  return EXCLUDED_EMAIL_DOMAINS.has(lowerDomain);
};

// Helper function for fuzzy matching
const normalizeString = (str) => {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
    .trim();
};

const calculateSimilarity = (str1, str2) => {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    const longer = Math.max(s1.length, s2.length);
    const shorter = Math.min(s1.length, s2.length);
    return shorter / longer;
  }
  
  // Simple word overlap
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const allWords = new Set([...words1, ...words2]);
  const commonWords = words1.filter(w => words2.includes(w)).length;
  
  return commonWords / allWords.size;
};

// Edit Group Modal
const EditGroupModal = ({ isOpen, onClose, group, partnerAccounts, onSave, onDelete }) => {
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && group) {
      setNewName(group.attributes?.name || '');
      setSearchTerm('');
      setShowDeleteConfirm(false);
    }
  }, [isOpen, group]);

  const filteredAccounts = useMemo(() => {
    if (!partnerAccounts) return [];
    if (!searchTerm) return partnerAccounts.slice(0, 20);
    const term = searchTerm.toLowerCase();
    return partnerAccounts
      .filter(a => a.accountName.toLowerCase().includes(term))
      .slice(0, 20);
  }, [searchTerm, partnerAccounts]);

  const handleSave = async () => {
    if (!newName.trim() || newName === group.attributes?.name) {
      onClose();
      return;
    }
    
    setSaving(true);
    try {
      await onSave(group.id, newName.trim());
      onClose();
    } catch (error) {
      alert('Failed to update group: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(group.id);
      onClose();
    } catch (error) {
      alert('Failed to delete group: ' + error.message);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const selectAccount = (accountName) => {
    setNewName(accountName);
    setSearchTerm('');
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content edit-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>✏️ Edit Group</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-body">
          <div className="edit-form">
            <label>Current Name:</label>
            <div className="current-name">{group?.attributes?.name}</div>
            
            <label>New Name:</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter new group name..."
              className="name-input"
            />
            
            {partnerAccounts && partnerAccounts.length > 0 && (
              <>
                <label>Or select from Partner Database:</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search partner accounts..."
                  className="search-input"
                />
                
                <div className="account-suggestions">
                  {filteredAccounts.map((account, idx) => (
                    <button
                      key={idx}
                      className="account-suggestion"
                      onClick={() => selectAccount(account.accountName)}
                    >
                      <span className="account-name">{account.accountName}</span>
                      <span className={`tier-badge tier-${(account.partnerTier || '').toLowerCase().replace(' ', '-')}`}>
                        {account.partnerTier}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
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
                  disabled={saving || !newName.trim() || newName === group?.attributes?.name}
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
};

// Create Group Modal - for creating a new group from a partner
const CreateGroupModal = ({ partner, onClose, onCreate, creating, progress }) => {
  const [useDomainSearch, setUseDomainSearch] = useState(false);
  const [domain, setDomain] = useState('');
  const [previewUsers, setPreviewUsers] = useState(null);
  const [crmContacts, setCrmContacts] = useState([]);
  const [matchedLmsUsers, setMatchedLmsUsers] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCrmMatch, setLoadingCrmMatch] = useState(true);
  
  // Load CRM contacts and check which exist in LMS on mount
  useEffect(() => {
    const loadCrmContacts = async () => {
      setLoadingCrmMatch(true);
      try {
        // Get CRM contacts for this partner
        const contacts = await getContactsByAccount(partner.accountName);
        setCrmContacts(contacts);
        
        if (contacts.length > 0) {
          // Check which CRM contacts exist in the LMS
          const matchedUsers = [];
          const batchSize = 5; // Process in batches to avoid rate limiting
          
          for (let i = 0; i < contacts.length; i += batchSize) {
            const batch = contacts.slice(i, i + batchSize);
            const results = await Promise.all(
              batch.map(async (contact) => {
                try {
                  const user = await northpassApi.getCurrentUser(contact.email);
                  if (user) {
                    return {
                      ...user,
                      crmContact: contact
                    };
                  }
                  return null;
                } catch {
                  return null;
                }
              })
            );
            matchedUsers.push(...results.filter(Boolean));
            
            // Small delay between batches
            if (i + batchSize < contacts.length) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
          
          setMatchedLmsUsers(matchedUsers);
        }
      } catch (error) {
        console.error('Error loading CRM contacts:', error);
      } finally {
        setLoadingCrmMatch(false);
      }
    };
    
    loadCrmContacts();
  }, [partner.accountName]);
  
  const handlePreviewDomain = async () => {
    if (!domain.trim()) return;
    
    setLoadingPreview(true);
    try {
      const users = await northpassApi.searchUsersByEmailDomain(domain.trim());
      setPreviewUsers(users);
    } catch (error) {
      console.error('Error previewing users:', error);
      alert('Failed to search users: ' + error.message);
    } finally {
      setLoadingPreview(false);
    }
  };
  
  const handleCreate = () => {
    if (useDomainSearch) {
      if (!domain.trim()) {
        alert('Please enter a domain');
        return;
      }
      onCreate(partner, { mode: 'domain', domain: domain.trim() });
    } else {
      // Use CRM-matched users
      onCreate(partner, { mode: 'crm', users: matchedLmsUsers });
    }
  };
  
  const usersToAdd = useDomainSearch ? previewUsers : matchedLmsUsers;
  const canCreate = useDomainSearch ? domain.trim() : true; // Can always create with CRM mode (even with 0 users)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content create-group-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>➕ Create Group for Partner</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-body">
          <div className="partner-summary">
            <h3>{partner.accountName}</h3>
            <div className="partner-meta">
              <span className={`tier-badge tier-${(partner.partnerTier || '').toLowerCase().replace(/\s+/g, '-')}`}>
                {partner.partnerTier || 'Unknown'}
              </span>
              <span>{partner.contactCount} contacts in CRM</span>
              <span>{partner.accountRegion || 'Unknown region'}</span>
            </div>
          </div>
          
          {/* CRM Contacts Match Section (Default) */}
          {!useDomainSearch && (
            <div className="crm-match-section">
              <h4>📋 CRM Contacts in LMS</h4>
              <p className="helper-text">
                Checking which of your {crmContacts.length} CRM contacts already exist in the LMS...
              </p>
              
              {loadingCrmMatch ? (
                <div className="loading-preview">
                  <span className="spinner">🔄</span> Checking CRM contacts against LMS...
                </div>
              ) : (
                <div className="preview-results">
                  <h4>
                    {matchedLmsUsers.length > 0 
                      ? `✅ Found ${matchedLmsUsers.length} of ${crmContacts.length} CRM contacts in LMS`
                      : `❌ No CRM contacts found in LMS (0 of ${crmContacts.length})`
                    }
                  </h4>
                  {matchedLmsUsers.length > 0 && (
                    <div className="preview-users-list">
                      {matchedLmsUsers.slice(0, 10).map(user => (
                        <div key={user.id} className="preview-user">
                          <span className="user-name">{user.attributes?.first_name} {user.attributes?.last_name}</span>
                          <span className="user-email">{user.attributes?.email}</span>
                        </div>
                      ))}
                      {matchedLmsUsers.length > 10 && (
                        <div className="preview-more">
                          ...and {matchedLmsUsers.length - 10} more users
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Domain Search Toggle */}
          <div className="search-mode-toggle">
            <label className="toggle-checkbox">
              <input
                type="checkbox"
                checked={useDomainSearch}
                onChange={(e) => {
                  setUseDomainSearch(e.target.checked);
                  setPreviewUsers(null);
                }}
                disabled={creating}
              />
              <span>🔍 Search by email domain instead</span>
            </label>
            <p className="helper-text-small">
              Use this for partners where ALL users with a domain should be added (single-office companies)
            </p>
          </div>
          
          {/* Domain Search Section (Optional) */}
          {useDomainSearch && (
            <div className="domain-input-section">
              <label>Email Domain to Match Users:</label>
              <p className="helper-text">
                ⚠️ This will add ALL LMS users with this domain, regardless of office/location.
              </p>
              <div className="domain-input-row">
                <span className="domain-prefix">@</span>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => {
                    setDomain(e.target.value.replace('@', ''));
                    setPreviewUsers(null);
                  }}
                  placeholder="company.com"
                  className="domain-input"
                  disabled={creating}
                />
                <NintexButton 
                  variant="secondary" 
                  onClick={handlePreviewDomain}
                  disabled={!domain.trim() || loadingPreview || creating}
                >
                  {loadingPreview ? '🔄 Searching...' : '🔍 Preview'}
                </NintexButton>
              </div>
              
              {previewUsers !== null && (
                <div className="preview-results">
                  <h4>
                    {previewUsers.length > 0 
                      ? `Found ${previewUsers.length} users with @${domain}`
                      : `No users found with @${domain}`
                    }
                  </h4>
                  {previewUsers.length > 0 && (
                    <div className="preview-users-list">
                      {previewUsers.slice(0, 10).map(user => (
                        <div key={user.id} className="preview-user">
                          <span className="user-name">{user.attributes?.first_name} {user.attributes?.last_name}</span>
                          <span className="user-email">{user.attributes?.email}</span>
                        </div>
                      ))}
                      {previewUsers.length > 10 && (
                        <div className="preview-more">
                          ...and {previewUsers.length - 10} more users
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {creating && (
            <div className="create-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
              </div>
              <p>{progress.stage}</p>
            </div>
          )}
          
          <div className="modal-actions">
            <NintexButton variant="secondary" onClick={onClose} disabled={creating}>
              Cancel
            </NintexButton>
            <NintexButton 
              variant="primary" 
              onClick={handleCreate}
              disabled={creating || !canCreate || loadingCrmMatch}
            >
              {creating 
                ? '🔄 Creating...' 
                : `➕ Create Group${usersToAdd?.length ? ` (${usersToAdd.length} users)` : ''}`
              }
            </NintexButton>
          </div>
        </div>
      </div>
    </div>
  );
};

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

  return ReactDOM.createPortal(
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
              {addResults.error ? (
                <>
                  <h3>❌ Error Adding Users</h3>
                  <p className="error-message">{addResults.error}</p>
                </>
              ) : addResults.primaryGroup?.failed > 0 && addResults.primaryGroup?.success === 0 ? (
                <>
                  <h3>❌ Failed to Add Users</h3>
                  <p className="error-message">
                    {addResults.primaryGroup?.error ? 
                      JSON.stringify(addResults.primaryGroup.error) : 
                      'Unknown error - check browser console for details'}
                  </p>
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
    </div>,
    document.body
  );
};

// Modal Component for CRM contacts missing from LMS
const CrmContactsModal = ({
  isOpen,
  onClose,
  contacts,
  groupName,
  groupId,
  onAddContacts
}) => {
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [addProgress, setAddProgress] = useState({ current: 0, total: 0, stage: '' });
  const [addResults, setAddResults] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedContacts([]);
      setAddResults(null);
    }
  }, [isOpen]);

  const toggleContact = (email) => {
    setSelectedContacts(prev =>
      prev.includes(email)
        ? prev.filter(e => e !== email)
        : [...prev, email]
    );
  };

  const selectAll = () => {
    setSelectedContacts(contacts.map(c => c.email));
  };

  const selectNone = () => {
    setSelectedContacts([]);
  };

  const handleAddContacts = async () => {
    if (selectedContacts.length === 0) return;

    setIsAdding(true);
    setAddProgress({ current: 0, total: selectedContacts.length, stage: 'Creating users...' });

    const results = {
      created: 0,
      addedToGroup: 0,
      addedToAllPartners: 0,
      failed: 0,
      errors: []
    };

    try {
      // Get the selected contact objects
      const contactsToAdd = contacts.filter(c => selectedContacts.includes(c.email));

      // Step 1: Create users in LMS
      const createdUserIds = [];
      for (let i = 0; i < contactsToAdd.length; i++) {
        const contact = contactsToAdd[i];
        setAddProgress({ 
          current: i + 1, 
          total: contactsToAdd.length, 
          stage: `Creating user ${i + 1}/${contactsToAdd.length}...` 
        });

        try {
          const result = await northpassApi.createPerson({
            email: contact.email,
            firstName: contact.firstName || contact.email.split('@')[0],
            lastName: contact.lastName || ''
          });

          if (result.success && result.user?.id) {
            results.created++;
            createdUserIds.push(result.user.id);
          } else {
            results.failed++;
            results.errors.push({ email: contact.email, error: result.error || 'Unknown error' });
          }
        } catch (error) {
          results.failed++;
          results.errors.push({ email: contact.email, error: error.message });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Step 2: Add created users to the group
      if (createdUserIds.length > 0 && groupId) {
        setAddProgress({ 
          current: 0, 
          total: createdUserIds.length, 
          stage: 'Adding users to group...' 
        });

        const groupResults = await northpassApi.addUsersToGroups(
          groupId,
          createdUserIds,
          true, // Add to All Partners group
          (current, total) => {
            setAddProgress({ current, total, stage: `Adding to group ${current}/${total}...` });
          }
        );

        results.addedToGroup = groupResults.primaryGroup?.success || 0;
        results.addedToAllPartners = groupResults.allPartnersGroup?.success || 0;
      }

      setAddResults(results);
      onAddContacts(results);

    } catch (error) {
      console.error('Error adding contacts:', error);
      setAddResults({ ...results, error: error.message });
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content crm-contacts-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📋 CRM Contacts Not in LMS</h2>
          <p className="modal-subtitle">
            Found {contacts.length} CRM contacts without LMS accounts
          </p>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {addResults ? (
            <div className="add-results">
              {addResults.error ? (
                <>
                  <h3>❌ Error Creating Users</h3>
                  <p className="error-message">{addResults.error}</p>
                </>
              ) : (
                <h3>✅ Users Created Successfully</h3>
              )}
              <div className="results-grid">
                <div className="result-item">
                  <span className="result-label">Created in LMS:</span>
                  <span className="result-value success">{addResults.created}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Added to {groupName}:</span>
                  <span className="result-value success">{addResults.addedToGroup}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Added to All Partners:</span>
                  <span className="result-value success">{addResults.addedToAllPartners}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Failed:</span>
                  <span className="result-value error">{addResults.failed}</span>
                </div>
              </div>
              {addResults.errors?.length > 0 && (
                <div className="error-details">
                  <h4>Errors:</h4>
                  <ul>
                    {addResults.errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>{err.email}: {err.error}</li>
                    ))}
                    {addResults.errors.length > 5 && (
                      <li>...and {addResults.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
              <NintexButton variant="primary" onClick={onClose}>
                Close
              </NintexButton>
            </div>
          ) : isAdding ? (
            <div className="adding-progress">
              <div className="progress-spinner"></div>
              <p>{addProgress.stage}</p>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${addProgress.total > 0 ? (addProgress.current / addProgress.total) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          ) : (
            <>
              <div className="info-banner">
                <span className="info-icon">ℹ️</span>
                <p>These CRM contacts will be invited to the LMS and automatically added to "{groupName}" and "All Partners" groups.</p>
              </div>

              <div className="selection-controls">
                <button onClick={selectAll} className="selection-btn">Select All</button>
                <button onClick={selectNone} className="selection-btn">Select None</button>
                <span className="selection-count">
                  {selectedContacts.length} of {contacts.length} selected
                </span>
              </div>

              <div className="users-list-modal">
                {contacts.map(contact => (
                  <label key={contact.email} className="user-item-modal">
                    <input
                      type="checkbox"
                      checked={selectedContacts.includes(contact.email)}
                      onChange={() => toggleContact(contact.email)}
                    />
                    <div className="user-info-modal">
                      <span className="user-name">
                        {contact.firstName || contact.lastName 
                          ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
                          : contact.email.split('@')[0]
                        }
                      </span>
                      <span className="user-email">{contact.email}</span>
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
                  onClick={handleAddContacts}
                  disabled={selectedContacts.length === 0}
                >
                  ➕ Create {selectedContacts.length} Users in LMS
                </NintexButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// Group Card Component with matching info and selection
const GroupCard = ({ 
  group, 
  matchInfo, 
  onAnalyze, 
  isAnalyzing, 
  analysisResult,
  onEdit,
  isSelected,
  onToggleSelect,
  selectionMode,
  onAnalysisUpdated
}) => {
  const [showModal, setShowModal] = useState(false);
  const [showCrmModal, setShowCrmModal] = useState(false);
  
  const handleAddUsers = (results) => {
    console.log('Users added:', results);
    // Trigger re-analysis if users were added
    if (results.primaryGroup?.success > 0) {
      onAnalysisUpdated && onAnalysisUpdated(group.id);
    }
  };

  const handleAddContacts = (results) => {
    console.log('Contacts added to LMS:', results);
    // Trigger re-analysis if contacts were created
    if (results.created > 0) {
      onAnalysisUpdated && onAnalysisUpdated(group.id);
    }
  };

  const getMatchBadge = () => {
    if (!matchInfo) return null;
    
    if (matchInfo.exactMatch) {
      return <span className="match-badge exact">✅ Matched</span>;
    } else if (matchInfo.closeMatches.length > 0) {
      return <span className="match-badge close">🔶 Similar</span>;
    } else {
      return <span className="match-badge none">❌ No Match</span>;
    }
  };

  return (
    <div className={`group-card ${matchInfo?.exactMatch ? 'matched' : matchInfo?.closeMatches?.length > 0 ? 'close-match' : 'unmatched'} ${isSelected ? 'selected' : ''}`}>
      <div className="group-card-header">
        {selectionMode && (
          <input 
            type="checkbox" 
            className="header-checkbox"
            checked={isSelected} 
            onChange={() => onToggleSelect(group.id)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <div className="header-left">
          <h3>{group.attributes?.name || 'Unknown Group'}</h3>
          {getMatchBadge()}
        </div>
        <div className="header-right">
          <button className="edit-btn" onClick={() => onEdit(group)} title="Edit or Delete Group">
            ✏️
          </button>
        </div>
      </div>
      
      {/* Match Info */}
      {matchInfo && !matchInfo.exactMatch && matchInfo.closeMatches.length > 0 && (
        <div className="close-matches">
          <span className="close-matches-label">Similar:</span>
          {matchInfo.closeMatches.slice(0, 2).map((match, idx) => (
            <span key={idx} className="close-match-item" title={`${Math.round(match.similarity * 100)}% similar`}>
              {match.accountName.length > 30 ? match.accountName.substring(0, 30) + '...' : match.accountName}
            </span>
          ))}
        </div>
      )}

      {matchInfo?.exactMatch && (
        <div className="match-details">
          <span className={`tier-badge tier-${(matchInfo.exactMatch.partnerTier || '').toLowerCase().replace(' ', '-')}`}>
            {matchInfo.exactMatch.partnerTier}
          </span>
          <span className="contact-count">{matchInfo.exactMatch.contactCount} contacts</span>
          <span className="region">{matchInfo.exactMatch.accountRegion}</span>
        </div>
      )}
      
      <div className="group-card-body">
        {analysisResult ? (
          <div className="analysis-result">
            <div className="analysis-stats">
              <div className="stat">
                <span className="stat-value">{analysisResult.memberCount ?? 0}</span>
                <span className="stat-label">Members</span>
              </div>
              <div className="stat">
                <span className="stat-value">{analysisResult.domains?.length ?? 0}</span>
                <span className="stat-label">Domains</span>
              </div>
              <div className="stat highlight">
                <span className="stat-value">{analysisResult.potentialUsers?.length ?? 0}</span>
                <span className="stat-label">Missing Users</span>
              </div>
              {analysisResult.crmContactsNotInLms?.length > 0 && (
                <div className="stat warning">
                  <span className="stat-value">{analysisResult.crmContactsNotInLms.length}</span>
                  <span className="stat-label">CRM Not in LMS</span>
                </div>
              )}
            </div>
            
            {analysisResult.domains?.length > 0 && (
              <div className="domains-list">
                <strong>Domains:</strong> {analysisResult.domains.join(', ')}
              </div>
            )}
            
            <div className="analysis-actions">
              {analysisResult.potentialUsers?.length > 0 ? (
                <NintexButton 
                  variant="primary" 
                  size="small"
                  onClick={() => setShowModal(true)}
                >
                  👥 View {analysisResult.potentialUsers.length} Missing Users
                </NintexButton>
              ) : (
                <p className="no-missing">✅ No missing LMS users</p>
              )}
              
              {analysisResult.crmContactsNotInLms?.length > 0 && (
                <NintexButton 
                  variant="secondary" 
                  size="small"
                  onClick={() => setShowCrmModal(true)}
                >
                  📋 Add {analysisResult.crmContactsNotInLms.length} CRM Contacts to LMS
                </NintexButton>
              )}
            </div>
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

      <CrmContactsModal
        isOpen={showCrmModal}
        onClose={() => setShowCrmModal(false)}
        contacts={analysisResult?.crmContactsNotInLms || []}
        groupName={group.attributes?.name || 'Unknown'}
        groupId={group.id}
        onAddContacts={handleAddContacts}
      />
    </div>
  );
};

const GroupAnalysis = () => {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [partnerAccounts, setPartnerAccounts] = useState([]);
  const [hasPartnerData, setHasPartnerData] = useState(false);
  const [matchResults, setMatchResults] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // all, matched, unmatched, close, empty, hasUsers
  const [analysisResults, setAnalysisResults] = useState({});
  const [analyzingGroupId, setAnalyzingGroupId] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  
  // Cache state
  const [cacheMetadata, setCacheMetadata] = useState(null);
  
  // Progress for bulk analysis
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  
  // Selection state for bulk operations
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  
  // Bulk delete state
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState({ current: 0, total: 0 });
  
  // Merge state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState({ stage: '', current: 0, total: 0 });
  const [mergeTargetId, setMergeTargetId] = useState('');
  
  // View mode: 'groups' or 'missingPartners'
  const [viewMode, setViewMode] = useState('groups');
  
  // Create group modal state
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [createGroupPartner, setCreateGroupPartner] = useState(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [createProgress, setCreateProgress] = useState({ stage: '', current: 0, total: 0 });
  
  // Missing partners search and sort
  const [missingPartnersSearch, setMissingPartnersSearch] = useState('');
  const [missingPartnersSort, setMissingPartnersSort] = useState('name'); // name, tier, region

  // Load groups - try cache first, then API
  const loadData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      let allGroups;
      
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const hasCache = await hasValidGroupsCache(60); // 60 minute cache
        if (hasCache) {
          console.log('📦 Loading groups from cache...');
          const cached = await getCachedGroups();
          if (cached.length > 0) {
            allGroups = cached;
            const meta = await getGroupsCacheMetadata();
            setCacheMetadata(meta);
          }
        }
      }
      
      // If no cache or force refresh, load from API
      if (!allGroups) {
        console.log('🌐 Loading groups from API...');
        allGroups = await northpassApi.getAllGroups();
        // Store in cache (without user counts initially)
        await storeGroupsCache(allGroups, {});
        const meta = await getGroupsCacheMetadata();
        setCacheMetadata(meta);
      }
      
      const sorted = allGroups.sort((a, b) => 
        (a.attributes?.name || '').localeCompare(b.attributes?.name || '')
      );
      setGroups(sorted);
      
      // Load partner database
      const dbStats = await getDatabaseStats();
      if (dbStats?.lastImport) {
        setHasPartnerData(true);
        const accounts = await getAccountSummary();
        setPartnerAccounts(accounts);
        
        // Match groups to accounts
        // Handle ptr_ prefix: groups may be named "ptr_AccountName"
        const matches = {};
        sorted.forEach(group => {
          const groupName = group.attributes?.name || '';
          const normalizedGroupName = normalizeString(groupName);
          
          // Remove ptr_ prefix for matching if present
          const groupNameWithoutPrefix = groupName.startsWith('ptr_') 
            ? groupName.substring(4) 
            : groupName;
          const normalizedGroupNameWithoutPrefix = normalizeString(groupNameWithoutPrefix);
          
          // Find exact match (try both with and without ptr_ prefix)
          const exactMatch = accounts.find(a => {
            const normalizedAccount = normalizeString(a.accountName);
            return normalizedAccount === normalizedGroupName || 
                   normalizedAccount === normalizedGroupNameWithoutPrefix;
          });
          
          // Find close matches if no exact
          let closeMatches = [];
          if (!exactMatch) {
            closeMatches = accounts
              .map(a => ({
                ...a,
                // Calculate similarity using name without ptr_ prefix
                similarity: Math.max(
                  calculateSimilarity(groupName, a.accountName),
                  calculateSimilarity(groupNameWithoutPrefix, a.accountName)
                )
              }))
              .filter(a => a.similarity >= 0.4)
              .sort((a, b) => b.similarity - a.similarity)
              .slice(0, 5);
          }
          
          matches[group.id] = {
            exactMatch,
            closeMatches
          };
        });
        setMatchResults(matches);
      } else {
        setHasPartnerData(false);
        setPartnerAccounts([]);
        setMatchResults({});
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter groups
  const filteredGroups = useMemo(() => {
    let filtered = groups;
    
    // Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(g => 
        (g.attributes?.name || '').toLowerCase().includes(term)
      );
    }
    
    // Apply partner match filters
    if (filterMode !== 'all' && hasPartnerData) {
      filtered = filtered.filter(g => {
        const match = matchResults[g.id];
        if (!match) return filterMode === 'unmatched';
        
        if (filterMode === 'matched') return match.exactMatch;
        if (filterMode === 'unmatched') return !match.exactMatch && match.closeMatches.length === 0;
        if (filterMode === 'close') return !match.exactMatch && match.closeMatches.length > 0;
        return true;
      });
    }
    
    return filtered;
  }, [groups, searchTerm, filterMode, matchResults, hasPartnerData]);

  const analyzeGroup = async (group) => {
    setAnalyzingGroupId(group.id);
    
    try {
      const members = await northpassApi.getGroupUsers(group.id);
      
      // Extract domains and filter out personal/public email domains
      const allDomains = [...new Set(
        members
          .map(m => m.attributes?.email?.split('@')[1])
          .filter(Boolean)
          .map(d => d.toLowerCase())
      )];
      
      // Filter out excluded domains (gmail, hotmail, outlook, etc.)
      const domains = allDomains.filter(d => !isExcludedDomain(d));
      const excludedCount = allDomains.length - domains.length;
      
      if (excludedCount > 0) {
        console.log(`📧 Excluded ${excludedCount} personal email domains (gmail, hotmail, etc.) from analysis`);
      }
      
      const memberIds = new Set(members.map(m => m.id));
      const memberEmails = new Set(members.map(m => m.attributes?.email?.toLowerCase()).filter(Boolean));
      
      let potentialUsers = [];
      if (domains.length > 0) {
        potentialUsers = await northpassApi.searchUsersByEmailDomains(domains, memberIds);
        
        // Also filter out any users with excluded domains from the results
        potentialUsers = potentialUsers.filter(u => !isExcludedDomain(u.email?.split('@')[1]));
      }
      
      // Check for CRM contacts not in LMS (only if we have a matched partner)
      let crmContactsNotInLms = [];
      const matchInfo = matchResults[group.id];
      if (matchInfo?.exactMatch) {
        try {
          // Get CRM contacts for this partner
          const crmContacts = await getContactsByAccount(matchInfo.exactMatch.accountName);
          
          if (crmContacts.length > 0) {
            // Check which CRM emails exist in LMS
            for (const contact of crmContacts) {
              if (!contact.email) continue;
              const emailLower = contact.email.toLowerCase();
              
              // Skip excluded domains
              const domain = emailLower.split('@')[1];
              if (isExcludedDomain(domain)) continue;
              
              // Skip if already a member
              if (memberEmails.has(emailLower)) continue;
              
              // Check if this email exists in LMS
              try {
                const lmsUser = await northpassApi.getCurrentUser(emailLower);
                if (!lmsUser) {
                  // User doesn't exist in LMS
                  crmContactsNotInLms.push({
                    email: contact.email,
                    firstName: contact['First Name'] || contact.firstName || '',
                    lastName: contact['Last Name'] || contact.lastName || '',
                    title: contact['Title'] || contact.title || ''
                  });
                }
              } catch {
                // If lookup fails, assume user doesn't exist
                crmContactsNotInLms.push({
                  email: contact.email,
                  firstName: contact['First Name'] || contact.firstName || '',
                  lastName: contact['Last Name'] || contact.lastName || '',
                  title: contact['Title'] || contact.title || ''
                });
              }
              
              // Small delay to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            console.log(`📋 Found ${crmContactsNotInLms.length} CRM contacts not in LMS for ${matchInfo.exactMatch.accountName}`);
          }
        } catch (error) {
          console.error('Error checking CRM contacts:', error);
        }
      }
      
      setAnalysisResults(prev => ({
        ...prev,
        [group.id]: { 
          memberCount: members.length, 
          domains, 
          potentialUsers,
          crmContactsNotInLms
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
          potentialUsers: [],
          crmContactsNotInLms: []
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
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setBulkAnalyzing(false);
  };

  const handleUpdateGroup = async (groupId, newName) => {
    await northpassApi.updateGroupName(groupId, newName);
    setEditingGroup(null);
    await clearGroupsCache(); // Clear cache so it reloads
    await loadData(true); // Force refresh
  };

  const handleDeleteGroup = async (groupId) => {
    await northpassApi.deleteGroup(groupId);
    await removeGroupFromCache(groupId);
    setEditingGroup(null);
    // Just remove from local state instead of reloading
    setGroups(prev => prev.filter(g => g.id !== groupId));
  };

  // Selection handlers
  const toggleGroupSelection = (groupId) => {
    setSelectedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const selectAllVisible = () => {
    setSelectedGroups(new Set(filteredGroups.map(g => g.id)));
  };

  const clearSelection = () => {
    setSelectedGroups(new Set());
    setSelectionMode(false);
  };

  const toggleSelectionMode = () => {
    if (selectionMode) {
      clearSelection();
    } else {
      setSelectionMode(true);
    }
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (selectedGroups.size === 0) return;
    
    const groupIdsToDelete = [...selectedGroups];
    
    setBulkDeleting(true);
    setBulkDeleteProgress({ current: 0, total: selectedGroups.size });
    
    try {
      const result = await northpassApi.deleteMultipleGroups(
        groupIdsToDelete,
        (current, total) => setBulkDeleteProgress({ current, total })
      );
      
      // Remove from cache
      await removeGroupsFromCache(groupIdsToDelete);
      
      // Remove from local state
      setGroups(prev => prev.filter(g => !groupIdsToDelete.includes(g.id)));
      
      alert(`Deleted ${result.deleted} groups${result.failed > 0 ? `, ${result.failed} failed` : ''}`);
      clearSelection();
    } catch (error) {
      alert('Bulk delete failed: ' + error.message);
    } finally {
      setBulkDeleting(false);
      setShowBulkDeleteConfirm(false);
    }
  };

  // Merge handler
  const handleMergeGroups = async () => {
    if (selectedGroups.size < 2 || !mergeTargetId) return;
    
    const sourceIds = [...selectedGroups].filter(id => id !== mergeTargetId);
    
    if (sourceIds.length === 0) {
      alert('Select at least one group to merge into the target.');
      return;
    }
    
    setMerging(true);
    setMergeProgress({ stage: 'starting', current: 0, total: 0 });
    
    try {
      const result = await northpassApi.mergeGroups(
        mergeTargetId,
        sourceIds,
        (stage, current, total) => setMergeProgress({ stage, current, total })
      );
      
      // Remove merged groups from cache
      await removeGroupsFromCache(sourceIds);
      
      // Remove from local state
      setGroups(prev => prev.filter(g => !sourceIds.includes(g.id)));
      
      alert(`Merge complete: ${result.usersMoved} users moved, ${result.groupsDeleted} groups deleted${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`);
      clearSelection();
      setShowMergeModal(false);
      setMergeTargetId('');
      await loadData();
    } catch (error) {
      alert('Merge failed: ' + error.message);
    } finally {
      setMerging(false);
    }
  };

  // Get selected group objects for display
  const selectedGroupObjects = useMemo(() => {
    return groups.filter(g => selectedGroups.has(g.id));
  }, [groups, selectedGroups]);

  // Summary statistics
  const stats = useMemo(() => {
    const analyzed = Object.values(analysisResults);
    const totalMissing = analyzed.reduce((sum, r) => sum + (r.potentialUsers?.length || 0), 0);
    const groupsWithMissing = analyzed.filter(r => (r.potentialUsers?.length || 0) > 0).length;
    
    const matched = Object.values(matchResults).filter(m => m.exactMatch).length;
    const closeMatch = Object.values(matchResults).filter(m => !m.exactMatch && m.closeMatches.length > 0).length;
    const unmatched = groups.length - matched - closeMatch;
    
    return {
      totalGroups: groups.length,
      analyzedGroups: analyzed.length,
      totalMissing,
      groupsWithMissing,
      matched,
      closeMatch,
      unmatched
    };
  }, [groups, analysisResults, matchResults]);

  // Compute partners without groups
  const partnersWithoutGroups = useMemo(() => {
    if (!hasPartnerData || partnerAccounts.length === 0) return [];
    
    // Get all group names (normalized) - also store versions without ptr_ prefix
    const groupNames = new Set();
    groups.forEach(g => {
      const name = g.attributes?.name || '';
      const normalized = normalizeString(name);
      groupNames.add(normalized);
      // Also add version without ptr_ prefix
      if (name.toLowerCase().startsWith('ptr_')) {
        groupNames.add(normalizeString(name.substring(4)));
      }
    });
    
    // Find partners that don't have a matching group
    return partnerAccounts
      .filter(partner => {
        const normalizedName = normalizeString(partner.accountName);
        // Check for exact match (with or without ptr_ prefix)
        if (groupNames.has(normalizedName)) return false;
        // Check if any group name is very similar
        for (const groupName of groupNames) {
          if (calculateSimilarity(normalizedName, groupName) > 0.85) return false;
        }
        return true;
      })
      .sort((a, b) => a.accountName.localeCompare(b.accountName));
  }, [partnerAccounts, groups, hasPartnerData]);
  
  // Filter and sort missing partners
  const filteredMissingPartners = useMemo(() => {
    let result = partnersWithoutGroups;
    
    // Apply search filter
    if (missingPartnersSearch) {
      const term = missingPartnersSearch.toLowerCase();
      result = result.filter(p => 
        p.accountName.toLowerCase().includes(term) ||
        (p.partnerTier || '').toLowerCase().includes(term) ||
        (p.accountRegion || '').toLowerCase().includes(term)
      );
    }
    
    // Apply sorting
    result = [...result].sort((a, b) => {
      switch (missingPartnersSort) {
        case 'tier': {
          // Sort by tier priority: Premier > Select > Registered > Certified > Unknown
          const tierOrder = { 'Premier': 1, 'Select': 2, 'Registered': 3, 'Certified': 4 };
          const tierA = tierOrder[a.partnerTier] || 99;
          const tierB = tierOrder[b.partnerTier] || 99;
          if (tierA !== tierB) return tierA - tierB;
          return a.accountName.localeCompare(b.accountName);
        }
        case 'region': {
          const regionA = a.accountRegion || 'ZZZ';
          const regionB = b.accountRegion || 'ZZZ';
          if (regionA !== regionB) return regionA.localeCompare(regionB);
          return a.accountName.localeCompare(b.accountName);
        }
        case 'name':
        default:
          return a.accountName.localeCompare(b.accountName);
      }
    });
    
    return result;
  }, [partnersWithoutGroups, missingPartnersSearch, missingPartnersSort]);
  
  // Handle creating a group for a partner
  const handleCreateGroup = async (partner, options) => {
    if (!partner || !options) return;
    
    setCreatingGroup(true);
    setCreateProgress({ stage: 'creating', current: 0, total: 4 });
    
    try {
      // Step 1: Create the group
      setCreateProgress({ stage: 'Creating group...', current: 1, total: 4 });
      const newGroup = await northpassApi.createGroup(partner.accountName);
      
      let users = [];
      
      if (options.mode === 'domain') {
        // Domain-based search
        setCreateProgress({ stage: 'Searching users by domain...', current: 2, total: 4 });
        users = await northpassApi.searchUsersByEmailDomain(options.domain);
      } else if (options.mode === 'crm') {
        // CRM-matched users (already looked up in the modal)
        setCreateProgress({ stage: 'Using CRM-matched users...', current: 2, total: 4 });
        users = options.users || [];
      }
      
      // Step 3 & 4: Add users to both the new group AND All Partners group
      if (users.length > 0) {
        setCreateProgress({ stage: `Adding ${users.length} users to group...`, current: 3, total: 4 });
        const userIds = users.map(u => u.id);
        
        // Use addUsersToGroups which handles both primary group and All Partners group
        const results = await northpassApi.addUsersToGroups(
          newGroup.id, 
          userIds, 
          true, // Add to All Partners group
          (current, total, stage) => {
            setCreateProgress({ stage, current: 3 + (current / total), total: 4 });
          }
        );
        
        // Clear cache and reload
        await clearGroupsCache();
        await loadData(true);
        
        const modeLabel = options.mode === 'domain' ? `@${options.domain}` : 'CRM contacts';
        alert(`✅ Created group "${partner.accountName}" (${modeLabel})\n\n• Added ${results.primaryGroup?.success || 0} users to group\n• Added ${results.allPartnersGroup?.success || 0} users to All Partners group`);
      } else {
        // No users found, just clear cache and reload
        await clearGroupsCache();
        await loadData(true);
        const noUsersLabel = options.mode === 'domain' 
          ? `No users found with @${options.domain} to add.`
          : 'No CRM contacts found in the LMS to add.';
        alert(`✅ Created group "${partner.accountName}"\n\n${noUsersLabel}`);
      }
      
      setShowCreateGroupModal(false);
      setCreateGroupPartner(null);
      
    } catch (error) {
      console.error('Error creating group:', error);
      alert('Failed to create group: ' + error.message);
    } finally {
      setCreatingGroup(false);
    }
  };

  return (
    <div className="group-analysis-content">
      <div className="analysis-header">
        <div className="header-content">
          <h1>👥 Group Analysis</h1>
          <p>Match Northpass groups to your partner database and manage group memberships.</p>
        </div>
        <div className="header-actions">
          {viewMode === 'groups' && (
            <NintexButton 
              variant={selectionMode ? 'primary' : 'secondary'} 
              onClick={toggleSelectionMode}
            >
              {selectionMode ? '✓ Selection Mode' : '☐ Select Groups'}
            </NintexButton>
          )}
          <NintexButton variant="secondary" onClick={loadData} disabled={loading}>
            🔄 Refresh
          </NintexButton>
        </div>
      </div>

      {/* View Mode Tabs */}
      {hasPartnerData && (
        <div className="view-mode-tabs">
          <button 
            className={`view-tab ${viewMode === 'groups' ? 'active' : ''}`}
            onClick={() => setViewMode('groups')}
          >
            📋 Existing Groups ({groups.length})
          </button>
          <button 
            className={`view-tab ${viewMode === 'missingPartners' ? 'active' : ''}`}
            onClick={() => setViewMode('missingPartners')}
          >
            ➕ Partners Without Groups ({partnersWithoutGroups.length})
          </button>
        </div>
      )}

      {/* Selection Toolbar */}
      {viewMode === 'groups' && selectionMode && (
        <div className="selection-toolbar">
          <div className="selection-info">
            <span className="selection-count">{selectedGroups.size} selected</span>
            <button className="link-btn" onClick={selectAllVisible}>Select All Visible</button>
            <button className="link-btn" onClick={clearSelection}>Clear Selection</button>
          </div>
          <div className="selection-actions">
            <NintexButton 
              variant="secondary" 
              onClick={() => setShowMergeModal(true)}
              disabled={selectedGroups.size < 2}
              title={selectedGroups.size < 2 ? 'Select at least 2 groups to merge' : ''}
            >
              🔀 Merge ({selectedGroups.size})
            </NintexButton>
            <NintexButton 
              variant="danger" 
              onClick={() => setShowBulkDeleteConfirm(true)}
              disabled={selectedGroups.size === 0}
            >
              🗑️ Delete ({selectedGroups.size})
            </NintexButton>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation */}
      {showBulkDeleteConfirm && (
        <div className="bulk-confirm-banner">
          <div className="confirm-content">
            <span className="confirm-icon">⚠️</span>
            <span className="confirm-text">
              Delete {selectedGroups.size} group{selectedGroups.size > 1 ? 's' : ''}? This cannot be undone!
            </span>
          </div>
          <div className="confirm-actions">
            <NintexButton variant="secondary" onClick={() => setShowBulkDeleteConfirm(false)} disabled={bulkDeleting}>
              Cancel
            </NintexButton>
            <NintexButton variant="danger" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? `Deleting ${bulkDeleteProgress.current}/${bulkDeleteProgress.total}...` : 'Yes, Delete All'}
            </NintexButton>
          </div>
        </div>
      )}

      {/* Partner Data Warning */}
      {!hasPartnerData && !loading && (
        <div className="warning-banner">
          <span className="warning-icon">⚠️</span>
          <div className="warning-content">
            <strong>No Partner Data Loaded</strong>
            <p>Import partner data in the <a href="/admin/data">Data Management</a> page to match groups with your CRM accounts.</p>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="summary-card">
          <span className="summary-value">{stats.totalGroups}</span>
          <span className="summary-label">Total Groups</span>
        </div>
        {hasPartnerData && (
          <>
            <div className="summary-card success">
              <span className="summary-value">{stats.matched}</span>
              <span className="summary-label">Matched</span>
            </div>
            <div className="summary-card warning">
              <span className="summary-value">{stats.closeMatch}</span>
              <span className="summary-label">Close Match</span>
            </div>
            <div className="summary-card error">
              <span className="summary-value">{stats.unmatched}</span>
              <span className="summary-label">Unmatched</span>
            </div>
          </>
        )}
        <div className="summary-card highlight">
          <span className="summary-value">{stats.totalMissing}</span>
          <span className="summary-label">Missing Users</span>
        </div>
        {cacheMetadata && (
          <div className="summary-card info">
            <span className="summary-value">
              {new Date(cacheMetadata.cachedAt).toLocaleTimeString()}
            </span>
            <span className="summary-label">Cached</span>
          </div>
        )}
        {hasPartnerData && (
          <div className="summary-card warning" onClick={() => setViewMode('missingPartners')} style={{ cursor: 'pointer' }}>
            <span className="summary-value">{partnersWithoutGroups.length}</span>
            <span className="summary-label">Missing Groups</span>
          </div>
        )}
      </div>

      {/* GROUPS VIEW */}
      {viewMode === 'groups' && (
        <>
          {/* Controls */}
          <div className="controls-bar">
            <input
              type="text"
              placeholder="🔍 Search groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            
            {hasPartnerData && (
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
                  className={`filter-btn ${filterMode === 'close' ? 'active' : ''}`}
                  onClick={() => setFilterMode('close')}
                >
                  🔶 Similar
                </button>
                <button 
                  className={`filter-btn ${filterMode === 'unmatched' ? 'active' : ''}`}
                  onClick={() => setFilterMode('unmatched')}
                >
                  ❌ Unmatched
                </button>
              </div>
            )}

        <NintexButton 
          variant="primary"
          onClick={analyzeAllGroups}
          disabled={bulkAnalyzing || filteredGroups.length === 0}
        >
          {bulkAnalyzing 
            ? `Analyzing ${bulkProgress.current}/${bulkProgress.total}...`
            : `🔍 Analyze All (${filteredGroups.length})`
          }
        </NintexButton>
      </div>

      {bulkAnalyzing && (
        <div className="bulk-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}></div>
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
              matchInfo={matchResults[group.id]}
              onAnalyze={analyzeGroup}
              isAnalyzing={analyzingGroupId === group.id}
              analysisResult={analysisResults[group.id]}
              onEdit={setEditingGroup}
              isSelected={selectedGroups.has(group.id)}
              onToggleSelect={toggleGroupSelection}
              selectionMode={selectionMode}
              onAnalysisUpdated={(groupId) => {
                // Clear the analysis result to allow re-analyzing
                setAnalysisResults(prev => {
                  const newResults = { ...prev };
                  delete newResults[groupId];
                  return newResults;
                });
              }}
            />
          ))}
        </div>
      )}

      {!loading && filteredGroups.length === 0 && (
        <div className="empty-state">
          <p>No groups found {searchTerm && `matching "${searchTerm}"`}</p>
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
            <span className="results-count">
              Showing {filteredMissingPartners.length} of {partnersWithoutGroups.length} partners without groups
            </span>
          </div>
          
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading...</p>
            </div>
          ) : (
            <div className="partners-grid">
              {filteredMissingPartners.map(partner => (
                <div key={partner.accountId || partner.accountName} className="partner-card">
                  <div className="partner-card-header">
                    <h3>{partner.accountName}</h3>
                    <span className={`tier-badge tier-${(partner.partnerTier || '').toLowerCase().replace(/\s+/g, '-')}`}>
                      {partner.partnerTier || 'Unknown'}
                    </span>
                  </div>
                  <div className="partner-card-body">
                    <div className="partner-info">
                      <span className="info-item">👥 {partner.contactCount} contacts</span>
                      <span className="info-item">🌍 {partner.accountRegion || 'Unknown region'}</span>
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
          
          {!loading && filteredMissingPartners.length === 0 && (
            <div className="empty-state">
              <p>
                {partnersWithoutGroups.length === 0 
                  ? '🎉 All partners have matching groups!'
                  : `No partners found matching "${missingPartnersSearch}"`
                }
              </p>
            </div>
          )}
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroupModal && createGroupPartner && ReactDOM.createPortal(
        <CreateGroupModal 
          partner={createGroupPartner}
          onClose={() => {
            setShowCreateGroupModal(false);
            setCreateGroupPartner(null);
          }}
          onCreate={handleCreateGroup}
          creating={creatingGroup}
          progress={createProgress}
        />,
        document.body
      )}

      {/* Edit Modal */}
      <EditGroupModal
        isOpen={!!editingGroup}
        onClose={() => setEditingGroup(null)}
        group={editingGroup}
        partnerAccounts={partnerAccounts}
        onSave={handleUpdateGroup}
        onDelete={handleDeleteGroup}
      />

      {/* Merge Modal */}
      {showMergeModal && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => !merging && setShowMergeModal(false)}>
          <div className="modal-content merge-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔀 Merge Groups</h2>
              <button className="modal-close" onClick={() => !merging && setShowMergeModal(false)}>✕</button>
            </div>
            
            <div className="modal-body">
              <p className="merge-description">
                Select a target group. All users from the other {selectedGroups.size - 1} group(s) will be moved to the target, 
                and the source groups will be deleted.
              </p>
              
              <div className="merge-groups-list">
                <label>Select Target Group:</label>
                {selectedGroupObjects.map(group => (
                  <div 
                    key={group.id} 
                    className={`merge-group-item ${mergeTargetId === group.id ? 'target' : ''}`}
                    onClick={() => setMergeTargetId(group.id)}
                  >
                    <input 
                      type="radio" 
                      name="mergeTarget" 
                      checked={mergeTargetId === group.id}
                      onChange={() => setMergeTargetId(group.id)}
                    />
                    <span className="group-name">{group.attributes?.name}</span>
                    {mergeTargetId === group.id && <span className="target-badge">Target</span>}
                    {mergeTargetId && mergeTargetId !== group.id && <span className="source-badge">Will be merged & deleted</span>}
                  </div>
                ))}
              </div>
              
              {merging && (
                <div className="merge-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${mergeProgress.total > 0 ? (mergeProgress.current / mergeProgress.total) * 100 : 0}%` }}></div>
                  </div>
                  <p>
                    {mergeProgress.stage === 'fetching' && `Fetching users from group ${mergeProgress.current}/${mergeProgress.total}...`}
                    {mergeProgress.stage === 'moving' && `Moving user ${mergeProgress.current}/${mergeProgress.total}...`}
                    {mergeProgress.stage === 'deleting' && `Deleting source group ${mergeProgress.current}/${mergeProgress.total}...`}
                    {mergeProgress.stage === 'starting' && 'Starting merge...'}
                  </p>
                </div>
              )}
              
              <div className="modal-actions">
                <NintexButton variant="secondary" onClick={() => setShowMergeModal(false)} disabled={merging}>
                  Cancel
                </NintexButton>
                <NintexButton 
                  variant="primary" 
                  onClick={handleMergeGroups}
                  disabled={merging || !mergeTargetId}
                >
                  {merging ? '🔄 Merging...' : `🔀 Merge ${selectedGroups.size - 1} Group(s) into Target`}
                </NintexButton>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default GroupAnalysis;
