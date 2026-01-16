/**
 * Server-Side Analytics Cache
 * In-memory cache with TTL for expensive analytics queries
 * 
 * Default TTL: 5 minutes for most queries
 * Longer TTL (10 min) for very expensive queries like engagement scores
 */

class AnalyticsCache {
  constructor() {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
    
    // Clean expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Generate cache key from endpoint and filters
   */
  generateKey(endpoint, filters = {}) {
    const filterStr = Object.entries(filters)
      .filter(([, v]) => v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return `${endpoint}:${filterStr}`;
  }

  /**
   * Get cached value if exists and not expired
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return entry.data;
  }

  /**
   * Set cache value with TTL
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {number} ttlMs - Time to live in milliseconds (default 5 min)
   */
  set(key, data, ttlMs = 5 * 60 * 1000) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      cachedAt: Date.now()
    });
  }

  /**
   * Invalidate cache entry
   */
  invalidate(key) {
    this.cache.delete(key);
  }

  /**
   * Invalidate all entries matching a pattern
   * @param {string} pattern - Endpoint pattern to match (e.g., 'kpi-summary')
   */
  invalidatePattern(pattern) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.stats.evictions += cleaned;
      console.log(`[AnalyticsCache] Cleaned ${cleaned} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1)
      : 0;
    
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      entries: this.cache.size,
      memoryEstimate: `${(JSON.stringify([...this.cache.entries()]).length / 1024).toFixed(1)} KB`
    };
  }

  /**
   * Wrapper for async functions with caching
   * @param {string} endpoint - Cache key endpoint
   * @param {Object} filters - Filter parameters
   * @param {Function} fetchFn - Async function to call if cache miss
   * @param {number} ttlMs - TTL in milliseconds
   */
  async withCache(endpoint, filters, fetchFn, ttlMs = 5 * 60 * 1000) {
    const key = this.generateKey(endpoint, filters);
    
    // Check cache first
    const cached = this.get(key);
    if (cached !== null) {
      console.log(`[AnalyticsCache] HIT: ${endpoint}`);
      return cached;
    }
    
    // Cache miss - fetch fresh data
    console.log(`[AnalyticsCache] MISS: ${endpoint}`);
    const data = await fetchFn();
    
    // Cache the result
    this.set(key, data, ttlMs);
    return data;
  }

  /**
   * Destroy cache (cleanup interval)
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

// Singleton instance
const analyticsCache = new AnalyticsCache();

// TTL constants (in milliseconds)
const CACHE_TTL = {
  SHORT: 2 * 60 * 1000,      // 2 minutes - for real-time data
  MEDIUM: 5 * 60 * 1000,     // 5 minutes - default
  LONG: 10 * 60 * 1000,      // 10 minutes - for expensive queries
  VERY_LONG: 30 * 60 * 1000  // 30 minutes - for rarely changing data
};

module.exports = {
  analyticsCache,
  CACHE_TTL
};
