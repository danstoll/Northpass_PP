import axios from 'axios';
import { 
  trackFailedCourse, 
  isKnownFailedCourse, 
  getFailedCourseStats,
  analyzePropertiesFailures 
} from './failedCourseTracker.js';

// Use proxy in development, direct API in production
const API_BASE_URL = import.meta.env.DEV 
  ? '/api/northpass' 
  : 'https://api.northpass.com';
const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';

// Optimized rate limiting configuration
const STANDARD_RATE_LIMIT = 5; // 5 requests per second for standard endpoints
const STANDARD_RATE_WINDOW = 1000; // 1 second
const STANDARD_MIN_DELAY = 200; // 200ms between standard requests

// Conservative for properties API only
const PROPERTIES_MIN_DELAY = 1000; // 1 second for properties API
const MAX_CONCURRENT_USERS = 3; // Process 3 users in parallel
let requestCount = 0;
let windowStart = Date.now();
let lastRequestTime = 0;

// Note: Properties API queue system removed as it was unused

// Enhanced rate limiter with different limits for different endpoints
async function throttledRequest(requestFn, isPropertiesApi = false) {
  const rateLimit = isPropertiesApi ? 1 : STANDARD_RATE_LIMIT;
  const minDelay = isPropertiesApi ? PROPERTIES_MIN_DELAY : STANDARD_MIN_DELAY;
  
  return new Promise((resolve, reject) => {
    const now = Date.now();
    
    // Ensure minimum delay between requests
    const timeSinceLastRequest = now - lastRequestTime;
    const delayNeeded = Math.max(0, minDelay - timeSinceLastRequest);
    
    setTimeout(async () => {
      // Reset counter if window has passed
      if (now - windowStart >= STANDARD_RATE_WINDOW) {
        requestCount = 0;
        windowStart = now;
      }
      
      // If under rate limit, execute immediately
      if (requestCount < rateLimit) {
        requestCount++;
        lastRequestTime = Date.now();
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      } else {
        // Queue the request for next window
        const delay = STANDARD_RATE_WINDOW - (now - windowStart);
        setTimeout(() => {
          throttledRequest(requestFn, isPropertiesApi).then(resolve).catch(reject);
        }, delay);
      }
    }, delayNeeded);
  });
}

