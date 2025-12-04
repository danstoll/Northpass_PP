/**
 * Partner Database Service
 * Uses IndexedDB to store partner contact data from Excel imports
 * Provides fast access for all admin tools without re-parsing Excel files
 */

const DB_NAME = 'NintexPartnerDB';
const DB_VERSION = 3; // Bumped for groups cache store
const CONTACTS_STORE = 'contacts';
const METADATA_STORE = 'metadata';
const LMS_USERS_STORE = 'lmsUsers';
const GROUPS_STORE = 'groups';

let db = null;

/**
 * Initialize the IndexedDB database
 */
export async function initDatabase() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('Partner database initialized');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Create contacts store with indexes
      if (!database.objectStoreNames.contains(CONTACTS_STORE)) {
        const contactsStore = database.createObjectStore(CONTACTS_STORE, { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        
        // Create indexes for common queries
        contactsStore.createIndex('email', 'email', { unique: false });
        contactsStore.createIndex('accountName', 'accountName', { unique: false });
        contactsStore.createIndex('partnerTier', 'partnerTier', { unique: false });
        contactsStore.createIndex('accountRegion', 'accountRegion', { unique: false });
        contactsStore.createIndex('contactStatus', 'contactStatus', { unique: false });
        contactsStore.createIndex('accountStatus', 'accountStatus', { unique: false });
      }

      // Create metadata store for import info
      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        database.createObjectStore(METADATA_STORE, { keyPath: 'key' });
      }

      // Create LMS users store for caching user data and match results
      if (!database.objectStoreNames.contains(LMS_USERS_STORE)) {
        const lmsStore = database.createObjectStore(LMS_USERS_STORE, { 
          keyPath: 'id' 
        });
        
        // Create indexes for LMS user queries
        lmsStore.createIndex('email', 'email', { unique: false });
        lmsStore.createIndex('matchStatus', 'matchStatus', { unique: false }); // 'matched', 'unmatched'
        lmsStore.createIndex('matchedContactId', 'matchedContactId', { unique: false });
      }

      // Create groups store for caching Northpass groups
      if (!database.objectStoreNames.contains(GROUPS_STORE)) {
        const groupsStore = database.createObjectStore(GROUPS_STORE, { 
          keyPath: 'id' 
        });
        
        // Create indexes for group queries
        groupsStore.createIndex('name', 'name', { unique: false });
        groupsStore.createIndex('userCount', 'userCount', { unique: false });
      }
    };
  });
}

/**
 * Import contacts from parsed Excel data
 * @param {Array} contacts - Array of contact objects from Excel
 * @param {string} fileName - Original file name for reference
 * @returns {Promise<{imported: number, errors: number}>}
 */
export async function importContacts(contacts, fileName) {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE, METADATA_STORE], 'readwrite');
    const contactsStore = transaction.objectStore(CONTACTS_STORE);
    // Note: metadataStore is accessed via a separate transaction after contacts import

    let imported = 0;
    let errors = 0;

    // Clear existing contacts before import
    const clearRequest = contactsStore.clear();
    
    clearRequest.onsuccess = () => {
      // Add each contact
      contacts.forEach((contact, index) => {
        try {
          // Normalize the contact data
          const normalizedContact = {
            email: contact['Email'] || contact.email || '',
            contactStatus: contact['Contact Status'] || contact.contactStatus || '',
            firstName: contact['First Name'] || contact.firstName || '',
            lastName: contact['Last Name'] || contact.lastName || '',
            title: contact['Title'] || contact.title || '',
            accountName: contact['Account Name'] || contact.accountName || '',
            accountStatus: contact['Account Status'] || contact.accountStatus || '',
            mailingCity: contact['Mailing City'] || contact.mailingCity || '',
            mailingZip: contact['Mailing Zip/Postal Code'] || contact.mailingZip || '',
            mailingCountry: contact['Mailing Country'] || contact.mailingCountry || '',
            accountOwner: contact['Account Owner'] || contact.accountOwner || '',
            accountId: contact['Account ID'] || contact.accountId || '',
            accountRegion: contact['Account Region'] || contact.accountRegion || '',
            partnerTier: contact['Partner Tier'] || contact.partnerTier || '',
          };

          const addRequest = contactsStore.add(normalizedContact);
          addRequest.onsuccess = () => imported++;
          addRequest.onerror = () => errors++;
        } catch (err) {
          console.error(`Error adding contact at index ${index}:`, err);
          errors++;
        }
      });
    };

    transaction.oncomplete = () => {
      // Save import metadata
      const metaTransaction = db.transaction([METADATA_STORE], 'readwrite');
      const metaStore = metaTransaction.objectStore(METADATA_STORE);
      
      metaStore.put({
        key: 'lastImport',
        fileName: fileName,
        importDate: new Date().toISOString(),
        totalContacts: imported,
        errors: errors
      });

      metaTransaction.oncomplete = () => {
        console.log(`Import complete: ${imported} contacts, ${errors} errors`);
        resolve({ imported, errors });
      };
    };

    transaction.onerror = () => {
      console.error('Import transaction failed:', transaction.error);
      reject(transaction.error);
    };
  });
}

