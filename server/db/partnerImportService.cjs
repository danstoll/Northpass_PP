/**
 * Partner Import Service
 * Handles importing partner/contact data from Excel into MariaDB
 */

const { query, transaction } = require('./connection.cjs');
const XLSX = require('xlsx');

/**
 * Parse Excel file buffer and extract contacts
 * @param {Buffer} fileBuffer - The Excel file buffer
 * @returns {Array} Array of normalized contact objects
 */
function parseExcelBuffer(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(worksheet);
  
  console.log(`📊 Parsed ${rawData.length} rows from Excel`);
  
  // Normalize column names and data
  return rawData.map(row => ({
    email: (row['Email'] || row.email || '').toLowerCase().trim(),
    firstName: row['First Name'] || row.firstName || '',
    lastName: row['Last Name'] || row.lastName || '',
    title: row['Title'] || row.title || '',
    phone: row['Phone'] || row.phone || '',
    accountName: row['Account Name'] || row.accountName || '',
    accountStatus: row['Account Status'] || row.accountStatus || '',
    accountRegion: row['Account Region'] || row.accountRegion || '',
    accountOwner: row['Account Owner'] || row.accountOwner || '',
    partnerTier: row['Partner Tier'] || row.partnerTier || '',
    partnerType: row['Partner Type'] || row.partnerType || '',
    contactStatus: row['Contact Status'] || row.contactStatus || '',
    salesforceId: row['Account ID'] || row['Salesforce ID'] || row.salesforceId || '',
    website: row['Website'] || row.website || '',
    mailingCity: row['Mailing City'] || row.mailingCity || '',
    mailingCountry: row['Mailing Country'] || row.mailingCountry || ''
  })).filter(c => c.email); // Only include rows with email
}

/**
 * Import contacts and create/update partners
 * @param {Buffer} fileBuffer - The Excel file buffer
 * @param {string} fileName - Original file name for logging
 * @param {Object} options - Import options
 * @returns {Promise<Object>} Import results
 */
async function importContacts(fileBuffer, fileName, options = {}) {
  const { clearExisting = true } = options;
  const startTime = Date.now();
  
  console.log(`📥 Starting import from ${fileName}...`);
  
  const contacts = parseExcelBuffer(fileBuffer);
  console.log(`📋 Found ${contacts.length} contacts with valid emails`);
  
  const stats = {
    totalRows: contacts.length,
    partnersCreated: 0,
    partnersUpdated: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    contactsSkipped: 0,
    errors: []
  };

  try {
    // Optionally clear existing data
    if (clearExisting) {
      console.log('🧹 Clearing existing data...');
      await query('DELETE FROM contacts');
      await query('DELETE FROM partners');
      console.log('✅ Existing data cleared');
    }

    // Group contacts by account
    const accountMap = new Map();
    for (const contact of contacts) {
      const accountName = contact.accountName || 'Unknown';
      if (!accountMap.has(accountName)) {
        accountMap.set(accountName, {
          accountName,
          partnerTier: contact.partnerTier,
          accountRegion: contact.accountRegion,
          accountOwner: contact.accountOwner,
          partnerType: contact.partnerType,
          salesforceId: contact.salesforceId,
          website: contact.website,
          contacts: []
        });
      }
      accountMap.get(accountName).contacts.push(contact);
    }

    console.log(`📁 Found ${accountMap.size} unique partner accounts`);

    // Insert partners first
    for (const [accountName, partner] of accountMap) {
      try {
        const result = await query(
          `INSERT INTO partners (account_name, partner_tier, account_region, account_owner, partner_type, salesforce_id, website)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             partner_tier = VALUES(partner_tier),
             account_region = VALUES(account_region),
             account_owner = VALUES(account_owner),
             partner_type = VALUES(partner_type),
             salesforce_id = VALUES(salesforce_id),
             website = VALUES(website),
             updated_at = NOW()`,
          [
            accountName,
            partner.partnerTier || null,
            partner.accountRegion || null,
            partner.accountOwner || null,
            partner.partnerType || null,
            partner.salesforceId || null,
            partner.website || null
          ]
        );
        
        if (result.affectedRows === 1) {
          stats.partnersCreated++;
        } else {
          stats.partnersUpdated++;
        }
      } catch (err) {
        stats.errors.push({ type: 'partner', name: accountName, error: err.message });
      }
    }

    console.log(`✅ Partners: ${stats.partnersCreated} created, ${stats.partnersUpdated} updated`);

    // Now insert contacts with partner_id lookup
    for (const contact of contacts) {
      try {
        // Get partner_id
        const partnerRows = await query(
          'SELECT id FROM partners WHERE account_name = ?',
          [contact.accountName || 'Unknown']
        );
        const partnerId = partnerRows[0]?.id || null;

        const result = await query(
          `INSERT INTO contacts (partner_id, email, first_name, last_name, title, phone, is_primary)
           VALUES (?, ?, ?, ?, ?, ?, FALSE)
           ON DUPLICATE KEY UPDATE
             partner_id = VALUES(partner_id),
             first_name = VALUES(first_name),
             last_name = VALUES(last_name),
             title = VALUES(title),
             phone = VALUES(phone),
             updated_at = NOW()`,
          [
            partnerId,
            contact.email,
            contact.firstName || null,
            contact.lastName || null,
            contact.title || null,
            contact.phone || null
          ]
        );

        if (result.affectedRows === 1) {
          stats.contactsCreated++;
        } else if (result.affectedRows === 2) {
          stats.contactsUpdated++;
        }
      } catch (err) {
        stats.contactsSkipped++;
        if (stats.errors.length < 10) {
          stats.errors.push({ type: 'contact', email: contact.email, error: err.message });
        }
      }
    }

    console.log(`✅ Contacts: ${stats.contactsCreated} created, ${stats.contactsUpdated} updated, ${stats.contactsSkipped} skipped`);

    // Log the import
    await query(
      `INSERT INTO sync_logs (sync_type, status, started_at, completed_at, records_processed, records_created, details)
       VALUES ('excel_import', 'completed', ?, NOW(), ?, ?, ?)`,
      [
        new Date(startTime),
        stats.totalRows,
        stats.contactsCreated + stats.partnersCreated,
        JSON.stringify({ fileName, stats })
      ]
    );

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`✅ Import completed in ${duration}s`);

    return {
      success: true,
      duration,
      stats
    };
  } catch (error) {
    console.error('❌ Import failed:', error);
    
    await query(
      `INSERT INTO sync_logs (sync_type, status, started_at, completed_at, error_message, details)
       VALUES ('excel_import', 'failed', ?, NOW(), ?, ?)`,
      [new Date(startTime), error.message, JSON.stringify({ fileName, stats })]
    );

    return {
      success: false,
      error: error.message,
      stats
    };
  }
}

