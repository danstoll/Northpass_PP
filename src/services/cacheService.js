// Cache Service for Northpass API Data
// Provides browser-based caching with expiration and cache-busting capabilities

const CACHE_PREFIX = 'northpass_cache_';
// Cache version - increment this when making breaking changes to force cache invalidation
const CACHE_VERSION = 420; // v330: Added Recent Certifications section to Admin Home with partner info
const CACHE_VERSION_KEY = 'northpass_cache_version';
const DEFAULT_CACHE_DURATION = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
const MAX_LOCALSTORAGE_ITEM_SIZE = 50 * 1024; // 50KB max per item for localStorage
const MAX_LOCALSTORAGE_TOTAL_SIZE = 4 * 1024 * 1024; // 4MB target max for our cache

class CacheService {
  constructor() {
    this.memoryCache = new Map(); // In-memory cache for current session
    this.cacheStats = {
      hits: 0,
      misses: 0,
      clears: 0,
      expired: 0
    };
    this.idbAvailable = false;
    this.idbPromise = this.initIndexedDB();
    
    // Check cache version and clear if outdated
    this.checkCacheVersion();
  }
  
  /**
   * Check cache version and clear all cache if version has changed
   * This ensures users get fresh data after code updates
   */
  checkCacheVersion() {
    try {
      const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
      const currentVersion = CACHE_VERSION.toString();
      
      if (storedVersion !== currentVersion) {
        console.log(`🔄 Cache version changed from ${storedVersion || 'none'} to ${currentVersion} - clearing all cache`);
        // Clear synchronously to ensure it happens before any cache reads
        this.clearAllSync();
        localStorage.setItem(CACHE_VERSION_KEY, currentVersion);
        console.log('✅ Cache cleared and version updated');
      } else {
        console.log(`✅ Cache version ${currentVersion} is current`);
      }
    } catch (error) {
      console.warn('Error checking cache version:', error);
    }
  }
  