/**
 * Get import metadata (last import info)
 * @returns {Promise<Object|null>}
 */
export async function getImportMetadata() {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([METADATA_STORE], 'readonly');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.get('lastImport');

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all unique account names with contact counts and tier info
 * @returns {Promise<Array>}
 */
export async function getAccountSummary() {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE], 'readonly');
    const store = transaction.objectStore(CONTACTS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const contacts = request.result;
      const accountMap = new Map();

      contacts.forEach(contact => {
        const name = contact.accountName;
        if (!name) return;

        if (!accountMap.has(name)) {
          accountMap.set(name, {
            accountName: name,
            partnerTier: contact.partnerTier,
            accountRegion: contact.accountRegion,
            accountStatus: contact.accountStatus,
            contactCount: 0,
            contacts: []
          });
        }

        const account = accountMap.get(name);
        account.contactCount++;
        account.contacts.push({
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          title: contact.title,
          contactStatus: contact.contactStatus
        });
      });

      const accounts = Array.from(accountMap.values());
      accounts.sort((a, b) => a.accountName.localeCompare(b.accountName));
      resolve(accounts);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get contacts for a specific account
 * @param {string} accountName - Account name to search for
 * @returns {Promise<Array>}
 */
export async function getContactsByAccount(accountName) {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE], 'readonly');
    const store = transaction.objectStore(CONTACTS_STORE);
    const index = store.index('accountName');
    const request = index.getAll(accountName);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get contacts by email (for matching with Northpass)
 * @param {string} email - Email to search for
 * @returns {Promise<Array>}
 */
export async function getContactByEmail(email) {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE], 'readonly');
    const store = transaction.objectStore(CONTACTS_STORE);
    const index = store.index('email');
    const request = index.getAll(email.toLowerCase());

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Search accounts by name (partial match)
 * @param {string} searchTerm - Search term
 * @returns {Promise<Array>}
 */
export async function searchAccounts(searchTerm) {
  const allAccounts = await getAccountSummary();
  const term = searchTerm.toLowerCase();
  
  return allAccounts.filter(account => 
    account.accountName.toLowerCase().includes(term)
  );
}

/**
 * Get contacts by tier
 * @param {string} tier - Partner tier
 * @returns {Promise<Array>}
 */
export async function getContactsByTier(tier) {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE], 'readonly');
    const store = transaction.objectStore(CONTACTS_STORE);
    const index = store.index('partnerTier');
    const request = index.getAll(tier);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get contacts by region
 * @param {string} region - Account region
 * @returns {Promise<Array>}
 */
export async function getContactsByRegion(region) {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE], 'readonly');
    const store = transaction.objectStore(CONTACTS_STORE);
    const index = store.index('accountRegion');
    const request = index.getAll(region);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get database statistics
 * @returns {Promise<Object>}
 */
export async function getDatabaseStats() {
  await initDatabase();

  const metadata = await getImportMetadata();
  const accounts = await getAccountSummary();

  // Calculate tier distribution
  const tierCounts = {};
  const regionCounts = {};
  let totalContacts = 0;

  accounts.forEach(account => {
    totalContacts += account.contactCount;
    
    const tier = account.partnerTier || 'Unknown';
    tierCounts[tier] = (tierCounts[tier] || 0) + account.contactCount;
    
    const region = account.accountRegion || 'Unknown';
    regionCounts[region] = (regionCounts[region] || 0) + account.contactCount;
  });

  return {
    lastImport: metadata,
    totalAccounts: accounts.length,
    totalContacts: totalContacts,
    tierDistribution: tierCounts,
    regionDistribution: regionCounts
  };
}

