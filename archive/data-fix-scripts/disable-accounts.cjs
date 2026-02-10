/**
 * Account Disable Script
 *
 * Disables accounts in both Impartner (via CRM) and Northpass LMS
 * based on the Excel file of unmatched accounts.
 *
 * Usage:
 *   node disable-accounts.cjs                    # Check what would be done (dry run)
 *   node disable-accounts.cjs --execute          # Actually disable accounts
 *   node disable-accounts.cjs --check-only       # Only check which accounts exist
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const https = require('https');
const config = require('./server/config.cjs');

const NORTHPASS_API_KEY = config.northpass.apiKey;

// Parse arguments
const args = process.argv.slice(2);
const execute = args.includes('--execute');
const checkOnly = args.includes('--check-only');

// Stats
const stats = {
  total: 0,
  inContacts: 0,
  inLms: 0,
  disabledImpartner: 0,
  disabledLms: 0,
  errors: []
};

// Northpass API helper
function northpassRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.northpass.com',
      path: path,
      method: method,
      headers: {
        'X-Api-Key': NORTHPASS_API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ACCOUNT DISABLE SCRIPT                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  if (!execute && !checkOnly) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('   Use --execute to actually disable accounts');
    console.log('   Use --check-only to only check existence\n');
  } else if (execute) {
    console.log('⚠️  EXECUTE MODE - Accounts WILL be disabled!\n');
  } else {
    console.log('📋 CHECK ONLY MODE - Just checking which accounts exist\n');
  }

  // Read Excel file
  const workbook = XLSX.readFile('./files/Nintex Partner Portal Unmatched_2026-01-16.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);

  const accounts = data.map(row => ({
    email: row.Email,
    firstName: row['First Name'],
    lastName: row['Last Name'],
    accountName: row['Account Name'],
    eid: row.EID
  })).filter(a => a.email && a.email !== 'NULL' && a.email !== 'takashi.td.tsuchiya@jp.ricoh.com');

  stats.total = accounts.length;
  console.log(`Found ${stats.total} accounts to process\n`);

  // Connect to database
  const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  });

  try {
    console.log('=== STEP 1: Checking accounts in our database ===\n');

    const inContacts = [];
    const inLms = [];
    const notFound = [];

    for (const account of accounts) {
      // Check contacts table (Impartner data)
      const [contacts] = await pool.query(
        `SELECT c.id, c.email, c.first_name, c.last_name, c.impartner_id, c.lms_user_id,
                c.is_active, p.account_name
         FROM contacts c
         LEFT JOIN partners p ON p.id = c.partner_id
         WHERE c.email = ?`,
        [account.email]
      );

      // Check lms_users table
      const [lmsUsers] = await pool.query(
        'SELECT id, email, status FROM lms_users WHERE email = ?',
        [account.email]
      );

      const inContact = contacts.length > 0;
      const inLmsTable = lmsUsers.length > 0;

      if (inContact) {
        inContacts.push({
          ...account,
          contactId: contacts[0].id,
          impartnerId: contacts[0].impartner_id,
          lmsUserId: contacts[0].lms_user_id,
          isActive: contacts[0].is_active,
          partnerName: contacts[0].account_name
        });
        stats.inContacts++;
      }

      if (inLmsTable) {
        inLms.push({
          ...account,
          lmsId: lmsUsers[0].id,
          lmsStatus: lmsUsers[0].status
        });
        stats.inLms++;
      }

      if (!inContact && !inLmsTable) {
        notFound.push(account);
      }
    }

    console.log(`📋 Accounts in contacts table (Impartner): ${inContacts.length}`);
    console.log(`📋 Accounts in LMS: ${inLms.length}`);
    console.log(`📋 Not found in either: ${notFound.length}\n`);

    if (checkOnly) {
      console.log('\n=== ACCOUNTS IN CONTACTS (first 20) ===');
      inContacts.slice(0, 20).forEach(a => {
        console.log(`  ${a.email} | Partner: ${a.partnerName} | Active: ${a.isActive}`);
      });
      if (inContacts.length > 20) console.log(`  ... and ${inContacts.length - 20} more`);

      console.log('\n=== ACCOUNTS IN LMS (first 20) ===');
      inLms.slice(0, 20).forEach(a => {
        console.log(`  ${a.email} | LMS ID: ${a.lmsId} | Status: ${a.lmsStatus}`);
      });
      if (inLms.length > 20) console.log(`  ... and ${inLms.length - 20} more`);

      console.log('\n=== NOT FOUND (first 20) ===');
      notFound.slice(0, 20).forEach(a => {
        console.log(`  ${a.email} (${a.firstName} ${a.lastName})`);
      });
      if (notFound.length > 20) console.log(`  ... and ${notFound.length - 20} more`);

      return;
    }

    // STEP 2: Disable in Impartner (our database - contacts table)
    console.log('=== STEP 2: Disabling accounts in database (Impartner sync) ===\n');

    for (const account of inContacts) {
      try {
        if (execute) {
          // Update contact to inactive
          await pool.query(
            `UPDATE contacts SET
               is_active = FALSE,
               updated_at = NOW()
             WHERE id = ?`,
            [account.contactId]
          );
          console.log(`  ✅ Disabled: ${account.email}`);
        } else {
          console.log(`  [DRY RUN] Would disable: ${account.email} (Currently active: ${account.isActive})`);
        }
        stats.disabledImpartner++;
      } catch (err) {
        console.log(`  ❌ Error disabling ${account.email}: ${err.message}`);
        stats.errors.push({ email: account.email, system: 'impartner', error: err.message });
      }
    }

    // STEP 3: Deactivate in Northpass LMS
    console.log('\n=== STEP 3: Deactivating accounts in Northpass LMS ===\n');

    for (const account of inLms) {
      try {
        if (execute) {
          // Deactivate in Northpass API
          const response = await northpassRequest(`/v2/people/${account.lmsId}`, 'PATCH', {
            data: {
              type: 'people',
              id: account.lmsId,
              attributes: {
                deactivated: true
              }
            }
          });

          if (response.status === 200 || response.status === 204) {
            // Also update our local lms_users table
            await pool.query(
              'UPDATE lms_users SET status = ?, is_active = FALSE, deactivated_at = NOW(), synced_at = NOW() WHERE id = ?',
              ['deactivated', account.lmsId]
            );
            console.log(`  ✅ Deactivated in LMS: ${account.email}`);
          } else {
            console.log(`  ⚠️ LMS API response ${response.status} for ${account.email}: ${JSON.stringify(response.data)}`);
          }
        } else {
          console.log(`  [DRY RUN] Would deactivate in LMS: ${account.email} (Status: ${account.lmsStatus})`);
        }
        stats.disabledLms++;

        // Rate limit
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.log(`  ❌ Error deactivating ${account.email}: ${err.message}`);
        stats.errors.push({ email: account.email, system: 'lms', error: err.message });
      }
    }

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                         SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`  Total accounts in file:      ${stats.total}`);
    console.log(`  Found in contacts (Impartner): ${stats.inContacts}`);
    console.log(`  Found in LMS:                  ${stats.inLms}`);
    console.log(`  ${execute ? 'Disabled' : 'Would disable'} in Impartner: ${stats.disabledImpartner}`);
    console.log(`  ${execute ? 'Deactivated' : 'Would deactivate'} in LMS: ${stats.disabledLms}`);
    console.log(`  Errors:                        ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n  Errors:');
      stats.errors.forEach(e => console.log(`    - ${e.email} (${e.system}): ${e.error}`));
    }

    if (!execute) {
      console.log('\n🔍 This was a DRY RUN. Use --execute to actually disable accounts.');
    }

  } finally {
    await pool.end();
  }
}

main().catch(console.error);
