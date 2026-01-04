/**
 * Partner Import Service
 * Handles importing partner/contact data from Excel into MariaDB
 */

const { query, transaction } = require('./connection.cjs');
const XLSX = require('xlsx');
const progress = require('./importProgress.cjs');

/**
 * Escape a value for SQL (returns NULL for null/undefined, quoted string otherwise)
 */
function escape(value) {
  if (value === null || value === undefined) return 'NULL';
  // Escape single quotes and backslashes
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `'${escaped}'`;
}

/**
 * Parse Excel file buffer and extract contacts
 * @param {Buffer} fileBuffer - The Excel file buffer
 * @returns {Array} Array of normalized contact objects
 */
function parseExcelBuffer(fileBuffer) {
  // Ensure we have a proper Buffer
  let buffer = fileBuffer;
  if (!Buffer.isBuffer(fileBuffer)) {
    console.log(`📦 Converting to Buffer from ${fileBuffer?.constructor?.name || typeof fileBuffer}`);
    if (fileBuffer instanceof Uint8Array || fileBuffer instanceof ArrayBuffer) {
      buffer = Buffer.from(fileBuffer);
    } else if (typeof fileBuffer === 'string') {
      buffer = Buffer.from(fileBuffer, 'base64');
    } else {
      buffer = Buffer.from(fileBuffer);
    }
  }
  
  console.log(`📦 Buffer size: ${buffer.length} bytes`);
  
  // Try different parsing options for various Excel formats
  let workbook;
  try {
    // Standard xlsx parsing
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (e1) {
    console.log(`⚠️ Standard parsing failed: ${e1.message}, trying alternatives...`);
    try {
      // Try as array buffer
      workbook = XLSX.read(buffer, { type: 'array' });
    } catch (e2) {
      // Try as base64
      workbook = XLSX.read(buffer.toString('base64'), { type: 'base64' });
    }
  }
  
  const sheetName = workbook.SheetNames[0];
  console.log(`📑 Sheet name: "${sheetName}", Total sheets: ${workbook.SheetNames.length}`);
  console.log(`📑 All sheet names: ${workbook.SheetNames.join(', ')}`);
  
  const worksheet = workbook.Sheets[sheetName];
  
  // Debug: show worksheet range
  const range = worksheet['!ref'];
  console.log(`📐 Worksheet range: ${range || 'empty'}`);
  
  // Try standard parsing first
  let rawData = XLSX.utils.sheet_to_json(worksheet);
  
  // If no data, try with different options
  if (rawData.length === 0 && range) {
    console.log('⚠️ No data with default parsing, trying with defval option...');
    rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  }
  
  // If still no data, try raw mode
  if (rawData.length === 0 && range) {
    console.log('⚠️ Still no data, trying raw mode...');
    rawData = XLSX.utils.sheet_to_json(worksheet, { raw: true, defval: '' });
  }
  
  // If still no data, show first few cells for debugging
  if (rawData.length === 0) {
    const cells = Object.keys(worksheet).filter(k => !k.startsWith('!')).slice(0, 20);
    console.log(`📝 First cells in sheet: ${cells.join(', ')}`);
    cells.forEach(cell => console.log(`   ${cell}: "${worksheet[cell]?.v}" (type: ${worksheet[cell]?.t})`));
    
    // Show buffer start for debugging
    if (buffer.length > 0) {
      console.log(`📦 Buffer start (hex): ${buffer.slice(0, 50).toString('hex')}`);
    }
  }
  
  console.log(`📊 Parsed ${rawData.length} rows from Excel`);
  
  // Log the column headers found for debugging
  if (rawData.length > 0) {
    const foundColumns = Object.keys(rawData[0]);
    console.log(`📋 Excel columns found: ${foundColumns.join(', ')}`);
    
    // Check for common column name variations
    const hasEmail = foundColumns.some(c => c.toLowerCase().includes('email') && !c.toLowerCase().includes('owner'));
    const hasAccount = foundColumns.some(c => c.toLowerCase().includes('account'));
    console.log(`📧 Has Email column: ${hasEmail}, Has Account column: ${hasAccount}`);
  }
  
  // Normalize column names and data
  // Helper to find column value with flexible matching
  const getColumn = (row, ...names) => {
    // Try exact matches first
    for (const name of names) {
      if (row[name] !== undefined) return row[name];
    }
    // Try case-insensitive matching
    const keys = Object.keys(row);
    for (const name of names) {
      const match = keys.find(k => k.toLowerCase() === name.toLowerCase());
      if (match && row[match] !== undefined) return row[match];
    }
    // Try partial matching for common variations
    for (const name of names) {
      const match = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '').includes(name.toLowerCase().replace(/[^a-z]/g, '')));
      if (match && row[match] !== undefined) return row[match];
    }
    return '';
  };
  
  return rawData.map(row => {
    // Parse last modified date - handle Excel date formats
    let lastModified = getColumn(row, 'Last Modified', 'Last Modified Date', 'lastModified', 'Modified Date');
    if (lastModified) {
      // Excel might return a serial date number or a string
      if (typeof lastModified === 'number') {
        // Excel serial date: days since 1900-01-01 (with a bug for 1900 leap year)
        const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
        lastModified = new Date(excelEpoch.getTime() + lastModified * 86400000);
      } else if (typeof lastModified === 'string') {
        lastModified = new Date(lastModified);
      }
      // Validate the date
      if (isNaN(lastModified.getTime())) {
        lastModified = null;
      }
    }
    
    // Get email - try multiple column name variations
    const email = (getColumn(row, 'Email', 'E-mail', 'email', 'Email Address', 'Contact Email', 'Contact: Email') || '').toLowerCase().trim();
    
    return {
      email,
      firstName: getColumn(row, 'First Name', 'FirstName', 'firstName', 'Contact: First Name'),
      lastName: getColumn(row, 'Last Name', 'LastName', 'lastName', 'Contact: Last Name'),
      title: getColumn(row, 'Title', 'Job Title', 'title'),
      phone: getColumn(row, 'Phone', 'Mobile', 'phone', 'Phone Number'),
      accountName: getColumn(row, 'Account Name', 'Account', 'accountName', 'Company', 'Company Name', 'Partner Name'),
      accountStatus: getColumn(row, 'Account Status', 'Status', 'accountStatus', 'Partner Status'),
      accountRegion: getColumn(row, 'Account Region', 'Region', 'accountRegion'),
      accountOwner: getColumn(row, 'Account Owner', 'Owner', 'accountOwner', 'Owner Name'),
      ownerEmail: (getColumn(row, 'Owner Email', 'Account Owner Email', 'ownerEmail', 'Owner: Email', 'Account Owner: Email') || '').toLowerCase().trim(),
      partnerTier: getColumn(row, 'Partner Tier', 'Tier', 'partnerTier'),
      partnerType: getColumn(row, 'Partner Type', 'Type', 'partnerType'),
      contactStatus: getColumn(row, 'Contact Status', 'contactStatus'),
      salesforceId: getColumn(row, 'Account ID', 'Salesforce ID', 'salesforceId', 'Account: ID'),
      website: getColumn(row, 'Website', 'website', 'Web Site'),
      mailingCity: getColumn(row, 'Mailing City', 'mailingCity', 'City'),
      mailingCountry: getColumn(row, 'Mailing Country', 'mailingCountry', 'Country'),
      lastModified: lastModified
    };
  }).filter(c => c.email); // Only include rows with email
}

