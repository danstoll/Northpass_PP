/**
 * Partner Database Service
 * Manages partner and contact data from Salesforce imports
 */

const { query, transaction } = require('./connection.cjs');

/**
 * Import partners from an array of records - BATCH OPTIMIZED
 * Each record should have: name/accountName, partnerTier, accountRegion, accountOwner, etc.
 */
async function importPartners(partners) {
  const stats = { processed: 0, created: 0, updated: 0, failed: 0 };

  if (!partners || partners.length === 0) return stats;

  console.log(`📦 Starting batch import of ${partners.length} partners...`);
  const startTime = Date.now();

  try {
    const batchSize = 500;
    const batches = [];
    
    for (let i = 0; i < partners.length; i += batchSize) {
      batches.push(partners.slice(i, i + batchSize));
    }

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      const values = [];
      const placeholders = [];

      for (const partner of batch) {
        const accountName = (partner.name || partner.accountName || partner['Account Name'] || '').trim();
        if (!accountName) {
          stats.failed++;
          continue;
        }

        values.push(
          accountName,
          (partner.tier || partner.partnerTier || partner['Partner Tier'] || '').trim(),
          (partner.region || partner.accountRegion || partner['Account Region'] || '').trim(),
          (partner.owner || partner.accountOwner || partner['Account Owner'] || '').trim(),
          (partner.partnerType || partner['Partner Type'] || '').trim(),
          (partner.website || partner['Website'] || '').trim(),
          (partner.salesforce_id || partner['Account ID'] || '').trim()
        );
        placeholders.push('(?, ?, ?, ?, ?, ?, ?)');
        stats.processed++;
      }

      if (placeholders.length > 0) {
        const sql = `
          INSERT INTO partners (account_name, partner_tier, account_region, account_owner, partner_type, website, salesforce_id)
          VALUES ${placeholders.join(', ')}
          ON DUPLICATE KEY UPDATE
            partner_tier = COALESCE(NULLIF(VALUES(partner_tier), ''), partner_tier),
            account_region = COALESCE(NULLIF(VALUES(account_region), ''), account_region),
            account_owner = COALESCE(NULLIF(VALUES(account_owner), ''), account_owner),
            partner_type = COALESCE(NULLIF(VALUES(partner_type), ''), partner_type),
            website = COALESCE(NULLIF(VALUES(website), ''), website),
            salesforce_id = COALESCE(NULLIF(VALUES(salesforce_id), ''), salesforce_id),
            updated_at = NOW()
        `;

        const result = await query(sql, values);
        stats.created += result.affectedRows - (result.affectedRows - placeholders.length);
        stats.updated += result.affectedRows - placeholders.length;
      }

      console.log(`  ✓ Partner batch ${batchIdx + 1}/${batches.length} complete`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Partner import complete in ${elapsed}s: ${stats.processed} processed`);

  } catch (error) {
    console.error('❌ Partner batch import error:', error.message);
    stats.failed = partners.length - stats.processed;
    throw error;
  }

  return stats;
}

/**
 * Import contacts from an array of records - BATCH OPTIMIZED
 */
async function importContacts(contacts) {
  const stats = { processed: 0, created: 0, updated: 0, failed: 0, noPartner: 0 };
  
  if (!contacts || contacts.length === 0) return stats;

  console.log(`📦 Starting batch import of ${contacts.length} contacts...`);
  const startTime = Date.now();

  try {
    // Step 1: Get all partners in one query (build lookup map)
    const partnerRows = await query('SELECT id, account_name FROM partners');
    const partnerMap = new Map();
    partnerRows.forEach(p => partnerMap.set(p.account_name.toLowerCase(), p.id));
    console.log(`  ✓ Loaded ${partnerMap.size} partners for lookup`);

    // Step 2: Get all LMS users in one query (build lookup map by email)
    const lmsUserRows = await query('SELECT id, email FROM lms_users');
    const lmsUserMap = new Map();
    lmsUserRows.forEach(u => lmsUserMap.set(u.email.toLowerCase(), u.id));
    console.log(`  ✓ Loaded ${lmsUserMap.size} LMS users for lookup`);

    // Step 3: Prepare batch data
    const batchSize = 500;
    const batches = [];
    
    for (let i = 0; i < contacts.length; i += batchSize) {
      batches.push(contacts.slice(i, i + batchSize));
    }

    console.log(`  ✓ Processing ${batches.length} batches of up to ${batchSize} contacts`);

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      const values = [];
      const placeholders = [];

      for (const contact of batch) {
        const email = (contact.email || contact['Email'] || '').trim().toLowerCase();
        if (!email) {
          stats.failed++;
          continue;
        }

        // Look up partner from pre-loaded map
        const accountName = (contact.partner_name || contact.accountName || contact['Account Name'] || '').trim();
        const partnerId = accountName ? partnerMap.get(accountName.toLowerCase()) || null : null;
        
        if (accountName && !partnerId) {
          stats.noPartner++;
        }

        // Look up LMS user from pre-loaded map
        const lmsUserId = lmsUserMap.get(email) || null;

        values.push(
          partnerId,
          email,
          (contact.first_name || contact.firstName || contact['First Name'] || '').trim(),
          (contact.last_name || contact.lastName || contact['Last Name'] || '').trim(),
          (contact.title || contact['Title'] || '').trim(),
          (contact.phone || contact['Phone'] || '').trim(),
          contact.isPrimary || contact['Is Primary'] || false,
          lmsUserId
        );
        placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?)');
        stats.processed++;
      }

      if (placeholders.length > 0) {
        // Batch INSERT with ON DUPLICATE KEY UPDATE
        const sql = `
          INSERT INTO contacts (partner_id, email, first_name, last_name, title, phone, is_primary, lms_user_id)
          VALUES ${placeholders.join(', ')}
          ON DUPLICATE KEY UPDATE
            partner_id = COALESCE(VALUES(partner_id), partner_id),
            first_name = VALUES(first_name),
            last_name = VALUES(last_name),
            title = VALUES(title),
            phone = VALUES(phone),
            is_primary = VALUES(is_primary),
            lms_user_id = COALESCE(VALUES(lms_user_id), lms_user_id),
            updated_at = NOW()
        `;

        const result = await query(sql, values);
        // affectedRows = inserts + (updates * 2) for ON DUPLICATE KEY
        stats.created += result.affectedRows - (result.affectedRows - placeholders.length);
        stats.updated += result.affectedRows - placeholders.length;
      }

      console.log(`  ✓ Batch ${batchIdx + 1}/${batches.length} complete`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Contact import complete in ${elapsed}s: ${stats.processed} processed, ${stats.created} created, ${stats.updated} updated`);

  } catch (error) {
    console.error('❌ Batch import error:', error.message);
    stats.failed = contacts.length - stats.processed;
    throw error;
  }

  return stats;
}

