/**
 * In-memory cache for Apple Ads API data
 *
 * Features:
 * - TTL-based expiration (5-15 minutes configurable)
 * - Automatic cache invalidation
 * - Cache hit/miss tracking
 * - Last update timestamp for headers
 */

class Cache {
  constructor() {
    this.store = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      invalidations: 0
    };
  }

  /**
   * Generate cache key from multiple parts
   */
  _makeKey(...parts) {
    return parts.filter(p => p !== null && p !== undefined).join(':');
  }

  /**
   * Set cache entry with TTL
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   * @param {number} ttl - Time to live in seconds (default 600 = 10 minutes)
   */
  set(key, data, ttl = 600) {
    const expiresAt = Date.now() + (ttl * 1000);
    this.store.set(key, {
      data,
      expiresAt,
      createdAt: Date.now()
    });
  }

  /**
   * Get cache entry if not expired
   * @param {string} key - Cache key
   * @returns {*|null} Cached data or null if expired/missing
   */
  get(key) {
    const entry = this.store.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.data;
  }

  /**
   * Get cache metadata (created time, expiry) without counting as hit/miss
   */
  getMetadata(key) {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      return null;
    }
    return {
      createdAt: new Date(entry.createdAt).toISOString(),
      expiresAt: new Date(entry.expiresAt).toISOString(),
      age: Math.floor((Date.now() - entry.createdAt) / 1000)
    };
  }

  /**
   * Invalidate specific cache key or pattern
   */
  invalidate(keyOrPattern) {
    if (keyOrPattern.includes('*')) {
      // Pattern-based invalidation
      const prefix = keyOrPattern.replace('*', '');
      let count = 0;
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) {
          this.store.delete(key);
          count++;
        }
      }
      this.stats.invalidations += count;
      return count;
    } else {
      // Direct key invalidation
      const deleted = this.store.delete(keyOrPattern);
      if (deleted) {
        this.stats.invalidations++;
      }
      return deleted ? 1 : 0;
    }
  }

  /**
   * Clear all cache
   */
  clear() {
    const count = this.store.size;
    this.store.clear();
    this.stats.invalidations += count;
    return count;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests * 100).toFixed(2) : 0;

    return {
      ...this.stats,
      entries: this.store.size,
      hitRate: `${hitRate}%`,
      totalRequests
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// Export singleton instance
const cache = new Cache();

// Cleanup every 5 minutes
setInterval(() => {
  const cleaned = cache.cleanup();
  if (cleaned > 0) {
    console.log(`Cache cleanup: removed ${cleaned} expired entries`);
  }
}, 5 * 60 * 1000);

module.exports = cache;
