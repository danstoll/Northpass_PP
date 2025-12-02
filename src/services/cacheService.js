// Cache Service for Northpass API Data
// Provides browser-based caching with expiration and cache-busting capabilities

const CACHE_PREFIX = 'northpass_cache_';
const DEFAULT_CACHE_DURATION = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

class CacheService {
  constructor() {
    this.memoryCache = new Map(); // In-memory cache for current session
    this.cacheStats = {
      hits: 0,
      misses: 0,
      clears: 0,
      expired: 0
    };
  }

  /**
   * Generate a cache key from parameters
   * @param {string} type - Type of data (e.g., 'company_users', 'user_certs', 'group_data')
   * @param {Object} params - Parameters to hash into key
   * @returns {string} - Cache key
   */
  generateCacheKey(type, params) {
    const paramString = JSON.stringify(params, Object.keys(params).sort());
    const hash = this.simpleHash(paramString);
    return `${CACHE_PREFIX}${type}_${hash}`;
  }

  /**
   * Simple hash function for cache keys
   * @param {string} str - String to hash
   * @returns {string} - Hash value
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get cached data if valid
   * @param {string} key - Cache key
   * @returns {Object|null} - Cached data or null if not found/expired
   */
  get(key) {
    try {
      // Check memory cache first (fastest)
      if (this.memoryCache.has(key)) {
        const cached = this.memoryCache.get(key);
        if (this.isValid(cached)) {
          this.cacheStats.hits++;
          console.log(`🎯 Memory cache HIT: ${key}`);
          return cached.data;
        } else {
          this.memoryCache.delete(key);
          this.cacheStats.expired++;
        }
      }

      // Check localStorage
      const cached = localStorage.getItem(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (this.isValid(parsed)) {
          // Store in memory cache for faster access
          this.memoryCache.set(key, parsed);
          this.cacheStats.hits++;
          console.log(`🎯 LocalStorage cache HIT: ${key}`);
          return parsed.data;
        } else {
          localStorage.removeItem(key);
          this.cacheStats.expired++;
          console.log(`⏰ Cache EXPIRED: ${key}`);
        }
      }

      this.cacheStats.misses++;
      console.log(`❌ Cache MISS: ${key}`);
      return null;
    } catch (error) {
      console.warn('Cache get error:', error);
      this.cacheStats.misses++;
      return null;
    }
  }

  /**
   * Store data in cache
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   * @param {number} duration - Cache duration in milliseconds (optional)
   */
  set(key, data, duration = DEFAULT_CACHE_DURATION) {
    try {
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        expires: Date.now() + duration,
        duration
      };

      // Store in memory cache
      this.memoryCache.set(key, cacheEntry);

      // Store in localStorage (with error handling for quota)
      try {
        localStorage.setItem(key, JSON.stringify(cacheEntry));
        console.log(`💾 Cached: ${key} (expires in ${Math.round(duration / 1000 / 60)} minutes)`);
      } catch (storageError) {
        if (storageError.name === 'QuotaExceededError') {
          console.warn('LocalStorage quota exceeded, clearing old cache entries');
          this.clearExpiredEntries();
          try {
            localStorage.setItem(key, JSON.stringify(cacheEntry));
          } catch {
            console.warn('Still cannot store in localStorage after cleanup, using memory only');
          }
        }
      }
    } catch (error) {
      console.warn('Cache set error:', error);
    }
  }

  /**
   * Check if cached entry is still valid
   * @param {Object} cached - Cached entry
   * @returns {boolean} - True if valid
   */
  isValid(cached) {
    return cached && cached.expires && Date.now() < cached.expires;
  }

  /**
   * Clear all cache entries
   */
  clearAll() {
    try {
      // Clear memory cache
      this.memoryCache.clear();

      // Clear localStorage entries
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      this.cacheStats.clears++;
      console.log(`🧹 Cleared ${keysToRemove.length} cache entries`);
      
      // Show notification to user
      this.showCacheNotification('Cache cleared! Data will be refreshed.', 'success');
    } catch (error) {
      console.warn('Cache clear error:', error);
    }
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredEntries() {
    try {
      let expiredCount = 0;
      
      // Clear expired memory cache entries
      for (const [key, cached] of this.memoryCache.entries()) {
        if (!this.isValid(cached)) {
          this.memoryCache.delete(key);
          expiredCount++;
        }
      }

      // Clear expired localStorage entries
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
          try {
            const cached = JSON.parse(localStorage.getItem(key));
            if (!this.isValid(cached)) {
              keysToRemove.push(key);
            }
          } catch {
            // Remove invalid entries
            keysToRemove.push(key);
          }
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));
      expiredCount += keysToRemove.length;

      if (expiredCount > 0) {
        console.log(`🧹 Cleaned up ${expiredCount} expired cache entries`);
      }
    } catch (error) {
      console.warn('Cache cleanup error:', error);
    }
  }

  /**
   * Clear cache for specific type of data
   * @param {string} type - Type of cache to clear (e.g., 'company_users', 'user_certs')
   */
  clearByType(type) {
    try {
      let clearedCount = 0;
      
      // Clear from memory cache
      for (const key of this.memoryCache.keys()) {
        if (key.includes(`${CACHE_PREFIX}${type}_`)) {
          this.memoryCache.delete(key);
          clearedCount++;
        }
      }

      // Clear from localStorage
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes(`${CACHE_PREFIX}${type}_`)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));
      clearedCount += keysToRemove.length;

      console.log(`🧹 Cleared ${clearedCount} ${type} cache entries`);
      this.showCacheNotification(`${type} cache cleared! Data will be refreshed.`, 'success');
    } catch (error) {
      console.warn('Cache clear by type error:', error);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getStats() {
    const memorySize = this.memoryCache.size;
    let localStorageSize = 0;
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
          localStorageSize++;
        }
      }
    } catch (error) {
      console.warn('Error getting localStorage stats:', error);
    }

    return {
      ...this.cacheStats,
      memoryEntries: memorySize,
      localStorageEntries: localStorageSize,
      hitRate: this.cacheStats.hits + this.cacheStats.misses > 0 ? 
        Math.round((this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses)) * 100) : 0
    };
  }

  /**
   * Show cache notification to user
   * @param {string} message - Notification message
   * @param {string} type - Notification type ('success', 'info', 'warning')
   */
  showCacheNotification(message, type = 'info') {
    // Create a simple notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      color: white;
      font-weight: bold;
      z-index: 10000;
      transition: opacity 0.3s ease;
      max-width: 300px;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;

    // Set color based on type
    switch (type) {
      case 'success':
        notification.style.backgroundColor = '#28a745';
        break;
      case 'warning':
        notification.style.backgroundColor = '#ffc107';
        notification.style.color = '#212529';
        break;
      default:
        notification.style.backgroundColor = '#007bff';
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  /**
   * Create a cached wrapper for an async function
   * @param {Function} fn - Async function to wrap
   * @param {string} cacheType - Type of cache
   * @param {number} duration - Cache duration (optional)
   * @returns {Function} - Cached version of the function
   */
  cached(fn, cacheType, duration = DEFAULT_CACHE_DURATION) {
    return async (...args) => {
      const cacheKey = this.generateCacheKey(cacheType, args);
      
      // Try to get from cache first
      const cached = this.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Not in cache, execute function
      console.log(`🔄 Fetching fresh data: ${cacheType}`);
      const result = await fn(...args);
      
      // Store in cache
      this.set(cacheKey, result, duration);
      
      return result;
    };
  }
}

// Create singleton instance
const cacheService = new CacheService();

// Clean up expired entries on startup
cacheService.clearExpiredEntries();

export default cacheService;