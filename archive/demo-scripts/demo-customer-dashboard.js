#!/usr/bin/env node

/**
 * Customer Dashboard Demo Script
 * 
 * Run this script to see examples of customer URL encoding in action:
 * node demo-customer-dashboard.js
 */

// Simulate the customer URL encoding functions
function encodeCustomerParams(params) {
  try {
    const customerParams = {
      ...params,
      type: 'customer'
    };
    
    const jsonString = JSON.stringify(customerParams);
    const encoded = Buffer.from(jsonString).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return encoded;
  } catch (error) {
    console.error('Error encoding customer URL parameters:', error);
    return null;
  }
}

function decodeCustomerParams(encodedString) {
  try {
    if (!encodedString) return null;
    
    let base64 = encodedString
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    while (base64.length % 4) {
      base64 += '=';
    }
    
    const jsonString = Buffer.from(base64, 'base64').toString();
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error decoding customer URL parameters:', error);
    return null;
  }
}

function generateCustomerUrl(baseUrl, params) {
  const encoded = encodeCustomerParams(params);
  if (!encoded) return baseUrl;
  
  return `${baseUrl}/customer?data=${encoded}`;
}

// Demo execution
console.log('🎓 Nintex Customer Training Dashboard - Demo\n');
console.log('='.repeat(55));

// Example 1: Company name lookup
const premierTechByName = {
  company: 'Premier Tech'
};

const encodedByName = encodeCustomerParams(premierTechByName);
console.log('\n📝 Customer Lookup by Name:');
console.log('Parameters:', JSON.stringify(premierTechByName, null, 2));
console.log('Encoded String:', encodedByName);
console.log('Decoded Back:', JSON.stringify(decodeCustomerParams(encodedByName), null, 2));

// Example 2: Company ID lookup
const premierTechById = {
  companyId: 'pt-001'
};

const encodedById = encodeCustomerParams(premierTechById);
console.log('\n📝 Customer Lookup by ID:');
console.log('Parameters:', JSON.stringify(premierTechById, null, 2));
console.log('Encoded String:', encodedById);
console.log('Decoded Back:', JSON.stringify(decodeCustomerParams(encodedById), null, 2));

// Example 3: Combined lookup
const combinedLookup = {
  company: 'Premier Tech',
  companyId: 'pt-001'
};

const encodedCombined = encodeCustomerParams(combinedLookup);
console.log('\n📝 Combined Lookup (Name + ID):');
console.log('Parameters:', JSON.stringify(combinedLookup, null, 2));
console.log('Encoded String:', encodedCombined);

// Example 4: URL comparison
const baseUrl = 'http://20.125.24.28:3000';
const customerUrlByName = generateCustomerUrl(baseUrl, premierTechByName);
const customerUrlById = generateCustomerUrl(baseUrl, premierTechById);
const regularUrlByName = `${baseUrl}/customer?company=${encodeURIComponent(premierTechByName.company)}`;
const regularUrlById = `${baseUrl}/customer?companyId=${premierTechById.companyId}`;

console.log('\n🔍 URL Comparison (Name Lookup):');
console.log('Regular URL:', regularUrlByName);
console.log('Encoded URL:', customerUrlByName);

console.log('\n🔍 URL Comparison (ID Lookup):');
console.log('Regular URL:', regularUrlById);
console.log('Encoded URL:', customerUrlById);

// Example 5: Multiple customer companies
const customerCompanies = [
  { company: 'Premier Tech' },
  { company: 'Global Solutions Inc' },
  { companyId: 'ent-001', company: 'Enterprise Corp' },
  { companyId: 'tp-123', company: 'Tech Partners LLC' }
];

console.log('\n🏢 Multiple Customer Examples:');
customerCompanies.forEach((params, index) => {
  const url = generateCustomerUrl(baseUrl, params);
  const lookupMethod = params.companyId ? `ID: ${params.companyId}` : `Name: ${params.company}`;
  console.log(`\n${index + 1}. ${params.company || 'Unknown'} (${lookupMethod}):`);
  console.log(`   ${url}`);
});

// Example 6: Dashboard differences
console.log('\n📊 Dashboard Comparison:');
console.log('👥 PARTNER Dashboard Features:');
console.log('  • NPCU point tracking');
console.log('  • Partner tier qualification (Premier/Select/etc.)');
console.log('  • Company-wide certification goals');
console.log('  • Tier requirement progress');
console.log('  • Product category breakdown');

console.log('\n🎓 CUSTOMER Dashboard Features:');
console.log('  • Staff training overview');
console.log('  • Individual employee records');
console.log('  • Certification expiry tracking');
console.log('  • Training completion rates');
console.log('  • Course-by-course breakdown');

console.log('\n👩‍💼 Admin Workflow for Customer URLs:');
console.log('1. Go to: http://20.125.24.28:3000/admin');
console.log('2. Click "🎓 Customer URLs" tab');
console.log('3. Enter customer data:');
console.log('   Premier Tech');
console.log('   Global Corp, gc-001');
console.log('4. Click "Generate URLs"');
console.log('5. Download CSV with customer URLs');
console.log('6. Distribute to customer staff managers');

console.log('\n✅ Benefits Summary:');
console.log('• Separate dashboards for different use cases');
console.log('• Company lookup by name OR ID');
console.log('• Staff-focused training management');
console.log('• No NPCU complexity for customers');
console.log('• Clean, encoded URLs');

console.log('\n🚀 Ready to test! Try these URLs:');
console.log('• Customer Dashboard: http://localhost:5173/customer');
console.log('• Partner Dashboard: http://localhost:5173/');
console.log('• Admin Panel: http://localhost:5173/admin');
console.log('• Test Customer URL:', generateCustomerUrl('http://localhost:5173', premierTechByName));

console.log('\n' + '='.repeat(55));
console.log('Customer Dashboard Demo complete! 🎉');