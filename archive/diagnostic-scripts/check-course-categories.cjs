/**
 * Query certification courses to understand naming patterns
 */
const { query } = require('./server/db/connection.cjs');

async function main() {
  try {
    console.log('Querying certification courses...\n');
    
    const courses = await query(`
      SELECT id, name, product_category, npcu_value 
      FROM lms_courses 
      WHERE npcu_value > 0 
      ORDER BY name
    `);
    
    console.log(`Found ${courses.length} certification courses:\n`);
    
    // Group by potential category
    const byCategory = {
      'Nintex CE / Automation Cloud': [],
      'Nintex K2': [],
      'Nintex for Salesforce': [],
      'Go To Market': [],
      'Other': []
    };
    
    for (const course of courses) {
      const name = course.name.toLowerCase();
      
      if (name.includes('k2') || name.includes('automation k2')) {
        byCategory['Nintex K2'].push(course);
      } else if (name.includes('salesforce') || name.includes('docgen for salesforce')) {
        byCategory['Nintex for Salesforce'].push(course);
      } else if (name.includes('go to market') || name.includes('gtm') || name.includes('sales') && name.includes('enablement')) {
        byCategory['Go To Market'].push(course);
      } else if (name.includes('automation cloud') || name.includes('workflow cloud') || 
                 name.includes('forms') || name.includes('process manager') ||
                 name.includes('promapp') || name.includes('xtensions')) {
        byCategory['Nintex CE / Automation Cloud'].push(course);
      } else {
        byCategory['Other'].push(course);
      }
    }
    
    // Print results
    for (const [category, items] of Object.entries(byCategory)) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📚 ${category} (${items.length} courses)`);
      console.log('='.repeat(60));
      for (const c of items) {
        console.log(`  [NPCU ${c.npcu_value}] ${c.name}`);
        console.log(`         Category: ${c.product_category || 'None'}`);
      }
    }
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

main();