/**
 * Get database statistics
 */
async function getDatabaseStats() {
  const [partnerCount] = await query('SELECT COUNT(*) as count FROM partners');
  const [contactCount] = await query('SELECT COUNT(*) as count FROM contacts');
  const [linkedCount] = await query('SELECT COUNT(*) as count FROM contacts WHERE lms_user_id IS NOT NULL');
  
  // Tier distribution
  const tierDist = await query(`
    SELECT p.partner_tier as tier, COUNT(c.id) as count
    FROM partners p
    LEFT JOIN contacts c ON c.partner_id = p.id
    GROUP BY p.partner_tier
    ORDER BY count DESC
  `);
  
  // Region distribution
  const regionDist = await query(`
    SELECT p.account_region as region, COUNT(c.id) as count
    FROM partners p
    LEFT JOIN contacts c ON c.partner_id = p.id
    GROUP BY p.account_region
    ORDER BY count DESC
  `);

  // Last import
  const [lastImport] = await query(`
    SELECT * FROM sync_logs 
    WHERE sync_type = 'excel_import' 
    ORDER BY started_at DESC 
    LIMIT 1
  `);

  return {
    totalPartners: partnerCount.count,
    totalContacts: contactCount.count,
    linkedToLms: linkedCount.count,
    tierDistribution: tierDist.reduce((acc, row) => {
      acc[row.tier || 'Unknown'] = row.count;
      return acc;
    }, {}),
    regionDistribution: regionDist.reduce((acc, row) => {
      acc[row.region || 'Unknown'] = row.count;
      return acc;
    }, {}),
    lastImport: lastImport || null
  };
}

/**
 * Get partner summary with contact counts
 */
async function getPartnerSummary(options = {}) {
  const { search = '', tier = '', region = '', limit = 100, offset = 0 } = options;
  
  let whereClause = '1=1';
  const params = [];
  
  if (search) {
    whereClause += ' AND p.account_name LIKE ?';
    params.push(`%${search}%`);
  }
  if (tier) {
    whereClause += ' AND p.partner_tier = ?';
    params.push(tier);
  }
  if (region) {
    whereClause += ' AND p.account_region = ?';
    params.push(region);
  }
  
  params.push(limit, offset);
  
  const partners = await query(`
    SELECT 
      p.*,
      COUNT(c.id) as contact_count,
      SUM(CASE WHEN c.lms_user_id IS NOT NULL THEN 1 ELSE 0 END) as lms_linked_count
    FROM partners p
    LEFT JOIN contacts c ON c.partner_id = p.id
    WHERE ${whereClause}
    GROUP BY p.id
    ORDER BY p.account_name
    LIMIT ? OFFSET ?
  `, params);
  
  return partners;
}

/**
 * Get contacts for a specific partner
 */
async function getContactsByPartner(partnerId) {
  return await query(`
    SELECT c.*, u.first_name as lms_first_name, u.last_name as lms_last_name
    FROM contacts c
    LEFT JOIN lms_users u ON c.lms_user_id = u.id
    WHERE c.partner_id = ?
    ORDER BY c.last_name, c.first_name
  `, [partnerId]);
}

/**
 * Search contacts
 */