/**
 * Import contacts and create/update partners
 * Smart sync: preserves LMS links, updates existing records, removes stale data
 * @param {Buffer} fileBuffer - The Excel file buffer
 * @param {string} fileName - Original file name for logging
 * @param {Object} options - Import options
 * @returns {Promise<Object>} Import results
 */
async function importContacts(fileBuffer, fileName, options = {}) {
  const { clearExisting = false } = options; // Default to false - smart sync
  const startTime = Date.now();
  
  console.log(`📥 Starting import from ${fileName}...`);
  progress.startImport(0);
  progress.updateProgress('parsing', 'Parsing Excel file...', 5);
  
  const contacts = parseExcelBuffer(fileBuffer);
  console.log(`📋 Found ${contacts.length} contacts with valid emails`);
  progress.updateProgress('parsing', `Parsed ${contacts.length} contacts from Excel`, 10, contacts.length);
  
  // Early exit if no contacts found - likely column name mismatch
  if (contacts.length === 0) {
    console.log('⚠️ No contacts found in file. Check column names match expected format.');
    progress.updateProgress('error', 'No contacts found - check column names', 100, 0);
    return {
      success: false,
      message: 'No contacts found in Excel file. Expected columns: "Email", "Account Name", "First Name", "Last Name". Check that column headers match exactly.',
      stats: {
        totalRows: 0,
        partnersCreated: 0,
        partnersUpdated: 0,
        contactsCreated: 0,
        contactsUpdated: 0,
        errors: ['No data rows found - column names may not match expected format']
      },
      duration: Date.now() - startTime
    };
  }
  
  const stats = {
    totalRows: contacts.length,
    partnersCreated: 0,
    partnersUpdated: 0,
    partnersRemoved: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    contactsRemoved: 0,
    contactsSkipped: 0,
    contactsUnchanged: 0, // Skipped due to same lastModified date
    lmsLinksPreserved: 0,
    errors: []
  };

  try {
    // Get existing data to preserve LMS links
    progress.updateProgress('preparing', 'Loading existing LMS links...', 15);
    const existingContacts = await query('SELECT id, email, lms_user_id FROM contacts');
    const emailToLmsUser = new Map();
    existingContacts.forEach(c => {
      if (c.lms_user_id) {
        emailToLmsUser.set(c.email.toLowerCase(), c.lms_user_id);
      }
    });
    console.log(`🔗 Found ${emailToLmsUser.size} existing LMS links to preserve`);

    // Get existing group links to preserve
    progress.updateProgress('preparing', 'Loading existing group links...', 18);
    const existingGroupLinks = await query('SELECT id, name, partner_id FROM lms_groups WHERE partner_id IS NOT NULL');
    const groupPartnerMap = new Map();
    existingGroupLinks.forEach(g => groupPartnerMap.set(g.partner_id, g.id));
    console.log(`🔗 Found ${existingGroupLinks.length} group-partner links to preserve`);

    // Only clear if explicitly requested (not recommended)
    if (clearExisting) {
      console.log('⚠️  Warning: Clear existing enabled - LMS links will be lost!');
      progress.updateProgress('clearing', 'Clearing existing data...', 20);
      await query('DELETE FROM contacts');
      await query('DELETE FROM partners');
      console.log('🧹 Existing data cleared');
    }

    // Group contacts by account
    progress.updateProgress('grouping', 'Grouping contacts by partner...', 22);
    const accountMap = new Map();
    const allEmails = new Set();
    
    for (const contact of contacts) {
      const accountName = contact.accountName || 'Unknown';
      allEmails.add(contact.email.toLowerCase());
      
      if (!accountMap.has(accountName)) {
        accountMap.set(accountName, {
          accountName,
          partnerTier: contact.partnerTier,
          accountRegion: contact.accountRegion,
          accountOwner: contact.accountOwner,
          ownerEmail: contact.ownerEmail,
          partnerType: contact.partnerType,
          salesforceId: contact.salesforceId,
          website: contact.website,
          contacts: []
        });
      }
      accountMap.get(accountName).contacts.push(contact);
    }

    console.log(`📁 Found ${accountMap.size} unique partner accounts`);
    const allAccountNames = new Set(accountMap.keys());

    // Step 1: Upsert partners (insert or update)
    const partnerIdMap = new Map(); // accountName -> partnerId
    const totalPartners = accountMap.size;
    let partnerIndex = 0;
    
    for (const [accountName, partner] of accountMap) {
      partnerIndex++;
      if (partnerIndex % 50 === 0 || partnerIndex === totalPartners) {
        const pct = 25 + Math.round((partnerIndex / totalPartners) * 20);
        progress.updateProgress('partners', `Processing partners... ${partnerIndex}/${totalPartners}`, pct, partnerIndex);
      }
      
      try {
        // Check if partner exists
        const existing = await query('SELECT id FROM partners WHERE account_name = ?', [accountName]);
        
        if (existing.length > 0) {
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
               updated_at = NOW()
             WHERE id = ?`,
            [
              partner.partnerTier || null,
              partner.accountRegion || null,
              partner.accountOwner || null,
              partner.ownerEmail || null,
              partner.partnerType || null,
              partner.salesforceId || null,
              partner.website || null,
              existing[0].id
            ]
          );
          partnerIdMap.set(accountName, existing[0].id);
          stats.partnersUpdated++;
        } else {
          // Insert new partner
          const result = await query(
            `INSERT INTO partners (account_name, partner_tier, account_region, account_owner, owner_email, partner_type, salesforce_id, website)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              accountName,
              partner.partnerTier || null,
              partner.accountRegion || null,
              partner.accountOwner || null,
              partner.ownerEmail || null,
              partner.partnerType || null,
              partner.salesforceId || null,
              partner.website || null
            ]
          );
          partnerIdMap.set(accountName, result.insertId);
          stats.partnersCreated++;
        }
      } catch (err) {
        stats.errors.push({ type: 'partner', name: accountName, error: err.message });
      }
    }

    console.log(`✅ Partners: ${stats.partnersCreated} created, ${stats.partnersUpdated} updated`);

    // Step 2: Batch upsert contacts (much faster than one-by-one)
    console.log(`📊 Processing ${contacts.length} contacts in batches...`);
    progress.updateProgress('contacts', `Processing ${contacts.length} contacts...`, 45, 0);
    
    const BATCH_SIZE = 100; // Smaller batches for reliability
    const totalContacts = contacts.length;
    let processedContacts = 0;
    
    // First, get all existing contacts in one query (include crm_last_modified for skip logic)
    const existingContactsResult = await query('SELECT id, email, lms_user_id, crm_last_modified FROM contacts');
    const existingContactsMap = new Map();
    existingContactsResult.forEach(c => {
      existingContactsMap.set(c.email.toLowerCase(), { 
        id: c.id, 
        lms_user_id: c.lms_user_id,
        crm_last_modified: c.crm_last_modified 
      });
    });
    console.log(`📋 Found ${existingContactsMap.size} existing contacts in database`);
    
    // Process in batches - use simple individual queries for reliability
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, Math.min(i + BATCH_SIZE, contacts.length));
      
      for (const contact of batch) {
        const email = contact.email.toLowerCase();
        const partnerId = partnerIdMap.get(contact.accountName || 'Unknown') || null;
        const existing = existingContactsMap.get(email);
        const newLastModified = contact.lastModified || null;
        
        try {
          if (existing) {
            // Skip if record hasn't changed since last import (incremental import optimization)
            if (newLastModified && existing.crm_last_modified) {
              const newDate = new Date(newLastModified);
              const existingDate = new Date(existing.crm_last_modified);
              if (newDate <= existingDate) {
                stats.contactsUnchanged++;
                continue; // Skip unchanged record
              }
            }
            
            // Track preserved LMS links
            if (existing.lms_user_id) {
              stats.lmsLinksPreserved++;
            }
            // Update existing contact
            await query(
              `UPDATE contacts SET partner_id = ?, first_name = ?, last_name = ?, title = ?, phone = ?, crm_last_modified = ?, updated_at = NOW() WHERE id = ?`,
              [partnerId, contact.firstName || null, contact.lastName || null, contact.title || null, contact.phone || null, newLastModified, existing.id]
            );
            stats.contactsUpdated++;
          } else {
            // Insert new contact
            const preservedLmsUserId = emailToLmsUser.get(email) || null;
            if (preservedLmsUserId) {
              stats.lmsLinksPreserved++;
            }
            await query(
              `INSERT INTO contacts (partner_id, email, first_name, last_name, title, phone, lms_user_id, crm_last_modified, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
              [partnerId, email, contact.firstName || null, contact.lastName || null, contact.title || null, contact.phone || null, preservedLmsUserId, newLastModified]
            );
            stats.contactsCreated++;
            // Add to map so we don't try to insert again if duplicate in file
            existingContactsMap.set(email, { id: -1, lms_user_id: preservedLmsUserId, crm_last_modified: newLastModified });
          }
        } catch (err) {
          stats.contactsSkipped++;
          if (stats.errors.length < 5) {
            stats.errors.push({ type: 'contact', email, error: err.message });
          }
        }
      }
      
      processedContacts += batch.length;
      const pct = 45 + Math.round((processedContacts / totalContacts) * 40);
      progress.updateProgress('contacts', `Processing contacts... ${processedContacts}/${totalContacts}`, pct, processedContacts);
      
      // Small delay to yield event loop and allow progress polling
      await new Promise(r => setTimeout(r, 1));
      
      if (processedContacts % 5000 === 0) {
        console.log(`  📊 Processed ${processedContacts}/${totalContacts} contacts...`);
      }
    }

    console.log(`✅ Contacts: ${stats.contactsCreated} created, ${stats.contactsUpdated} updated, ${stats.contactsUnchanged} unchanged (skipped), ${stats.lmsLinksPreserved} LMS links preserved`);

    // Step 3: Remove contacts no longer in CRM (but preserve their LMS user record)
    // Only run if we actually imported some contacts (otherwise we'd delete everything!)
    if (allEmails.size > 0) {
      progress.updateProgress('cleanup', 'Removing stale contacts...', 88);
      const contactsToRemove = await query(
        `SELECT id, email, lms_user_id FROM contacts WHERE email NOT IN (${Array(allEmails.size).fill('?').join(',')})`,
        [...allEmails]
      );
      
      if (contactsToRemove.length > 0) {
        const idsToRemove = contactsToRemove.map(c => c.id);
        await query(`DELETE FROM contacts WHERE id IN (${idsToRemove.map(() => '?').join(',')})`, idsToRemove);
        stats.contactsRemoved = contactsToRemove.length;
        console.log(`🧹 Removed ${stats.contactsRemoved} contacts no longer in CRM`);
      }
    } else {
      console.log('⚠️ No contacts parsed from file - skipping stale contact removal');
    }

    // Step 4: Remove partners no longer in CRM (preserving group links by nulling partner_id)
    // Only run if we actually imported some partners
    if (allAccountNames.size > 0) {
      progress.updateProgress('cleanup', 'Removing stale partners...', 92);
      const partnersToCheck = await query('SELECT id, account_name FROM partners');
      const partnersToRemove = partnersToCheck.filter(p => !allAccountNames.has(p.account_name));
      
      if (partnersToRemove.length > 0) {
        // Null out partner_id in lms_groups before deleting (preserve group, just unlink)
        for (const partner of partnersToRemove) {
          await query('UPDATE lms_groups SET partner_id = NULL WHERE partner_id = ?', [partner.id]);
        }
        
        const idsToRemove = partnersToRemove.map(p => p.id);
        await query(`DELETE FROM partners WHERE id IN (${idsToRemove.map(() => '?').join(',')})`, idsToRemove);
        stats.partnersRemoved = partnersToRemove.length;
        console.log(`🧹 Removed ${stats.partnersRemoved} partners no longer in CRM`);
      }
    } else {
      console.log('⚠️ No partners parsed from file - skipping stale partner removal');
    }

    // Log the import
    progress.updateProgress('finalizing', 'Saving import log...', 96);
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
    progress.completeImport(true);

    return {
      success: true,
      duration,
      stats
    };
  } catch (error) {
    console.error('❌ Import failed:', error);
    progress.completeImport(false, error.message);
    
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

/**
 * Get current import progress
 */
function getImportProgress() {
  return progress.getProgress();
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
  clearAllData,
  getImportProgress
};