/**
 * Get all partners with summary stats
 */
async function getPartnerSummary() {
  return await query(`
    SELECT 
      p.id,
      p.account_name,
      p.partner_tier,
      p.account_region,
      p.account_owner,
      COUNT(DISTINCT c.id) as contact_count,
      COUNT(DISTINCT CASE WHEN c.lms_user_id IS NOT NULL THEN c.id END) as lms_linked_count,
      g.id as group_id,
      g.name as group_name,
      g.user_count as group_user_count
    FROM partners p
    LEFT JOIN contacts c ON c.partner_id = p.id
    LEFT JOIN lms_groups g ON g.partner_id = p.id
    GROUP BY p.id
    ORDER BY p.account_name
  `);
}

/**
 * Get partners by account owner
 */
async function getPartnersByOwner(ownerName) {
  return await query(`
    SELECT 
      p.*,
      COUNT(DISTINCT c.id) as contact_count,
      g.id as group_id,
      g.name as group_name
    FROM partners p
    LEFT JOIN contacts c ON c.partner_id = p.id
    LEFT JOIN lms_groups g ON g.partner_id = p.id
    WHERE p.account_owner = ?
    GROUP BY p.id
    ORDER BY p.account_name
  `, [ownerName]);
}

/**
 * Get all account owners with their partner counts
 */
