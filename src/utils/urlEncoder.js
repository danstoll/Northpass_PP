/**
 * URL Parameter Encoding/Decoding Utilities
 * 
 * This module provides functions to encode and decode URL parameters
 * to hide sensitive information from end users while maintaining functionality.
 */

/**
 * Encodes parameters into a Base64 URL-safe string
 * @param {Object} params - Object containing parameters to encode
 * @returns {string} Base64 encoded parameter string
 */
export const encodeUrlParams = (params) => {
  try {
    const jsonString = JSON.stringify(params);
    // Use Base64 encoding and make it URL-safe
    const encoded = btoa(jsonString)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return encoded;
  } catch (error) {
    console.error('Error encoding URL parameters:', error);
    return null;
  }
};

/**
 * Decodes a Base64 encoded parameter string back to an object
 * @param {string} encodedString - Base64 encoded parameter string
 * @returns {Object|null} Decoded parameters object or null if invalid
 */
export const decodeUrlParams = (encodedString) => {
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
    console.error('Error decoding URL parameters:', error);
    return null;
  }
};

/**
 * Generates an encoded URL with hidden parameters
 * @param {string} baseUrl - Base URL (e.g., window.location.origin)
 * @param {Object} params - Parameters to encode
 * @returns {string} Complete URL with encoded parameters
 */
export const generateEncodedUrl = (baseUrl, params) => {
  const encoded = encodeUrlParams(params);
  if (!encoded) return baseUrl;
  
  return `${baseUrl}?data=${encoded}`;
};

/**
 * Extracts parameters from current URL, handling both encoded and regular formats
 * @returns {Object} Object containing company/group name, tier, and viewer info
 */
export const extractUrlParams = () => {
  const urlParams = new URLSearchParams(window.location.search);

  // First, try to get encoded data parameter
  const encodedData = urlParams.get('data');
  if (encodedData) {
    const decoded = decodeUrlParams(encodedData);
    if (decoded) {
      return {
        groupName: decoded.group || decoded.company,
        tier: decoded.tier,
        viewer: decoded.viewer || null,  // 'nintex', 'partner', or null
        viewerEmail: decoded.viewerEmail || null,
        isEncoded: true
      };
    }
  }

  // Fall back to regular parameters for backward compatibility
  const groupName = urlParams.get('group') || urlParams.get('company');
  const tier = urlParams.get('tier');
  const viewer = urlParams.get('viewer');  // Allow ?viewer=nintex as fallback

  return {
    groupName,
    tier,
    viewer,
    viewerEmail: null,
    isEncoded: false
  };
};

// Example usage:
// const encodedUrl = generateEncodedUrl('http://localhost:3000', {
//   company: 'Acme Corporation',
//   tier: 'Premier'
// });
// console.log(encodedUrl); // http://localhost:3000?data=eyJjb21wYW55IjoiQWNtZSBDb3Jwb3JhdGlvbiIsInRpZXIiOiJQcmVtaWVyIn0