/**
 * Clear all data from the database
 * @returns {Promise<void>}
 */
export async function clearDatabase() {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE, METADATA_STORE], 'readwrite');
    
    transaction.objectStore(CONTACTS_STORE).clear();
    transaction.objectStore(METADATA_STORE).clear();

    transaction.oncomplete = () => {
      console.log('Database cleared');
      resolve();
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Check if database has data
 * @returns {Promise<boolean>}
 */
export async function hasData() {
  const metadata = await getImportMetadata();
  return metadata !== null && metadata.totalContacts > 0;
}

/**
 * Export database to JSON (for backup)
 * @returns {Promise<Object>}
 */
export async function exportToJSON() {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE, METADATA_STORE], 'readonly');
    const contactsStore = transaction.objectStore(CONTACTS_STORE);
    const metadataStore = transaction.objectStore(METADATA_STORE);

    const contactsRequest = contactsStore.getAll();
    const metadataRequest = metadataStore.getAll();

    let contacts = [];
    let metadata = [];

    contactsRequest.onsuccess = () => { contacts = contactsRequest.result; };
    metadataRequest.onsuccess = () => { metadata = metadataRequest.result; };

    transaction.oncomplete = () => {
      resolve({
        exportDate: new Date().toISOString(),
        metadata: metadata,
        contacts: contacts
      });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Delete contacts by account name pattern
 * @param {string} pattern - Account name pattern to match (case-insensitive)
 * @returns {Promise<{deleted: number}>}
 */
export async function deleteContactsByAccountPattern(pattern) {
  await initDatabase();
  const lowerPattern = pattern.toLowerCase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE, METADATA_STORE], 'readwrite');
    const store = transaction.objectStore(CONTACTS_STORE);
    const request = store.openCursor();
    
    let deleted = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const contact = cursor.value;
        if (contact.accountName && contact.accountName.toLowerCase().includes(lowerPattern)) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      }
    };

    transaction.oncomplete = async () => {
      // Update metadata with new count
      await updateMetadataCount();
      console.log(`Deleted ${deleted} contacts matching "${pattern}"`);
      resolve({ deleted });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Delete contacts by region
 * @param {string} region - Region to delete (exact match, case-insensitive)
 * @returns {Promise<{deleted: number}>}
 */
export async function deleteContactsByRegion(region) {
  await initDatabase();
  const lowerRegion = region.toLowerCase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE, METADATA_STORE], 'readwrite');
    const store = transaction.objectStore(CONTACTS_STORE);
    const request = store.openCursor();
    
    let deleted = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const contact = cursor.value;
        const contactRegion = (contact.accountRegion || '').toLowerCase();
        if (contactRegion === lowerRegion || (lowerRegion === 'unknown' && !contact.accountRegion)) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      }
    };

    transaction.oncomplete = async () => {
      await updateMetadataCount();
      console.log(`Deleted ${deleted} contacts from region "${region}"`);
      resolve({ deleted });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Delete contacts by tier
 * @param {string} tier - Tier to delete (exact match, case-insensitive)
 * @returns {Promise<{deleted: number}>}
 */
export async function deleteContactsByTier(tier) {
  await initDatabase();
  const lowerTier = tier.toLowerCase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE, METADATA_STORE], 'readwrite');
    const store = transaction.objectStore(CONTACTS_STORE);
    const request = store.openCursor();
    
    let deleted = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const contact = cursor.value;
        const contactTier = (contact.partnerTier || '').toLowerCase();
        if (contactTier === lowerTier || (lowerTier === 'unknown' && !contact.partnerTier)) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      }
    };

    transaction.oncomplete = async () => {
      await updateMetadataCount();
      console.log(`Deleted ${deleted} contacts from tier "${tier}"`);
      resolve({ deleted });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Delete a specific account by exact name
 * @param {string} accountName - Exact account name to delete
 * @returns {Promise<{deleted: number}>}
 */
export async function deleteAccount(accountName) {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE, METADATA_STORE], 'readwrite');
    const store = transaction.objectStore(CONTACTS_STORE);
    const index = store.index('accountName');
    const request = index.openCursor(IDBKeyRange.only(accountName));
    
    let deleted = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        deleted++;
        cursor.continue();
      }
    };

    transaction.oncomplete = async () => {
      await updateMetadataCount();
      console.log(`Deleted ${deleted} contacts from account "${accountName}"`);
      resolve({ deleted });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get all contacts (for matching with LMS)
 * @returns {Promise<Array>}
 */
export async function getAllContacts() {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE], 'readonly');
    const store = transaction.objectStore(CONTACTS_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update metadata contact count after deletions
 */
async function updateMetadataCount() {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONTACTS_STORE, METADATA_STORE], 'readwrite');
    const contactsStore = transaction.objectStore(CONTACTS_STORE);
    const metadataStore = transaction.objectStore(METADATA_STORE);

    const countRequest = contactsStore.count();
    
    countRequest.onsuccess = () => {
      const newCount = countRequest.result;
      const getRequest = metadataStore.get('lastImport');
      
      getRequest.onsuccess = () => {
        if (getRequest.result) {
          const metadata = getRequest.result;
          metadata.totalContacts = newCount;
          metadata.lastModified = new Date().toISOString();
          metadataStore.put(metadata);
        }
      };
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// ============================================================================
// LMS USER MATCHING FUNCTIONS
// ============================================================================

/**
 * Store LMS users with their match status
 * @param {Array} lmsUsers - Array of LMS user objects from Northpass API
 * @param {Map} matchMap - Map of email -> contact for matched users
 * @returns {Promise<{stored: number, matched: number, unmatched: number}>}
 */
export async function storeLmsMatchResults(lmsUsers, matchMap) {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([LMS_USERS_STORE, METADATA_STORE], 'readwrite');
    const lmsStore = transaction.objectStore(LMS_USERS_STORE);
    const metadataStore = transaction.objectStore(METADATA_STORE);

    let stored = 0;
    let matched = 0;
    let unmatched = 0;

    // Clear existing LMS users before storing
    const clearRequest = lmsStore.clear();
    
    clearRequest.onsuccess = () => {
      lmsUsers.forEach(user => {
        const email = user.attributes?.email?.toLowerCase() || '';
        const matchedContact = matchMap.get(email);
        
        const lmsRecord = {
          id: user.id,
          email: email,
          firstName: user.attributes?.first_name || '',
          lastName: user.attributes?.last_name || '',
          name: [user.attributes?.first_name, user.attributes?.last_name].filter(Boolean).join(' ') || email || 'Unknown',
          createdAt: user.attributes?.created_at || '',
          lastActiveAt: user.attributes?.last_active_at || '',
          matchStatus: matchedContact ? 'matched' : 'unmatched',
          matchedContactId: matchedContact?.id || null,
          matchedAccountName: matchedContact?.accountName || null,
          matchedPartnerTier: matchedContact?.partnerTier || null,
          matchedAccountRegion: matchedContact?.accountRegion || null,
          rawAttributes: user.attributes || {}
        };

        const addRequest = lmsStore.add(lmsRecord);
        addRequest.onsuccess = () => {
          stored++;
          if (matchedContact) {
            matched++;
          } else {
            unmatched++;
          }
        };
        addRequest.onerror = (e) => {
          console.error('Error storing LMS user:', e);
        };
      });
    };

    transaction.oncomplete = () => {
      // Save LMS matching metadata
      metadataStore.put({
        key: 'lmsMatching',
        matchDate: new Date().toISOString(),
        totalLmsUsers: stored,
        matched: matched,
        unmatched: unmatched,
        matchRate: stored > 0 ? Math.round((matched / stored) * 100) : 0
      });
      
      console.log(`LMS matching stored: ${stored} users (${matched} matched, ${unmatched} unmatched)`);
      resolve({ stored, matched, unmatched });
    };

    transaction.onerror = () => {
      console.error('LMS storage transaction failed:', transaction.error);
      reject(transaction.error);
    };
  });
}