  /**
   * Synchronous version of clearAll for use in constructor
   */
  clearAllSync() {
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
      
      // Note: IndexedDB will be cleared when it's initialized
      this.cacheStats.clears++;
    } catch (error) {
      console.warn('Error in clearAllSync:', error);
    }
  }

  /**
   * Initialize IndexedDB for larger cache items
   */
  async initIndexedDB() {
    try {
      return new Promise((resolve) => {
        // Use CACHE_VERSION in the DB version to force upgrade when cache version changes
        const request = indexedDB.open('NorthpassCacheDB', CACHE_VERSION);
        
        request.onerror = () => {
          console.warn('IndexedDB not available for caching, using memory only for large items');
          this.idbAvailable = false;
          resolve(null);
        };
        
        request.onsuccess = async () => {
          this.idbAvailable = true;
          console.log('✅ IndexedDB cache initialized');
          const db = request.result;
          
          // Clear IndexedDB cache if version changed (the onupgradeneeded will have fired)
          const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
          if (storedVersion && parseInt(storedVersion) < CACHE_VERSION) {
            console.log('🔄 Clearing IndexedDB cache due to version upgrade');
            await this.idbClearAll(db);
          }
          
          resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          // If upgrading from an older version, delete the old store and create a new one
          if (db.objectStoreNames.contains('cache')) {
            db.deleteObjectStore('cache');
            console.log('🔄 Deleted old cache store for version upgrade');
          }
          const store = db.createObjectStore('cache', { keyPath: 'key' });
          store.createIndex('expires', 'expires', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('✅ Created new cache store');
        };
      });
    } catch (error) {
      console.warn('IndexedDB initialization failed:', error);
      this.idbAvailable = false;
      return null;
    }
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
    // Synchronous get - only checks memory and localStorage
    // For IndexedDB, use getAsync
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
   * Get cached data asynchronously (includes IndexedDB lookup)
   * @param {string} key - Cache key
   * @returns {Promise<Object|null>} - Cached data or null if not found/expired
   */
  async getAsync(key) {
    // First try synchronous caches
    const syncResult = this.get(key);
    if (syncResult !== null) {
      return syncResult;
    }

    // Try IndexedDB for larger items
    if (this.idbAvailable) {
      try {
        const db = await this.idbPromise;
        if (db) {
          const result = await this.idbGet(db, key);
          if (result && this.isValid(result)) {
            // Store in memory cache for faster access
            this.memoryCache.set(key, result);
            this.cacheStats.hits++;
            this.cacheStats.misses--; // Undo the miss count from sync get
            console.log(`🎯 IndexedDB cache HIT: ${key}`);
            return result.data;
          }
        }
      } catch (error) {
        console.warn('IndexedDB get error:', error);
      }
    }

    return null;
  }

  /**
   * Get from IndexedDB
   */
  async idbGet(db, key) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('cache', 'readonly');
        const store = tx.objectStore('cache');
        const request = store.get(key);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Store in IndexedDB
   */
  async idbSet(db, key, cacheEntry) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        const request = store.put({ key, ...cacheEntry });
        
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Delete from IndexedDB
   */
  async idbDelete(db, key) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        const request = store.delete(key);
        
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Clear all IndexedDB cache entries
   */
  async idbClearAll(db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        const request = store.clear();
        
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Get estimated size of data in bytes
   */
  getDataSize(data) {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      return JSON.stringify(data).length * 2; // Rough estimate
    }
  }

  /**
   * Get total size of our localStorage cache entries
   */
  getLocalStorageCacheSize() {
    let totalSize = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
          const item = localStorage.getItem(key);
          totalSize += key.length + (item ? item.length : 0);
        }
      }
    } catch {
      // Ignore errors
    }
    return totalSize * 2; // UTF-16 encoding
  }

  /**
   * Clear oldest cache entries to make room
   * @param {number} targetSize - Target size to free up
   */
  clearOldestEntries(targetSize) {
    const entries = [];
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
          const item = localStorage.getItem(key);
          try {
            const parsed = JSON.parse(item);
            entries.push({
              key,
              timestamp: parsed.timestamp || 0,
              size: key.length + (item ? item.length : 0)
            });
          } catch {
            // Invalid entry, remove it
            localStorage.removeItem(key);
          }
        }
      }

      // Sort by timestamp (oldest first)
      entries.sort((a, b) => a.timestamp - b.timestamp);

      let freedSize = 0;
      let removedCount = 0;
      for (const entry of entries) {
        if (freedSize >= targetSize) break;
        localStorage.removeItem(entry.key);
        this.memoryCache.delete(entry.key);
        freedSize += entry.size * 2;
        removedCount++;
      }

      if (removedCount > 0) {
        console.log(`🧹 Freed ${Math.round(freedSize / 1024)}KB by removing ${removedCount} old cache entries`);
      }
      
      return freedSize;
    } catch (error) {
      console.warn('Error clearing oldest entries:', error);
      return 0;
    }
  }

  /**
   * Store data in cache
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   * @param {number} duration - Cache duration in milliseconds (optional)
   */
  set(key, data, duration = DEFAULT_CACHE_DURATION) {
    // Run async to handle IndexedDB
    this.setAsync(key, data, duration);
  }

  /**
   * Store data in cache (async version)
   */
  async setAsync(key, data, duration = DEFAULT_CACHE_DURATION) {
    try {
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        expires: Date.now() + duration,
        duration
      };

      // Store in memory cache (always)
      this.memoryCache.set(key, cacheEntry);

      // Check data size to decide storage location
      const dataSize = this.getDataSize(cacheEntry);
      
      // For large items, use IndexedDB instead of localStorage
      if (dataSize > MAX_LOCALSTORAGE_ITEM_SIZE) {
        if (this.idbAvailable) {
          const db = await this.idbPromise;
          if (db) {
            const stored = await this.idbSet(db, key, cacheEntry);
            if (stored) {
              console.log(`💾 Cached in IndexedDB: ${key} (${Math.round(dataSize / 1024)}KB, expires in ${Math.round(duration / 1000 / 60)} min)`);
              return;
            }
          }
        }
        // Fall back to memory-only for large items if IndexedDB unavailable
        console.log(`💭 Cached in memory only (large): ${key} (${Math.round(dataSize / 1024)}KB)`);
        return;
      }

      // For smaller items, use localStorage
      try {
        // Check if we need to free up space
        const currentSize = this.getLocalStorageCacheSize();
        if (currentSize + dataSize > MAX_LOCALSTORAGE_TOTAL_SIZE) {
          this.clearOldestEntries(dataSize + (MAX_LOCALSTORAGE_TOTAL_SIZE * 0.2)); // Free 20% extra
        }
        
        localStorage.setItem(key, JSON.stringify(cacheEntry));
        console.log(`💾 Cached: ${key} (expires in ${Math.round(duration / 1000 / 60)} min)`);
      } catch (storageError) {
        if (storageError.name === 'QuotaExceededError') {
          console.warn('LocalStorage quota exceeded, clearing old entries...');
          this.clearExpiredEntries();
          this.clearOldestEntries(dataSize * 2);
          try {
            localStorage.setItem(key, JSON.stringify(cacheEntry));
            console.log(`💾 Cached after cleanup: ${key}`);
          } catch {
            // If still failing, try IndexedDB
            if (this.idbAvailable) {
              const db = await this.idbPromise;
              if (db) {
                await this.idbSet(db, key, cacheEntry);
                console.log(`💾 Cached in IndexedDB (fallback): ${key}`);
                return;
              }
            }
            console.warn(`💭 Cached in memory only: ${key}`);
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
  async clearAll() {
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
      
      // Clear IndexedDB cache
      if (this.idbAvailable) {
        const db = await this.idbPromise;
        if (db) {
          await this.idbClearAll(db);
        }
      }
      
      this.cacheStats.clears++;
      console.log(`🧹 Cleared ${keysToRemove.length} localStorage + IndexedDB cache entries`);
      
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
      
      // Try to get from cache first (including IndexedDB for large items)
      const cached = await this.getAsync(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Not in cache, execute function
      console.log(`🔄 Fetching fresh data: ${cacheType}`);
      const result = await fn(...args);
      
      // Store in cache (async handles IndexedDB for large items)
      await this.setAsync(cacheKey, result, duration);
      
      return result;
    };
  }
}

// Create singleton instance
const cacheService = new CacheService();

// Clean up expired entries on startup
cacheService.clearExpiredEntries();

export default cacheService;