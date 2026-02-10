import axios from 'axios';
import { 
  trackFailedCourse, 
  isKnownFailedCourse, 
  getFailedCourseStats,
  analyzePropertiesFailures 
} from './failedCourseTracker.js';
import cacheService from './cacheService.js';

// Always use proxy to avoid CORS issues - API key is injected server-side by the proxy
const API_BASE_URL = '/api/northpass';

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
  // Cache management methods
  clearCache() {
    console.log('🧹 Clearing all Northpass cache...');
    cacheService.clearAll();
  },

  clearCacheByType(type) {
    console.log(`🧹 Clearing ${type} cache...`);
    cacheService.clearByType(type);
  },

  getCacheStats() {
    return cacheService.getStats();
  },

  // Test API connection
  async testConnection() {
    try {
      console.log('🔗 Testing Northpass API connection...');
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

  // Validate if a course ID exists and try to fetch NPCU if not in cache
  // Returns { isValid: boolean, npcu: number }
  async validateCourseInCatalog(courseId, courseName = 'Unknown Course') {
    if (!courseId) return false;
    
    // Ensure NPCU cache is loaded
    if (!this._npcuCacheLoaded) {
      await this.loadAllCourseNPCU();
    }
    
    // If the course is in the NPCU cache, it's valid
    if (this._courseNPCUCache.has(courseId)) {
      return true;
    }
    
    // Not in bulk cache - try to fetch individually as fallback
    // This catches archived courses or courses not returned by bulk API
    console.log(`📡 Course not in bulk cache, trying individual fetch: ${courseName} (${courseId})`);
    
    try {
      const response = await rateLimitedApiCall(() => 
        apiClient.get(`/v2/properties/courses/${courseId}`)
      );
      
      const properties = response.data?.data?.attributes?.properties || {};
      const npcu = this.validateNPCUValue(properties.npcu);
      
      // Add to cache for future lookups
      this._courseNPCUCache.set(courseId, npcu);
      
      console.log(`✅ Found course via individual fetch: ${courseName} - NPCU: ${npcu}`);
      return true;
      
    } catch (error) {
      // 403 or 404 means the course truly doesn't exist or isn't accessible
      console.log(`⚠️ Course not found in system: ${courseName} (${courseId}) - Status: ${error.response?.status || 'unknown'}`);
      trackFailedCourse(courseId, courseName, '404_NOT_FOUND', {
        cacheSize: this._courseNPCUCache.size,
        validationAttempt: new Date().toISOString(),
        errorStatus: error.response?.status
      });
      return false;
    }
  },

  // Cache for course NPCU values from Properties API
  _courseNPCUCache: new Map(),
  _npcuCacheTimestamp: null,
  _npcuCacheTTL: 30 * 60 * 1000, // 30 minutes TTL
  _npcuCacheLoaded: false,

  /**
   * Load all course NPCU values from the bulk Properties API endpoint
   * This is much more efficient than individual course lookups
   */
  async loadAllCourseNPCU() {
    // Skip if already loaded recently
    const now = Date.now();
    if (this._npcuCacheLoaded && 
        this._npcuCacheTimestamp && 
        (now - this._npcuCacheTimestamp) < this._npcuCacheTTL) {
      console.log('⚡ Using cached NPCU data');
      return;
    }

    console.log('📡 Loading ALL course NPCU values from bulk Properties API...');
    
    try {
      let allProperties = [];
      let currentPage = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        const response = await rateLimitedApiCall(() => 
          apiClient.get(`/v2/properties/courses?limit=100&page=${currentPage}`)
        );

        const pageData = response.data?.data || [];
        if (pageData.length === 0) {
          hasMorePages = false;
        } else {
          allProperties = [...allProperties, ...pageData];
          console.log(`📄 Page ${currentPage}: ${pageData.length} courses (Total: ${allProperties.length})`);
          currentPage++;
          
          // Safety limit
          if (currentPage > 20) {
            console.warn('⚠️ Stopped after 20 pages');
            hasMorePages = false;
          }
        }
      }

      // Clear and rebuild the cache
      this._courseNPCUCache.clear();
      
      let certificationCount = 0;
      allProperties.forEach(item => {
        const courseId = item.id;
        const properties = item.attributes?.properties || {};
        const npcu = this.validateNPCUValue(properties.npcu);
        
        this._courseNPCUCache.set(courseId, npcu);
        
        if (npcu > 0) {
          certificationCount++;
          console.log(`✅ ${properties.name || courseId}: NPCU=${npcu}`);
        }
      });

      this._npcuCacheLoaded = true;
      this._npcuCacheTimestamp = now;
      
      console.log(`🎯 Loaded NPCU for ${allProperties.length} courses (${certificationCount} with NPCU > 0)`);
      
    } catch (error) {
      console.error('❌ Error loading bulk NPCU data:', error.message);
      // Don't mark as loaded so it will retry next time
      this._npcuCacheLoaded = false;
    }
  },

  /**
   * Fetch NPCU value for a course - uses pre-loaded cache
   * @param {string} courseId - The course ID
   * @param {string} courseName - The course name (for logging)
   * @returns {number} - NPCU value (0, 1, or 2)
   */
  async getCourseNPCU(courseId, courseName = 'Unknown Course') {
    if (!courseId) return 0;

    // Ensure NPCU cache is loaded
    if (!this._npcuCacheLoaded) {
      await this.loadAllCourseNPCU();
    }

    // Check cache
    if (this._courseNPCUCache.has(courseId)) {
      const cached = this._courseNPCUCache.get(courseId);
      if (cached > 0) {
        console.log(`⚡ NPCU for ${courseName}: ${cached}`);
      }
      return cached;
    }

    // Course not in cache - likely not in the system or new
    console.log(`⚠️ Course ${courseName} (${courseId}) not found in NPCU cache`);
    return 0;
  },

  /**
   * Batch fetch NPCU values for multiple courses - uses pre-loaded cache
   * @param {Array} courses - Array of {courseId, courseName} objects
   * @returns {Map} - Map of courseId -> NPCU value
   */
  async batchGetCourseNPCU(courses) {
    // Ensure NPCU cache is loaded first
    if (!this._npcuCacheLoaded) {
      await this.loadAllCourseNPCU();
    }

    const results = new Map();
    
    for (const { courseId, courseName } of courses) {
      const npcu = this._courseNPCUCache.get(courseId) || 0;
      results.set(courseId, npcu);
      
      if (npcu > 0) {
        console.log(`⚡ NPCU for ${courseName}: ${npcu}`);
      }
    }

    return results;
  },

  // Try to get certificates with expiry dates from certificates endpoint
  async getUserCertificates(userId) {
    // This endpoint consistently returns 404, so we'll skip it for now
    // and rely on transcript data with calculated expiry dates
    console.log('📜 Skipping certificates endpoint (returns 404) for user:', userId);
    return [];
  },

  // Get user certifications with enriched data and catalog validation (cached)
  async getUserCertifications(userId) {
    const cachedFn = cacheService.cached(
      this._getUserCertificationsUncached.bind(this),
      'user_certifications',
      4 * 60 * 60 * 1000 // 4 hours
    );
    return await cachedFn(userId);
  },

  // Get comprehensive user learning data for customer dashboard (cached)
  async getUserLearningActivity(userId) {
    const cachedFn = cacheService.cached(
      this._getUserLearningActivityUncached.bind(this),
      'user_learning_activity',
      4 * 60 * 60 * 1000 // 4 hours
    );
    return await cachedFn(userId);
  },

  // Internal method to get all learning activity (enrollments, progress, completions)
  async _getUserLearningActivityUncached(userId) {
    try {
      console.log('📚 Fetching comprehensive learning activity for user:', userId);
      
      // Get complete transcript data (all course interactions)
      let allTranscriptItems = [];
      let currentPage = 1;
      let hasNextPage = true;
      
      try {
        console.log('📡 Fetching complete learning transcript for user:', userId);
        
        while (hasNextPage) {
          console.log(`📄 Fetching transcript page ${currentPage}...`);
          
          const pageParam = currentPage > 1 ? `?page=${currentPage}&limit=50` : '?limit=50';
          const transcriptResponse = await rateLimitedApiCall(() => apiClient.get(`/v2/transcripts/${userId}${pageParam}`));
          
          if (transcriptResponse.data?.data && transcriptResponse.data.data.length > 0) {
            allTranscriptItems = [...allTranscriptItems, ...transcriptResponse.data.data];
            console.log(`✅ Page ${currentPage}: Found ${transcriptResponse.data.data.length} items (Total: ${allTranscriptItems.length})`);
            
            hasNextPage = !!transcriptResponse.data.links?.next;
            if (hasNextPage) currentPage++;
          } else {
            hasNextPage = false;
          }
        }
        
        console.log(`🎯 Total learning activities fetched: ${allTranscriptItems.length}`);
        
      } catch {
        console.log('📝 No transcript data available (expected for users without any learning activity)');
        allTranscriptItems = [];
      }
      
      if (!allTranscriptItems || allTranscriptItems.length === 0) {
        return {
          enrollments: [],
          inProgress: [],
          completed: [],
          totalCourses: 0,
          completionRate: 0,
          averageProgress: 0
        };
      }
      
      // Get completed courses to fetch NPCU values
      const completedCourses = allTranscriptItems
        .filter(item => item.attributes?.progress_status === 'completed')
        .map(item => ({
          courseId: item.attributes.resource_id,
          courseName: item.attributes.name || 'Unknown Course'
        }));

      // Batch fetch NPCU values for completed courses from Properties API
      let npcuMap = new Map();
      if (completedCourses.length > 0) {
        console.log(`📡 Fetching NPCU values for ${completedCourses.length} completed courses...`);
        npcuMap = await this.batchGetCourseNPCU(completedCourses);
      }

      // Process all learning activities
      const learningActivities = allTranscriptItems.map(item => {
        const attrs = item.attributes;
        const courseId = attrs.resource_id;
        
        // Get NPCU from Properties API for completed courses
        const npcu = attrs.progress_status === 'completed' ? (npcuMap.get(courseId) || 0) : 0;
        
        return {
          id: item.id,
          resourceId: courseId,
          resourceType: attrs.resource_type,
          name: attrs.name || 'Unknown Course',
          status: attrs.progress_status, // enrolled, in_progress, completed
          progress: attrs.progress || 0, // Progress percentage
          completedAt: attrs.completed_at,
          enrolledAt: attrs.enrolled_at,
          startedAt: attrs.started_at,
          lastActiveAt: attrs.last_active_at,
          attemptNumber: attrs.attempt_number,
          versionNumber: attrs.version_number,
          certificateUrl: item.links?.certificate || null,
          hasCertificate: !!item.links?.certificate,
          expiresAt: attrs.expires_at || attrs.expiry_date || null,
          // Calculate expiry for completed certifications
          expiryDate: attrs.expires_at || attrs.expiry_date || 
                     (attrs.completed_at ? this.calculateExpiryDate(attrs.completed_at, attrs.name || 'Unknown Course') : null),
          // NPCU from Properties API for completed certifications
          npcu: npcu,
          category: this.categorizeCertificationByProduct(attrs.name || 'Unknown Course')
        };
      });
      
      // Separate by status
      const enrollments = learningActivities.filter(item => item.status === 'enrolled' || !item.status);
      const inProgress = learningActivities.filter(item => item.status === 'in_progress' || (item.progress > 0 && item.status !== 'completed'));
      const completed = learningActivities.filter(item => item.status === 'completed');
      
      // Calculate statistics
      const totalCourses = learningActivities.length;
      const completionRate = totalCourses > 0 ? Math.round((completed.length / totalCourses) * 100) : 0;
      const averageProgress = learningActivities.length > 0 ? 
        Math.round(learningActivities.reduce((sum, item) => sum + (item.progress || 0), 0) / learningActivities.length) : 0;
      
      console.log(`📊 Learning summary: ${enrollments.length} enrolled, ${inProgress.length} in progress, ${completed.length} completed`);
      
      return {
        enrollments,
        inProgress,
        completed,
        totalCourses,
        completionRate,
        averageProgress,
        allActivities: learningActivities
      };
      
    } catch (error) {
      console.error('❌ Error fetching learning activity:', error);
      return {
        enrollments: [],
        inProgress: [],
        completed: [],
        totalCourses: 0,
        completionRate: 0,
        averageProgress: 0
      };
    }
  },

  // Internal uncached version of getUserCertifications
  async _getUserCertificationsUncached(userId) {
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
      
      // First, collect all course IDs to batch fetch NPCU values
      const coursesToFetchNPCU = completedItems.map(item => ({
        courseId: item.attributes.resource_id,
        courseName: item.attributes.name || 'Unknown Course'
      }));

      // Batch fetch NPCU values from Properties API
      console.log(`📡 Fetching NPCU values for ${coursesToFetchNPCU.length} courses from Properties API...`);
      const npcuMap = await this.batchGetCourseNPCU(coursesToFetchNPCU);

      // Convert to standardized format using correct API field names
      let certifications = completedItems.map(item => {
        const attrs = item.attributes;
        const courseId = attrs.resource_id;
        
        // Get NPCU from Properties API (already fetched)
        const npcu = npcuMap.get(courseId) || 0;
        
        return {
          id: item.id,
          resourceId: courseId,
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
          // NPCU from Properties API
          npcu: npcu,
          // Use actual expiry date if available, otherwise calculate
          expiryDate: attrs.expires_at || attrs.expiry_date || attrs.certificate_expires_at || 
                     attrs.valid_until || attrs.valid_to || attrs.certificate_expiry_date || 
                     attrs.cert_expires_at || this.calculateExpiryDate(attrs.completed_at, attrs.name || 'Unknown Course')
        };
      });

      console.log(`🔍 Pre-validation: Found ${certifications.length} completed items`);
      
      // Validate each certification against the current course catalog
      // validateCourseInCatalog now fetches NPCU individually for courses not in bulk cache
      const validatedCertifications = [];
      const invalidCertifications = [];
      
      for (const cert of certifications) {
        const isValid = await this.validateCourseInCatalog(cert.resourceId, cert.name);
        if (isValid) {
          // Re-fetch NPCU from cache in case it was added by validateCourseInCatalog
          const updatedNpcu = this._courseNPCUCache.get(cert.resourceId) || cert.npcu;
          validatedCertifications.push({
            ...cert,
            npcu: updatedNpcu,
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
      
      // DEDUPLICATION: If a user has multiple completions of the same course,
      // keep only the most recent one (latest completedAt date)
      const deduplicatedCertifications = this.deduplicateCertifications(validatedCertifications);
      
      if (deduplicatedCertifications.length < validatedCertifications.length) {
        const duplicateCount = validatedCertifications.length - deduplicatedCertifications.length;
        console.log(`🔄 Deduplication: Removed ${duplicateCount} duplicate certification(s), keeping most recent versions`);
      }
      
      // Return only valid, deduplicated certifications for NPCU calculation
      return deduplicatedCertifications;
      
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

  /**
   * Deduplicate certifications - when a user has multiple completions of the same course,
   * keep only the most recent one (based on completedAt date).
   * This handles cases where users retake certifications in the LMS.
   * @param {Array} certifications - Array of certification objects
   * @returns {Array} - Deduplicated array with only the latest completion per course
   */
  deduplicateCertifications(certifications) {
    if (!certifications || certifications.length === 0) {
      return [];
    }

    // Group by resourceId (course ID)
    const courseMap = new Map();
    
    certifications.forEach(cert => {
      const courseId = cert.resourceId;
      const existing = courseMap.get(courseId);
      
      if (!existing) {
        // First time seeing this course
        courseMap.set(courseId, cert);
      } else {
        // Compare completion dates - keep the most recent
        const existingDate = new Date(existing.completedAt);
        const currentDate = new Date(cert.completedAt);
        
        if (currentDate > existingDate) {
          // Current cert is newer, replace
          console.log(`🔄 Duplicate found: "${cert.name}" - keeping newer (${cert.completedAt}) over older (${existing.completedAt})`);
          courseMap.set(courseId, cert);
        } else {
          console.log(`🔄 Duplicate found: "${cert.name}" - keeping existing (${existing.completedAt}) over older (${cert.completedAt})`);
        }
      }
    });

    // Convert map values back to array
    return Array.from(courseMap.values());
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

  // DEPRECATED: Calculate NPCU points based on course name and type (legacy fallback)
  // NPCU values should come from the Properties API (/v2/properties/courses/{courseId})
  // This function is kept only as a fallback if the Properties API is unavailable
  // NPCU can only be 0 (blank), 1, or 2 - no other values allowed
  calculateNPCUPoints(courseName) {
    console.warn('⚠️ Using fallback NPCU calculation - Properties API should be used instead');
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
   * Find a group by ID
   * @param {string} groupId - The ID of the group to find
   * @returns {Object|null} - The group object or null if not found
   */
  async findGroupById(groupId) {
    console.log(`🔍 Searching for group by ID: "${groupId}"`);
    
    try {
      const response = await rateLimitedApiCall(() => apiClient.get(`/v2/groups/${groupId}`));
      
      if (response.data?.data) {
        console.log(`✅ Found group by ID: ${response.data.data.attributes.name} (ID: ${groupId})`);
        return response.data.data;
      }
      
      console.log(`❌ Group not found with ID: ${groupId}`);
      return null;
    } catch (error) {
      console.error(`❌ Error finding group by ID ${groupId}:`, error.response?.status, error.response?.statusText);
      return null;
    }
  },

  /**
   * Find a group by name or ID
   * @param {string} identifier - The name or ID of the group to find
   * @param {boolean} isId - Whether the identifier is an ID (true) or name (false)
   * @returns {Object|null} - The group object or null if not found
   */
  async findGroup(identifier, isId = false) {
    if (isId) {
      return await this.findGroupById(identifier);
    } else {
      return await this.findGroupByName(identifier);
    }
  },

  /**
   * Find a group by name (cached)
   * @param {string} groupName - The name of the group to find
   * @returns {Object|null} - The group object or null if not found
   */
  async findGroupByName(groupName) {
    const cachedFn = cacheService.cached(
      this._findGroupByNameUncached.bind(this),
      'group_by_name',
      2 * 60 * 60 * 1000 // 2 hours
    );
    return await cachedFn(groupName);
  },

  /**
   * Internal uncached version of findGroupByName
   * @param {string} groupName - The name of the group to find
   * @returns {Object|null} - The group object or null if not found
   */
  async _findGroupByNameUncached(groupName) {
    console.log(`🔍 Searching for group: "${groupName}" (uncached)`);
    
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
   * Get all groups from the Northpass API (paginated)
   * @returns {Array} - Array of all group objects
   */
  async getAllGroups() {
    console.log('📋 Fetching all groups...');
    
    try {
      const allGroups = [];
      let page = 1;
      
      while (true) {
        const response = await rateLimitedApiCall(() => apiClient.get('/v2/groups', {
          params: {
            page: page,
            limit: 50
          }
        }));
        
        const groups = response.data?.data || [];
        
        if (groups.length === 0) {
          break; // No more pages
        }
        
        allGroups.push(...groups);
        console.log(`📄 Page ${page}: ${groups.length} groups (Total: ${allGroups.length})`);
        
        page++;
        
        // Safety check to prevent infinite loops
        if (page > 50) {
          console.warn('⚠️ Stopped after 50 pages (2500 groups)');
          break;
        }
      }
      
      console.log(`✅ Loaded ${allGroups.length} total groups`);
      return allGroups;
      
    } catch (error) {
      console.error('❌ Error fetching all groups:', error);
      throw error;
    }
  },

  /**
   * Get all users in a specific group using memberships endpoint (cached)
   * @param {string} groupId - The ID of the group
   * @returns {Array} - Array of user objects
   */
  async getGroupUsers(groupId) {
    const cachedFn = cacheService.cached(
      this._getGroupUsersUncached.bind(this),
      'group_users',
      3 * 60 * 60 * 1000 // 3 hours
    );
    return await cachedFn(groupId);
  },

  /**
   * Internal uncached version of getGroupUsers
   * @param {string} groupId - The ID of the group
   * @returns {Array} - Array of user objects
   */
  async _getGroupUsersUncached(groupId) {
    console.log(`👥 Fetching users for group ID: ${groupId} (uncached)`);
    
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
   * Process multiple users' learning data for customer dashboard
   * @param {Array} users - Array of user objects
   * @param {Function} progressCallback - Callback to report progress
   * @returns {Array} - Array of processed user objects with comprehensive learning stats
   */
  async processUsersForCustomerDashboard(users, progressCallback = null) {
    console.log(`🚀 Starting customer dashboard processing of ${users.length} users...`);
    
    const results = [];
    const errors = [];
    
    // Process users in batches
    for (let i = 0; i < users.length; i += MAX_CONCURRENT_USERS) {
      const batch = users.slice(i, i + MAX_CONCURRENT_USERS);
      console.log(`📦 Processing batch ${Math.floor(i/MAX_CONCURRENT_USERS) + 1}: users ${i + 1}-${Math.min(i + MAX_CONCURRENT_USERS, users.length)}`);
      
      const batchPromises = batch.map(async (user, batchIndex) => {
        const globalIndex = i + batchIndex;
        
        try {
          const firstName = user?.attributes?.first_name || '';
          const lastName = user?.attributes?.last_name || '';
          const email = user?.attributes?.email || '';
          const userId = user?.id;
          
          if (!userId) {
            throw new Error('User ID not found in user object');
          }
          
          // Create display name
          let displayName;
          if (firstName.trim() && lastName.trim()) {
            displayName = `${firstName.trim()} ${lastName.trim()}`;
          } else if (firstName.trim()) {
            displayName = firstName.trim();
          } else if (lastName.trim()) {
            displayName = lastName.trim();
          } else if (email) {
            displayName = email;
          } else {
            displayName = `User ${userId.substring(0, 8)}...`;
          }
          
          if (progressCallback) {
            progressCallback(globalIndex + 1, users.length, user);
          }
          
          const learningData = await this.getUserLearningActivity(userId);
          
          return {
            id: userId,
            name: displayName,
            email: email,
            ...learningData,
            error: null
          };
          
        } catch (error) {
          const firstName = user?.attributes?.first_name || '';
          const lastName = user?.attributes?.last_name || '';
          const email = user?.attributes?.email;
          const userId = user?.id || 'unknown-id';
          
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
          
          if (email) {
            return {
              id: userId,
              name: displayName,
              email: email,
              enrollments: [],
              inProgress: [],
              completed: [],
              totalCourses: 0,
              completionRate: 0,
              averageProgress: 0,
              error: error.message
            };
          } else {
            return null;
          }
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      const validResults = batchResults.filter(result => result !== null);
      results.push(...validResults);
      
      if (i + MAX_CONCURRENT_USERS < users.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`✅ Customer dashboard processing complete! Processed ${results.length} users with ${errors.length} errors`);
    return results;
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
          // Extract last login timestamp from user attributes
          const lastLoginAt = user?.attributes?.last_sign_in_at || user?.attributes?.last_login_at || user?.attributes?.current_sign_in_at || null;
          
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
          
          // Fetch both certification stats and learning activity in parallel
          const [userStats, learningActivity] = await Promise.all([
            this.getUserCertificationStats(userId),
            this.getUserLearningActivity(userId)
          ]);
          
          return {
            id: userId,
            name: displayName,
            email: email,
            lastLoginAt: lastLoginAt,
            certifications: userStats.certifications,
            totalNPCU: userStats.totalNPCU,
            certificationCount: userStats.certificationCount,
            productBreakdown: userStats.productBreakdown,
            // Learning activity data
            enrolledCourses: learningActivity.enrollments?.length || 0,
            inProgressCourses: learningActivity.inProgress?.length || 0,
            completedCourses: learningActivity.completed?.length || 0,
            totalCourses: learningActivity.totalCourses || 0,
            completionRate: learningActivity.completionRate || 0,
            averageProgress: learningActivity.averageProgress || 0,
            learningActivity: learningActivity,
            error: null
          };
          
        } catch (error) {
          // Safe access to user attributes for error logging
          const firstName = user?.attributes?.first_name || '';
          const lastName = user?.attributes?.last_name || '';
          const email = user?.attributes?.email;
          const userId = user?.id || user?.attributes?.id || 'unknown-id';
          const lastLoginAt = user?.attributes?.last_sign_in_at || user?.attributes?.last_login_at || null;
          
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
              lastLoginAt: lastLoginAt,
              certifications: [],
              totalNPCU: 0,
              certificationCount: 0,
              enrolledCourses: 0,
              inProgressCourses: 0,
              completedCourses: 0,
              totalCourses: 0,
              completionRate: 0,
              averageProgress: 0,
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
  },

  /**
   * Get all users in the system (cached for 30 minutes)
   * @returns {Array} - Array of all user objects
   */
  async getAllUsers() {
    const cachedFn = cacheService.cached(
      this._getAllUsersUncached.bind(this),
      'all_users',
      30 * 60 * 1000 // 30 minutes cache
    );
    return await cachedFn();
  },

  /**
   * Internal uncached version of getAllUsers
   * @returns {Array} - Array of all user objects
   */
  async _getAllUsersUncached() {
    console.log('👥 Fetching all users from Northpass (uncached)...');
    
    try {
      const allUsers = [];
      let page = 1;
      
      while (true) {
        const response = await rateLimitedApiCall(() => apiClient.get('/v2/people', {
          params: {
            page: page,
            limit: 50
          }
        }));
        
        const users = response.data?.data || [];
        
        if (users.length === 0) {
          break;
        }
        
        allUsers.push(...users);
        console.log(`📄 Page ${page}: ${users.length} users (total: ${allUsers.length})`);
        
        page++;
        
        // Safety limit - increased to support larger LMS installations
        if (page > 500) {
          console.warn('⚠️ Stopped fetching after 500 pages (25000 users)');
          break;
        }
      }
      
      console.log(`✅ Total users fetched: ${allUsers.length}`);
      return allUsers;
      
    } catch (error) {
      console.error('❌ Error fetching all users:', error);
      throw error;
    }
  },

  /**
   * Find users by email domain who are NOT in the specified group
   * @param {string} groupId - The group ID to exclude
   * @param {Array} domains - Array of email domains to search for
   * @param {Array} existingUserIds - Array of user IDs already in the group
   * @returns {Array} - Array of users matching the domains but not in the group
   */
  async findUsersByDomainNotInGroup(groupId, domains, existingUserIds) {
    console.log(`🔍 Searching for users with domains: ${domains.join(', ')}`);
    console.log(`📋 Excluding ${existingUserIds.length} users already in group`);
    
    try {
      const allUsers = await this.getAllUsers();
      
      // Filter users who:
      // 1. Have an email
      // 2. Email domain matches one of the target domains
      // 3. Are NOT already in the group
      const matchingUsers = allUsers.filter(user => {
        const email = user.attributes?.email?.toLowerCase();
        if (!email) return false;
        
        const userDomain = email.split('@')[1];
        if (!userDomain) return false;
        
        const domainMatches = domains.some(d => d.toLowerCase() === userDomain);
        const notInGroup = !existingUserIds.includes(user.id);
        
        return domainMatches && notInGroup;
      });
      
      console.log(`✅ Found ${matchingUsers.length} users with matching domains not in group`);
      
      return matchingUsers.map(user => ({
        id: user.id,
        email: user.attributes?.email || '',
        firstName: user.attributes?.first_name || '',
        lastName: user.attributes?.last_name || '',
        name: [user.attributes?.first_name, user.attributes?.last_name].filter(Boolean).join(' ') || user.attributes?.email || 'Unknown'
      }));
      
    } catch (error) {
      console.error('❌ Error finding users by domain:', error);
      throw error;
    }
  },

  /**
   * Find the "All Partners" group
   * @returns {Object|null} - The group object or null if not found
   */
  async findAllPartnersGroup() {
    console.log('🔍 Searching for "All Partners" group...');
    
    try {
      const group = await this.findGroupByName('All Partners');
      if (group) {
        console.log(`✅ Found "All Partners" group: ${group.id}`);
        return group;
      }
      
      console.warn('⚠️ "All Partners" group not found');
      return null;
      
    } catch (error) {
      console.error('❌ Error finding All Partners group:', error);
      return null;
    }
  },

  /**
   * Add people to a group using the relationships endpoint
   * POST /v2/groups/{group_uuid}/relationships/people
   * This can add multiple people at once and ignores people already in the group
   * @param {string} groupId - The group ID
   * @param {Array} userIds - Array of user IDs to add
   * @returns {Object} - Result of the operation
   */
  async addPeopleToGroup(groupId, userIds) {
    console.log(`➕ Adding ${userIds.length} users to group ${groupId}...`);
    console.log(`   User IDs to add: ${userIds.slice(0, 5).join(', ')}${userIds.length > 5 ? '...' : ''}`);
    
    if (!groupId) {
      console.error('❌ No groupId provided!');
      return { success: false, error: 'No groupId provided' };
    }
    
    if (!userIds || userIds.length === 0) {
      console.error('❌ No userIds provided!');
      return { success: false, error: 'No userIds provided' };
    }
    
    try {
      // Build the data array for JSON:API format
      const peopleData = userIds.map(userId => ({
        type: 'people',
        id: String(userId) // Ensure ID is a string
      }));
      
      console.log(`   Payload: ${JSON.stringify({ data: peopleData.slice(0, 2) })}...`);
      
      const response = await rateLimitedApiCall(() => apiClient.post(
        `/v2/groups/${groupId}/relationships/people`,
        { data: peopleData }
      ));
      
      // Log the full response for debugging
      console.log(`✅ API Response Status: ${response.status}`);
      console.log(`   Response Data:`, response.data);
      console.log(`✅ Successfully added ${userIds.length} users to group ${groupId}`);
      return { success: true, data: response.data, count: userIds.length };
      
    } catch (error) {
      console.error(`❌ Error adding users to group ${groupId}:`, error.response?.data || error.message);
      console.error('   Status:', error.response?.status);
      console.error('   Full error:', error);
      
      // Check if it's a specific error we can handle
      if (error.response?.status === 422) {
        console.error('   422 Unprocessable Entity - Check if users already exist in group or IDs are invalid');
      }
      
      return { success: false, error: error.response?.data || error.message, status: error.response?.status };
    }
  },

  /**
   * Add a single user to a group (convenience wrapper)
   * @param {string} groupId - The group ID
   * @param {string} userId - The user ID
   * @returns {Object} - Result of the operation
   */
  async addUserToGroup(groupId, userId) {
    return this.addPeopleToGroup(groupId, [userId]);
  },

  /**
   * Search users by email domain using API filtering (more efficient than fetching all)
   * Uses filter[email][cont]=@domain to search server-side
   * @param {string} domain - The email domain to search for (e.g., "bridging-it.de")
   * @returns {Array} - Array of matching users
   */
  async searchUsersByEmailDomain(domain) {
    console.log(`🔍 Searching for users with email domain: @${domain}`);
    
    try {
      const allUsers = [];
      let page = 1;
      
      while (true) {
        const response = await rateLimitedApiCall(() => apiClient.get('/v2/people', {
          params: {
            page: page,
            limit: 50,
            'filter[email][cont]': `@${domain}`
          }
        }));
        
        const users = response.data?.data || [];
        
        if (users.length === 0) {
          break;
        }
        
        allUsers.push(...users);
        console.log(`📄 Page ${page}: ${users.length} users matching @${domain} (total: ${allUsers.length})`);
        
        page++;
        
        // Safety limit
        if (page > 50) {
          console.warn('⚠️ Stopped after 50 pages');
          break;
        }
      }
      
      console.log(`✅ Found ${allUsers.length} users with @${domain} email domain`);
      return allUsers;
      
    } catch (error) {
      console.error(`❌ Error searching users by domain @${domain}:`, error);
      throw error;
    }
  },

  /**
   * Search users by multiple email domains (parallel requests for speed)
   * @param {Array} domains - Array of email domains to search for
   * @param {Set} excludeUserIds - Set of user IDs to exclude from results
   * @returns {Array} - Array of matching users not in the exclude list
   */
  async searchUsersByEmailDomains(domains, excludeUserIds = new Set()) {
    console.log(`🔍 Searching for users across ${domains.length} email domains...`);
    
    try {
      // Search each domain (with some parallelism but not too aggressive)
      const batchSize = 3; // Search 3 domains at a time
      const allMatchingUsers = [];
      const seenUserIds = new Set();
      
      for (let i = 0; i < domains.length; i += batchSize) {
        const batch = domains.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(domain => this.searchUsersByEmailDomain(domain))
        );
        
        // Merge results, avoiding duplicates
        for (const users of batchResults) {
          for (const user of users) {
            if (!seenUserIds.has(user.id) && !excludeUserIds.has(user.id)) {
              seenUserIds.add(user.id);
              allMatchingUsers.push(user);
            }
          }
        }
      }
      
      console.log(`✅ Found ${allMatchingUsers.length} unique users across ${domains.length} domains (excluding ${excludeUserIds.size} existing members)`);
      
      return allMatchingUsers.map(user => ({
        id: user.id,
        email: user.attributes?.email || '',
        firstName: user.attributes?.first_name || '',
        lastName: user.attributes?.last_name || '',
        name: [user.attributes?.first_name, user.attributes?.last_name].filter(Boolean).join(' ') || user.attributes?.email || 'Unknown'
      }));
      
    } catch (error) {
      console.error('❌ Error searching users by domains:', error);
      throw error;
    }
  },

  /**
   * Bulk add users to groups using the bulk endpoint (much faster!)
   * POST /v2/bulk/people/membership - can handle up to 15,000 at once
   * @param {Array} userIds - Array of user IDs to add
   * @param {Array} groupIds - Array of group IDs to add users to
   * @returns {Object} - Result of the bulk operation
   */
  async bulkAddUsersToGroups(userIds, groupIds) {
    console.log(`⚡ Bulk adding ${userIds.length} users to ${groupIds.length} groups...`);
    console.log(`   User IDs: ${userIds.slice(0, 3).join(', ')}${userIds.length > 3 ? '...' : ''}`);
    console.log(`   Group IDs: ${groupIds.join(', ')}`);
    
    try {
      // Try different payload formats
      const response = await rateLimitedApiCall(() => apiClient.post('/v2/bulk/people/membership', {
        data: {
          person_ids: userIds,
          group_ids: groupIds
        }
      }));
      
      console.log('✅ Bulk add complete:', response.data);
      return {
        success: true,
        data: response.data
      };
      
    } catch (error) {
      console.error('❌ Bulk add error:', error.response?.data || error.message);
      console.error('   Status:', error.response?.status);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  },

  /**
   * Add multiple users to a group (and optionally to All Partners group)
   * Uses bulk API when available for better performance
   * @param {string} groupId - The primary group ID
   * @param {Array} userIds - Array of user IDs to add
   * @param {boolean} addToAllPartners - Whether to also add to All Partners group
   * @param {Function} progressCallback - Callback for progress updates
   * @returns {Object} - Summary of the operation
   */
  async addUsersToGroups(groupId, userIds, addToAllPartners = true, progressCallback = null) {
    console.log(`➕ Adding ${userIds.length} users to group ${groupId}...`);
    
    const results = {
      primaryGroup: { success: 0, failed: 0, alreadyExists: 0 },
      allPartnersGroup: { success: 0, failed: 0, alreadyExists: 0, skipped: false }
    };
    
    if (progressCallback) {
      progressCallback(0, 2, 'Adding to primary group...');
    }
    
    // Add to primary group using the relationships endpoint (handles all at once)
    console.log(`📍 Calling addPeopleToGroup for primary group ${groupId} with ${userIds.length} users`);
    const primaryResult = await this.addPeopleToGroup(groupId, userIds);
    console.log(`📍 Primary group result:`, primaryResult);
    
    if (primaryResult.success) {
      results.primaryGroup.success = userIds.length;
      console.log(`✅ Added ${userIds.length} users to primary group`);
    } else {
      results.primaryGroup.failed = userIds.length;
      results.primaryGroup.error = primaryResult.error;
      console.error('❌ Failed to add users to primary group:', primaryResult.error);
    }
    
    if (progressCallback) {
      progressCallback(1, 2, 'Adding to All Partners group...');
    }
    
    // Add to All Partners group if needed
    if (addToAllPartners) {
      const allPartnersGroup = await this.findAllPartnersGroup();
      console.log(`📍 All Partners group found:`, allPartnersGroup?.id);
      
      if (allPartnersGroup) {
        const allPartnersResult = await this.addPeopleToGroup(allPartnersGroup.id, userIds);
        console.log(`📍 All Partners result:`, allPartnersResult);
        
        if (allPartnersResult.success) {
          results.allPartnersGroup.success = userIds.length;
          console.log(`✅ Added ${userIds.length} users to All Partners group`);
        } else {
          results.allPartnersGroup.failed = userIds.length;
          results.allPartnersGroup.error = allPartnersResult.error;
          console.error('❌ Failed to add users to All Partners group:', allPartnersResult.error);
        }
      } else {
        console.warn('⚠️ All Partners group not found, skipping...');
        results.allPartnersGroup.skipped = true;
      }
    }
    
    if (progressCallback) {
      progressCallback(2, 2, 'Complete!');
    }
    
    console.log('✅ Batch add complete:', results);
    return results;
  },

  /**
   * Get user transcript (learning activities) by user ID
   * @param {string} userId - The Northpass user ID
   * @returns {Promise<Array>} Array of transcript items
   */
  async getUserTranscript(userId) {
    try {
      let allItems = [];
      let currentPage = 1;
      let hasNextPage = true;

      while (hasNextPage && currentPage <= 10) {
        const pageParam = currentPage > 1 ? `?page[number]=${currentPage}` : '';
        const response = await rateLimitedApiCall(() => 
          apiClient.get(`/v2/transcripts/${userId}${pageParam}`)
        );

        if (response.data?.data && response.data.data.length > 0) {
          allItems = [...allItems, ...response.data.data];
          hasNextPage = !!response.data.links?.next;
          currentPage++;
        } else {
          hasNextPage = false;
        }
      }

      return allItems;
    } catch (error) {
      if (error.response?.status === 404) {
        return []; // No transcript data
      }
      throw error;
    }
  },

  /**
   * Update a group's name
   * @param {string} groupId - The group UUID
   * @param {string} newName - The new name for the group
   * @returns {Promise<Object>} Updated group data
   */
  async updateGroupName(groupId, newName) {
    console.log(`✏️ Updating group ${groupId} to "${newName}"`);
    
    try {
      const response = await rateLimitedApiCall(() => 
        apiClient.patch(`/v2/groups/${groupId}`, {
          data: {
            type: 'groups',
            id: groupId,
            attributes: {
              name: newName
            }
          }
        })
      );
      
      console.log(`✅ Group updated successfully`);
      return response.data?.data;
    } catch (error) {
      console.error('❌ Error updating group:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Create a new person in the LMS
   * @param {Object} userData - User data { email, firstName, lastName }
   * @returns {Promise<Object>} Result with success, userId, alreadyExists flags
   */
  async createPerson({ email, firstName, lastName }) {
    console.log(`➕ Creating person: ${email}`);
    
    if (!email) {
      return { success: false, error: 'Email is required' };
    }
    
    try {
      const response = await rateLimitedApiCall(() => 
        apiClient.post('/v2/people', {
          data: {
            type: 'people',
            attributes: {
              email: email.toLowerCase().trim(),
              first_name: firstName || '',
              last_name: lastName || ''
            }
          }
        })
      );
      
      const userId = response.data?.data?.id;
      console.log(`✅ Person created successfully: ${userId}`);
      return { 
        success: true, 
        userId: userId,
        alreadyExists: false,
        data: response.data?.data
      };
      
    } catch (error) {
      // Check if user already exists (422 with specific error)
      if (error.response?.status === 422) {
        const errorData = error.response?.data;
        const errorMessage = JSON.stringify(errorData);
        
        // Try to find existing user
        if (errorMessage.includes('email') && (errorMessage.includes('taken') || errorMessage.includes('exists') || errorMessage.includes('unique'))) {
          console.log(`⚠️ Person already exists: ${email}, looking up...`);
          
          try {
            const existingUser = await this.getCurrentUser(email);
            if (existingUser) {
              return {
                success: true,
                userId: existingUser.id,
                alreadyExists: true,
                data: existingUser
              };
            }
          } catch (lookupError) {
            console.error('Error looking up existing user:', lookupError);
          }
          
          return { 
            success: false, 
            alreadyExists: true, 
            error: 'User already exists but could not retrieve ID'
          };
        }
      }
      
      console.error(`❌ Error creating person ${email}:`, error.response?.data || error.message);
      return { 
        success: false, 
        error: error.response?.data?.errors?.[0]?.detail || error.message,
        alreadyExists: false
      };
    }
  },

  /**
   * Bulk invite people to the school
   * @param {Array} users - Array of { email, firstName, lastName }
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Results summary
   */
  async bulkInvitePeople(users, onProgress = null) {
    console.log(`📨 Bulk inviting ${users.length} people...`);
    
    const results = {
      created: 0,
      alreadyExisted: 0,
      failed: 0,
      errors: [],
      userIds: []
    };
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      
      if (onProgress) {
        onProgress(i + 1, users.length, `Processing ${user.email}...`);
      }
      
      const result = await this.createPerson(user);
      
      if (result.success) {
        if (result.alreadyExists) {
          results.alreadyExisted++;
        } else {
          results.created++;
        }
        if (result.userId) {
          results.userIds.push(result.userId);
        }
      } else {
        results.failed++;
        results.errors.push({ email: user.email, error: result.error });
      }
      
      // Small delay between creations
      if (i < users.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`✅ Bulk invite complete: ${results.created} created, ${results.alreadyExisted} existed, ${results.failed} failed`);
    return results;
  },

  /**
   * Create a new group
   * @param {string} name - The name for the group
   * @param {string} description - Optional description
   * @returns {Promise<Object>} Created group data (or existing group if 409 conflict)
   */
  async createGroup(name, description = '') {
    console.log(`➕ Creating group "${name}"`);
    
    try {
      const response = await rateLimitedApiCall(() => 
        apiClient.post('/v2/groups', {
          data: {
            type: 'groups',
            attributes: {
              name: name,
              description: description
            }
          }
        })
      );
      
      console.log(`✅ Group created successfully:`, response.data?.data?.id);
      return response.data?.data;
    } catch (error) {
      // Handle 409 Conflict - group already exists
      if (error.response?.status === 409) {
        console.log(`⚠️ Group "${name}" already exists, looking up...`);
        
        // Search for the existing group
        const existingGroup = await this.findGroupByName(name);
        if (existingGroup) {
          console.log(`✅ Found existing group: ${existingGroup.id}`);
          return existingGroup;
        }
        
        console.error('❌ Group exists but could not be found');
        throw new Error(`Group "${name}" already exists but could not be retrieved`);
      }
      
      console.error('❌ Error creating group:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Delete a group
   * @param {string} groupId - The group UUID
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteGroup(groupId) {
    console.log(`🗑️ Deleting group ${groupId}`);
    
    try {
      await rateLimitedApiCall(() => 
        apiClient.delete(`/v2/groups/${groupId}`)
      );
      
      console.log(`✅ Group deleted successfully`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting group:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Delete multiple groups
   * @param {Array} groupIds - Array of group UUIDs to delete
   * @param {Function} onProgress - Progress callback (current, total)
   * @returns {Promise<{deleted: number, failed: number, errors: Array}>}
   */
  async deleteMultipleGroups(groupIds, onProgress = null) {
    console.log(`🗑️ Bulk deleting ${groupIds.length} groups`);
    
    let deleted = 0;
    let failed = 0;
    const errors = [];
    
    for (let i = 0; i < groupIds.length; i++) {
      const groupId = groupIds[i];
      
      try {
        await rateLimitedApiCall(() => 
          apiClient.delete(`/v2/groups/${groupId}`)
        );
        deleted++;
      } catch (error) {
        failed++;
        errors.push({ groupId, error: error.message });
        console.error(`Failed to delete group ${groupId}:`, error.message);
      }
      
      if (onProgress) {
        onProgress(i + 1, groupIds.length);
      }
      
      // Small delay between deletions
      if (i < groupIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`✅ Bulk delete complete: ${deleted} deleted, ${failed} failed`);
    return { deleted, failed, errors };
  },

  /**
   * Merge groups - moves all users from source groups to target group, then deletes source groups
   * @param {string} targetGroupId - The group to merge into
   * @param {Array} sourceGroupIds - Array of group IDs to merge from (will be deleted)
   * @param {Function} onProgress - Progress callback (stage, current, total)
   * @returns {Promise<{usersMoved: number, groupsDeleted: number, errors: Array}>}
   */
  async mergeGroups(targetGroupId, sourceGroupIds, onProgress = null) {
    console.log(`🔀 Merging ${sourceGroupIds.length} groups into ${targetGroupId}`);
    
    let usersMoved = 0;
    let groupsDeleted = 0;
    const errors = [];
    
    // Step 1: Get all users from source groups
    const allSourceUsers = new Set();
    
    for (let i = 0; i < sourceGroupIds.length; i++) {
      const sourceId = sourceGroupIds[i];
      
      if (onProgress) {
        onProgress('fetching', i + 1, sourceGroupIds.length);
      }
      
      try {
        const users = await this.getGroupUsers(sourceId);
        users.forEach(u => allSourceUsers.add(u.id));
      } catch (error) {
        errors.push({ stage: 'fetch', groupId: sourceId, error: error.message });
        console.error(`Failed to get users from group ${sourceId}:`, error.message);
      }
    }
    
    console.log(`📊 Found ${allSourceUsers.size} unique users across source groups`);
    
    // Step 2: Get existing users in target group
    let targetUserIds = new Set();
    try {
      const targetUsers = await this.getGroupUsers(targetGroupId);
      targetUserIds = new Set(targetUsers.map(u => u.id));
    } catch (error) {
      errors.push({ stage: 'target', groupId: targetGroupId, error: error.message });
      throw new Error(`Failed to get target group users: ${error.message}`);
    }
    
    // Step 3: Add users to target group (only those not already in it)
    const usersToAdd = [...allSourceUsers].filter(id => !targetUserIds.has(id));
    console.log(`➕ Adding ${usersToAdd.length} users to target group`);
    
    for (let i = 0; i < usersToAdd.length; i++) {
      const userId = usersToAdd[i];
      
      if (onProgress) {
        onProgress('moving', i + 1, usersToAdd.length);
      }
      
      try {
        await this.addUserToGroup(targetGroupId, userId);
        usersMoved++;
      } catch (error) {
        errors.push({ stage: 'move', userId, error: error.message });
      }
      
      // Rate limiting
      if (i < usersToAdd.length - 1 && i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // Step 4: Delete source groups
    console.log(`🗑️ Deleting ${sourceGroupIds.length} source groups`);
    
    for (let i = 0; i < sourceGroupIds.length; i++) {
      const sourceId = sourceGroupIds[i];
      
      if (onProgress) {
        onProgress('deleting', i + 1, sourceGroupIds.length);
      }
      
      try {
        await rateLimitedApiCall(() => 
          apiClient.delete(`/v2/groups/${sourceId}`)
        );
        groupsDeleted++;
      } catch (error) {
        errors.push({ stage: 'delete', groupId: sourceId, error: error.message });
        console.error(`Failed to delete source group ${sourceId}:`, error.message);
      }
      
      if (i < sourceGroupIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`✅ Merge complete: ${usersMoved} users moved, ${groupsDeleted} groups deleted`);
    return { usersMoved, groupsDeleted, errors };
  }
};

// Default export - direct export of the northpassApi object
export default northpassApi;