/**
 * Get all LMS users by match status
 * @param {string} status - 'matched', 'unmatched', or 'all'
 * @returns {Promise<Array>}
 */
export async function getLmsUsersByStatus(status = 'all') {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([LMS_USERS_STORE], 'readonly');
    const store = transaction.objectStore(LMS_USERS_STORE);

    if (status === 'all') {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      const index = store.index('matchStatus');
      const request = index.getAll(status);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }
  });
}

/**
 * Get LMS matching metadata
 * @returns {Promise<Object|null>}
 */
export async function getLmsMatchingMetadata() {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([METADATA_STORE], 'readonly');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.get('lmsMatching');

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get unmatched LMS users with optional filtering
 * @param {Object} options - Filter options
 * @param {string} options.searchTerm - Search in name or email
 * @param {string} options.sortBy - Sort field ('name', 'email', 'createdAt', 'lastActiveAt')
 * @param {string} options.sortOrder - 'asc' or 'desc'
 * @returns {Promise<Array>}
 */
export async function getUnmatchedLmsUsers(options = {}) {
  const { searchTerm = '', sortBy = 'name', sortOrder = 'asc' } = options;
  
  const users = await getLmsUsersByStatus('unmatched');
  
  // Filter by search term
  let filtered = users;
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = users.filter(user => 
      user.name?.toLowerCase().includes(term) ||
      user.email?.toLowerCase().includes(term)
    );
  }
  
  // Sort
  filtered.sort((a, b) => {
    let aVal = a[sortBy] || '';
    let bVal = b[sortBy] || '';
    
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    
    if (sortOrder === 'desc') {
      return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
    }
    return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
  });
  
  return filtered;
}

