/**
 * Customer URL Parameter Encoding/Decoding Utilities
 * 
 * This module provides functions to encode and decode URL parameters
 * for customer dashboards. Unlike partner dashboards, customer URLs
 * only need company information (name or ID) without tier requirements.
 */

/**
 * Encodes customer parameters into a Base64 URL-safe string
 * @param {Object} params - Object containing customer parameters
 * @param {string} params.company - Company name for lookup
 * @param {string} [params.companyId] - Optional company ID for direct lookup
 * @param {string} [params.type] - Optional type identifier ('customer')
 * @returns {string} Base64 encoded parameter string
 */
export const encodeCustomerParams = (params) => {
  try {
    // Add type marker to distinguish from partner URLs
    const customerParams = {
      ...params,
      type: 'customer'
    };
    
    const jsonString = JSON.stringify(customerParams);
    // Use Base64 encoding and make it URL-safe
    const encoded = btoa(jsonString)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return encoded;
  } catch (error) {
    console.error('Error encoding customer URL parameters:', error);
    return null;
  }
};

/**
 * Decodes a Base64 encoded customer parameter string back to an object
 * @param {string} encodedString - Base64 encoded parameter string
 * @returns {Object|null} Decoded parameters object or null if invalid
 */
export const decodeCustomerParams = (encodedString) => {
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
    
    const jsonString = atob(base64);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error decoding customer URL parameters:', error);
    return null;
  }
};

/**
 * Generates an encoded customer URL with hidden parameters
 * @param {string} baseUrl - Base URL (e.g., window.location.origin)
 * @param {Object} params - Customer parameters to encode
 * @returns {string} Complete URL with encoded parameters
 */
export const generateCustomerUrl = (baseUrl, params) => {
  const encoded = encodeCustomerParams(params);
  if (!encoded) return baseUrl;
  
  return `${baseUrl}/customer?data=${encoded}`;
};

/**
 * Extracts customer parameters from current URL, handling both encoded and regular formats
 * @returns {Object} Object containing company info and type
 */
export const extractCustomerParams = () => {
  const urlParams = new URLSearchParams(window.location.search);
  
  // First, try to get encoded data parameter
  const encodedData = urlParams.get('data');
  if (encodedData) {
    const decoded = decodeCustomerParams(encodedData);
    if (decoded && decoded.type === 'customer') {
      return {
        company: decoded.company,
        companyId: decoded.companyId,
        type: 'customer',
        isEncoded: true
      };
    }
  }
  
  // Fall back to regular parameters for backward compatibility
  const company = urlParams.get('company') || urlParams.get('group');
  const companyId = urlParams.get('companyId') || urlParams.get('id');
  
  // Check if we're on customer route
  const isCustomerRoute = window.location.pathname.includes('/customer');
  
  return {
    company,
    companyId,
    type: isCustomerRoute ? 'customer' : null,
    isEncoded: false
  };
};

/**
 * Validates customer parameters
 * @param {Object} params - Customer parameters to validate
 * @returns {Object} Validation result
 */
export const validateCustomerParams = (params) => {
  const errors = [];
  
  if (!params.company && !params.companyId) {
    errors.push('Either company name or company ID is required');
  }
  
  if (params.company && typeof params.company !== 'string') {
    errors.push('Company name must be a string');
  }
  
  if (params.companyId && typeof params.companyId !== 'string') {
    errors.push('Company ID must be a string');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Example usage:
// const customerUrl = generateCustomerUrl('http://localhost:3000', {
//   company: 'Premier Tech',
//   companyId: 'pt-001'
// });
// console.log(customerUrl); // http://localhost:3000/customer?data=eyJjb21wYW55IjoiUHJlbWllciBUZWNoIiwiY29tcGFueUlkIjoicHQtMDAxIiwidHlwZSI6ImN1c3RvbWVyIn0