// Enhanced API client with rate limiting and retry logic
// Rate limited wrapper for axios function calls
async function rateLimitedApiCall(apiCallFunction, retryCount = 0) {
  const maxRetries = 3;
  
  return throttledRequest(async () => {
    try {
      const response = await apiCallFunction();
      // Log successful API calls for debugging
      if (response.config?.url) {
        console.log(`✅ API call succeeded: ${response.config.method?.toUpperCase()} ${response.config.url}`);
      }
      return response;
    } catch (error) {
      // Log failed API calls for debugging
      if (error.config?.url) {
        console.warn(`⚠️ API call failed: ${error.config.method?.toUpperCase()} ${error.config.url} - ${error.response?.status} ${error.response?.statusText || error.message}`);
      }
      // Handle 429 (rate limiting) with aggressive exponential backoff
      if (error.response?.status === 429 && retryCount < maxRetries) {
        const backoffTime = Math.pow(3, retryCount) * 2000 + Math.random() * 1000; // 2-3s, 6-7s, 18-19s
        console.warn(`🚫 Rate limited! Backing off for ${Math.round(backoffTime/1000)}s (attempt ${retryCount + 1}/${maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        return rateLimitedApiCall(apiCallFunction, retryCount + 1);
      }
      
      throw error;
    }
  });
}

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-Api-Key': API_KEY,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
});

// Add response interceptor to handle expected 404s gracefully
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't log 404s for transcript endpoint - this is expected for users without courses
    if (error.response?.status === 404 && error.config?.url?.includes('/transcript')) {
      console.log('📝 No transcript data found (expected for users without completed courses)');
    }
    // Re-throw the error so it can be handled by try-catch blocks
    return Promise.reject(error);
  }
);

export const northpassApi = {
  // Test API connection
  async testConnection() {
    try {
      console.log('🔗 Testing Northpass API connection...');
      console.log('🔑 Using API Key:', API_KEY.substring(0, 8) + '...');
      console.log('🌐 API Base URL:', API_BASE_URL);
      
      // Try a simple endpoint to test connectivity
      const response = await apiClient.get('/v2/people?limit=1');
      console.log('✅ API Connection successful!');
      console.log('📊 Response structure:', {
        status: response.status,
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : []
      });
      
      return true;
    } catch (error) {
      console.error('❌ API Connection failed:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      return false;
    }
  },

  // Get current user information by email
  async getCurrentUser(userEmail) {
    try {
      if (userEmail) {
        console.log('🔍 Looking up user by email:', userEmail);
        const response = await apiClient.get(`/v2/people`, {
          params: {
            'filter[email][eq]': userEmail
          }
        });
        
        console.log('📧 Email lookup response:', response.data);
        const users = response.data?.data || [];
        
        if (users.length > 0) {
          console.log('✅ Found user:', users[0].attributes);
          return users[0];
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error fetching user:', error.response?.data || error.message);
      return null;
    }
  },

  // Cache for course catalog to avoid repeated API calls
  _courseCatalogCache: null,
  _catalogCacheTimestamp: null,
  _catalogCacheTTL: 5 * 60 * 1000, // 5 minutes TTL

  // Fetch current course catalog for validation
  async getCourseCatalog() {
    try {
      // Check if we have a valid cached catalog
      const now = Date.now();
      if (this._courseCatalogCache && 
          this._catalogCacheTimestamp && 
          (now - this._catalogCacheTimestamp) < this._catalogCacheTTL) {
        console.log('📚 Using cached course catalog');
        return this._courseCatalogCache;
      }

      console.log('📡 Fetching current course catalog...');
      let allCourses = [];
      let currentPage = 1;
      let hasNextPage = true;

      while (hasNextPage) {
        const pageParam = currentPage > 1 ? `?page=${currentPage}&limit=50&filter[published][eq]=true` : '?limit=50&filter[published][eq]=true';
        const response = await rateLimitedApiCall(() => apiClient.get(`/v2/courses${pageParam}`));
        
        if (response.data?.data && response.data.data.length > 0) {
          allCourses = [...allCourses, ...response.data.data];
          hasNextPage = !!response.data.links?.next;
          if (hasNextPage) currentPage++;
        } else {
          hasNextPage = false;
        }
      }

      // Create a Set of valid course IDs for quick lookup
      const validCourseIds = new Set(allCourses.map(course => course.id));
      
      console.log(`✅ Loaded ${allCourses.length} published courses into catalog`);
      
      // Cache the results
      this._courseCatalogCache = validCourseIds;
      this._catalogCacheTimestamp = now;
      
      return validCourseIds;
    } catch (error) {
      console.error('❌ Error fetching course catalog:', error.message);
      return new Set(); // Return empty set on error
    }
  },

  // Validate if a course ID exists in the current catalog
  async validateCourseInCatalog(courseId, courseName = 'Unknown Course') {
    if (!courseId) return false;
    
    // Check if this course is already known to be invalid to avoid unnecessary API calls
    if (isKnownFailedCourse(courseId, '404_NOT_FOUND')) {
      console.log(`⚡ Skipping known invalid course: ${courseName} (${courseId})`);
      return false;
    }
    
    const catalog = await this.getCourseCatalog();
    const isValid = catalog.has(courseId);
    
    // Track failed courses for future optimization
    if (!isValid) {
      trackFailedCourse(courseId, courseName, '404_NOT_FOUND', {
        catalogSize: catalog.size,
        validationAttempt: new Date().toISOString()
      });
    }
    
    return isValid;
  },

  // Try to get certificates with expiry dates from certificates endpoint
  async getUserCertificates(userId) {
    // This endpoint consistently returns 404, so we'll skip it for now
    // and rely on transcript data with calculated expiry dates
    console.log('📜 Skipping certificates endpoint (returns 404) for user:', userId);
    return [];
  },

  // Get user certifications with enriched data and catalog validation
  async getUserCertifications(userId) {
    try {
      console.log('📚 Fetching certifications for user:', userId);
      
      // Note: certificates endpoint returns 404, so we rely on transcript data
      console.log('📝 Using transcript endpoint for certification data (certificates endpoint unavailable)');
      
      // Use the correct transcript endpoint we discovered with pagination
      let allTranscriptItems = [];
      let currentPage = 1;
      let hasNextPage = true;
      
      try {
        console.log('📡 Attempting to fetch complete transcript for user:', userId);
        
        while (hasNextPage) {
          console.log(`📄 Fetching transcript page ${currentPage} with increased page size...`);
          
          // Use only basic pagination with increased page size (filtering not supported on transcript endpoint)
          const pageParam = currentPage > 1 ? `?page=${currentPage}&limit=50` : '?limit=50';
          
          const transcriptResponse = await rateLimitedApiCall(() => apiClient.get(`/v2/transcripts/${userId}${pageParam}`));
          
          if (transcriptResponse.data?.data && transcriptResponse.data.data.length > 0) {
            allTranscriptItems = [...allTranscriptItems, ...transcriptResponse.data.data];
            console.log(`✅ Page ${currentPage}: Found ${transcriptResponse.data.data.length} items (Total: ${allTranscriptItems.length})`);
            
            // Check if there's a next page
            hasNextPage = !!transcriptResponse.data.links?.next;
            if (hasNextPage) {
              currentPage++;
            }
          } else {
            hasNextPage = false;
          }
        }
        
        console.log(`🎯 Total transcript items fetched: ${allTranscriptItems.length}`);
        
      } catch (transcriptError) {
        console.log('📝 Transcript not available (expected 404 for users without courses)');
        console.log('   Error status:', transcriptError.response?.status);
        console.log('   Error message:', transcriptError.message);
        allTranscriptItems = [];
      }
      
      if (!allTranscriptItems || allTranscriptItems.length === 0) {
        console.log('📝 No transcript data available');
        return [];
      }
      
      console.log('📋 Raw transcript data:', { totalItems: allTranscriptItems.length });
      
      // Debug: Log the structure of transcript items to find expiry date fields
      if (allTranscriptItems.length > 0) {
        const sample = allTranscriptItems[0];
        console.log('🔍 Sample transcript item structure:', {
          id: sample.id,
          type: sample.type,
          attributeKeys: Object.keys(sample.attributes || {}),
          linksKeys: Object.keys(sample.links || {}),
          allAttributes: sample.attributes
        });
        
        // Look for any date-related fields that might be expiry dates
        const attrs = sample.attributes || {};
        const dateFields = Object.keys(attrs).filter(key => 
          key.toLowerCase().includes('expir') || 
          key.toLowerCase().includes('valid') || 
          key.toLowerCase().includes('date') ||
          key.toLowerCase().includes('until')
        );
        console.log('📅 Date-related fields found:', dateFields.map(field => ({ 
          field, 
          value: attrs[field] 
        })));
      }
      
      const transcriptItems = allTranscriptItems;
      console.log(`📊 Found ${transcriptItems.length} transcript items`);
      
      // Filter for completed courses/learning paths using correct field names
      const completedItems = transcriptItems.filter(item => {
        const attrs = item.attributes;
        return attrs?.progress_status === 'completed' && attrs?.completed_at;
      });
      
      console.log(`✅ Found ${completedItems.length} completed items`);
      
      // Convert to standardized format using correct API field names
      let certifications = completedItems.map(item => {
        const attrs = item.attributes;
        
        return {
          id: item.id,
          resourceId: attrs.resource_id,
          resourceType: attrs.resource_type,
          name: attrs.name || 'Unknown Course', // Correct field name
          status: attrs.progress_status, // Correct field name
          completedAt: attrs.completed_at,
          enrolledAt: attrs.enrolled_at,
          startedAt: attrs.started_at,
          lastActiveAt: attrs.last_active_at,
          attemptNumber: attrs.attempt_number,
          versionNumber: attrs.version_number,
          // Check for certificate link in transcript item links
          certificateUrl: item.links?.certificate || null,
          hasCertificate: !!item.links?.certificate,
          // Check for potential expiry date fields in attributes (transcript data only)
          expiresAt: attrs.expires_at || attrs.expiry_date || attrs.certificate_expires_at || null,
          validUntil: attrs.valid_until || attrs.valid_to || null,
          certificateExpiryDate: attrs.certificate_expiry_date || attrs.cert_expires_at || null,
          // Add NPCU calculation based on course name/type
          npcu: this.calculateNPCUPoints(attrs.name || 'Unknown Course'),
          // Use actual expiry date if available, otherwise calculate
          expiryDate: attrs.expires_at || attrs.expiry_date || attrs.certificate_expires_at || 
                     attrs.valid_until || attrs.valid_to || attrs.certificate_expiry_date || 
                     attrs.cert_expires_at || this.calculateExpiryDate(attrs.completed_at, attrs.name || 'Unknown Course')
        };
      });

      console.log(`🔍 Pre-validation: Found ${certifications.length} completed items`);
      
      // Validate each certification against the current course catalog
      const validatedCertifications = [];
      const invalidCertifications = [];
      
      for (const cert of certifications) {
        const isValid = await this.validateCourseInCatalog(cert.resourceId, cert.name);
        if (isValid) {
          validatedCertifications.push({
            ...cert,
            isValidCourse: true
          });
        } else {
          invalidCertifications.push({
            ...cert,
            isValidCourse: false,
            npcu: 0 // Set NPCU to 0 for invalid courses
          });
          console.warn(`⚠️ Invalid course found: ${cert.name} (ID: ${cert.resourceId}) - excluded from NPCU calculation`);
        }
      }
      
      console.log(`✅ Validation complete: ${validatedCertifications.length} valid, ${invalidCertifications.length} invalid courses`);
      console.log('🎓 Valid certifications:', validatedCertifications);
      
      if (invalidCertifications.length > 0) {
        console.log('❌ Invalid certifications (excluded from NPCU):', invalidCertifications.map(c => ({ name: c.name, id: c.resourceId })));
      }
      
      // Display failed course statistics for this user
      if (invalidCertifications.length > 0) {
        getFailedCourseStats();
      }
      
      // Return only valid certifications for NPCU calculation
      return validatedCertifications;
      
    } catch (error) {
      console.log('ℹ️ Note: 404 errors for transcript are normal for users without courses');
      console.log('❌ Error in getUserCertifications:', error.message);
      console.log('   Status:', error.response?.status);
      console.log('   Details:', error.response?.data);
      return [];
    }
  },

  // Analyze course validation results across all users
  analyzeCompanyCourseValidation(allUsers) {
    console.log('🔍 === COMPANY COURSE VALIDATION ANALYSIS ===');
    
    // Get comprehensive statistics from the failed course tracker
    const stats = getFailedCourseStats();
    
    // Collect all certifications from all users
    const allCertifications = [];
    const validCertifications = [];
    const invalidCertifications = [];
    
    allUsers.forEach(user => {
      user.certifications.forEach(cert => {
        allCertifications.push({
          ...cert,
          userId: user.id,
          userName: user.name
        });
        
        if (cert.isValidCourse !== false) {
          validCertifications.push(cert);
        } else {
          invalidCertifications.push(cert);
        }
      });
    });
    
    // Analyze the data using the failed course tracker
    analyzePropertiesFailures(allCertifications, validCertifications);
    
    const analysis = {
      totalUsers: allUsers.length,
      totalCertifications: allCertifications.length,
      validCertifications: validCertifications.length,
      invalidCertifications: invalidCertifications.length,
      courseValidityRate: allCertifications.length > 0 ? 
        Math.round((validCertifications.length / allCertifications.length) * 100) : 0,
      trackedFailedCourses: stats.totalFailedCourses,
      failedCourseBreakdown: {
        notFound404: stats.notFound404.length,
        accessDenied403: stats.accessDenied403.length,
        propertiesAccessDenied403: stats.propertiesAccessDenied403.length,
        otherErrors: stats.otherErrors.length
      }
    };
    
    console.log('📊 === FINAL COMPANY VALIDATION SUMMARY ===');
    console.log(`👥 Users Analyzed: ${analysis.totalUsers}`);
    console.log(`🎓 Total Certifications Found: ${analysis.totalCertifications}`);
    console.log(`✅ Valid Courses: ${analysis.validCertifications} (${analysis.courseValidityRate}%)`);
    console.log(`❌ Invalid Courses: ${analysis.invalidCertifications} (${100 - analysis.courseValidityRate}%)`);
    console.log(`📋 Tracked Failed Courses: ${analysis.trackedFailedCourses}`);
    console.log('🔧 Failed Course Breakdown:', analysis.failedCourseBreakdown);
    
    if (analysis.invalidCertifications > 0) {
      console.log('⚠️  IMPORTANT: Invalid courses have been excluded from NPCU calculations');
      console.log('💡 These courses may be archived, deleted, or unpublished');
    }
    
    return analysis;
  },

  // Validate NPCU value from API - ensure it's 0, 1, or 2 only
  validateNPCUValue(npcuValue) {
    // Convert to number and ensure it's valid
    const npcu = Number(npcuValue);
    
    // NPCU can only be 0, 1, or 2 per business rules
    if (npcu === 0 || npcu === 1 || npcu === 2) {
      return npcu;
    }
    
    // If invalid value, default to 0
    console.warn(`⚠️ Invalid NPCU value: ${npcuValue}, defaulting to 0`);
    return 0;
  },

  // Categorize certifications by Nintex product groups
  categorizeCertificationByProduct(courseName) {
    const name = courseName.toLowerCase();
    
    // Nintex CE (Cloud Enterprise): Workflow, RPA, Process Manager, Apps, Automation Cloud
    if (name.includes('workflow') || 
        name.includes('rpa') || 
        name.includes('process manager') || 
        name.includes('automation cloud') ||
        (name.includes('nintex apps') && !name.includes('salesforce'))) {
      return 'Nintex CE';
    }
    
    // Nintex K2: K2 Cloud, K2 Automation
    if (name.includes('k2') || 
        name.includes('automation k2')) {
      return 'Nintex K2';
    }
    
    // Nintex for Salesforce: Apps for Salesforce, DocGen for Salesforce
    if (name.includes('salesforce') || 
        name.includes('docgen') ||
        name.includes('apps for salesforce')) {
      return 'Nintex for Salesforce';
    }
    
    // Other/Uncategorized
    return 'Other';
  },

  // Get product category statistics for a set of certifications
  getProductCategoryStats(certifications) {
    const stats = {
      'Nintex CE': { count: 0, npcu: 0, courses: [] },
      'Nintex K2': { count: 0, npcu: 0, courses: [] },
      'Nintex for Salesforce': { count: 0, npcu: 0, courses: [] },
      'Other': { count: 0, npcu: 0, courses: [] }
    };
    
    certifications.forEach(cert => {
      const category = this.categorizeCertificationByProduct(cert.name);
      stats[category].count++;
      stats[category].npcu += cert.npcu || 0;
      stats[category].courses.push({
        name: cert.name,
        npcu: cert.npcu || 0,
        isValid: cert.isValidCourse !== false,
        completedAt: cert.completedAt,
        expiryDate: cert.expiryDate
      });
    });
    
    return stats;
  },

  // Calculate expiry date for certifications based on completion date and course type
  calculateExpiryDate(completedAt, courseName) {
    if (!completedAt) return null;
    
    const completedDate = new Date(completedAt);
    if (isNaN(completedDate.getTime())) return null;
    
    const name = courseName.toLowerCase();
    
    // Different validity periods based on certification type
    let validityMonths = 24; // Default: 2 years
    
    // Some certifications might have different validity periods
    if (name.includes('fundamentals') || name.includes('basic')) {
      validityMonths = 36; // 3 years for fundamental courses
    } else if (name.includes('advanced') || name.includes('expert')) {
      validityMonths = 18; // 1.5 years for advanced certifications
    } else if (name.includes('k2') || name.includes('automation')) {
      validityMonths = 24; // 2 years for K2 certifications
    }
    
    const expiryDate = new Date(completedDate);
    expiryDate.setMonth(expiryDate.getMonth() + validityMonths);
    
    return expiryDate.toISOString();
  },

  // Calculate NPCU points based on course name and type (business logic fallback)
  // NPCU can only be 0 (blank), 1, or 2 - no other values allowed
  calculateNPCUPoints(courseName) {
    const name = courseName.toLowerCase();
    
    // Only assign NPCU points if this is actually a certification course
    // Look for certification-specific keywords
    if (name.includes('certification') || name.includes('certified')) {
      // Advanced certifications get 2 NPCU
      if (name.includes('advanced') || name.includes('expert') || name.includes('master') || name.includes('professional')) {
        return 2;
      }
      // Basic certifications get 1 NPCU
      return 1;
    }
    
    // Regular courses (not certifications) get 0 NPCU
    return 0;
  },



  // ========================================
  // GROUP MANAGEMENT FUNCTIONS
  // ========================================

  /**
   * Find a group by name
   * @param {string} groupName - The name of the group to find
   * @returns {Object|null} - The group object or null if not found
   */
  async findGroupByName(groupName) {
    console.log(`🔍 Searching for group: "${groupName}"`);
    
    try {
      let page = 1;
      let foundGroup = null;
      let totalGroupsChecked = 0;
      
      while (!foundGroup) {
        const response = await rateLimitedApiCall(() => apiClient.get('/v2/groups', {
          params: {
            page: page,
            limit: 50
          }
        }));
        
        // The response structure has data.data for the actual array
        const groups = response.data?.data || [];
        
        if (groups.length === 0) {
          break; // No more pages
        }
        
        // Search for the group in this page
        foundGroup = groups.find(group => {
          const groupNameInApi = group.attributes?.name || '';
          const match = groupNameInApi.toLowerCase() === groupName.toLowerCase();
          
          // Debug logging for close matches
          if (groupNameInApi.toLowerCase().includes(groupName.toLowerCase().substring(0, 10))) {
            console.log(`🔍 Potential match: "${groupNameInApi}" vs "${groupName}" (exact: ${match})`);
          }
          
          return match;
        });
        
        if (foundGroup) {
          console.log(`✅ Found group: ${foundGroup.attributes.name} (ID: ${foundGroup.id})`);
          return foundGroup;
        }
        
        totalGroupsChecked += groups.length;
        console.log(`📄 Page ${page}: ${groups.length} groups checked (Total: ${totalGroupsChecked})`);
        
        // Log some group names for debugging
        if (groups.length > 0) {
          console.log(`🔍 Groups on this page:`, groups.slice(0, 3).map(g => g.attributes?.name || 'Unknown').join(', '));
        }
        
        page++;
        
        // Safety check to prevent infinite loops
        if (page > 20) {
          console.warn('⚠️ Stopped searching after 20 pages (1000 groups)');
          break;
        }
      }
      
      console.log(`❌ Group "${groupName}" not found`);
      return null;
      
    } catch (error) {
      console.error('❌ Error searching for group:', error);
      throw error;
    }
  },

  /**
   * Get all users in a specific group using memberships endpoint
   * @param {string} groupId - The ID of the group
   * @returns {Array} - Array of user objects
   */
  async getGroupUsers(groupId) {
    console.log(`👥 Fetching users for group ID: ${groupId}`);
    
    try {
      const allUsers = [];
      let page = 1;
      let totalMemberships = 0;
      
      while (true) {
        const response = await rateLimitedApiCall(() => apiClient.get(`/v2/groups/${groupId}/memberships`, {
          params: {
            page: page,
            limit: 50
          }
        }));
        
        // The response structure has data.data for the actual array
        const memberships = response.data?.data || [];
        
        if (memberships.length === 0) {
          break; // No more pages
        }
        
        // Extract user objects from membership data
        const users = memberships.map(membership => membership.relationships.person.data);
        allUsers.push(...users);
        totalMemberships += memberships.length;
        
        console.log(`📄 Page ${page}: ${memberships.length} memberships, ${users.length} users (total: ${allUsers.length})`);
        
        // Debug: Show membership structure
        if (memberships.length > 0 && page === 1) {
          console.log(`🔍 Sample membership structure:`, {
            membership: memberships[0],
            hasRelationships: !!memberships[0]?.relationships,
            hasPerson: !!memberships[0]?.relationships?.person,
            hasData: !!memberships[0]?.relationships?.person?.data
          });
        }
        
        page++;
        
        // Safety check
        if (page > 50) {
          console.warn('⚠️ Stopped fetching after 50 pages (2500 users)');
          break;
        }
      }
      
      // Now we need to get the full user details for each user ID
      console.log(`🔍 Fetching full details for ${allUsers.length} users...`);
      const fullUsers = [];
      
      for (const userRef of allUsers) {
        try {
          const userResponse = await rateLimitedApiCall(() => apiClient.get(`/v2/people/${userRef.id}`));
          if (userResponse.data) {
            // Store the actual user data (nested under data.data)
            fullUsers.push(userResponse.data.data);
            // Safe access to user attributes - correct path is data.data.attributes
            const userData = userResponse.data.data;
            const email = userData?.attributes?.email || '';
            const firstName = userData?.attributes?.first_name || '';
            const lastName = userData?.attributes?.last_name || '';
            
            // Create a display name: prefer full name, fallback to email, then user ID
            let name;
            if (firstName.trim() && lastName.trim()) {
              name = `${firstName.trim()} ${lastName.trim()}`;
            } else if (email) {
              name = email;
            } else {
              name = `User ${userRef.id.substring(0, 8)}...`;
            }
            
            console.log(`✅ Got user details: ${name} (Email: ${email || 'none'})`);
          }
        } catch (userError) {
          console.warn(`⚠️ Could not get details for user ${userRef.id}:`, userError.message);
        }
      }
      
      console.log(`✅ Total users in group: ${fullUsers.length} (from ${totalMemberships} memberships)`);
      return fullUsers;
      
    } catch (error) {
      console.error('❌ Error fetching group users:', error);
      throw error;
    }
  },

  /**
   * Check if a certification is expired based on its expiry date
   * @param {Object} certification - Certification object with expiryDate
   * @returns {boolean} - True if expired, false if still valid or no expiry date
   */
  isCertificationExpired(certification) {
    if (!certification.expiryDate) {
      return false; // No expiry date means it doesn't expire
    }
    
    const now = new Date();
    const expiryDate = new Date(certification.expiryDate);
    
    return expiryDate < now; // Expired if expiry date is in the past
  },

  /**
   * Get comprehensive certification statistics for a user
   * Only includes valid (non-expired) certifications in NPCU totals
   * @param {string} userId - The ID of the user
   * @returns {Object} - Object containing certifications and stats
   */
  async getUserCertificationStats(userId) {
    console.log(`📊 Analyzing certifications for user ID: ${userId}`);
    
    try {
      // Get user's certifications (reuse existing method)
      const certifications = await this.getUserCertifications(userId);
      
      // Filter for completed certifications only, excluding expired ones
      const completedCertifications = certifications.filter(cert => 
        cert.status === 'completed' && cert.npcu > 0 && !this.isCertificationExpired(cert)
      );
      
      console.log(`📚 User has ${completedCertifications.length} completed certifications`);
      
      // Calculate total NPCU
      const totalNPCU = completedCertifications.reduce((total, cert) => total + cert.npcu, 0);
      
      // Get product category breakdown
      const productStats = this.getProductCategoryStats(completedCertifications);
      
      const result = {
        userId,
        totalCourses: certifications.length,
        certifications: completedCertifications,
        totalNPCU,
        certificationCount: completedCertifications.length,
        productBreakdown: productStats
      };
      
      console.log(`✅ User certification analysis complete: ${completedCertifications.length} certifications, ${totalNPCU} total NPCU`);
      console.log('📊 Product breakdown:', {
        'Nintex CE': `${productStats['Nintex CE'].count} courses (${productStats['Nintex CE'].npcu} NPCU)`,
        'Nintex K2': `${productStats['Nintex K2'].count} courses (${productStats['Nintex K2'].npcu} NPCU)`,
        'Nintex for Salesforce': `${productStats['Nintex for Salesforce'].count} courses (${productStats['Nintex for Salesforce'].npcu} NPCU)`,
        'Other': `${productStats['Other'].count} courses (${productStats['Other'].npcu} NPCU)`
      });
      return result;
      
    } catch (error) {
      console.error('❌ Error analyzing user certifications:', error);
      throw error;
    }
  },

  /**
   * Process multiple users' certifications in parallel for faster loading
   * @param {Array} users - Array of user objects
   * @param {Function} progressCallback - Callback to report progress
   * @returns {Array} - Array of processed user objects with certification stats
   */
  async processUsersInParallel(users, progressCallback = null) {
    console.log(`🚀 Starting parallel processing of ${users.length} users...`);
    
    // Debug: Log the structure of the first user object
    if (users.length > 0) {
      console.log('🔍 Sample user object structure:', {
        hasId: !!users[0]?.id,
        hasAttributes: !!users[0]?.attributes,
        hasFirstName: !!users[0]?.attributes?.first_name,
        keys: Object.keys(users[0] || {}),
        attributeKeys: Object.keys(users[0]?.attributes || {})
      });
    }
    
    const results = [];
    const errors = [];
    
    // Process users in batches to avoid overwhelming the API
    for (let i = 0; i < users.length; i += MAX_CONCURRENT_USERS) {
      const batch = users.slice(i, i + MAX_CONCURRENT_USERS);
      console.log(`📦 Processing batch ${Math.floor(i/MAX_CONCURRENT_USERS) + 1}: users ${i + 1}-${Math.min(i + MAX_CONCURRENT_USERS, users.length)}`);
      
      // Process this batch in parallel
      const batchPromises = batch.map(async (user, batchIndex) => {
        const globalIndex = i + batchIndex;
        
        try {
          // Safe access to user attributes with real data priority
          const firstName = user?.attributes?.first_name || '';
          const lastName = user?.attributes?.last_name || '';
          const email = user?.attributes?.email || '';
          const userId = user?.id;
          
          if (!userId) {
            throw new Error('User ID not found in user object');
          }
          
          // Create display name from available data
          let displayName;
          if (firstName.trim() && lastName.trim()) {
            displayName = `${firstName.trim()} ${lastName.trim()}`;
          } else if (firstName.trim()) {
            displayName = firstName.trim();
          } else if (lastName.trim()) {
            displayName = lastName.trim();
          } else if (email) {
            displayName = email; // Use email as display name if no names available
          } else {
            displayName = `User ${userId.substring(0, 8)}...`; // Use truncated ID as fallback
          }
          
          if (progressCallback) {
            progressCallback(globalIndex + 1, users.length, user);
          }
          
          const userStats = await this.getUserCertificationStats(userId);
          
          return {
            id: userId,
            name: displayName,
            email: email,
            certifications: userStats.certifications,
            totalNPCU: userStats.totalNPCU,
            certificationCount: userStats.certificationCount,
            productBreakdown: userStats.productBreakdown, // ADD THIS LINE!
            error: null
          };
          
        } catch (error) {
          // Safe access to user attributes for error logging
          const firstName = user?.attributes?.first_name || '';
          const lastName = user?.attributes?.last_name || '';
          const email = user?.attributes?.email;
          const userId = user?.id || user?.attributes?.id || 'unknown-id';
          
          // Create display name for error logging
          let displayName;
          if (firstName.trim() && lastName.trim()) {
            displayName = `${firstName.trim()} ${lastName.trim()}`;
          } else if (email) {
            displayName = email;
          } else {
            displayName = `User ${userId}`;
          }
          
          console.warn(`⚠️ Error processing user ${displayName}:`, error.message);
          errors.push({ user, error });
          
          // Only return user data if they have an email
          if (email) {
            return {
              id: userId,
              name: displayName,
              email: email,
              certifications: [],
              totalNPCU: 0,
              certificationCount: 0,
              error: error.message
            };
          } else {
            // Skip users without email addresses
            return null;
          }
        }
      });
      
      // Wait for this batch to complete and filter out null results
      const batchResults = await Promise.all(batchPromises);
      const validResults = batchResults.filter(result => result !== null);
      results.push(...validResults);
      
      // Small delay between batches to be respectful to the API
      if (i + MAX_CONCURRENT_USERS < users.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`✅ Parallel processing complete! Processed ${results.length} users with ${errors.length} errors`);
    return results;
  }
};

// Default export - direct export of the northpassApi object
export default northpassApi;