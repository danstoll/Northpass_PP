/**
 * Impartner PRM Sync Service
 * 
 * Syncs partner accounts and contacts from Impartner PRM to MariaDB
 * Replaces manual CRM Excel import with automated API sync
 * 
 * Supports both full and incremental sync modes
 * 
 * Includes LMS offboarding when partners/contacts are deactivated
 */

const { query, transaction } = require('./connection.cjs');
const https = require('https');
const { offboardPartner, offboardContact } = require('./offboardingService.cjs');

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
  
  // Contact IsActive flag - must be true (filters out IsActive=false)
  requireActiveContacts: true,
  
  // Contact status values to EXCLUDE (custom field Contact_Status__cf)
  // This explicitly filters out Inactive contacts
  excludeContactStatus: ['Inactive', 'Terminated', 'Suspended', 'Deactivated'],
  
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
 * Returns { valid: [], filtered: [], filterReasons: {} }
 */
function filterAccounts(accounts, logDetails = false) {
  const valid = [];
  const filtered = [];
  const filterReasons = {
    noName: 0,
    inactive: 0,
    invalidTier: 0,
    excludedName: 0
  };
  
  for (const account of accounts) {
    // Skip if no name
    if (!account.name) {
      filterReasons.noName++;
      filtered.push({ account, reason: 'noName' });
      continue;
    }
    
    // Filter by account status (exclude Inactive)
    const status = account.account_Status__cf || '';
    if (FILTERS.excludeAccountStatus.some(s => s.toLowerCase() === status.toLowerCase())) {
      filterReasons.inactive++;
      filtered.push({ account, reason: 'inactive', status });
      if (logDetails && filterReasons.inactive <= 5) {
        console.log(`   ⏭️ Filtered (Inactive): ${account.name}`);
      }
      continue;
    }
    
    // Filter by partner tier (only include valid tiers)
    const tier = account.partner_Tier__cf || '';
    if (!FILTERS.validTiers.some(t => t.toLowerCase() === tier.toLowerCase())) {
      filterReasons.invalidTier++;
      filtered.push({ account, reason: 'invalidTier', tier });
      if (logDetails && filterReasons.invalidTier <= 5) {
        console.log(`   ⏭️ Filtered (Invalid tier '${tier}'): ${account.name}`);
      }
      continue;
    }
    
    // Exclude accounts with certain names (case-insensitive contains)
    const nameLower = account.name.toLowerCase();
    if (FILTERS.excludeAccountNames.some(n => nameLower.includes(n.toLowerCase()))) {
      filterReasons.excludedName++;
      filtered.push({ account, reason: 'excludedName' });
      if (logDetails && filterReasons.excludedName <= 5) {
        console.log(`   ⏭️ Filtered (Excluded name): ${account.name}`);
      }
      continue;
    }
    
    valid.push(account);
  }
  
  return { valid, filtered, filterReasons };
}

/**
 * Filter users/contacts based on CRM export rules
 * Returns { valid: [], filterStats: {} }
 */
