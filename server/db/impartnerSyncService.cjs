/**
 * Impartner PRM Sync Service
 * 
 * Syncs partner accounts and contacts from Impartner PRM to MariaDB
 * Replaces manual CRM Excel import with automated API sync
 * 
 * Supports both full and incremental sync modes
 */

const { query, transaction } = require('./connection.cjs');
const https = require('https');

// Impartner API Configuration
const IMPARTNER_CONFIG = {
  host: 'prod.impartner.live',
  basePath: '/api/objects/v1',
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  tenantId: '1',
  pageSize: 100 // Records per API request
};

// Filter Configuration - matches CRM export filters
const FILTERS = {
  // Partner tier values to include (exclude Pending, blank)
  validTiers: ['Premier', 'Premier Plus', 'Certified', 'Registered', 'Aggregator'],
  
  // Account status to exclude
  excludeAccountStatus: ['Inactive'],
  
  // Contact status to include
  validContactStatus: ['Active'],
  
  // Account names to exclude (case-insensitive contains)
  excludeAccountNames: ['nintex'],
  
  // Email domains to exclude
  excludeEmailDomains: [
    'bill.com',
    'nintex.com',
    'safalo.com',
    'crestan.com'
  ],
  
  // Email patterns to exclude (before @)
  excludeEmailPatterns: [
    'demo',
    'sales',
    'support',
    'accounts',
    'test',
    'renewals',
    'finance',
    'payable'
  ]
};

/**
 * Make an authenticated request to Impartner API
 */
function makeImpartnerRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: IMPARTNER_CONFIG.host,
      path: IMPARTNER_CONFIG.basePath + path,
      method: 'GET',
      headers: {
        'Authorization': `prm-key ${IMPARTNER_CONFIG.apiKey}`,
        'X-PRM-TenantId': IMPARTNER_CONFIG.tenantId,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          // Check for non-200 status
          if (res.statusCode !== 200) {
            console.error(`API returned status ${res.statusCode}: ${data.substring(0, 200)}`);
            reject(new Error(`API returned status ${res.statusCode}`));
            return;
          }
          
          const json = JSON.parse(data);
          if (json.success) {
            resolve(json.data);
          } else {
            reject(new Error(json.message || 'API request failed'));
          }
        } catch (e) {
          // Log raw response for debugging
          console.error(`JSON parse error. Raw response (first 500 chars): ${data.substring(0, 500)}`);
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Fetch all records with pagination
 */
async function fetchAllRecords(objectType, fields, filter = null, sinceDate = null) {
  const records = [];
  let skip = 0;
  let hasMore = true;
  
  // Build query string
  let queryParts = [`fields=${fields}`, `take=${IMPARTNER_CONFIG.pageSize}`];
  
  // Build combined filter
  let filters = [];
  if (filter) {
    filters.push(`(${filter})`);
  }
  
  // Add incremental filter for updated records
  // Impartner uses SQL-style operators: >, <, >=, <=, =, !=
  // Date format: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SS'
  if (sinceDate) {
    // Format date as ISO string (without Z suffix for Impartner)
    let isoDate;
    if (sinceDate instanceof Date) {
      isoDate = sinceDate.toISOString().replace('Z', '');
    } else {
      isoDate = new Date(sinceDate).toISOString().replace('Z', '');
    }
    console.log(`📅 Incremental sync since: ${isoDate}`);
    filters.push(`(Updated > '${isoDate}')`);
  }
  
  // Combine filters with 'and'
  if (filters.length > 0) {
    queryParts.push(`filter=${encodeURIComponent(filters.join(' and '))}`);
  }
  
  console.log(`📥 Fetching ${objectType} records...`);
  if (sinceDate) {
    console.log(`   Using incremental filter since: ${sinceDate}`);
  }
  
  while (hasMore) {
    const path = `/${objectType}?${queryParts.join('&')}&skip=${skip}`;
    
    try {
      const data = await makeImpartnerRequest(path);
      
      if (data.results && data.results.length > 0) {
        records.push(...data.results);
        skip += data.results.length;
        
        if (skip % 500 === 0) {
          console.log(`   📊 Fetched ${skip}/${data.count || '?'} ${objectType} records`);
        }
        
        // Check if we have more records
        hasMore = data.results.length === IMPARTNER_CONFIG.pageSize;
      } else {
        hasMore = false;
      }
    } catch (err) {
      console.error(`❌ Error fetching ${objectType} at skip=${skip}:`, err.message);
      throw err;
    }
  }
  
  console.log(`✅ Fetched ${records.length} ${objectType} records total`);
  return records;
}

/**
 * Filter accounts based on CRM export rules
 */
function filterAccounts(accounts) {
  return accounts.filter(account => {
    // Skip if no name
    if (!account.name) return false;
    
    // Filter by account status (exclude Inactive)
    const status = account.account_Status__cf || '';
    if (FILTERS.excludeAccountStatus.some(s => s.toLowerCase() === status.toLowerCase())) {
      return false;
    }
    
    // Filter by partner tier (only include valid tiers)
    const tier = account.partner_Tier__cf || '';
    if (!FILTERS.validTiers.some(t => t.toLowerCase() === tier.toLowerCase())) {
      return false;
    }
    
    // Exclude accounts with certain names (case-insensitive contains)
    const nameLower = account.name.toLowerCase();
    if (FILTERS.excludeAccountNames.some(n => nameLower.includes(n.toLowerCase()))) {
      return false;
    }
    
    return true;
  });
}

/**
 * Filter users/contacts based on CRM export rules
 */
function filterUsers(users) {
  return users.filter(user => {
    // Must have valid email
    const email = (user.email || '').toLowerCase().trim();
    if (!email || !email.includes('@')) return false;
    
    // Filter by contact status (only Active)
    const status = user.contact_Status__cf || '';
    if (status && !FILTERS.validContactStatus.some(s => s.toLowerCase() === status.toLowerCase())) {
      return false;
    }
    
    // Exclude certain email domains
    const domain = email.split('@')[1] || '';
    if (FILTERS.excludeEmailDomains.some(d => domain.toLowerCase() === d.toLowerCase())) {
      return false;
    }
    
    // Exclude certain email patterns (before @)
    const localPart = email.split('@')[0] || '';
    if (FILTERS.excludeEmailPatterns.some(p => localPart.toLowerCase().includes(p.toLowerCase()))) {
      return false;
    }
    
    return true;
  });
}

/**
 * Get the last successful sync timestamp for incremental syncs
 */
async function getLastSyncTime(syncType) {
  try {
    const result = await query(
      `SELECT MAX(completed_at) as last_sync 
       FROM sync_logs 
       WHERE sync_type = ? AND status = 'completed'`,
      [syncType]
    );
    return result[0]?.last_sync || null;
  } catch (err) {
    console.error('Error getting last sync time:', err.message);
    return null;
  }
}

/**
 * Log sync operation
 */
async function logSync(syncType, status, stats) {
  try {
    await query(
      `INSERT INTO sync_logs (sync_type, status, records_processed, records_created, records_updated, records_failed, details, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ${status === 'completed' ? 'NOW()' : 'NULL'})`,
      [
        syncType,
        status,
        stats.processed || 0,
        stats.created || 0,
        stats.updated || 0,
        stats.failed || 0,
        JSON.stringify(stats)
      ]
    );
  } catch (err) {
    console.error('Error logging sync:', err.message);
  }
}

/**
 * Sync partner accounts from Impartner
 */
async function syncPartners(mode = 'incremental') {
  const syncType = 'impartner_partners';
  console.log(`\n🏢 Starting Impartner Partners Sync (${mode} mode)...`);
  
  const stats = {
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };
  
  try {
    // Get last sync time for incremental mode
    let sinceDate = null;
    if (mode === 'incremental') {
      sinceDate = await getLastSyncTime(syncType);
      if (sinceDate) {
        console.log(`📅 Incremental sync since: ${sinceDate}`);
      } else {
        console.log(`📅 No previous sync found, running full sync`);
      }
    }
    
    // Fetch accounts from Impartner
    const fields = [
      'Id', 'Name', 'Partner_Tier__cf', 'Account_Status__cf',
      'Account_Owner__cf', 'Account_Owner_Email__cf',
      'Partner_Type__cf', 'Website', 'CrmId',
      'MailingCity', 'MailingCountry', 'Region',
      'MemberCount', 'Updated', 'ParentAccountId'
    ].join(',');
    
    const allAccounts = await fetchAllRecords('Account', fields, null, sinceDate);
    
    // Apply filters
    const accounts = filterAccounts(allAccounts);
    console.log(`📋 ${accounts.length} accounts after filtering (${allAccounts.length - accounts.length} filtered out)`);
    
    // Get existing partners for lookup
    const existingPartners = await query('SELECT id, account_name, salesforce_id FROM partners');
    const partnerByName = new Map();
    const partnerBySfId = new Map();
    existingPartners.forEach(p => {
      partnerByName.set(p.account_name.toLowerCase(), p);
      if (p.salesforce_id) {
        partnerBySfId.set(p.salesforce_id, p);
      }
    });
    
    // Process accounts
    for (const account of accounts) {
      stats.processed++;
      
      try {
        const accountName = account.name;
        const salesforceId = account.crmId || null;
        const impartnerParentId = account.parentAccountId || null;
        
        // Look up existing partner by Salesforce ID first, then by name
        let existing = null;
        if (salesforceId) {
          existing = partnerBySfId.get(salesforceId);
        }
        if (!existing) {
          existing = partnerByName.get(accountName.toLowerCase());
        }
        
        // Prepare data - map Impartner fields to our schema
        const partnerData = {
          account_name: accountName,
          partner_tier: account.partner_Tier__cf || null,
          account_region: account.mailingCountry || null, // Using country as region
          account_owner: account.account_Owner__cf || null,
          owner_email: account.account_Owner_Email__cf || null,
          partner_type: account.partner_Type__cf || null,
          salesforce_id: salesforceId,
          website: account.website || null,
          impartner_parent_id: impartnerParentId
        };
        
        if (existing) {
          // Update existing partner
          await query(
            `UPDATE partners SET
               partner_tier = ?,
               account_region = ?,
               account_owner = ?,
               owner_email = ?,
               partner_type = ?,
               salesforce_id = ?,
               website = ?,
               impartner_parent_id = ?,
               updated_at = NOW()
             WHERE id = ?`,
            [
              partnerData.partner_tier,
              partnerData.account_region,
              partnerData.account_owner,
              partnerData.owner_email,
              partnerData.partner_type,
              partnerData.salesforce_id,
              partnerData.website,
              partnerData.impartner_parent_id,
              existing.id
            ]
          );
          stats.updated++;
        } else {
          // Insert new partner
          await query(
            `INSERT INTO partners (account_name, partner_tier, account_region, account_owner, owner_email, partner_type, salesforce_id, website, impartner_parent_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              partnerData.account_name,
              partnerData.partner_tier,
              partnerData.account_region,
              partnerData.account_owner,
              partnerData.owner_email,
              partnerData.partner_type,
              partnerData.salesforce_id,
              partnerData.website,
              partnerData.impartner_parent_id
            ]
          );
          stats.created++;
        }
        
        // Progress logging
        if (stats.processed % 100 === 0) {
          console.log(`   📊 Processed ${stats.processed}/${accounts.length} partners`);
        }
      } catch (err) {
        stats.failed++;
        stats.errors.push({ account: account.name, error: err.message });
        console.error(`❌ Error processing partner ${account.name}:`, err.message);
      }
    }
    
    // Log sync completion
    await logSync(syncType, 'completed', stats);
    
    console.log(`\n✅ Partners Sync Complete:`);
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   Created: ${stats.created}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Failed: ${stats.failed}`);
    
    return stats;
    
  } catch (err) {
    stats.errors.push({ error: err.message });
    await logSync(syncType, 'failed', stats);
    throw err;
  }
}

/**
 * Sync contacts/users from Impartner
 */
async function syncContacts(mode = 'incremental') {
  const syncType = 'impartner_contacts';
  console.log(`\n👥 Starting Impartner Contacts Sync (${mode} mode)...`);
  
  const stats = {
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    lmsLinksPreserved: 0,
    errors: []
  };
  
  try {
    // Get last sync time for incremental mode
    let sinceDate = null;
    if (mode === 'incremental') {
      sinceDate = await getLastSyncTime(syncType);
      if (sinceDate) {
        console.log(`📅 Incremental sync since: ${sinceDate}`);
      } else {
        console.log(`📅 No previous sync found, running full sync`);
      }
    }
    
    // Fetch users from Impartner
    const fields = [
      'Id', 'Email', 'FirstName', 'LastName', 'Title', 'Phone',
      'Account', 'AccountName', 'Contact_Status__cf',
      'IsActive', 'CrmId', 'Updated'
    ].join(',');
    
    const allUsers = await fetchAllRecords('User', fields, null, sinceDate);
    
    // Apply filters
    const users = filterUsers(allUsers);
    console.log(`📋 ${users.length} contacts after filtering (${allUsers.length - users.length} filtered out)`);
    
    // Get existing contacts with LMS links (to preserve them)
    const existingContacts = await query('SELECT id, email, lms_user_id FROM contacts');
    const contactByEmail = new Map();
    existingContacts.forEach(c => {
      contactByEmail.set(c.email.toLowerCase(), c);
    });
    console.log(`🔗 Found ${existingContacts.filter(c => c.lms_user_id).length} existing LMS links to preserve`);
    
    // Get partners for lookup
    const partners = await query('SELECT id, account_name FROM partners');
    const partnerByName = new Map();
    partners.forEach(p => {
      partnerByName.set(p.account_name.toLowerCase(), p.id);
    });
    
    // Process users in batches
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, Math.min(i + BATCH_SIZE, users.length));
      
      for (const user of batch) {
        stats.processed++;
        
        try {
          const email = user.email.toLowerCase().trim();
          const existing = contactByEmail.get(email);
          
          // Look up partner by account name
          const accountName = user.accountName || '';
          const partnerId = partnerByName.get(accountName.toLowerCase()) || null;
          
          // Prepare contact data
          const contactData = {
            partner_id: partnerId,
            email: email,
            first_name: user.firstName || null,
            last_name: user.lastName || null,
            title: user.title || null,
            phone: user.phone || null
          };
          
          if (existing) {
            // Preserve LMS link
            if (existing.lms_user_id) {
              stats.lmsLinksPreserved++;
            }
            
            // Update existing contact
            await query(
              `UPDATE contacts SET
                 partner_id = ?,
                 first_name = ?,
                 last_name = ?,
                 title = ?,
                 phone = ?,
                 updated_at = NOW()
               WHERE id = ?`,
              [
                contactData.partner_id,
                contactData.first_name,
                contactData.last_name,
                contactData.title,
                contactData.phone,
                existing.id
              ]
            );
            stats.updated++;
          } else {
            // Insert new contact
            await query(
              `INSERT INTO contacts (partner_id, email, first_name, last_name, title, phone)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                contactData.partner_id,
                contactData.email,
                contactData.first_name,
                contactData.last_name,
                contactData.title,
                contactData.phone
              ]
            );
            stats.created++;
          }
        } catch (err) {
          stats.failed++;
          stats.errors.push({ email: user.email, error: err.message });
          // Don't log every error, just count them
        }
      }
      
      // Progress logging
      if (stats.processed % 500 === 0) {
        console.log(`   📊 Processed ${stats.processed}/${users.length} contacts`);
      }
    }
    
    // Log sync completion
    await logSync(syncType, 'completed', stats);
    
    console.log(`\n✅ Contacts Sync Complete:`);
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   Created: ${stats.created}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log(`   LMS Links Preserved: ${stats.lmsLinksPreserved}`);
    
    if (stats.errors.length > 0 && stats.errors.length <= 10) {
      console.log(`   Errors:`, stats.errors);
    } else if (stats.errors.length > 10) {
      console.log(`   First 10 errors:`, stats.errors.slice(0, 10));
    }
    
    return stats;
    
  } catch (err) {
    stats.errors.push({ error: err.message });
    await logSync(syncType, 'failed', stats);
    throw err;
  }
}

/**
 * Run full sync (partners then contacts)
 */
async function syncAll(mode = 'incremental') {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔄 IMPARTNER FULL SYNC - ${mode.toUpperCase()} MODE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  
  const results = {
    partners: null,
    contacts: null,
    success: false,
    duration: 0
  };
  
  const startTime = Date.now();
  
  try {
    // Sync partners first (contacts reference them)
    results.partners = await syncPartners(mode);
    
    // Then sync contacts
    results.contacts = await syncContacts(mode);
    
    results.success = true;
    results.duration = Date.now() - startTime;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ IMPARTNER SYNC COMPLETE`);
    console.log(`   Duration: ${(results.duration / 1000).toFixed(1)}s`);
    console.log(`   Partners: ${results.partners.created} created, ${results.partners.updated} updated`);
    console.log(`   Contacts: ${results.contacts.created} created, ${results.contacts.updated} updated`);
    console.log(`${'='.repeat(60)}\n`);
    
    return results;
    
  } catch (err) {
    results.duration = Date.now() - startTime;
    results.error = err.message;
    console.error(`\n❌ IMPARTNER SYNC FAILED: ${err.message}`);
    throw err;
  }
}

/**
 * Get sync status and stats
 */
async function getSyncStatus() {
  try {
    // Get last partner sync
    const lastPartnerSync = await query(
      `SELECT * FROM sync_logs WHERE sync_type = 'impartner_partners' ORDER BY started_at DESC LIMIT 1`
    );
    
    // Get last contact sync
    const lastContactSync = await query(
      `SELECT * FROM sync_logs WHERE sync_type = 'impartner_contacts' ORDER BY started_at DESC LIMIT 1`
    );
    
    // Get current counts
    const partnerCount = await query('SELECT COUNT(*) as count FROM partners');
    const contactCount = await query('SELECT COUNT(*) as count FROM contacts');
    const linkedContacts = await query('SELECT COUNT(*) as count FROM contacts WHERE lms_user_id IS NOT NULL');
    
    return {
      partners: {
        totalCount: partnerCount[0]?.count || 0,
        lastSync: lastPartnerSync[0] || null
      },
      contacts: {
        totalCount: contactCount[0]?.count || 0,
        linkedToLms: linkedContacts[0]?.count || 0,
        lastSync: lastContactSync[0] || null
      },
      filters: FILTERS
    };
  } catch (err) {
    console.error('Error getting sync status:', err.message);
    throw err;
  }
}

/**
 * Preview what would be synced (dry run)
 */
async function previewSync() {
  console.log(`\n📋 IMPARTNER SYNC PREVIEW (Dry Run)`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // Fetch and filter accounts
    const accountFields = 'Id,Name,Partner_Tier__cf,Account_Status__cf';
    const allAccounts = await fetchAllRecords('Account', accountFields);
    const filteredAccounts = filterAccounts(allAccounts);
    
    // Fetch and filter users (sample)
    const userFields = 'Id,Email,Contact_Status__cf,AccountName';
    const allUsers = await fetchAllRecords('User', userFields);
    const filteredUsers = filterUsers(allUsers);
    
    // Get current database counts
    const currentPartners = await query('SELECT COUNT(*) as count FROM partners');
    const currentContacts = await query('SELECT COUNT(*) as count FROM contacts');
    
    const preview = {
      accounts: {
        impartnerTotal: allAccounts.length,
        afterFilters: filteredAccounts.length,
        filtered: allAccounts.length - filteredAccounts.length,
        currentInDb: currentPartners[0]?.count || 0
      },
      users: {
        impartnerTotal: allUsers.length,
        afterFilters: filteredUsers.length,
        filtered: allUsers.length - filteredUsers.length,
        currentInDb: currentContacts[0]?.count || 0
      },
      filters: FILTERS,
      sampleFilteredAccounts: allAccounts
        .filter(a => !filterAccounts([a]).length)
        .slice(0, 5)
        .map(a => ({ name: a.name, tier: a.partner_Tier__cf, status: a.account_Status__cf })),
      sampleFilteredUsers: allUsers
        .filter(u => !filterUsers([u]).length)
        .slice(0, 5)
        .map(u => ({ email: u.email, status: u.contact_Status__cf }))
    };
    
    console.log(`\n📊 ACCOUNTS:`);
    console.log(`   Impartner total: ${preview.accounts.impartnerTotal}`);
    console.log(`   After filters: ${preview.accounts.afterFilters}`);
    console.log(`   Would be filtered out: ${preview.accounts.filtered}`);
    console.log(`   Current in database: ${preview.accounts.currentInDb}`);
    
    console.log(`\n👥 USERS/CONTACTS:`);
    console.log(`   Impartner total: ${preview.users.impartnerTotal}`);
    console.log(`   After filters: ${preview.users.afterFilters}`);
    console.log(`   Would be filtered out: ${preview.users.filtered}`);
    console.log(`   Current in database: ${preview.users.currentInDb}`);
    
    return preview;
    
  } catch (err) {
    console.error(`❌ Preview failed: ${err.message}`);
    throw err;
  }
}

module.exports = {
  syncPartners,
  syncContacts,
  syncAll,
  getSyncStatus,
  previewSync,
  FILTERS
};
