#!/usr/bin/env node

/**
 * URL Encoding Demo Script
 * 
 * Run this script to see examples of URL encoding in action:
 * node demo-url-encoding.js
 */

// Simulate the URL encoding functions (since we can't import ES modules directly in Node.js without special setup)
function encodeUrlParams(params) {
  try {
    const jsonString = JSON.stringify(params);
    // Use Base64 encoding and make it URL-safe
    const encoded = Buffer.from(jsonString).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return encoded;
  } catch (error) {
    console.error('Error encoding URL parameters:', error);
    return null;
  }
}

function decodeUrlParams(encodedString) {
  try {
    if (!encodedString) return null;
    
    // Restore Base64 padding and characters
    let base64 = encodedString
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    
    const jsonString = Buffer.from(base64, 'base64').toString();
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error decoding URL parameters:', error);
    return null;
  }
}

function generateEncodedUrl(baseUrl, params) {
  const encoded = encodeUrlParams(params);
  if (!encoded) return baseUrl;
  
  return `${baseUrl}?data=${encoded}`;
}

// Demo execution
console.log('🔗 Nintex Partner Portal - URL Encoding Demo\n');
console.log('='.repeat(50));

// Example 1: Basic encoding/decoding
const testParams = {
  company: 'Acme Corporation',
  tier: 'Premier'
};

const encoded = encodeUrlParams(testParams);
console.log('\n📝 Basic Encoding Example:');
console.log('Original Parameters:', JSON.stringify(testParams, null, 2));
console.log('Encoded String:', encoded);
console.log('Decoded Back:', JSON.stringify(decodeUrlParams(encoded), null, 2));

// Example 2: URL comparison
const baseUrl = 'http://20.125.24.28:3000';
const encodedUrl = generateEncodedUrl(baseUrl, testParams);
const regularUrl = `${baseUrl}/?company=${encodeURIComponent(testParams.company)}&tier=${testParams.tier}`;

console.log('\n🔍 URL Comparison:');
console.log('Regular URL (visible parameters):');
console.log(regularUrl);
console.log('\nEncoded URL (hidden parameters):');
console.log(encodedUrl);

// Example 3: Multiple companies
const companies = [
  { company: 'Nintex Partner Portal Americas', tier: 'Premier' },
  { company: 'Global Tech Solutions & Co.', tier: 'Select' },
  { company: 'Enterprise Workflow Inc', tier: 'Certified' },
  { company: 'Small Business Partners', tier: 'Registered' }
];

console.log('\n🏢 Multiple Company Examples:');
companies.forEach((params, index) => {
  const url = generateEncodedUrl(baseUrl, params);
  console.log(`\n${index + 1}. ${params.company} (${params.tier}):`);
  console.log(`   ${url}`);
});

// Example 4: Special characters test
const specialTest = {
  company: 'Tech & Solutions Co. (Advanced)',
  tier: 'Premier'
};

console.log('\n🧪 Special Characters Test:');
console.log('Company with special chars:', specialTest.company);
console.log('Encoded safely:', generateEncodedUrl(baseUrl, specialTest));

// Example 5: Show what the admin would do
console.log('\n👩‍💼 Admin Workflow:');
console.log('1. Go to: http://20.125.24.28:3000/admin');
console.log('2. Enter company data in CSV format:');
console.log('   Acme Corporation, Premier');
console.log('   Widget Industries, Select');
console.log('3. Click "Generate URLs"');
console.log('4. Download CSV with all encoded URLs');
console.log('5. Distribute secure URLs to partners');

console.log('\n✅ Benefits Summary:');
console.log('• Company names are hidden from URL bar');
console.log('• Partner tiers not visible to end users');
console.log('• URLs work with special characters');
console.log('• Backward compatible with old format');
console.log('• Professional, clean appearance');

console.log('\n🚀 Ready to test! Start the app and try these URLs:');
console.log('• Homepage: http://localhost:5173/');
console.log('• Admin Panel: http://localhost:5173/admin');
console.log('• Test URL:', generateEncodedUrl('http://localhost:5173', testParams));

console.log('\n' + '='.repeat(50));
console.log('Demo complete! 🎉');