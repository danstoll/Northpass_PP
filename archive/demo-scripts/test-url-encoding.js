/**
 * URL Encoding Demo and Test Script
 * 
 * This file demonstrates how the URL encoding system works
 * and provides examples for testing.
 */

import { encodeUrlParams, decodeUrlParams, generateEncodedUrl, extractUrlParams } from '../src/utils/urlEncoder.js';

// Example 1: Basic encoding/decoding
console.log('=== URL Encoding Demo ===\n');

const testParams = {
  company: 'Acme Corporation',
  tier: 'Premier'
};

const encoded = encodeUrlParams(testParams);
console.log('Original Parameters:', testParams);
console.log('Encoded String:', encoded);
console.log('Decoded Parameters:', decodeUrlParams(encoded));
console.log();

// Example 2: Generate complete URLs
const baseUrl = 'http://20.125.24.28:3000';
const encodedUrl = generateEncodedUrl(baseUrl, testParams);
const regularUrl = `${baseUrl}/?company=${encodeURIComponent(testParams.company)}&tier=${testParams.tier}`;

console.log('=== URL Comparison ===\n');
console.log('Regular URL (parameters visible):');
console.log(regularUrl);
console.log();
console.log('Encoded URL (parameters hidden):');
console.log(encodedUrl);
console.log();

// Example 3: Test multiple companies
const testCompanies = [
  { company: 'Nintex Partner Portal Americas', tier: 'Premier' },
  { company: 'Global Tech Solutions', tier: 'Select' },
  { company: 'Enterprise Workflow Inc', tier: 'Certified' },
  { company: 'Small Business Partners', tier: 'Registered' }
];

console.log('=== Multiple Company URLs ===\n');
testCompanies.forEach((params, index) => {
  const encoded = generateEncodedUrl(baseUrl, params);
  console.log(`${index + 1}. ${params.company} (${params.tier}):`);
  console.log(`   ${encoded}`);
  console.log();
});

// Example 4: Demonstrate URL safety
console.log('=== URL Safety Test ===\n');
const specialCharsCompany = {
  company: 'Tech & Solutions Co. (Advanced)',
  tier: 'Premier'
};

const safeEncoded = generateEncodedUrl(baseUrl, specialCharsCompany);
const unsafeRegular = `${baseUrl}/?company=${specialCharsCompany.company}&tier=${specialCharsCompany.tier}`;

console.log('Company with special characters:', specialCharsCompany.company);
console.log('Unsafe regular URL:', unsafeRegular);
console.log('Safe encoded URL:', safeEncoded);
console.log('Decoded from safe URL:', decodeUrlParams(safeEncoded.split('?data=')[1]));
console.log();

// Example 5: Show benefits
console.log('=== Benefits of URL Encoding ===\n');
console.log('✅ Benefits:');
console.log('  • Company names are hidden from URL');
console.log('  • Partner tiers are not visible to end users');
console.log('  • URLs are shorter and cleaner');
console.log('  • Safe handling of special characters');
console.log('  • Backward compatibility with old format');
console.log('  • Base64 encoding prevents casual inspection');
console.log();

console.log('⚠️  Security Note:');
console.log('  • This is encoding, not encryption');
console.log('  • Data can be decoded by anyone with the knowledge');
console.log('  • Use HTTPS for transmission security');
console.log('  • Consider server-side validation for sensitive data');

// Example 6: Browser simulation
console.log('\n=== Browser Usage Simulation ===\n');
console.log('// In browser console, you can test:');
console.log(`// window.location.href = "${encodedUrl}";`);
console.log('// Then check: extractUrlParams();');

export { testParams, testCompanies, encodedUrl };