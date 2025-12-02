/**
 * Administrative URL Generation Utility
 * 
 * This utility provides functions for administrators to generate
 * encoded URLs for distribution to partners and clients.
 */

import { generateEncodedUrl } from './urlEncoder.js';

/**
 * Batch generate URLs for multiple companies
 * @param {Array} companies - Array of company objects with name and tier
 * @param {string} baseUrl - Base URL for the application
 * @returns {Array} Array of objects with company info and generated URLs
 */
export const batchGenerateUrls = (companies, baseUrl) => {
  return companies.map(company => ({
    ...company,
    encodedUrl: generateEncodedUrl(baseUrl, {
      company: company.name,
      tier: company.tier
    }),
    regularUrl: `${baseUrl}/?company=${encodeURIComponent(company.name)}&tier=${company.tier}`
  }));
};

/**
 * Generate CSV content for bulk URL distribution
 * @param {Array} urlData - Output from batchGenerateUrls
 * @returns {string} CSV content ready for download
 */
export const generateUrlCsv = (urlData) => {
  const headers = ['Company Name', 'Partner Tier', 'Encoded URL', 'Regular URL'];
  const rows = urlData.map(item => [
    `"${item.name}"`,
    item.tier,
    `"${item.encodedUrl}"`,
    `"${item.regularUrl}"`
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
};

/**
 * Download CSV file with generated URLs
 * @param {Array} urlData - Output from batchGenerateUrls
 * @param {string} filename - Optional filename for download
 */
export const downloadUrlCsv = (urlData, filename = 'partner-urls.csv') => {
  const csvContent = generateUrlCsv(urlData);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

/**
 * Validate company data before URL generation
 * @param {Array} companies - Array of company objects
 * @returns {Object} Validation result with valid companies and errors
 */
export const validateCompanyData = (companies) => {
  const validTiers = ['Premier', 'Select', 'Registered', 'Certified'];
  const valid = [];
  const errors = [];
  
  companies.forEach((company, index) => {
    const issues = [];
    
    if (!company.name || typeof company.name !== 'string' || company.name.trim() === '') {
      issues.push('Missing or invalid company name');
    }
    
    if (!company.tier || !validTiers.includes(company.tier)) {
      issues.push(`Invalid tier. Must be one of: ${validTiers.join(', ')}`);
    }
    
    if (issues.length === 0) {
      valid.push({
        ...company,
        name: company.name.trim()
      });
    } else {
      errors.push({
        index: index + 1,
        company: company.name || 'Unknown',
        issues
      });
    }
  });
  
  return { valid, errors };
};

// Example usage:
/*
const companies = [
  { name: 'Acme Corporation', tier: 'Premier' },
  { name: 'Widget Industries', tier: 'Select' },
  { name: 'Tech Solutions LLC', tier: 'Certified' }
];

const validation = validateCompanyData(companies);
if (validation.errors.length > 0) {
  console.error('Validation errors:', validation.errors);
}

const urlData = batchGenerateUrls(validation.valid, 'http://20.125.24.28:3000');
downloadUrlCsv(urlData, 'partner-portal-urls.csv');
*/