/**
 * Get LMS user statistics by email domain
 * @returns {Promise<Object>} Domain breakdown with match rates
 */
export async function getLmsUserDomainStats() {
  const users = await getLmsUsersByStatus('all');
  
  const domainStats = new Map();
  
  users.forEach(user => {
    if (!user.email) return;
    
    const domain = user.email.split('@')[1] || 'unknown';
    
    if (!domainStats.has(domain)) {
      domainStats.set(domain, { domain, total: 0, matched: 0, unmatched: 0 });
    }
    
    const stats = domainStats.get(domain);
    stats.total++;
    if (user.matchStatus === 'matched') {
      stats.matched++;
    } else {
      stats.unmatched++;
    }
  });
  
  // Convert to array and calculate match rates
  const result = Array.from(domainStats.values())
    .map(d => ({
      ...d,
      matchRate: d.total > 0 ? Math.round((d.matched / d.total) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total);
  
  return result;
}

/**
 * Check if LMS matching data exists
 * @returns {Promise<boolean>}
 */
export async function hasLmsMatchingData() {
  const metadata = await getLmsMatchingMetadata();
  return metadata !== null;
}

/**
 * Clear LMS matching data
 * @returns {Promise<void>}
 */
export async function clearLmsMatchingData() {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([LMS_USERS_STORE, METADATA_STORE], 'readwrite');
    const lmsStore = transaction.objectStore(LMS_USERS_STORE);
    const metadataStore = transaction.objectStore(METADATA_STORE);

    lmsStore.clear();
    metadataStore.delete('lmsMatching');

    transaction.oncomplete = () => {
      console.log('LMS matching data cleared');
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

// ============================================================================
// GROUPS CACHE FUNCTIONS
// ============================================================================

/**
 * Store groups with user counts in cache
 * @param {Array} groups - Array of group objects from Northpass API
 * @param {Object} userCounts - Map of groupId -> userCount
 * @returns {Promise<{stored: number}>}
 */
export async function storeGroupsCache(groups, userCounts = {}) {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([GROUPS_STORE, METADATA_STORE], 'readwrite');
    const groupsStore = transaction.objectStore(GROUPS_STORE);
    const metadataStore = transaction.objectStore(METADATA_STORE);

    let stored = 0;

    // Clear existing groups before storing
    const clearRequest = groupsStore.clear();
    
    clearRequest.onsuccess = () => {
      groups.forEach(group => {
        const groupRecord = {
          id: group.id,
          name: group.attributes?.name || '',
          description: group.attributes?.description || '',
          userCount: userCounts[group.id] ?? null, // null means not yet counted
          rawAttributes: group.attributes || {}
        };

        const addRequest = groupsStore.add(groupRecord);
        addRequest.onsuccess = () => stored++;
        addRequest.onerror = (e) => console.error('Error storing group:', e);
      });
      
      // Save groups cache metadata INSIDE the transaction
      metadataStore.put({
        key: 'groupsCache',
        cacheDate: new Date().toISOString(),
        totalGroups: groups.length,
        hasUserCounts: Object.keys(userCounts).length > 0
      });
    };

    transaction.oncomplete = () => {
      console.log(`Groups cache stored: ${stored} groups`);
      resolve({ stored });
    };

    transaction.onerror = () => {
      console.error('Groups cache transaction failed:', transaction.error);
      reject(transaction.error);
    };
  });
}

/**
 * Get cached groups
 * @returns {Promise<Array>}
 */
export async function getCachedGroups() {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([GROUPS_STORE], 'readonly');
    const store = transaction.objectStore(GROUPS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const groups = request.result.map(g => ({
        id: g.id,
        attributes: {
          name: g.name,
          description: g.description,
          ...g.rawAttributes
        },
        userCount: g.userCount
      }));
      resolve(groups);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update user count for a specific group
 * @param {string} groupId - The group ID
 * @param {number} userCount - The user count
 */
export async function updateGroupUserCount(groupId, userCount) {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([GROUPS_STORE], 'readwrite');
    const store = transaction.objectStore(GROUPS_STORE);
    
    const getRequest = store.get(groupId);
    
    getRequest.onsuccess = () => {
      const group = getRequest.result;
      if (group) {
        group.userCount = userCount;
        store.put(group);
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Update user counts for multiple groups
 * @param {Object} userCounts - Map of groupId -> userCount
 */
export async function updateGroupUserCounts(userCounts) {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([GROUPS_STORE], 'readwrite');
    const store = transaction.objectStore(GROUPS_STORE);
    
    Object.entries(userCounts).forEach(([groupId, count]) => {
      const getRequest = store.get(groupId);
      getRequest.onsuccess = () => {
        const group = getRequest.result;
        if (group) {
          group.userCount = count;
          store.put(group);
        }
      };
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get groups cache metadata
 * @returns {Promise<Object|null>}
 */
export async function getGroupsCacheMetadata() {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([METADATA_STORE], 'readonly');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.get('groupsCache');

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Check if groups cache exists and is recent (within maxAge minutes)
 * @param {number} maxAgeMinutes - Maximum age in minutes (default 60)
 * @returns {Promise<boolean>}
 */
export async function hasValidGroupsCache(maxAgeMinutes = 60) {
  const metadata = await getGroupsCacheMetadata();
  if (!metadata) return false;
  
  const cacheAge = (Date.now() - new Date(metadata.cacheDate).getTime()) / 1000 / 60;
  return cacheAge < maxAgeMinutes;
}

/**
 * Clear groups cache
 * @returns {Promise<void>}
 */
export async function clearGroupsCache() {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([GROUPS_STORE, METADATA_STORE], 'readwrite');
    const groupsStore = transaction.objectStore(GROUPS_STORE);
    const metadataStore = transaction.objectStore(METADATA_STORE);

    groupsStore.clear();
    metadataStore.delete('groupsCache');

    transaction.oncomplete = () => {
      console.log('Groups cache cleared');
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Remove a group from cache (after deletion)
 * @param {string} groupId - The group ID to remove
 */
export async function removeGroupFromCache(groupId) {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([GROUPS_STORE], 'readwrite');
    const store = transaction.objectStore(GROUPS_STORE);
    store.delete(groupId);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Remove multiple groups from cache
 * @param {Array} groupIds - Array of group IDs to remove
 */
export async function removeGroupsFromCache(groupIds) {
  await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([GROUPS_STORE], 'readwrite');
    const store = transaction.objectStore(GROUPS_STORE);
    
    groupIds.forEach(id => store.delete(id));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export default {
  initDatabase,
  importContacts,
  getImportMetadata,
  getAccountSummary,
  getContactsByAccount,
  getContactByEmail,
  searchAccounts,
  getContactsByTier,
  getContactsByRegion,
  getDatabaseStats,
  clearDatabase,
  hasData,
  exportToJSON,
  deleteContactsByAccountPattern,
  deleteContactsByRegion,
  deleteContactsByTier,
  deleteAccount,
  getAllContacts,
  // LMS Matching functions
  storeLmsMatchResults,
  getLmsUsersByStatus,
  getLmsMatchingMetadata,
  getUnmatchedLmsUsers,
  getLmsUserDomainStats,
  hasLmsMatchingData,
  clearLmsMatchingData,
  // Groups Cache functions
  storeGroupsCache,
  getCachedGroups,
  updateGroupUserCount,
  updateGroupUserCounts,
  getGroupsCacheMetadata,
  hasValidGroupsCache,
  clearGroupsCache,
  removeGroupFromCache,
  removeGroupsFromCache
};
