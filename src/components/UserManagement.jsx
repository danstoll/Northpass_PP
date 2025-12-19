import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import './UserManagement.css';
import northpassApi from '../services/northpassApi';
import { 
  getAllContacts,
  getDatabaseStats 
} from '../services/partnerDatabase';
import NintexButton from './NintexButton';

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
  return !domain || EXCLUDED_EMAIL_DOMAINS.has(domain);
};

// Confirmation Modal for adding users
const AddUsersModal = ({ 
  isOpen, 
  onClose, 
  selectedContacts, 
  onConfirm, 
  isAdding, 
  progress,
  results 
}) => {
  // Group contacts by account for display - must be before early return
  const contactsByAccount = useMemo(() => {
    if (!selectedContacts || selectedContacts.length === 0) return [];
    const grouped = {};
    selectedContacts.forEach(contact => {
      const account = contact.accountName || 'Unknown';
      if (!grouped[account]) {
        grouped[account] = {
          accountName: account,
          partnerTier: contact.partnerTier,
          contacts: []
        };
      }
      grouped[account].contacts.push(contact);
    });
    return Object.values(grouped).sort((a, b) => a.accountName.localeCompare(b.accountName));
  }, [selectedContacts]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content add-users-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>➕ Add Users to LMS</h2>
          <button className="modal-close" onClick={onClose} disabled={isAdding}>✕</button>
        </div>
        
        <div className="modal-body">
          {results ? (
            <div className="add-results">
              <h3>{results.created > 0 ? '✅ Users Added Successfully' : '⚠️ No Users Added'}</h3>
              <div className="results-grid">
                <div className="result-item">
                  <span className="result-label">Users Created:</span>
                  <span className="result-value success">{results.created}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Added to Partner Groups:</span>
                  <span className="result-value success">{results.addedToGroup}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Added to All Partners:</span>
                  <span className="result-value success">{results.addedToAllPartners}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Already Existed:</span>
                  <span className="result-value warning">{results.alreadyExisted}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Failed:</span>
                  <span className="result-value error">{results.failed}</span>
                </div>
              </div>
              {results.errors && results.errors.length > 0 && (
                <div className="error-details">
                  <h4>Errors:</h4>
                  <ul>
                    {results.errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>{err.email}: {err.error}</li>
                    ))}
                    {results.errors.length > 5 && (
                      <li>...and {results.errors.length - 5} more errors</li>
                    )}
                  </ul>
                </div>
              )}
              <div className="modal-actions">
                <NintexButton variant="primary" onClick={onClose}>
                  Close
                </NintexButton>
              </div>
            </div>
          ) : isAdding ? (
            <div className="adding-progress">
              <div className="progress-spinner"></div>
              <p>{progress.stage}</p>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                ></div>
              </div>
              <p className="progress-detail">{progress.current} of {progress.total}</p>
            </div>
          ) : (
            <>
              <div className="confirm-summary">
                <p>You are about to add <strong>{selectedContacts.length}</strong> users to the LMS.</p>
                <p className="info-text">
                  Each user will be:
                  <br />• Created in Northpass with their email
                  <br />• Added to their partner's group (if it exists)
                  <br />• Added to the "All Partners" group
                </p>
              </div>
              
              <div className="accounts-preview">
                <h4>Users by Partner ({contactsByAccount.length} partners):</h4>
                <div className="accounts-list">
                  {contactsByAccount.slice(0, 10).map((account, idx) => (
                    <div key={idx} className="account-preview-item">
                      <span className="account-name">{account.accountName}</span>
                      <span className={`tier-badge tier-${(account.partnerTier || '').toLowerCase().replace(/\s+/g, '-')}`}>
                        {account.partnerTier || 'Unknown'}
                      </span>
                      <span className="contact-count">{account.contacts.length} users</span>
                    </div>
                  ))}
                  {contactsByAccount.length > 10 && (
                    <div className="more-accounts">
                      ...and {contactsByAccount.length - 10} more partners
                    </div>
                  )}
                </div>
              </div>
              
              <div className="modal-actions">
                <NintexButton variant="secondary" onClick={onClose}>
                  Cancel
                </NintexButton>
                <NintexButton variant="primary" onClick={onConfirm}>
                  ➕ Add {selectedContacts.length} Users
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

const UserManagement = () => {
  // Data state
  const [loading, setLoading] = useState(true);
  const [crmContacts, setCrmContacts] = useState([]);
  const [lmsUsers, setLmsUsers] = useState(new Map()); // email -> user object
  const [groups, setGroups] = useState(new Map()); // name (normalized) -> group object
  const [hasPartnerData, setHasPartnerData] = useState(false);
  
  // Analysis state
  const [missingContacts, setMissingContacts] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ stage: '', current: 0, total: 0 });
  
  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [excludePersonalEmails, setExcludePersonalEmails] = useState(true);
  
  // Selection state
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  
  // Add users modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addProgress, setAddProgress] = useState({ stage: '', current: 0, total: 0 });
  const [addResults, setAddResults] = useState(null);

  // Load initial data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Check if partner data exists
      const dbStats = await getDatabaseStats();
      if (!dbStats?.lastImport) {
        setHasPartnerData(false);
        setLoading(false);
        return;
      }
      
      setHasPartnerData(true);
      
      // Load CRM contacts
      const contacts = await getAllContacts();
      setCrmContacts(contacts);
      console.log(`📋 Loaded ${contacts.length} CRM contacts`);
      
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Analyze to find missing contacts
  const analyzeContacts = async () => {
    setAnalyzing(true);
    setAnalysisProgress({ stage: 'Loading LMS users...', current: 0, total: 3 });
    
    try {
      // Step 1: Get all LMS users
      setAnalysisProgress({ stage: 'Fetching all LMS users...', current: 1, total: 3 });
      const allUsers = await northpassApi.getAllUsers();
      
      // Build email lookup map
      const emailMap = new Map();
      allUsers.forEach(user => {
        const email = user.attributes?.email?.toLowerCase();
        if (email) {
          emailMap.set(email, user);
        }
      });
      setLmsUsers(emailMap);
      console.log(`📧 Loaded ${emailMap.size} LMS users`);
      
      // Step 2: Get all groups
      setAnalysisProgress({ stage: 'Fetching groups...', current: 2, total: 3 });
      const allGroups = await northpassApi.getAllGroups();
      
      // Build group lookup map (by normalized name)
      // Handle ptr_ prefix: store both with and without prefix for matching
      const groupMap = new Map();
      allGroups.forEach(group => {
        const name = (group.attributes?.name || '').toLowerCase().trim();
        if (name) {
          groupMap.set(name, group);
          // Also store without ptr_ prefix for matching CRM names
          if (name.startsWith('ptr_')) {
            const nameWithoutPrefix = name.substring(4); // Remove 'ptr_'
            groupMap.set(nameWithoutPrefix, group);
          }
        }
      });
      setGroups(groupMap);
      console.log(`👥 Loaded ${groupMap.size} groups`);
      
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
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c => 
        c.email?.toLowerCase().includes(term) ||
        c.firstName?.toLowerCase().includes(term) ||
        c.lastName?.toLowerCase().includes(term) ||
        c.accountName?.toLowerCase().includes(term)
      );
    }
    
    // Tier filter
    if (tierFilter !== 'all') {
      filtered = filtered.filter(c => c.partnerTier === tierFilter);
    }
    
    // Region filter
    if (regionFilter !== 'all') {
      filtered = filtered.filter(c => c.accountRegion === regionFilter);
    }
    
    // Exclude personal emails
    if (excludePersonalEmails) {
      filtered = filtered.filter(c => !isExcludedDomain(c.email));
    }
    
    return filtered;
  }, [missingContacts, searchTerm, tierFilter, regionFilter, excludePersonalEmails]);

  // Selection handlers
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
    setSelectionMode(false);
  };

  // Get selected contact objects
  const selectedContactObjects = useMemo(() => {
    return filteredContacts.filter(c => selectedContacts.has(c.id));
  }, [filteredContacts, selectedContacts]);

  // Add users to LMS
  const handleAddUsers = async () => {
    if (selectedContactObjects.length === 0) return;
    
    setIsAdding(true);
    setAddProgress({ stage: 'Starting...', current: 0, total: selectedContactObjects.length });
    setAddResults(null);
    
    const results = {
      created: 0,
      addedToGroup: 0,
      addedToAllPartners: 0,
      alreadyExisted: 0,
      failed: 0,
      errors: []
    };
    
    try {
      // Find "All Partners" group
      const allPartnersGroup = await northpassApi.findAllPartnersGroup();
      const allPartnersGroupId = allPartnersGroup?.id;
      
      for (let i = 0; i < selectedContactObjects.length; i++) {
        const contact = selectedContactObjects[i];
        setAddProgress({ 
          stage: `Processing ${contact.email}...`, 
          current: i + 1, 
          total: selectedContactObjects.length 
        });
        
        try {
          // Step 1: Create user in LMS
          const createResult = await northpassApi.createPerson({
            email: contact.email,
            firstName: contact.firstName,
            lastName: contact.lastName
          });
          
          if (createResult.alreadyExists) {
            results.alreadyExisted++;
            // Even if user exists, try to add them to groups
          } else if (createResult.success) {
            results.created++;
          } else {
            results.failed++;
            results.errors.push({ email: contact.email, error: createResult.error || 'Unknown error' });
            continue; // Skip group assignment if creation failed
          }
          
          const userId = createResult.userId;
          if (!userId) continue;
          
          // Step 2: Find partner group and add user (check both with and without ptr_ prefix)
          const partnerGroupName = contact.accountName?.toLowerCase().trim();
          const partnerGroup = groups.get(partnerGroupName) || groups.get('ptr_' + partnerGroupName);
          
          if (partnerGroup) {
            const groupResult = await northpassApi.addPeopleToGroup(partnerGroup.id, [userId]);
            if (groupResult.success) {
              results.addedToGroup++;
            }
          }
          
          // Step 3: Add to All Partners group
          if (allPartnersGroupId) {
            const allPartnersResult = await northpassApi.addPeopleToGroup(allPartnersGroupId, [userId]);
            if (allPartnersResult.success) {
              results.addedToAllPartners++;
            }
          }
          
          // Small delay between users
          await new Promise(resolve => setTimeout(resolve, 300));
          
        } catch (error) {
          results.failed++;
          results.errors.push({ email: contact.email, error: error.message });
        }
      }
      
      setAddResults(results);
      
      // Refresh the analysis to remove added users
      if (results.created > 0 || results.alreadyExisted > 0) {
        // Update local state to remove successfully added contacts
        const addedEmails = new Set(
          selectedContactObjects
            .filter(c => !results.errors.find(e => e.email === c.email))
            .map(c => c.email.toLowerCase())
        );
        
        setMissingContacts(prev => prev.filter(c => !addedEmails.has(c.email?.toLowerCase())));
        clearSelection();
      }
      
    } catch (error) {
      console.error('Error adding users:', error);
      setAddResults({
        ...results,
        failed: results.failed + 1,
        errors: [...results.errors, { email: 'System', error: error.message }]
      });
    } finally {
      setIsAdding(false);
    }
  };

  // Summary stats
  const stats = useMemo(() => {
    const totalCrm = crmContacts.length;
    const totalMissing = missingContacts.length;
    const totalFiltered = filteredContacts.length;
    const totalLms = lmsUsers.size;
    const personalEmails = missingContacts.filter(c => isExcludedDomain(c.email)).length;
    
    return {
      totalCrm,
      totalMissing,
      totalFiltered,
      totalLms,
      personalEmails,
      matchRate: totalCrm > 0 ? Math.round(((totalCrm - totalMissing) / totalCrm) * 100) : 0
    };
  }, [crmContacts, missingContacts, filteredContacts, lmsUsers]);

  if (loading) {
    return (
      <div className="user-management-content">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading partner data...</p>
        </div>
      </div>
    );
  }

  if (!hasPartnerData) {
    return (
      <div className="user-management-content">
        <div className="warning-banner">
          <span className="warning-icon">⚠️</span>
          <div className="warning-content">
            <strong>No Partner Data Loaded</strong>
            <p>Import partner contact data in the <a href="/admin/data">Data Management</a> page first.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="user-management-content">
      <div className="page-header">
        <div className="header-content">
          <h1>👤 User Management</h1>
          <p>Find CRM contacts missing from the LMS and add them with proper group assignments.</p>
        </div>
        <div className="header-actions">
          <NintexButton 
            variant="primary" 
            onClick={analyzeContacts}
            disabled={analyzing}
          >
            {analyzing ? '🔄 Analyzing...' : '🔍 Analyze Missing Users'}
          </NintexButton>
        </div>
      </div>

      {analyzing && (
        <div className="analysis-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
            ></div>
          </div>
          <p>{analysisProgress.stage}</p>
        </div>
      )}

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="summary-card">
          <span className="summary-value">{stats.totalCrm}</span>
          <span className="summary-label">CRM Contacts</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{stats.totalLms}</span>
          <span className="summary-label">LMS Users</span>
        </div>
        <div className="summary-card success">
          <span className="summary-value">{stats.matchRate}%</span>
          <span className="summary-label">Match Rate</span>
        </div>
        <div className="summary-card warning">
          <span className="summary-value">{stats.totalMissing}</span>
          <span className="summary-label">Missing from LMS</span>
        </div>
        <div className="summary-card info">
          <span className="summary-value">{stats.personalEmails}</span>
          <span className="summary-label">Personal Emails</span>
        </div>
      </div>

      {missingContacts.length > 0 && (
        <>
          {/* Selection Toolbar */}
          {selectionMode && (
            <div className="selection-toolbar">
              <div className="selection-info">
                <span className="selection-count">{selectedContacts.size} selected</span>
                <button className="link-btn" onClick={selectAllVisible}>Select All Visible ({filteredContacts.length})</button>
                <button className="link-btn" onClick={clearSelection}>Clear Selection</button>
              </div>
              <div className="selection-actions">
                <NintexButton 
                  variant="primary"
                  onClick={() => setShowAddModal(true)}
                  disabled={selectedContacts.size === 0}
                >
                  ➕ Add {selectedContacts.size} Users to LMS
                </NintexButton>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="controls-bar">
            <input
              type="text"
              placeholder="🔍 Search by email, name, or company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            
            <select 
              value={tierFilter} 
              onChange={(e) => setTierFilter(e.target.value)}
              className="filter-select"
            >
              {tiers.map(tier => (
                <option key={tier} value={tier}>
                  {tier === 'all' ? 'All Tiers' : tier}
                </option>
              ))}
            </select>
            
            <select 
              value={regionFilter} 
              onChange={(e) => setRegionFilter(e.target.value)}
              className="filter-select"
            >
              {regions.map(region => (
                <option key={region} value={region}>
                  {region === 'all' ? 'All Regions' : region}
                </option>
              ))}
            </select>
            
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={excludePersonalEmails}
                onChange={(e) => setExcludePersonalEmails(e.target.checked)}
              />
              Exclude personal emails
            </label>
            
            <NintexButton 
              variant={selectionMode ? 'primary' : 'secondary'}
              onClick={() => setSelectionMode(!selectionMode)}
            >
              {selectionMode ? '✓ Selection Mode' : '☐ Select Users'}
            </NintexButton>
          </div>

          <div className="results-info">
            Showing {filteredContacts.length} of {missingContacts.length} missing contacts
          </div>

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
                  // Check both with and without ptr_ prefix
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
                        <span className={`tier-badge tier-${(contact.partnerTier || '').toLowerCase().replace(/\s+/g, '-')}`}>
                          {contact.partnerTier || 'Unknown'}
                        </span>
                      </td>
                      <td>{contact.accountRegion || '-'}</td>
                      <td>
                        {hasGroup ? (
                          <span className="status-badge success">✓ Yes</span>
                        ) : (
                          <span className="status-badge warning">✗ No</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {filteredContacts.length > 100 && (
              <div className="table-footer">
                Showing first 100 of {filteredContacts.length} contacts. Use filters to narrow down.
              </div>
            )}
          </div>
        </>
      )}

      {missingContacts.length === 0 && !analyzing && lmsUsers.size > 0 && (
        <div className="empty-state success">
          <span className="empty-icon">✅</span>
          <h3>All CRM contacts are in the LMS!</h3>
          <p>No missing users found.</p>
        </div>
      )}

      {missingContacts.length === 0 && !analyzing && lmsUsers.size === 0 && (
        <div className="empty-state">
          <span className="empty-icon">🔍</span>
          <h3>Click "Analyze Missing Users" to start</h3>
          <p>This will compare your CRM contacts with LMS users to find who's missing.</p>
        </div>
      )}

      {/* Add Users Modal */}
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
    </div>
  );
};

export default UserManagement;
