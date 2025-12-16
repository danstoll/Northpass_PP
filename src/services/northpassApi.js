import axios from 'axios';
import { 
  trackFailedCourse, 
  isKnownFailedCourse, 
  getFailedCourseStats,
  analyzePropertiesFailures 
} from './failedCourseTracker.js';
import cacheService from './cacheService.js';
import { shouldSkipCourse, shouldExcludeCourseByName, isExcludedCourseId, getLearningPathComponentInfo, getKnownNpcuOverride } from './invalidCourseReference.js';

// Always use proxy to avoid CORS issues
const API_BASE_URL = '/api/northpass';
const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';

// Rate limiting configuration - Northpass allows 10 requests/second
// See: https://developers.northpass.com/docs/api-rate-limiting
const STANDARD_RATE_LIMIT = 10; // 10 requests per second (official Northpass limit)
const STANDARD_RATE_WINDOW = 1000; // 1 second
const STANDARD_MIN_DELAY = 100; // 100ms between requests (allows 10/sec)

// Properties API can use same rate limit as standard endpoints
const PROPERTIES_MIN_DELAY = 100; // 100ms for properties API (same as standard)
const MAX_CONCURRENT_USERS = 5; // Process 5 users in parallel (increased from 3)
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
  // Helper to check if a course name indicates it's archived or should be excluded
  isArchivedCourse(courseName) {
    // Use centralized exclusion logic from invalidCourseReference.js
    return shouldExcludeCourseByName(courseName);
  },

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
        console.log(`📚 Using cached course catalog (${this._courseCatalogCache.size} courses)`);
        return this._courseCatalogCache;
      }

      console.log('📡 Fetching current course catalog with pagination (live + archived courses)...');
      let allCourses = [];
      
      // Fetch BOTH live and draft courses
      // Live courses: active certifications
      // Draft courses with "Archived" prefix: archived courses that still count NPCU until expiry
      // Deleted courses (not in API): excluded entirely
      for (const status of ['live', 'draft']) {
        let currentPage = 1;
        let hasNextPage = true;
        
        while (hasNextPage) {
          const pageParam = `?page=${currentPage}&limit=50&filter[status][eq]=${status}`;
          console.log(`   📄 Fetching ${status} courses page ${currentPage}...`);
          const response = await rateLimitedApiCall(() => apiClient.get(`/v2/courses${pageParam}`));
          
          if (response.data?.data && response.data.data.length > 0) {
            // For draft courses, only include those with "Archived" prefix (these are archived courses)
            // For live courses, include all
            const filteredCourses = response.data.data.filter(c => {
              if (status === 'draft') {
                const name = c.attributes?.name || '';
                return name.toLowerCase().startsWith('archived');
              }
              return true; // Include all live courses
            });
            
            // Mark the actual status: 'live' or 'archived' (draft with Archived prefix)
            const coursesWithStatus = filteredCourses.map(c => ({
              ...c,
              _catalogStatus: status === 'draft' ? 'archived' : 'live'
            }));
            allCourses = [...allCourses, ...coursesWithStatus];
            
            const archivedInPage = status === 'draft' ? filteredCourses.length : 0;
            console.log(`   ✓ Page ${currentPage}: ${response.data.data.length} ${status} courses${status === 'draft' ? ` (${archivedInPage} archived)` : ''} (total: ${allCourses.length})`);
            hasNextPage = !!response.data.links?.next;
            if (hasNextPage) currentPage++;
          } else {
            hasNextPage = false;
          }
        }
      }
      
      console.log(`📊 Catalog pagination complete: ${allCourses.length} total courses (live + archived)`);

      // Filter out excluded courses (test, etc.) and create a Map of courseId -> status
      // This Map allows us to check both existence AND status (live vs archived)
      const validCourses = allCourses.filter(course => {
        const courseId = course.id;
        const name = course.attributes?.name || '';
        
        // Use centralized skip logic
        if (shouldSkipCourse(courseId, name)) {
          console.log(`⏭️ Skipping excluded course: ${name}`);
          return false;
        }
        return true;
      });
      
      // Create Map of courseId -> { status: 'live'|'archived', name: string }
      const courseCatalogMap = new Map();
      validCourses.forEach(course => {
        courseCatalogMap.set(course.id, {
          status: course._catalogStatus || course.attributes?.status || 'live',
          name: course.attributes?.name || 'Unknown Course'
        });
      });
      
      const liveCount = validCourses.filter(c => c._catalogStatus === 'live').length;
      const archivedCount = validCourses.filter(c => c._catalogStatus === 'archived').length;
      console.log(`✅ Catalog loaded: ${validCourses.length} valid courses (${liveCount} live, ${archivedCount} archived)`);
      
      // Cache the results
      this._courseCatalogCache = courseCatalogMap;
      this._catalogCacheTimestamp = now;
      
      return courseCatalogMap;
    } catch (error) {
      console.error('❌ Error fetching course catalog:', error.message);
      return new Map(); // Return empty map on error
    }
  },

  /**
   * Validate if a course ID exists in the current catalog
   * Returns course info object with status, or null if deleted/invalid
   * - Deleted courses (not in API): returns null (excluded entirely)
   * - Archived courses: returns { status: 'archived', ... } (NPCU counts until expiry)
   * - Live courses: returns { status: 'live', ... } (normal NPCU counting)
   * @param {string} courseId - The course ID to validate
   * @param {string} courseName - The course name (for logging)
   * @returns {Object|null} - Course info with status, or null if deleted/invalid
   */
  async validateCourseInCatalog(courseId, courseName = 'Unknown Course') {
    if (!courseId) return null;
    
    // Use centralized skip logic (checks ID + name patterns)
    if (shouldSkipCourse(courseId, courseName)) {
      console.log(`⏭️ Skipping excluded course: ${courseName} (${courseId})`);
      return null;
    }
    
    // Check if this is a known Learning Path component (valid but not in catalog)
    const lpComponentInfo = getLearningPathComponentInfo(courseId);
    if (lpComponentInfo) {
      console.log(`📚 Learning Path component is valid: ${lpComponentInfo.courseName} (NPCU: ${lpComponentInfo.npcu})`);
      return { status: 'live', name: lpComponentInfo.courseName, isLearningPathComponent: true };
    }
    
    // Check if this course is already known to be deleted to avoid unnecessary API calls
    if (isKnownFailedCourse(courseId, '404_NOT_FOUND')) {
      console.log(`⚡ Skipping known deleted course: ${courseName} (${courseId})`);
      return null; // Deleted courses are excluded entirely
    }
    
    const catalog = await this.getCourseCatalog();
    const courseInfo = catalog.get(courseId);
    
    // Track failed courses (deleted) for future optimization
    if (!courseInfo) {
      trackFailedCourse(courseId, courseName, '404_NOT_FOUND', {
        catalogSize: catalog.size,
        validationAttempt: new Date().toISOString()
      });
      console.log(`❌ Course not in catalog (deleted): ${courseName} (${courseId})`);
      return null; // Deleted courses are excluded entirely
    }
    
    // Log if archived course found
    if (courseInfo.status === 'archived') {
      console.log(`📦 Archived course found: ${courseName} - NPCU will count until expiry`);
    }
    
    return courseInfo;
  },

  // Cache for course NPCU values from Properties API
  _courseNPCUCache: new Map(),
  _npcuCacheTimestamp: null,
  _npcuCacheTTL: 30 * 60 * 1000, // 30 minutes TTL

  /**
   * Fetch NPCU value for a course from the Properties API
   * @param {string} courseId - The course ID
   * @param {string} courseName - The course name (for logging)
   * @returns {number} - NPCU value (0, 1, or 2)
   */
  async getCourseNPCU(courseId, courseName = 'Unknown Course') {
    if (!courseId) return 0;

    // Check if this is a known Learning Path component (valid but not in catalog)
    const lpComponentInfo = getLearningPathComponentInfo(courseId);
    if (lpComponentInfo) {
      console.log(`📚 Learning Path component found: ${lpComponentInfo.courseName} - NPCU: ${lpComponentInfo.npcu}`);
      this._courseNPCUCache.set(courseId, lpComponentInfo.npcu);
      return lpComponentInfo.npcu;
    }

    // Use centralized skip logic (checks ID + name patterns)
    if (shouldSkipCourse(courseId, courseName)) {
      console.log(`⏭️ Skipping excluded course NPCU: ${courseName}`);
      return 0;
    }

    // Check cache first
    if (this._courseNPCUCache.has(courseId)) {
      const cached = this._courseNPCUCache.get(courseId);
      console.log(`⚡ Using cached NPCU for ${courseName}: ${cached}`);
      return cached;
    }

    // Check if this course is known to fail properties API
    if (isKnownFailedCourse(courseId, 'PROPERTIES_403')) {
      console.log(`⚡ Skipping known failed properties course: ${courseName} (${courseId})`);
      return 0;
    }

    try {
      console.log(`📡 Fetching NPCU from Properties API for: ${courseName} (${courseId})`);
      
      const response = await rateLimitedApiCall(() => 
        apiClient.get(`/v2/properties/courses/${courseId}`)
      );

      // Log full response for debugging
      console.log(`📋 Properties API response for ${courseName}:`, JSON.stringify(response.data, null, 2));

      // The Properties API returns: data.attributes.properties.npcu
      // Structure: { data: { attributes: { properties: { npcu: 0|1|2, ... } } } }
      const properties = response.data?.data?.attributes?.properties || {};
      let npcuValue = 0;

      // Check for NPCU directly in the properties object
      if (properties.npcu !== undefined) {
        npcuValue = this.validateNPCUValue(properties.npcu);
        console.log(`✅ Found NPCU for ${courseName}: ${npcuValue}`);
      } else {
        console.log(`⚠️ No 'npcu' property found for ${courseName}`);
        console.log(`   Available properties: ${Object.keys(properties).join(', ')}`);
      }

      // Cache the result
      this._courseNPCUCache.set(courseId, npcuValue);
      return npcuValue;

    } catch (error) {
      const status = error.response?.status;
      
      if (status === 403) {
        console.warn(`⚠️ Properties API 403 for ${courseName} (${courseId}) - checking for known override`);
        
        // Check if we have a known NPCU override for this course
        const knownOverride = getKnownNpcuOverride(courseId);
        if (knownOverride) {
          console.log(`✅ Using known NPCU override for ${courseName}: ${knownOverride.npcu}`);
          this._courseNPCUCache.set(courseId, knownOverride.npcu);
          return knownOverride.npcu;
        }
        
        trackFailedCourse(courseId, courseName, 'PROPERTIES_403', { status });
      } else if (status === 404) {
        console.warn(`⚠️ Properties API 404 for ${courseName} (${courseId}) - no properties found`);
      } else {
        console.error(`❌ Properties API error for ${courseName}:`, error.message);
      }

      // Cache as 0 to avoid repeated failed calls
      this._courseNPCUCache.set(courseId, 0);
      return 0;
    }
  },

  /**
   * Batch fetch NPCU values for multiple courses
   * @param {Array} courses - Array of {courseId, courseName} objects
   * @returns {Map} - Map of courseId -> NPCU value
   */
  async batchGetCourseNPCU(courses) {
    const results = new Map();
    
    // Process in small batches to avoid rate limiting
    // Northpass rate limit is 10 req/sec, but we're conservative to account for
    // other concurrent API calls (catalog, transcripts, etc.)
    const batchSize = 3;
    console.log(`📦 Processing ${courses.length} courses in batches of ${batchSize}...`);
    
    for (let i = 0; i < courses.length; i += batchSize) {
      const batch = courses.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(courses.length / batchSize);
      
      console.log(`   Batch ${batchNum}/${totalBatches}: ${batch.map(c => c.courseName.substring(0, 30)).join(', ')}`);
      
      const batchResults = await Promise.all(
        batch.map(async ({ courseId, courseName }) => {
          const npcu = await this.getCourseNPCU(courseId, courseName);
          return { courseId, npcu };
        })
      );

      batchResults.forEach(({ courseId, npcu }) => {
        results.set(courseId, npcu);
      });

      // Longer delay between batches to stay well under rate limit
      // 500ms delay = max 6 requests per second (with batch of 3)
      if (i + batchSize < courses.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`✅ Fetched NPCU for ${results.size} courses`);
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
      
      // Get completed courses and validate against catalog FIRST
      const completedItems = allTranscriptItems
        .filter(item => item.attributes?.progress_status === 'completed');
      
      // Validate completed courses against catalog before fetching NPCU
      // validateCourseInCatalog returns null for deleted courses, or { status, name } for live/archived
      // SKIP Learning Paths - they don't have NPCU properties (only courses do)
      const validatedCompletedCourses = [];
      for (const item of completedItems) {
        const courseId = item.attributes.resource_id;
        const courseName = item.attributes.name || 'Unknown Course';
        const resourceType = item.attributes.resource_type;
        
        // Skip Learning Paths - they don't have NPCU properties
        if (resourceType === 'learning_path') {
          console.log(`⏭️ Skipping Learning Path (no NPCU): ${courseName}`);
          continue;
        }
        
        const courseInfo = await this.validateCourseInCatalog(courseId, courseName);
        if (courseInfo) {
          // Course exists (live or archived) - archived courses still count until expiry
          validatedCompletedCourses.push({ courseId, courseName, item, courseStatus: courseInfo.status });
        }
        // Deleted courses (courseInfo === null) are excluded entirely
      }

      // Batch fetch NPCU values ONLY for validated completed courses (via proxy)
      let npcuMap = new Map();
      if (validatedCompletedCourses.length > 0) {
        console.log(`📡 Fetching NPCU values for ${validatedCompletedCourses.length} validated completed courses...`);
        npcuMap = await this.batchGetCourseNPCU(validatedCompletedCourses.map(c => ({ 
          courseId: c.courseId, 
          courseName: c.courseName 
        })));
      }

      // Create a set of valid course IDs for quick lookup
      const validCourseIds = new Set(validatedCompletedCourses.map(c => c.courseId));

      // Process all learning activities (filter out invalid courses)
      const learningActivities = allTranscriptItems
        .filter(item => {
          const courseId = item.attributes.resource_id;
          const courseName = item.attributes.name || 'Unknown Course';
          // For non-completed items, do a quick name-based check
          if (item.attributes?.progress_status !== 'completed') {
            return !shouldSkipCourse(courseId, courseName);
          }
          // For completed items, use the validated set
          return validCourseIds.has(courseId);
        })
        .map(item => {
        const attrs = item.attributes;
        const courseId = attrs.resource_id;
        
        // Get NPCU from Properties API for completed courses (validated: 0, 1, or 2 only)
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
          // NPCU from Properties API for completed certifications (0, 1, or 2)
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
      
      // STEP 1: Validate courses against catalog FIRST (before fetching NPCU)
      // validateCourseInCatalog returns null for deleted courses, or { status, name } for live/archived
      // Deleted courses: excluded entirely
      // Archived courses: included, NPCU counts until expiry date
      // Learning Paths: skipped (they don't have NPCU properties)
      console.log(`🔍 Validating ${completedItems.length} courses against catalog...`);
      
      const validatedItems = [];
      const invalidItems = [];
      const skippedLearningPaths = [];
      const courseStatusMap = new Map(); // Track status for each course
      
      for (const item of completedItems) {
        const courseId = item.attributes.resource_id;
        const courseName = item.attributes.name || 'Unknown Course';
        const resourceType = item.attributes.resource_type;
        
        // Skip Learning Paths - they don't have NPCU properties
        if (resourceType === 'learning_path') {
          skippedLearningPaths.push(courseName);
          continue;
        }
        
        const courseInfo = await this.validateCourseInCatalog(courseId, courseName);
        if (courseInfo) {
          // Course exists (live or archived) - archived courses still count until expiry
          validatedItems.push(item);
          courseStatusMap.set(courseId, courseInfo.status);
        } else {
          // Deleted course - excluded entirely
          invalidItems.push({ courseId, courseName, reason: 'deleted' });
        }
      }
      
      if (skippedLearningPaths.length > 0) {
        console.log(`⏭️ Skipped ${skippedLearningPaths.length} Learning Paths (no NPCU): ${skippedLearningPaths.slice(0, 3).join(', ')}${skippedLearningPaths.length > 3 ? '...' : ''}`);
      }
      
      const liveCount = [...courseStatusMap.values()].filter(s => s === 'live').length;
      const archivedCount = [...courseStatusMap.values()].filter(s => s === 'archived').length;
      console.log(`✅ Catalog validation: ${validatedItems.length} valid (${liveCount} live, ${archivedCount} archived), ${invalidItems.length} deleted courses`);
      
      if (invalidItems.length > 0) {
        console.log('❌ Deleted courses (excluded):', invalidItems.map(c => c.courseName).join(', '));
      }
      
      // STEP 2: Fetch NPCU values ONLY for validated courses (via proxy)
      const coursesToFetchNPCU = validatedItems.map(item => ({
        courseId: item.attributes.resource_id,
        courseName: item.attributes.name || 'Unknown Course'
      }));

      // Batch fetch NPCU values from Properties API (uses proxy /api/northpass)
      console.log(`📡 Fetching NPCU values for ${coursesToFetchNPCU.length} validated courses from Properties API...`);
      const npcuMap = await this.batchGetCourseNPCU(coursesToFetchNPCU);

      // STEP 3: Convert validated items to standardized format with NPCU
      // Archived courses: NPCU counts until expiry date (2 years from completion)
      const certifications = validatedItems.map(item => {
        const attrs = item.attributes;
        const courseId = attrs.resource_id;
        const courseStatus = courseStatusMap.get(courseId) || 'live';
        
        // Get NPCU from Properties API (already fetched, validated to be 0, 1, or 2)
        const npcu = npcuMap.get(courseId) || 0;
        
        // Calculate expiry date (2 years from completion for ALL certifications)
        const expiryDate = attrs.expires_at || attrs.expiry_date || attrs.certificate_expires_at || 
                     attrs.valid_until || attrs.valid_to || attrs.certificate_expiry_date || 
                     attrs.cert_expires_at || this.calculateExpiryDate(attrs.completed_at, attrs.name || 'Unknown Course');
        
        return {
          id: item.id,
          resourceId: courseId,
          resourceType: attrs.resource_type,
          name: attrs.name || 'Unknown Course',
          status: attrs.progress_status,
          completedAt: attrs.completed_at,
          enrolledAt: attrs.enrolled_at,
          startedAt: attrs.started_at,
          lastActiveAt: attrs.last_active_at,
          attemptNumber: attrs.attempt_number,
          versionNumber: attrs.version_number,
          certificateUrl: item.links?.certificate || null,
          hasCertificate: !!item.links?.certificate,
          expiresAt: attrs.expires_at || attrs.expiry_date || attrs.certificate_expires_at || null,
          validUntil: attrs.valid_until || attrs.valid_to || null,
          certificateExpiryDate: attrs.certificate_expiry_date || attrs.cert_expires_at || null,
          // NPCU from Properties API (validated: 0, 1, or 2 only)
          npcu: npcu,
          isValidCourse: true,
          // Track course status: 'live' or 'archived'
          // Archived courses still count NPCU until expiryDate
          courseStatus: courseStatus,
          isArchived: courseStatus === 'archived',
          expiryDate: expiryDate
        };
      });

      console.log(`🎓 Returning ${certifications.length} validated certifications with NPCU values`);
      
      // Log NPCU summary
      const npcuSummary = certifications.reduce((acc, cert) => {
        acc[cert.npcu] = (acc[cert.npcu] || 0) + 1;
        return acc;
      }, {});
      console.log(`📊 NPCU distribution: ${JSON.stringify(npcuSummary)}`);
      
      // Detailed logging for debugging - show all certs with NPCU > 0
      const certsWithNpcu = certifications.filter(c => c.npcu > 0);
      if (certsWithNpcu.length > 0) {
        console.log(`🏆 Certifications with NPCU:`, certsWithNpcu.map(c => ({
          name: c.name.substring(0, 50),
          npcu: c.npcu,
          expired: c.expiryDate ? new Date(c.expiryDate) < new Date() : false
        })));
      } else {
        console.warn(`⚠️ No certifications with NPCU > 0 found for user ${userId}`);
        console.log(`📋 NPCU Map contents:`, [...npcuMap.entries()].filter(([k, v]) => v > 0));
      }
      
      // Display failed course statistics for this user
      if (invalidItems.length > 0) {
        getFailedCourseStats();
      }
      
      return certifications;
      
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
    
    // All certifications expire 2 years (24 months) from completion - no exceptions
    const validityMonths = 24;
    
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
   * Uses the Memberships API to get users that belong to a specific group
   * @param {string} groupId - The ID of the group
   * @returns {Array} - Array of user objects
   */
  async _getGroupUsersUncached(groupId) {
    console.log(`👥 Fetching users for group ID: ${groupId} (uncached)`);
    
    try {
      const allMemberships = [];
      let page = 1;
      
      // Use Memberships API - returns users that are members of this specific group
      while (true) {
        console.log(`📄 Fetching memberships page ${page} for group...`);
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
        
        allMemberships.push(...memberships);
        
        console.log(`📄 Page ${page}: ${memberships.length} memberships (total: ${allMemberships.length})`);
        
        // Check if there's a next page
        if (!response.data.links?.next) {
          break;
        }
        
        page++;
        
        // Safety check
        if (page > 100) {
          console.warn('⚠️ Stopped fetching after 100 pages (5000 memberships)');
          break;
        }
      }
      
      console.log(`✅ Total memberships in group: ${allMemberships.length}`);
      
      // Now fetch the user details for each membership
      // Memberships have a relationship to the person
      const userIds = allMemberships.map(m => m.relationships?.person?.data?.id).filter(Boolean);
      console.log(`👤 Fetching details for ${userIds.length} users...`);
      
      // Fetch user details in parallel (with rate limiting)
      const users = await Promise.all(
        userIds.map(async (userId) => {
          try {
            const response = await rateLimitedApiCall(() => apiClient.get(`/v2/people/${userId}`));
            return response.data?.data;
          } catch (error) {
            console.warn(`⚠️ Could not fetch user ${userId}:`, error.message);
            return null;
          }
        })
      );
      
      const validUsers = users.filter(Boolean);
      console.log(`✅ Fetched ${validUsers.length} user details`);
      
      // Log sample user for debugging
      if (validUsers.length > 0) {
        const sample = validUsers[0];
        const email = sample?.attributes?.email || '';
        const firstName = sample?.attributes?.first_name || '';
        const lastName = sample?.attributes?.last_name || '';
        console.log(`🔍 Sample user: ${firstName} ${lastName} (${email})`);
      }
      
      return validUsers;
      
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
    
    try {
      // Build the data array for JSON:API format
      const peopleData = userIds.map(userId => ({
        type: 'people',
        id: userId
      }));
      
      const response = await rateLimitedApiCall(() => apiClient.post(
        `/v2/groups/${groupId}/relationships/people`,
        { data: peopleData }
      ));
      
      console.log(`✅ Successfully added ${userIds.length} users to group ${groupId}`);
      return { success: true, data: response.data, count: userIds.length };
      
    } catch (error) {
      console.error(`❌ Error adding users to group ${groupId}:`, error.response?.data || error.message);
      console.error('   Status:', error.response?.status);
      return { success: false, error: error.response?.data || error.message };
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
    const primaryResult = await this.addPeopleToGroup(groupId, userIds);
    if (primaryResult.success) {
      results.primaryGroup.success = userIds.length;
      console.log(`✅ Added ${userIds.length} users to primary group`);
    } else {
      results.primaryGroup.failed = userIds.length;
      console.error('❌ Failed to add users to primary group');
    }
    
    if (progressCallback) {
      progressCallback(1, 2, 'Adding to All Partners group...');
    }
    
    // Add to All Partners group if needed
    if (addToAllPartners) {
      const allPartnersGroup = await this.findAllPartnersGroup();
      if (allPartnersGroup) {
        const allPartnersResult = await this.addPeopleToGroup(allPartnersGroup.id, userIds);
        if (allPartnersResult.success) {
          results.allPartnersGroup.success = userIds.length;
          console.log(`✅ Added ${userIds.length} users to All Partners group`);
        } else {
          results.allPartnersGroup.failed = userIds.length;
          console.error('❌ Failed to add users to All Partners group');
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
   * Create a new group
   * @param {string} name - The name for the group
   * @param {string} description - Optional description
   * @returns {Promise<Object>} Created group data
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