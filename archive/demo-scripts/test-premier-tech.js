/**
 * Quick test for Premier Tech customer dashboard
 */

// Generate encoded URL for Premier Tech
const testParams = {
  company: 'Premier Tech',
  type: 'customer'
};

const encoded = btoa(JSON.stringify(testParams))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=/g, '');

const testUrl = `http://localhost:5173/customer?data=${encoded}`;

console.log('🎓 Premier Tech Customer Dashboard Test URL:');
console.log(testUrl);
console.log('\n📋 To test:');
console.log('1. Copy the URL above');
console.log('2. Paste into browser');
console.log('3. Should show Premier Tech staff training dashboard');
console.log('\n🔍 Decoded parameters:');
console.log(JSON.stringify(testParams, null, 2));