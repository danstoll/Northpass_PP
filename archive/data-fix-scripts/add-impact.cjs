const { query } = require('./server/db/connection.cjs');

async function addPartner() {
  try {
    await query(`
      INSERT INTO partners (account_name, partner_tier, impartner_id, is_active, created_at)
      VALUES ('Impact Networking', 'Premier', 1886359, 1, NOW())
    `);
    console.log('✅ Added Impact Networking');
    
    const result = await query('SELECT * FROM partners WHERE impartner_id = 1886359');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

addPartner();
