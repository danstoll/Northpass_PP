/**
 * Test script for partner family detection
 */

const { query } = require('./server/db/connection.cjs');

async function test() {
  try {
    console.log('Connecting to database...');
    
    // Check for potential families by name prefix
    const families = await query(`
      SELECT 
        SUBSTRING_INDEX(account_name, ' ', 1) as prefix,
        COUNT(*) as member_count,
        GROUP_CONCAT(account_region SEPARATOR ', ') as regions
      FROM partners
      WHERE CHAR_LENGTH(SUBSTRING_INDEX(account_name, ' ', 1)) >= 4
        AND SUBSTRING_INDEX(account_name, ' ', 1) NOT IN ('The', 'LLC', 'Inc', 'Ltd', 'GmbH')
      GROUP BY SUBSTRING_INDEX(account_name, ' ', 1)
      HAVING COUNT(*) >= 5
      ORDER BY member_count DESC
      LIMIT 20
    `);
    
    console.log('\n📊 Potential Partner Families (5+ members):');
    console.log('='.repeat(60));
    
    for (const f of families) {
      console.log(`\n🏢 ${f.prefix} (${f.member_count} partners)`);
      
      // Get members
      const members = await query(`
        SELECT id, account_name, account_region, partner_tier, partner_family
        FROM partners
        WHERE account_name LIKE ?
        ORDER BY account_name
        LIMIT 10
      `, [`${f.prefix}%`]);
      
      for (const m of members) {
        const familyNote = m.partner_family ? ` [Family: ${m.partner_family}]` : '';
        console.log(`   - ${m.account_name} (${m.account_region || '?'})${familyNote}`);
      }
      if (f.member_count > 10) {
        console.log(`   ... and ${f.member_count - 10} more`);
      }
    }
    
    // Check for partners with Impartner parent IDs
    console.log('\n\n📊 Partners with Impartner Parent Relationships:');
    console.log('='.repeat(60));
    
    const withParent = await query(`
      SELECT p.account_name, p.account_region, p.impartner_parent_id
      FROM partners p
      WHERE p.impartner_parent_id IS NOT NULL
      ORDER BY p.impartner_parent_id, p.account_name
    `);
    
    if (withParent.length === 0) {
      console.log('No partners with parent relationships found.');
      console.log('(Run Impartner sync to populate impartner_parent_id)');
    } else {
      console.log(`Found ${withParent.length} partners with parent IDs:`);
      withParent.forEach(p => {
        console.log(`   - ${p.account_name} (Parent ID: ${p.impartner_parent_id})`);
      });
    }
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

test();