async function getAccountOwners() {
  return await query(`
    SELECT 
      account_owner as owner_name,
      COUNT(*) as account_count
    FROM partners
    WHERE account_owner IS NOT NULL AND account_owner != ''
    GROUP BY account_owner
    ORDER BY account_owner
  `);
}

/**
 * Get contacts for a partner
 */
async function getContactsByPartner(partnerId) {
  return await query(`
    SELECT 
      c.*,
      u.first_name as lms_first_name,
      u.last_name as lms_last_name,
      u.status as lms_status,
      u.last_active_at as lms_last_active
    FROM contacts c
    LEFT JOIN lms_users u ON u.id = c.lms_user_id
    WHERE c.partner_id = ?
    ORDER BY c.last_name, c.first_name
  `, [partnerId]);
}

/**
 * Get contacts by account name
 */
async function getContactsByAccountName(accountName) {
  const partner = await query('SELECT id FROM partners WHERE account_name = ?', [accountName]);
  if (!partner[0]) return [];
  return await getContactsByPartner(partner[0].id);
}

/**
 * Search partners
 */
async function searchPartners(searchTerm, filters = {}) {
  let sql = `
    SELECT 
      p.*,
      COUNT(DISTINCT c.id) as contact_count,
      g.id as group_id,
      g.name as group_name
    FROM partners p
    LEFT JOIN contacts c ON c.partner_id = p.id
    LEFT JOIN lms_groups g ON g.partner_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (searchTerm) {
    sql += ' AND p.account_name LIKE ?';
    params.push(`%${searchTerm}%`);
  }

  if (filters.tier) {
    sql += ' AND p.partner_tier = ?';
    params.push(filters.tier);
  }

  if (filters.region) {
    sql += ' AND p.account_region = ?';
    params.push(filters.region);
  }

  if (filters.owner) {
    sql += ' AND p.account_owner = ?';
    params.push(filters.owner);
  }

  sql += ' GROUP BY p.id ORDER BY p.account_name';

  return await query(sql, params);
}

/**
 * Get database stats
 */
async function getDatabaseStats() {
  const [partners] = await query('SELECT COUNT(*) as count FROM partners');
  const [contacts] = await query('SELECT COUNT(*) as count FROM contacts');
  const [linkedContacts] = await query('SELECT COUNT(*) as count FROM contacts WHERE lms_user_id IS NOT NULL');
  const [lmsUsers] = await query('SELECT COUNT(*) as count FROM lms_users');
  const [lmsGroups] = await query('SELECT COUNT(*) as count FROM lms_groups');
  const [lmsCourses] = await query('SELECT COUNT(*) as count FROM lms_courses');
  const [lastSync] = await query('SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 1');

  return {
    partners: partners.count,
    contacts: contacts.count,
    linkedContacts: linkedContacts.count,
    lmsUsers: lmsUsers.count,
    lmsGroups: lmsGroups.count,
    lmsCourses: lmsCourses.count,
    lastSync: lastSync || null
  };
}

/**
 * Clear all partner data (for re-import)
 */
async function clearPartnerData() {
  await query('DELETE FROM contacts');
  await query('DELETE FROM partners');
  return { success: true };
}

module.exports = {
  importPartners,
  importContacts,
  getPartnerSummary,
  getPartnersByOwner,
  getAccountOwners,
  getContactsByPartner,
  getContactsByAccountName,
  searchPartners,
  getDatabaseStats,
  clearPartnerData
};
