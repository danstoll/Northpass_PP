/**
 * Sync Context Module
 * 
 * In-memory cache that shares data between sync operations during a sync chain.
 * Prevents duplicate API calls by caching groups, users, courses, and group counts.
 * 
 * Usage:
 *   const { initSyncContext, getSyncContext, clearSyncContext } = require('./syncContext.cjs');
 *   
 *   // At chain start
 *   initSyncContext('daily-chain-2024');
 *   
 *   // During sync operations
 *   const ctx = getSyncContext();
 *   ctx.setGroups(groups);
 *   const cachedGroups = ctx.getGroups();
 *   
 *   // At chain end
 *   clearSyncContext();
 */

// Constants
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes TTL

// Singleton context instance
let context = null;

/**
 * Create a new sync context with caches for various data types
 */
function createContext(sessionId) {
  return {
    sessionId,
    createdAt: Date.now(),
    expiresAt: Date.now() + CACHE_TTL_MS,
    
    // Status tracking
    status: {
      groups: null,      // 'pending' | 'completed' | 'failed'
      users: null,
      courses: null,
      enrollments: null,
      groupMembers: null
    },
    
    // Data caches using Maps for O(1) lookups
    _groups: new Map(),        // groupId -> group data
    _users: new Map(),         // userId -> user data  
    _courses: new Map(),       // courseId -> course data
    _groupCounts: new Map(),   // groupId -> user_count
    _partnerGroups: new Map(), // partnerId -> groupId
    
    // Statistics
    stats: {
      cacheHits: 0,
      cacheMisses: 0,
      apiCallsSaved: 0
    },

    // --------- GROUPS ---------
    
    setGroups(groups) {
      this._groups.clear();
      groups.forEach(g => {
        this._groups.set(g.id, g);
        // Also cache group counts if available
        if (g.user_count !== undefined) {
          this._groupCounts.set(g.id, g.user_count);
        }
      });
      this.status.groups = 'completed';
      console.log(`[SyncContext] Cached ${groups.length} groups`);
    },

    getGroups() {
      if (this._groups.size === 0) {
        this.stats.cacheMisses++;
        return null;
      }
      this.stats.cacheHits++;
      this.stats.apiCallsSaved += Math.ceil(this._groups.size / 100); // pages saved
      return Array.from(this._groups.values());
    },

    getGroup(groupId) {
      const group = this._groups.get(groupId);
      if (group) this.stats.cacheHits++;
      else this.stats.cacheMisses++;
      return group;
    },

    getGroupCount(groupId) {
      return this._groupCounts.get(groupId);
    },

    setGroupCount(groupId, count) {
      this._groupCounts.set(groupId, count);
    },

    // --------- USERS ---------
    
    setUsers(users) {
      this._users.clear();
      users.forEach(u => this._users.set(u.id, u));
      this.status.users = 'completed';
      console.log(`[SyncContext] Cached ${users.length} users`);
    },

    getUsers() {
      if (this._users.size === 0) {
        this.stats.cacheMisses++;
        return null;
      }
      this.stats.cacheHits++;
      this.stats.apiCallsSaved += Math.ceil(this._users.size / 100);
      return Array.from(this._users.values());
    },

    getUser(userId) {
      const user = this._users.get(userId);
      if (user) this.stats.cacheHits++;
      else this.stats.cacheMisses++;
      return user;
    },

    // --------- COURSES ---------
    
    setCourses(courses) {
      this._courses.clear();
      courses.forEach(c => this._courses.set(c.id, c));
      this.status.courses = 'completed';
      console.log(`[SyncContext] Cached ${courses.length} courses`);
    },

    getCourses() {
      if (this._courses.size === 0) {
        this.stats.cacheMisses++;
        return null;
      }
      this.stats.cacheHits++;
      this.stats.apiCallsSaved += Math.ceil(this._courses.size / 100);
      return Array.from(this._courses.values());
    },

    getCourse(courseId) {
      const course = this._courses.get(courseId);
      if (course) this.stats.cacheHits++;
      else this.stats.cacheMisses++;
      return course;
    },

    // --------- PARTNER GROUPS ---------
    
    setPartnerGroups(partnerGroups) {
      // Map of partnerId -> groupId
      this._partnerGroups.clear();
      if (Array.isArray(partnerGroups)) {
        partnerGroups.forEach(pg => this._partnerGroups.set(pg.partnerId, pg.groupId));
      } else if (typeof partnerGroups === 'object') {
        Object.entries(partnerGroups).forEach(([partnerId, groupId]) => {
          this._partnerGroups.set(partnerId, groupId);
        });
      }
      console.log(`[SyncContext] Cached ${this._partnerGroups.size} partner-group mappings`);
    },

    getPartnerGroups() {
      if (this._partnerGroups.size === 0) {
        this.stats.cacheMisses++;
        return null;
      }
      this.stats.cacheHits++;
      return Object.fromEntries(this._partnerGroups);
    },

    getPartnerGroupId(partnerId) {
      return this._partnerGroups.get(partnerId);
    },

    // --------- UTILITIES ---------
    
    isExpired() {
      return Date.now() > this.expiresAt;
    },

    refresh() {
      this.expiresAt = Date.now() + CACHE_TTL_MS;
    },

    getStats() {
      return {
        ...this.stats,
        cacheHitRate: this.stats.cacheHits + this.stats.cacheMisses > 0
          ? Math.round(this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100)
          : 0,
        groupsCached: this._groups.size,
        usersCached: this._users.size,
        coursesCached: this._courses.size,
        sessionId: this.sessionId,
        createdAt: new Date(this.createdAt).toISOString(),
        expiresAt: new Date(this.expiresAt).toISOString()
      };
    },

    clearCache(cacheType) {
      switch (cacheType) {
        case 'groups':
          this._groups.clear();
          this._groupCounts.clear();
          this.status.groups = null;
          break;
        case 'users':
          this._users.clear();
          this.status.users = null;
          break;
        case 'courses':
          this._courses.clear();
          this.status.courses = null;
          break;
        default:
          console.warn(`[SyncContext] Unknown cache type: ${cacheType}`);
      }
    }
  };
}