async function searchContacts(searchTerm, limit = 50) {
  return await query(`
    SELECT c.*, p.account_name, p.partner_tier, p.account_region
    FROM contacts c
    LEFT JOIN partners p ON c.partner_id = p.id
    WHERE c.email LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ?
    ORDER BY c.last_name, c.first_name
    LIMIT ?
  `, [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, limit]);
}

/**
 * Delete partner and all associated contacts
 */
async function deletePartner(partnerId) {
  await query('DELETE FROM contacts WHERE partner_id = ?', [partnerId]);
  const result = await query('DELETE FROM partners WHERE id = ?', [partnerId]);
  return { deleted: result.affectedRows };
}

/**
 * Delete contacts by region
 */
async function deleteByRegion(region) {
  const result = await query(`
    DELETE c FROM contacts c
    INNER JOIN partners p ON c.partner_id = p.id
    WHERE p.account_region = ?
  `, [region]);
  
  // Also delete partners with no remaining contacts
  await query(`
    DELETE FROM partners 
    WHERE account_region = ? 
    AND id NOT IN (SELECT DISTINCT partner_id FROM contacts WHERE partner_id IS NOT NULL)
  `, [region]);
  
  return { deleted: result.affectedRows };
}

/**
 * Delete contacts by tier
 */
async function deleteByTier(tier) {
  const result = await query(`
    DELETE c FROM contacts c
    INNER JOIN partners p ON c.partner_id = p.id
    WHERE p.partner_tier = ?
  `, [tier]);
  
  // Also delete partners with no remaining contacts
  await query(`
    DELETE FROM partners 
    WHERE partner_tier = ? 
    AND id NOT IN (SELECT DISTINCT partner_id FROM contacts WHERE partner_id IS NOT NULL)
  `, [tier]);
  
  return { deleted: result.affectedRows };
}

/**
 * Delete contacts matching account name pattern
 */
async function deleteByAccountPattern(pattern) {
  const result = await query(`
    DELETE c FROM contacts c
    INNER JOIN partners p ON c.partner_id = p.id
    WHERE p.account_name LIKE ?
  `, [`%${pattern}%`]);
  
  // Also delete matching partners with no remaining contacts
  await query(`
    DELETE FROM partners 
    WHERE account_name LIKE ? 
    AND id NOT IN (SELECT DISTINCT partner_id FROM contacts WHERE partner_id IS NOT NULL)
  `, [`%${pattern}%`]);
  
  return { deleted: result.affectedRows };
}

/**
 * Get contacts preview for cleaning operations
 */
async function getContactsPreview(filterType, filterValue, limit = 200) {
  let whereClause = '';
  const params = [];
  
  switch (filterType) {
    case 'region':
      whereClause = 'p.account_region = ?';
      params.push(filterValue);
      break;
    case 'tier':
      whereClause = 'p.partner_tier = ?';
      params.push(filterValue);
      break;
    case 'pattern':
      whereClause = 'p.account_name LIKE ?';
      params.push(`%${filterValue}%`);
      break;
    default:
      return [];
  }
  
  params.push(limit);
  
  return await query(`
    SELECT c.*, p.account_name, p.partner_tier, p.account_region
    FROM contacts c
    INNER JOIN partners p ON c.partner_id = p.id
    WHERE ${whereClause}
    ORDER BY p.account_name, c.last_name
    LIMIT ?
  `, params);
}

/**
 * Get unmatched contacts (not linked to LMS)
 */
async function getUnmatchedContacts(options = {}) {
  const { limit = 100, offset = 0 } = options;
  
  return await query(`
    SELECT c.*, p.account_name, p.partner_tier, p.account_region
    FROM contacts c
    LEFT JOIN partners p ON c.partner_id = p.id
    WHERE c.lms_user_id IS NULL
    ORDER BY p.account_name, c.last_name
    LIMIT ? OFFSET ?
  `, [limit, offset]);
}

/**
 * Get match statistics
 */
async function getMatchStats() {
  const [total] = await query('SELECT COUNT(*) as count FROM contacts');
  const [matched] = await query('SELECT COUNT(*) as count FROM contacts WHERE lms_user_id IS NOT NULL');
  const [lmsUsers] = await query('SELECT COUNT(*) as count FROM lms_users');
  
  return {
    totalContacts: total.count,
    matchedContacts: matched.count,
    unmatchedContacts: total.count - matched.count,
    matchRate: total.count > 0 ? Math.round((matched.count / total.count) * 100) : 0,
    totalLmsUsers: lmsUsers.count
  };
}

/**
 * Clear all partner/contact data
 */
async function clearAllData() {
  await query('DELETE FROM contacts');
  await query('DELETE FROM partners');
  return { success: true };
}

module.exports = {
  parseExcelBuffer,
  importContacts,
  getDatabaseStats,
  getPartnerSummary,
  getContactsByPartner,
  searchContacts,
  deletePartner,
  deleteByRegion,
  deleteByTier,
  deleteByAccountPattern,
  getContactsPreview,
  getUnmatchedContacts,
  getMatchStats,
  clearAllData
};
