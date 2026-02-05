/**
 * Deactivate the 28 Ricoh users in Northpass LMS
 */

const mysql = require('mysql2/promise');
const https = require('https');

const NORTHPASS_API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';

// The 28 users that need LMS deactivation
const lmsUsers = [
  'gnaneshwarreddy.goli@ricoh-usa.com',
  'paritosh.upadhyaya@ricoh-usa.com',
  'craig.ackerman@ricoh-usa.com',
  'stephen.adams@ricoh-usa.com',
  'daniel.alex@ricoh-usa.com',
  'alain.antoine@ricoh-usa.com',
  'shrikant.bhadsavale@ricoh-usa.com',
  'steven.delacastro@ricoh-usa.com',
  'mona.fennessy@mindshift.com',
  'ari.fernandez@ricoh-usa.com',
  'steve.grande@ricoh-usa.com',
  'douglas.hansberger@ricoh-usa.com',
  'ellen.hubbard-bugielski@ricoh-usa.com',
  'justin.hughes@ricoh-usa.com',
  'elizabeth.johnson1@ricoh-usa.com',
  'william.krieger@ricoh-usa.com',
  'nicolas.lamoureux@ricoh.ca',
  'bryan.lynn@ricoh-usa.com',
  'michael.oquinn@ricoh-usa.com',
  'diana.roberts@ricoh-usa.com',
  'lee.rogers@ricoh-usa.com',
  'michael.rose@ricoh-usa.com',
  'robin.sagulla@ricoh-usa.com',
  'william.santos@ricoh-usa.com',
  'eric.stavola@ricoh-usa.com',
  'tracey.thorntonthompson@ricoh-usa.com',
  'kelli.weber@ricoh-usa.com',
  'robert.widman@ricoh-usa.com'
];

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
  console.log('=== Deactivating 28 users in Northpass LMS ===\n');

  const pool = mysql.createPool({
    host: '20.29.25.238',
    port: 31337,
    user: 'root',
    password: 'P6Rof2DQo5wZqa9yM7y6',
    database: 'northpass_portal'
  });

  let success = 0;
  let failed = 0;

  try {
    for (const email of lmsUsers) {
      // Get LMS user ID
      const [users] = await pool.query('SELECT id FROM lms_users WHERE email = ?', [email]);
      if (users.length === 0) {
        console.log(`  ⚠️ Not found in lms_users: ${email}`);
        continue;
      }

      const lmsId = users[0].id;

      try {
        // Deactivate in Northpass API
        const response = await northpassRequest(`/v2/people/${lmsId}`, 'PATCH', {
          data: {
            type: 'people',
            id: lmsId,
            attributes: {
              deactivated: true
            }
          }
        });

        if (response.status === 200 || response.status === 204) {
          // Update our local lms_users table
          await pool.query(
            'UPDATE lms_users SET status = ?, is_active = FALSE, deactivated_at = NOW(), synced_at = NOW() WHERE id = ?',
            ['deactivated', lmsId]
          );
          console.log(`  ✅ Deactivated: ${email}`);
          success++;
        } else {
          console.log(`  ⚠️ API response ${response.status} for ${email}: ${JSON.stringify(response.data).substring(0, 100)}`);
          failed++;
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.log(`  ❌ Error: ${email}: ${err.message}`);
        failed++;
      }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`  Success: ${success}`);
    console.log(`  Failed: ${failed}`);

  } finally {
    await pool.end();
  }
}

main().catch(console.error);