/**
 * Initialize a new sync context
 * @param {string} sessionId - Unique identifier for this sync session
 * @returns {object} The sync context
 */
function initSyncContext(sessionId = `sync-${Date.now()}`) {
  // If existing context is not expired, warn but allow override
  if (context && !context.isExpired()) {
    console.warn(`[SyncContext] Overwriting existing context (session: ${context.sessionId})`);
    console.log(`[SyncContext] Previous session stats:`, context.getStats());
  }
  
  context = createContext(sessionId);
  console.log(`[SyncContext] Initialized new context (session: ${sessionId})`);
  return context;
}

/**
 * Get the current sync context
 * @returns {object|null} The sync context or null if not initialized/expired
 */
function getSyncContext() {
  if (!context) {
    return null;
  }
  
  if (context.isExpired()) {
    console.warn(`[SyncContext] Context expired (session: ${context.sessionId})`);
    const stats = context.getStats();
    context = null;
    console.log(`[SyncContext] Expired session stats:`, stats);
    return null;
  }
  
  return context;
}

/**
 * Get the current context or create a new one if needed
 * @param {string} sessionId - Session ID if creating new context
 * @returns {object} The sync context
 */
function getOrCreateSyncContext(sessionId) {
  const existing = getSyncContext();
  if (existing) return existing;
  return initSyncContext(sessionId);
}

/**
 * Clear the sync context
 * @param {boolean} logStats - Whether to log stats before clearing
 */
function clearSyncContext(logStats = true) {
  if (context && logStats) {
    console.log(`[SyncContext] Clearing context (session: ${context.sessionId})`);
    console.log(`[SyncContext] Final stats:`, context.getStats());
  }
  context = null;
}

/**
 * Check if a sync context is currently active
 * @returns {boolean}
 */
function hasSyncContext() {
  return context !== null && !context.isExpired();
}

module.exports = {
  initSyncContext,
  getSyncContext,
  getOrCreateSyncContext,
  clearSyncContext,
  hasSyncContext,
  CACHE_TTL_MS
};