function filterUsers(users, logDetails = false) {
  const valid = [];
  const filterStats = {
    noEmail: 0,
    isActiveNo: 0,
    contactStatusInactive: 0,
    excludedDomain: 0,
    excludedPattern: 0
  };
  
  for (const user of users) {
    // Must have valid email
    const email = (user.email || '').toLowerCase().trim();
    if (!email || !email.includes('@')) {
      filterStats.noEmail++;
      continue;
    }
    
    // Filter by IsActive flag (must be true)
    // Impartner returns isActive as boolean or string
    const isActive = user.isActive;
    if (isActive === false || isActive === 'false' || isActive === 0 || isActive === '0') {
      filterStats.isActiveNo++;
      if (logDetails && filterStats.isActiveNo <= 5) {
        console.log(`   ⏭️ Filtered (IsActive=No): ${email}`);
      }
      continue;
    }
    
    // Filter by contact status - exclude Inactive contacts
    // Check both possible field names (Contact_Status__cf and contact_Status__c)
    const status = user.contact_Status__cf || user.contact_Status__c || '';
    const statusLower = status.toLowerCase();
    if (FILTERS.excludeContactStatus.some(s => s.toLowerCase() === statusLower)) {
      filterStats.contactStatusInactive++;
      if (logDetails && filterStats.contactStatusInactive <= 5) {
        console.log(`   ⏭️ Filtered (Contact_Status=${status}): ${email}`);
      }
      continue;
    }
    
    // Exclude certain email domains
    const domain = email.split('@')[1] || '';
    if (FILTERS.excludeEmailDomains.some(d => domain.toLowerCase() === d.toLowerCase())) {
      filterStats.excludedDomain++;
      continue;
    }
    
    // Exclude certain email patterns (before @)
    const localPart = email.split('@')[0] || '';
    if (FILTERS.excludeEmailPatterns.some(p => localPart.toLowerCase().includes(p.toLowerCase()))) {
      filterStats.excludedPattern++;
      continue;
    }
    
    valid.push(user);
  }
  
  return { valid, filterStats };
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
 * Log sync operation with full stats
 */
async function logSync(syncType, status, stats) {
  try {
    await query(
      `INSERT INTO sync_logs (sync_type, status, records_processed, records_created, records_updated, records_deleted, records_skipped, records_failed, details, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === 'completed' ? 'NOW()' : 'NULL'})`,
      [
        syncType,
        status,
        stats.processed || 0,
        stats.created || 0,
        stats.updated || 0,
        stats.deleted || 0,
        stats.skipped || 0,
        stats.failed || 0,
        JSON.stringify(stats)
      ]
    );
    console.log(`📝 Logged sync: ${syncType} - ${status}`);
  } catch (err) {
    console.error('Error logging sync:', err.message);
  }
}

/**
 * Sync partner accounts from Impartner
 * Handles create, update, and soft-delete (marks inactive if removed from Impartner)
 */
async function syncPartners(mode = 'incremental') {
  const syncType = 'impartner_partners';
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏢 IMPARTNER PARTNERS SYNC - ${mode.toUpperCase()} MODE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  
  const stats = {
    processed: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    reactivated: 0,
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
        mode = 'full'; // Fall back to full sync
      }
    }
    
    // Fetch Region lookup table for mapping regionId to name
    console.log('📍 Fetching Region lookup table...');
    let regionMap = new Map();
    try {
      const regions = await fetchAllRecords('Region', 'Id,Name');
      regions.forEach(r => regionMap.set(r.id, r.name));
      console.log(`   Found ${regions.length} regions:`, [...regionMap.entries()].map(([id, name]) => `${id}=${name}`).join(', '));
    } catch (err) {
      console.warn('   ⚠️ Could not fetch Region table:', err.message);
      // Fallback hardcoded mapping (as of Jan 2026)
      regionMap.set(1785, 'Americas');
      regionMap.set(1786, 'APAC');
      regionMap.set(1787, 'EMEA');
      regionMap.set(2159, 'Emerging Markets');
      console.log('   Using fallback region mapping');
    }
    
    // Fetch accounts from Impartner (use RegionId not Region)
    const fields = [
      'Id', 'Name', 'Partner_Tier__cf', 'Account_Status__cf',
      'Account_Owner__cf', 'Account_Owner_Email__cf',
      'Partner_Type__cf', 'Website', 'CrmId',
      'MailingCity', 'MailingCountry', 'RegionId',
      'MemberCount', 'Updated', 'ParentAccountId', 'PrimaryUserId'
    ].join(',');
    
    // API-level filters to reduce data transfer:
    // - Only include valid partner tiers (but include ALL statuses including Inactive for offboarding)
    // Note: We still filter client-side for excluded names (contains check not supported in API)
    // Note: We fetch inactive accounts too so we can detect them and trigger offboarding
    const validTiersFilter = FILTERS.validTiers.map(t => `Partner_Tier__cf = '${t}'`).join(' or ');
    const accountFilter = `(${validTiersFilter})`;
    
    const allAccounts = await fetchAllRecords('Account', fields, accountFilter, sinceDate);
    console.log(`📥 Fetched ${allAccounts.length} accounts from Impartner (API filtered: valid tiers, includes inactive for offboarding)`);
    
    // Collect PrimaryUserIds for batch lookup
    const primaryUserIds = new Set();
    allAccounts.forEach(a => {
      if (a.primaryUserId) primaryUserIds.add(a.primaryUserId);
    });
    
    // Batch fetch primary user details
    console.log(`👤 Fetching ${primaryUserIds.size} primary users...`);
    const primaryUserMap = new Map();
    if (primaryUserIds.size > 0) {
      try {
        // Fetch users in batches of 50
        const userIdArray = Array.from(primaryUserIds);
        for (let i = 0; i < userIdArray.length; i += 50) {
          const batch = userIdArray.slice(i, i + 50);
          // Use 'Id in (list)' syntax which Impartner supports
          const userFilter = `Id in (${batch.join(',')})`;
          const users = await fetchAllRecords('User', 'Id,Email,FirstName,LastName,FullName', userFilter);
          users.forEach(u => {
            primaryUserMap.set(u.id, {
              name: u.fullName || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
              email: u.email
            });
          });
        }
        console.log(`   ✅ Fetched ${primaryUserMap.size} primary user details`);
      } catch (err) {
        console.warn(`   ⚠️ Could not fetch primary users: ${err.message}`);
      }
    }
    
    // Apply filters with detailed logging
    const filterResult = filterAccounts(allAccounts, true);
    const accounts = filterResult.valid;
    const filteredCount = filterResult.filtered.length;
    
    console.log(`\n📋 FILTER RESULTS:`);
    console.log(`   ✅ Valid accounts: ${accounts.length}`);
    console.log(`   ❌ Filtered out: ${filteredCount}`);
    console.log(`      - No name: ${filterResult.filterReasons.noName}`);
    console.log(`      - Inactive status: ${filterResult.filterReasons.inactive}`);
    console.log(`      - Invalid tier: ${filterResult.filterReasons.invalidTier}`);
    console.log(`      - Excluded name: ${filterResult.filterReasons.excludedName}`);
    
    // Build set of valid Impartner IDs for deletion detection (full sync only)
    const validImpartnerIds = new Set();
    // Also track accounts that were FILTERED (inactive, etc) - they should be soft-deleted too
    const filteredImpartnerIds = new Set();
    
    if (mode === 'full') {
      accounts.forEach(a => validImpartnerIds.add(a.id));
      // Track filtered accounts so we can soft-delete them if they exist in our DB
      filterResult.filtered.forEach(f => {
        if (f.account?.id) filteredImpartnerIds.add(f.account.id);
      });
    }
    
    // Get existing partners for lookup
    const existingPartners = await query('SELECT id, account_name, salesforce_id, impartner_id, is_active FROM partners');
    const partnerByName = new Map();
    const partnerBySfId = new Map();
    const partnerBySfId15 = new Map(); // For 15-char prefix matching
    const partnerByImpartnerId = new Map();
    
    existingPartners.forEach(p => {
      partnerByName.set(p.account_name.toLowerCase(), p);
      if (p.salesforce_id) {
        partnerBySfId.set(p.salesforce_id, p);
        // Also index by first 15 chars for matching 18-char IDs
        if (p.salesforce_id.length === 15) {
          partnerBySfId15.set(p.salesforce_id, p);
        } else if (p.salesforce_id.length === 18) {
          partnerBySfId15.set(p.salesforce_id.substring(0, 15), p);
        }
      }
      if (p.impartner_id) partnerByImpartnerId.set(p.impartner_id, p);
    });
    
    console.log(`💾 Existing partners in DB: ${existingPartners.length}`);
    console.log(`   - Active: ${existingPartners.filter(p => p.is_active !== 0).length}`);
    console.log(`   - Inactive: ${existingPartners.filter(p => p.is_active === 0).length}`);
    
    // Process accounts
    for (const account of accounts) {
      stats.processed++;
      
      try {
        const accountName = account.name;
        const salesforceId = account.crmId || null;
        const impartnerId = account.id;
        const impartnerParentId = account.parentAccountId || null;
        
        // Look up existing partner by Impartner ID first, then Salesforce ID, then by name
        let existing = partnerByImpartnerId.get(impartnerId);
        if (!existing && salesforceId) {
          // Try exact match first
          existing = partnerBySfId.get(salesforceId);
          // If no match and ID is 18 chars, try 15-char prefix match
          if (!existing && salesforceId.length === 18) {
            existing = partnerBySfId15.get(salesforceId.substring(0, 15));
          }
        }
        if (!existing) {
          existing = partnerByName.get(accountName.toLowerCase());
        }
        
        // Prepare data - map Impartner fields to our schema
        // Map regionId to region name using lookup table
        const regionName = account.regionId ? regionMap.get(account.regionId) : null;
        
        // Get primary user details
        const primaryUser = account.primaryUserId ? primaryUserMap.get(account.primaryUserId) : null;
        
        const partnerData = {
          account_name: accountName,
          partner_tier: account.partner_Tier__cf || null,
          account_status: account.account_Status__cf || 'Active',
          account_region: regionName,  // Region = Americas, APAC, EMEA, Emerging Markets
          country: account.mailingCountry || null, // Country = United States, Australia, etc.
          account_owner: account.account_Owner__cf || null,
          owner_email: account.account_Owner_Email__cf || null,
          primary_user_name: primaryUser?.name || null,
          primary_user_email: primaryUser?.email || null,
          primary_user_id: account.primaryUserId || null,
          partner_type: account.partner_Type__cf || null,
          salesforce_id: salesforceId,
          website: account.website || null,
          impartner_id: impartnerId,
          impartner_parent_id: impartnerParentId
        };
        
        if (existing) {
          // Check if previously deleted/inactive and reactivate
          const wasInactive = existing.is_active === 0;
          
          // Update existing partner
          await query(
            `UPDATE partners SET
               partner_tier = ?,
               account_status = ?,
               account_region = ?,
               country = ?,
               account_owner = ?,
               owner_email = ?,
               primary_user_name = ?,
               primary_user_email = ?,
               primary_user_id = ?,
               partner_type = ?,
               salesforce_id = ?,
               website = ?,
               impartner_id = ?,
               impartner_parent_id = ?,
               is_active = TRUE,
               deleted_at = NULL,
               updated_at = NOW()
             WHERE id = ?`,
            [
              partnerData.partner_tier,
              partnerData.account_status,
              partnerData.account_region,
              partnerData.country,
              partnerData.account_owner,
              partnerData.owner_email,
              partnerData.primary_user_name,
              partnerData.primary_user_email,
              partnerData.primary_user_id,
              partnerData.partner_type,
              partnerData.salesforce_id,
              partnerData.website,
              partnerData.impartner_id,
              partnerData.impartner_parent_id,
              existing.id
            ]
          );
          
          if (wasInactive) {
            stats.reactivated++;
            console.log(`   ♻️ Reactivated: ${accountName}`);
          }
          stats.updated++;
        } else {
          // Insert new partner
          await query(
            `INSERT INTO partners (account_name, partner_tier, account_status, account_region, country, account_owner, owner_email, primary_user_name, primary_user_email, primary_user_id, partner_type, salesforce_id, website, impartner_id, impartner_parent_id, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [
              partnerData.account_name,
              partnerData.partner_tier,
              partnerData.account_status,
              partnerData.account_region,
              partnerData.country,
              partnerData.account_owner,
              partnerData.owner_email,
              partnerData.primary_user_name,
              partnerData.primary_user_email,
              partnerData.primary_user_id,
              partnerData.partner_type,
              partnerData.salesforce_id,
              partnerData.website,
              partnerData.impartner_id,
              partnerData.impartner_parent_id
            ]
          );
          stats.created++;
          console.log(`   ➕ Created: ${accountName}`);
        }
        
        // Progress logging
        if (stats.processed % 100 === 0) {
          console.log(`   📊 Processed ${stats.processed}/${accounts.length} partners`);
        }
      } catch (err) {
        stats.failed++;
        stats.errors.push({ account: account.name, error: err.message });
        console.error(`   ❌ Error processing ${account.name}: ${err.message}`);
      }
    }
    
    // DELETION DETECTION (full sync only)
    // Mark partners as deleted if they:
    // 1. Exist in our DB but not in Impartner anymore, OR
    // 2. Exist in Impartner but were filtered out (inactive, invalid tier, etc)
    if (mode === 'full' && (validImpartnerIds.size > 0 || filteredImpartnerIds.size > 0)) {
      console.log(`\n🔍 Processing filtered accounts to link with existing partners...`);
      
      // First, process filtered accounts to set impartner_id on matching existing partners
      // This allows us to detect them for soft-deletion
      let linkedFiltered = 0;
      for (const filtered of filterResult.filtered) {
        const account = filtered.account;
        if (!account || !account.id) continue;
        
        const salesforceId = account.crmId || null;
        const accountName = account.name || '';
        
        // Look up existing partner
        let existing = partnerByImpartnerId.get(account.id);
        if (!existing && salesforceId) {
          existing = partnerBySfId.get(salesforceId);
          if (!existing && salesforceId.length === 18) {
            existing = partnerBySfId15.get(salesforceId.substring(0, 15));
          }
        }
        if (!existing && accountName) {
          existing = partnerByName.get(accountName.toLowerCase());
        }
        
        if (existing && !existing.impartner_id) {
          // Link this filtered account to the existing partner
          await query(
            `UPDATE partners SET impartner_id = ?, salesforce_id = COALESCE(?, salesforce_id) WHERE id = ?`,
            [account.id, salesforceId, existing.id]
          );
          linkedFiltered++;
          if (linkedFiltered <= 5) {
            console.log(`   🔗 Linked filtered account: ${accountName} (${filtered.reason})`);
          }
        }
      }
      if (linkedFiltered > 0) {
        console.log(`   📊 Linked ${linkedFiltered} filtered accounts to existing partners`);
      }
      
      console.log(`\n🔍 Checking for deleted/inactive partners...`);
      console.log(`   📊 Valid Impartner IDs: ${validImpartnerIds.size}`);
      console.log(`   📊 Filtered Impartner IDs: ${filteredImpartnerIds.size}`);
      
      // Get all active partners with impartner_id
      const activePartners = await query(
        `SELECT id, account_name, impartner_id FROM partners WHERE is_active = TRUE AND impartner_id IS NOT NULL`
      );
      console.log(`   📊 Active partners with impartner_id in DB: ${activePartners.length}`);
      
      let deletedCount = 0;
      let inactiveCount = 0;
      let checkedCount = 0;
      let offboardedCount = 0;
      
      for (const partner of activePartners) {
        checkedCount++;
        // Check if partner is NOT in valid set
        if (!validImpartnerIds.has(partner.impartner_id)) {
          // Check WHY - is it filtered or completely gone?
          const reason = filteredImpartnerIds.has(partner.impartner_id) 
            ? 'filtered (inactive/invalid tier)' 
            : 'removed from Impartner';
          
          // Soft delete the partner
          await query(
            `UPDATE partners SET is_active = FALSE, deleted_at = NOW(), account_status = 'Inactive' WHERE id = ?`,
            [partner.id]
          );
          stats.deleted++;
          
          // LMS Offboarding: Remove users from All Partners group and delete partner's LMS group
          try {
            console.log(`   🚪 Offboarding partner from LMS: ${partner.account_name}...`);
            const offboardResult = await offboardPartner(partner.id);
            if (offboardResult.success) {
              offboardedCount++;
              stats.offboarded = (stats.offboarded || 0) + 1;
              stats.usersRemovedFromAllPartners = (stats.usersRemovedFromAllPartners || 0) + offboardResult.usersRemovedFromAllPartners;
              if (offboardResult.partnerGroupDeleted) {
                stats.lmsGroupsDeleted = (stats.lmsGroupsDeleted || 0) + 1;
              }
            }
          } catch (offboardErr) {
            console.error(`   ⚠️ Offboarding failed for ${partner.account_name}:`, offboardErr.message);
            stats.offboardErrors = stats.offboardErrors || [];
            stats.offboardErrors.push({ partnerId: partner.id, error: offboardErr.message });
          }
          
          if (filteredImpartnerIds.has(partner.impartner_id)) {
            inactiveCount++;
            console.log(`   🚫 Deactivated: ${partner.account_name} (now ${reason})`);
          } else {
            deletedCount++;
            console.log(`   🗑️ Soft-deleted: ${partner.account_name} (${reason})`);
          }
        }
      }
      
      if (deletedCount > 0 || inactiveCount > 0) {
        console.log(`   Summary: ${deletedCount} deleted, ${inactiveCount} deactivated, ${offboardedCount} offboarded from LMS`);
      } else {
        console.log(`   ✓ No deletions or deactivations needed`);
      }
    }
    
    // Log sync completion
    await logSync(syncType, 'completed', stats);
    
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`✅ PARTNERS SYNC COMPLETE`);
    console.log(`   📊 Processed: ${stats.processed}`);
    console.log(`   ➕ Created: ${stats.created}`);
    console.log(`   📝 Updated: ${stats.updated}`);
    console.log(`   ♻️ Reactivated: ${stats.reactivated}`);
    console.log(`   🗑️ Soft-deleted: ${stats.deleted}`);
    if (stats.offboarded) {
      console.log(`   🚪 LMS Offboarded: ${stats.offboarded} partners`);
      console.log(`      - Users removed from All Partners: ${stats.usersRemovedFromAllPartners || 0}`);
      console.log(`      - LMS Groups deleted: ${stats.lmsGroupsDeleted || 0}`);
    }
    console.log(`   ❌ Failed: ${stats.failed}`);
    console.log(`${'='.repeat(60)}\n`);
    
    return stats;
    
  } catch (err) {
    stats.errors.push({ error: err.message });
    await logSync(syncType, 'failed', stats);
    console.error(`\n❌ PARTNERS SYNC FAILED: ${err.message}`);
    throw err;
  }
}

/**
 * Sync contacts/users from Impartner
 * Handles create, update, and soft-delete (marks inactive if removed from Impartner)
 */
async function syncContacts(mode = 'incremental') {
  const syncType = 'impartner_contacts';
  console.log(`\n${'='.repeat(60)}`);
  console.log(`👥 IMPARTNER CONTACTS SYNC - ${mode.toUpperCase()} MODE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  
  const stats = {
    processed: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    reactivated: 0,
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
        mode = 'full'; // Fall back to full sync
      }
    }
    
    // Fetch users from Impartner
    const fields = [
      'Id', 'Email', 'FirstName', 'LastName', 'Title', 'Phone',
      'Account', 'AccountName', 'Contact_Status__cf',
      'IsActive', 'CrmId', 'Updated'
    ].join(',');
    
    // API-level filters to reduce data transfer:
    // - Only active users (IsActive = true)
    // - Exclude inactive contact status
    // Note: We still filter client-side for excluded email domains/patterns (not supported in API)
    const userFilter = `IsActive = true and Contact_Status__cf != 'Inactive'`;
    
    const allUsers = await fetchAllRecords('User', fields, userFilter, sinceDate);
    console.log(`📥 Fetched ${allUsers.length} users from Impartner (API filtered: IsActive=true, Contact_Status!=Inactive)`);
    
    // Apply filters
    const { valid: users, filterStats } = filterUsers(allUsers, true);
    const filteredCount = allUsers.length - users.length;
    console.log(`📋 After filtering: ${users.length} valid, ${filteredCount} filtered out`);
    console.log(`   Filter breakdown:`);
    console.log(`   - No email: ${filterStats.noEmail}`);
    console.log(`   - IsActive=No: ${filterStats.isActiveNo}`);
    console.log(`   - Contact_Status inactive: ${filterStats.contactStatusInactive}`);
    console.log(`   - Excluded domain: ${filterStats.excludedDomain}`);
    console.log(`   - Excluded pattern: ${filterStats.excludedPattern}`);
    
    // Build set of valid Impartner IDs for deletion detection (full sync only)
    const validImpartnerIds = new Set();
    if (mode === 'full') {
      users.forEach(u => validImpartnerIds.add(u.id));
    }
    
    // Get existing contacts with LMS links (to preserve them)
    const existingContacts = await query('SELECT id, email, lms_user_id, impartner_id, is_active FROM contacts');
    const contactByEmail = new Map();
    const contactByImpartnerId = new Map();
    
    existingContacts.forEach(c => {
      contactByEmail.set(c.email.toLowerCase(), c);
      if (c.impartner_id) contactByImpartnerId.set(c.impartner_id, c);
    });
    
    const lmsLinkedCount = existingContacts.filter(c => c.lms_user_id).length;
    console.log(`💾 Existing contacts in DB: ${existingContacts.length}`);
    console.log(`   - Active: ${existingContacts.filter(c => c.is_active !== 0).length}`);
    console.log(`   - Inactive: ${existingContacts.filter(c => c.is_active === 0).length}`);
    console.log(`   - LMS Linked: ${lmsLinkedCount}`);
    
    // Get partners for lookup
    const partners = await query('SELECT id, account_name FROM partners WHERE is_active = TRUE');
    const partnerByName = new Map();
    partners.forEach(p => {
      partnerByName.set(p.account_name.toLowerCase(), p.id);
    });
    console.log(`🏢 Active partners for linking: ${partners.length}`);
    
    // Process users in batches
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, Math.min(i + BATCH_SIZE, users.length));
      
      for (const user of batch) {
        stats.processed++;
        
        try {
          const email = user.email.toLowerCase().trim();
          const impartnerId = user.id;
          
          // Look up existing contact by Impartner ID first, then email
          let existing = contactByImpartnerId.get(impartnerId);
          if (!existing) {
            existing = contactByEmail.get(email);
          }
          
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
            phone: user.phone || null,
            impartner_id: impartnerId
          };
          
          if (existing) {
            // Preserve LMS link
            if (existing.lms_user_id) {
              stats.lmsLinksPreserved++;
            }
            
            // Check if previously deleted/inactive and reactivate
            const wasInactive = existing.is_active === 0;
            
            // Update existing contact
            await query(
              `UPDATE contacts SET
                 partner_id = ?,
                 first_name = ?,
                 last_name = ?,
                 title = ?,
                 phone = ?,
                 impartner_id = ?,
                 is_active = TRUE,
                 deleted_at = NULL,
                 updated_at = NOW()
               WHERE id = ?`,
              [
                contactData.partner_id,
                contactData.first_name,
                contactData.last_name,
                contactData.title,
                contactData.phone,
                contactData.impartner_id,
                existing.id
              ]
            );
            
            if (wasInactive) {
              stats.reactivated++;
            }
            stats.updated++;
          } else {
            // Insert new contact
            await query(
              `INSERT INTO contacts (partner_id, email, first_name, last_name, title, phone, impartner_id, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
              [
                contactData.partner_id,
                contactData.email,
                contactData.first_name,
                contactData.last_name,
                contactData.title,
                contactData.phone,
                contactData.impartner_id
              ]
            );
            stats.created++;
          }
        } catch (err) {
          stats.failed++;
          stats.errors.push({ email: user.email, error: err.message });
        }
      }
      
      // Progress logging
      if (stats.processed % 500 === 0 || stats.processed === users.length) {
        console.log(`   📊 Processed ${stats.processed}/${users.length} contacts (${stats.created} new, ${stats.updated} updated)`);
      }
    }
    
    // DELETION DETECTION (full sync only)
    // Mark contacts as deleted if they exist in our DB but not in Impartner
    if (mode === 'full' && validImpartnerIds.size > 0) {
      console.log(`\n🔍 Checking for deleted contacts...`);
      
      // Get all active contacts with impartner_id
      const activeContacts = await query(
        `SELECT id, email, impartner_id, lms_user_id FROM contacts WHERE is_active = TRUE AND impartner_id IS NOT NULL`
      );
      
      let deleteCount = 0;
      let offboardedCount = 0;
      for (const contact of activeContacts) {
        if (!validImpartnerIds.has(contact.impartner_id)) {
          // Contact no longer in Impartner - soft delete
          await query(
            `UPDATE contacts SET is_active = FALSE, deleted_at = NOW() WHERE id = ?`,
            [contact.id]
          );
          stats.deleted++;
          deleteCount++;
          
          // LMS Offboarding: Remove user from partner group and All Partners group
          if (contact.lms_user_id) {
            console.log(`   🚪 Offboarding user from LMS: ${contact.email}...`);
            try {
              const offboardResult = await offboardContact(contact.id);
              if (offboardResult.success) {
                offboardedCount++;
                stats.offboarded = (stats.offboarded || 0) + 1;
              }
            } catch (offboardErr) {
              console.error(`   ⚠️ Offboarding failed for ${contact.email}:`, offboardErr.message);
              stats.offboardErrors = stats.offboardErrors || [];
              stats.offboardErrors.push({ contactId: contact.id, error: offboardErr.message });
            }
          }
        }
      }
      
      if (deleteCount > 0) {
        console.log(`   🗑️ Soft-deleted ${deleteCount} contacts no longer in Impartner`);
        if (offboardedCount > 0) {
          console.log(`   🚪 Offboarded ${offboardedCount} users from LMS groups`);
        }
      } else {
        console.log(`   ✓ No deletions needed`);
      }
    }
    
    // Log sync completion
    await logSync(syncType, 'completed', stats);
    
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`✅ CONTACTS SYNC COMPLETE`);
    console.log(`   📊 Processed: ${stats.processed}`);
    console.log(`   ➕ Created: ${stats.created}`);
    console.log(`   📝 Updated: ${stats.updated}`);
    console.log(`   ♻️ Reactivated: ${stats.reactivated}`);
    console.log(`   🗑️ Soft-deleted: ${stats.deleted}`);
    if (stats.offboarded) {
      console.log(`   🚪 LMS Offboarded: ${stats.offboarded} users`);
    }
    console.log(`   🔗 LMS Links Preserved: ${stats.lmsLinksPreserved}`);
    console.log(`   ❌ Failed: ${stats.failed}`);
    
    if (stats.errors.length > 0 && stats.errors.length <= 5) {
      console.log(`   ⚠️ Errors:`, stats.errors);
    } else if (stats.errors.length > 5) {
      console.log(`   ⚠️ First 5 errors:`, stats.errors.slice(0, 5));
    }
    console.log(`${'='.repeat(60)}\n`);
    
    return stats;
    
  } catch (err) {
    stats.errors.push({ error: err.message });
    await logSync(syncType, 'failed', stats);
    console.error(`\n❌ CONTACTS SYNC FAILED: ${err.message}`);
    throw err;
  }
}

/**
 * Run full sync (partners then contacts)
 */
async function syncAll(mode = 'incremental') {
  console.log(`\n${'#'.repeat(70)}`);
  console.log(`#  IMPARTNER FULL SYNC - ${mode.toUpperCase()} MODE`);
  console.log(`#  Started: ${new Date().toISOString()}`);
  console.log(`${'#'.repeat(70)}`);
  
  const results = {
    partners: null,
    contacts: null,
    success: false,
    duration: 0,
    totals: {
      processed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      reactivated: 0,
      failed: 0
    }
  };
  
  const startTime = Date.now();
  
  try {
    // Sync partners first (contacts reference them)
    results.partners = await syncPartners(mode);
    
    // Then sync contacts
    results.contacts = await syncContacts(mode);
    
    // Calculate totals
    results.totals.processed = (results.partners?.processed || 0) + (results.contacts?.processed || 0);
    results.totals.created = (results.partners?.created || 0) + (results.contacts?.created || 0);
    results.totals.updated = (results.partners?.updated || 0) + (results.contacts?.updated || 0);
    results.totals.deleted = (results.partners?.deleted || 0) + (results.contacts?.deleted || 0);
    results.totals.reactivated = (results.partners?.reactivated || 0) + (results.contacts?.reactivated || 0);
    results.totals.failed = (results.partners?.failed || 0) + (results.contacts?.failed || 0);
    
    results.success = true;
    results.duration = Date.now() - startTime;
    
    console.log(`\n${'#'.repeat(70)}`);
    console.log(`#  IMPARTNER SYNC COMPLETE`);
    console.log(`#  Duration: ${(results.duration / 1000).toFixed(1)} seconds`);
    console.log(`${'#'.repeat(70)}`);
    console.log(`\n📊 SUMMARY:`);
    console.log(`   ┌────────────────┬──────────┬──────────┐`);
    console.log(`   │                │ Partners │ Contacts │`);
    console.log(`   ├────────────────┼──────────┼──────────┤`);
    console.log(`   │ Processed      │ ${String(results.partners?.processed || 0).padStart(8)} │ ${String(results.contacts?.processed || 0).padStart(8)} │`);
    console.log(`   │ Created        │ ${String(results.partners?.created || 0).padStart(8)} │ ${String(results.contacts?.created || 0).padStart(8)} │`);
    console.log(`   │ Updated        │ ${String(results.partners?.updated || 0).padStart(8)} │ ${String(results.contacts?.updated || 0).padStart(8)} │`);
    console.log(`   │ Deleted        │ ${String(results.partners?.deleted || 0).padStart(8)} │ ${String(results.contacts?.deleted || 0).padStart(8)} │`);
    console.log(`   │ Reactivated    │ ${String(results.partners?.reactivated || 0).padStart(8)} │ ${String(results.contacts?.reactivated || 0).padStart(8)} │`);
    console.log(`   │ Failed         │ ${String(results.partners?.failed || 0).padStart(8)} │ ${String(results.contacts?.failed || 0).padStart(8)} │`);
    console.log(`   └────────────────┴──────────┴──────────┘`);
    console.log(`\n   LMS Links Preserved: ${results.contacts?.lmsLinksPreserved || 0}`);
    console.log(`${'#'.repeat(70)}\n`);
    
    return results;
    
  } catch (err) {
    results.duration = Date.now() - startTime;
    results.error = err.message;
    console.error(`\n${'!'.repeat(70)}`);
    console.error(`!  IMPARTNER SYNC FAILED`);
    console.error(`!  Error: ${err.message}`);
    console.error(`!  Duration: ${(results.duration / 1000).toFixed(1)} seconds`);
    console.error(`${'!'.repeat(70)}\n`);
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
    // Fetch and filter accounts (with API-level filtering)
    const accountFields = 'Id,Name,Partner_Tier__cf,Account_Status__cf';
    const validTiersFilter = FILTERS.validTiers.map(t => `Partner_Tier__cf = '${t}'`).join(' or ');
    const accountApiFilter = `Account_Status__cf != 'Inactive' and (${validTiersFilter})`;
    const allAccounts = await fetchAllRecords('Account', accountFields, accountApiFilter);
    const accountFilterResult = filterAccounts(allAccounts, false);
    
    // Fetch and filter users (with API-level filtering)
    const userFields = 'Id,Email,Contact_Status__cf,AccountName';
    const userApiFilter = `IsActive = true and Contact_Status__cf != 'Inactive' and Contact_Status__cf != 'Terminated'`;
    const allUsers = await fetchAllRecords('User', userFields, userApiFilter);
    const filteredUsers = filterUsers(allUsers);
    
    // Get current database counts
    const currentPartners = await query('SELECT COUNT(*) as count FROM partners');
    const currentContacts = await query('SELECT COUNT(*) as count FROM contacts');
    const activePartners = await query('SELECT COUNT(*) as count FROM partners WHERE is_active = TRUE');
    const inactivePartners = await query('SELECT COUNT(*) as count FROM partners WHERE is_active = FALSE');
    
    const preview = {
      accounts: {
        impartnerTotal: allAccounts.length,
        afterFilters: accountFilterResult.valid.length,
        filtered: accountFilterResult.filtered.length,
        filterReasons: accountFilterResult.filterReasons,
        currentInDb: currentPartners[0]?.count || 0,
        activeInDb: activePartners[0]?.count || 0,
        inactiveInDb: inactivePartners[0]?.count || 0
      },
      users: {
        impartnerTotal: allUsers.length,
        afterFilters: filteredUsers.length,
        filtered: allUsers.length - filteredUsers.length,
        currentInDb: currentContacts[0]?.count || 0
      },
      filters: FILTERS,
      sampleFilteredAccounts: accountFilterResult.filtered
        .slice(0, 10)
        .map(f => ({ name: f.account?.name, tier: f.account?.partner_Tier__cf, status: f.account?.account_Status__cf, reason: f.reason })),
      sampleFilteredUsers: allUsers
        .filter(u => !filterUsers([u]).length)
        .slice(0, 5)
        .map(u => ({ email: u.email, status: u.contact_Status__cf }))
    };
    
    console.log(`\n📊 ACCOUNTS:`);
    console.log(`   Impartner total: ${preview.accounts.impartnerTotal}`);
    console.log(`   After filters: ${preview.accounts.afterFilters}`);
    console.log(`   Would be filtered out: ${preview.accounts.filtered}`);
    console.log(`      - Inactive: ${preview.accounts.filterReasons.inactive}`);
    console.log(`      - Invalid tier: ${preview.accounts.filterReasons.invalidTier}`);
    console.log(`      - Excluded name: ${preview.accounts.filterReasons.excludedName}`);
    console.log(`   Current in database: ${preview.accounts.currentInDb} (${preview.accounts.activeInDb} active, ${preview.accounts.inactiveInDb} inactive)`);
    
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

/**
 * Sync leads from Impartner
 * Tracks leads associated with partner accounts for reporting
 */
async function syncLeads(mode = 'incremental') {
  const syncType = 'sync_leads';
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 IMPARTNER LEADS SYNC - ${mode.toUpperCase()} MODE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  
  const stats = {
    processed: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    filtered: 0,  // Leads without partner association
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
        mode = 'full';
      }
    }
    
    // Fetch leads from Impartner
    // Valid fields discovered: Id, FirstName, LastName, Email, Phone, Title, StatusId, Source, Created, Updated, Description, CrmId, PartnerAccountId
    const fields = [
      'Id', 'FirstName', 'LastName', 'Email', 'Phone', 'Title',
      'StatusId', 'Source', 'Description', 'CrmId',
      'PartnerAccountId', 'Created', 'Updated'
    ].join(',');
    
    // Filter at API level: only fetch leads with a partner account
    // This reduces API calls from ~72K to ~20K records
    const leadFilter = 'PartnerAccountId != null';
    
    const allLeads = await fetchAllRecords('Lead', fields, leadFilter, sinceDate);
    console.log(`📥 Fetched ${allLeads.length} leads from Impartner (filtered to partner-linked only)`);
    
    // Fetch LeadStatus lookup table
    console.log('📋 Fetching LeadStatus lookup table...');
    let statusMap = new Map();
    try {
      const statuses = await fetchAllRecords('LeadStatus', 'Id,Name');
      statuses.forEach(s => statusMap.set(s.id, s.name));
      console.log(`   Found ${statuses.length} lead statuses`);
    } catch (err) {
      console.warn(`   ⚠️ Could not fetch LeadStatus table: ${err.message}`);
    }
    
    // Build partner lookup map (impartner_id -> local id)
    const partners = await query('SELECT id, impartner_id, account_name FROM partners WHERE impartner_id IS NOT NULL');
    const partnerByImpartnerId = new Map();
    partners.forEach(p => partnerByImpartnerId.set(p.impartner_id, p));
    console.log(`💾 Partner lookup map: ${partners.length} partners with impartner_id`);
    
    // Get existing leads for update detection
    const existingLeads = await query('SELECT id, impartner_id FROM leads');
    const leadByImpartnerId = new Map();
    existingLeads.forEach(l => leadByImpartnerId.set(l.impartner_id, l));
    console.log(`💾 Existing leads in DB: ${existingLeads.length}`);
    
    // Filter leads - only include leads attached to a partner we KNOW about in our DB
    // (API filter removes null PartnerAccountId, but we still need to match our partner list)
    const leadsWithKnownPartner = allLeads.filter(l => {
      return l.partnerAccountId && partnerByImpartnerId.has(l.partnerAccountId);
    });
    stats.filtered = allLeads.length - leadsWithKnownPartner.length;
    console.log(`📋 LEAD FILTER RESULTS:`);
    console.log(`   📥 Leads from API (with PartnerAccountId): ${allLeads.length}`);
    console.log(`   ✅ Leads matching known partners: ${leadsWithKnownPartner.length}`);
    console.log(`   ❌ Leads with unknown partner (excluded): ${stats.filtered}`);
    
    // Track valid Impartner IDs for deletion detection (only partner-linked leads)
    const validImpartnerIds = new Set();
    if (mode === 'full') {
      leadsWithKnownPartner.forEach(l => validImpartnerIds.add(l.id));
    }
    
    // Process leads (only those with known partners)
    for (const lead of leadsWithKnownPartner) {
      stats.processed++;
      
      try {
        const impartnerId = lead.id;
        const impartnerPartnerId = lead.partnerAccountId || null;
        
        // Look up local partner ID
        let localPartnerId = null;
        if (impartnerPartnerId) {
          const partner = partnerByImpartnerId.get(impartnerPartnerId);
          if (partner) {
            localPartnerId = partner.id;
          }
        }
        
        // Parse dates
        let leadCreatedAt = null;
        let leadUpdatedAt = null;
        try {
          if (lead.created) leadCreatedAt = new Date(lead.created).toISOString().slice(0, 19).replace('T', ' ');
          if (lead.updated) leadUpdatedAt = new Date(lead.updated).toISOString().slice(0, 19).replace('T', ' ');
        } catch (e) {
          // Date parsing failed, leave as null
        }
        
        // Prepare lead data
        const leadData = {
          impartner_id: impartnerId,
          partner_id: localPartnerId,
          impartner_partner_id: impartnerPartnerId,
          first_name: lead.firstName || null,
          last_name: lead.lastName || null,
          email: lead.email || null,
          phone: lead.phone || null,
          title: lead.title || null,
          company_name: lead.companyName || null,
          status_id: lead.statusId || null,
          status_name: lead.statusId ? statusMap.get(lead.statusId) || null : null,
          source: lead.source || null,
          description: lead.description || null,
          crm_id: lead.crmId || null,
          lead_created_at: leadCreatedAt,
          lead_updated_at: leadUpdatedAt,
          synced_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        };
        
        const existing = leadByImpartnerId.get(impartnerId);
        
        if (existing) {
          // Update existing lead
          await query(`
            UPDATE leads SET
              partner_id = ?,
              impartner_partner_id = ?,
              first_name = ?,
              last_name = ?,
              email = ?,
              phone = ?,
              title = ?,
              company_name = ?,
              status_id = ?,
              status_name = ?,
              source = ?,
              description = ?,
              crm_id = ?,
              lead_created_at = ?,
              lead_updated_at = ?,
              synced_at = ?
            WHERE impartner_id = ?
          `, [
            leadData.partner_id,
            leadData.impartner_partner_id,
            leadData.first_name,
            leadData.last_name,
            leadData.email,
            leadData.phone,
            leadData.title,
            leadData.company_name,
            leadData.status_id,
            leadData.status_name,
            leadData.source,
            leadData.description,
            leadData.crm_id,
            leadData.lead_created_at,
            leadData.lead_updated_at,
            leadData.synced_at,
            impartnerId
          ]);
          stats.updated++;
        } else {
          // Insert new lead
          await query(`
            INSERT INTO leads (
              impartner_id, partner_id, impartner_partner_id,
              first_name, last_name, email, phone, title, company_name,
              status_id, status_name, source, description, crm_id,
              lead_created_at, lead_updated_at, synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            leadData.impartner_id,
            leadData.partner_id,
            leadData.impartner_partner_id,
            leadData.first_name,
            leadData.last_name,
            leadData.email,
            leadData.phone,
            leadData.title,
            leadData.company_name,
            leadData.status_id,
            leadData.status_name,
            leadData.source,
            leadData.description,
            leadData.crm_id,
            leadData.lead_created_at,
            leadData.lead_updated_at,
            leadData.synced_at
          ]);
          stats.created++;
        }
        
        // Progress logging every 1000 records
        if (stats.processed % 1000 === 0) {
          console.log(`   Processed ${stats.processed}/${allLeads.length}...`);
        }
        
      } catch (err) {
        stats.failed++;
        stats.errors.push({ id: lead.id, error: err.message });
        if (stats.errors.length <= 5) {
          console.error(`   ❌ Lead ${lead.id}: ${err.message}`);
        }
      }
    }
    
    // Delete leads that no longer exist in Impartner (full sync only)
    if (mode === 'full' && validImpartnerIds.size > 0) {
      console.log(`\n🗑️ Checking for deleted leads...`);
      const leadsToDelete = existingLeads.filter(l => !validImpartnerIds.has(l.impartner_id));
      
      if (leadsToDelete.length > 0) {
        const deleteIds = leadsToDelete.map(l => l.impartner_id);
        const placeholders = deleteIds.map(() => '?').join(',');
        await query(`DELETE FROM leads WHERE impartner_id IN (${placeholders})`, deleteIds);
        stats.deleted = leadsToDelete.length;
        console.log(`   Deleted ${stats.deleted} leads no longer in Impartner`);
      }
    }
    
    // Update lead counts on partners table
    console.log(`\n📊 Updating partner lead counts...`);
    await updatePartnerLeadCounts();
    
    // Log sync completion
    await logSync(syncType, 'completed', {
      processed: stats.processed,
      created: stats.created,
      updated: stats.updated,
      deleted: stats.deleted,
      skipped: stats.filtered,
      failed: stats.failed
    });
    
    console.log(`\n✅ LEAD SYNC COMPLETE`);
    console.log(`   Filtered (no partner): ${stats.filtered}`);
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   Created: ${stats.created}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Deleted: ${stats.deleted}`);
    console.log(`   Failed: ${stats.failed}`);
    
    return stats;
    
  } catch (err) {
    console.error(`\n❌ LEAD SYNC FAILED: ${err.message}`);
    await logSync(syncType, 'error', {
      processed: stats.processed,
      failed: stats.failed,
      error: err.message
    });
    throw err;
  }
}

/**
 * Update lead counts on partners table for quick aggregation
 */
async function updatePartnerLeadCounts() {
  try {
    // Update total lead count
    await query(`
      UPDATE partners p
      SET lead_count = (
        SELECT COUNT(*) FROM leads l WHERE l.partner_id = p.id
      ),
      leads_last_30_days = (
        SELECT COUNT(*) FROM leads l 
        WHERE l.partner_id = p.id 
        AND l.lead_created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      ),
      leads_updated_at = NOW()
    `);
    console.log(`   ✅ Updated partner lead counts`);
  } catch (err) {
    console.error(`   ⚠️ Failed to update lead counts: ${err.message}`);
  }
}

/**
 * Get lead statistics
 */
async function getLeadStats() {
  try {
    const [total] = await query('SELECT COUNT(*) as count FROM leads');
    const [withPartner] = await query('SELECT COUNT(*) as count FROM leads WHERE partner_id IS NOT NULL');
    const [last30Days] = await query('SELECT COUNT(*) as count FROM leads WHERE lead_created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
    
    // Leads by status
    const byStatus = await query(`
      SELECT status_name, COUNT(*) as count 
      FROM leads 
      WHERE status_name IS NOT NULL
      GROUP BY status_name 
      ORDER BY count DESC
    `);
    
    // Leads by source (top 10)
    const bySource = await query(`
      SELECT source, COUNT(*) as count 
      FROM leads 
      WHERE source IS NOT NULL AND source != ''
      GROUP BY source 
      ORDER BY count DESC
      LIMIT 10
    `);
    
    // Leads by month (last 12 months)
    const byMonth = await query(`
      SELECT 
        DATE_FORMAT(lead_created_at, '%Y-%m') as month,
        COUNT(*) as count
      FROM leads
      WHERE lead_created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY month
      ORDER BY month DESC
    `);
    
    return {
      total: total.count,
      withPartner: withPartner.count,
      last30Days: last30Days.count,
      byStatus,
      bySource,
      byMonth
    };
  } catch (err) {
    console.error('Error getting lead stats:', err.message);
    throw err;
  }
}

module.exports = {
  syncPartners,
  syncContacts,
  syncAll,
  getSyncStatus,
  previewSync,
  syncLeads,
  updatePartnerLeadCounts,
  getLeadStats,
  FILTERS
};
