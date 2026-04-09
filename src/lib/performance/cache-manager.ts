import { logger } from '@/lib/utils/logger';
import { CONFIG } from '@/lib/config';

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  data: T;
  expiry: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
  tags: Set<string>;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  averageAccessTime: number;
}

/**
 * Cache options
 */
export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  maxSize?: number; // Maximum size in bytes
  tags?: string[]; // Tags for group invalidation
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Advanced cache manager with multiple strategies
 */
export class CacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalEntries: 0,
    totalSize: 0,
    hitRate: 0,
    averageAccessTime: 0
  };
  private accessTimes: number[] = [];
  private maxEntries: number;
  private maxTotalSize: number;

  constructor(
    maxEntries = CONFIG.CACHE.maxEntries,
    maxTotalSize = 50 * 1024 * 1024 // 50MB default
  ) {
    this.maxEntries = maxEntries;
    this.maxTotalSize = maxTotalSize;
    
    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);
    
    // Collect stats every minute
    setInterval(() => this.updateStats(), 60 * 1000);
  }

  /**
   * Get item from cache
   */
  get<T>(key: string): T | null {
    const startTime = performance.now();
    
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.recordAccessTime(performance.now() - startTime);
      return null;
    }

    // Check if expired
    if (entry.expiry < Date.now()) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      this.recordAccessTime(performance.now() - startTime);
      return null;
    }

    // Update access metadata
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    this.stats.hits++;
    this.recordAccessTime(performance.now() - startTime);
    
    logger.debug('Cache hit', { 
      key, 
      accessCount: entry.accessCount,
      age: Date.now() - (entry.expiry - (CONFIG.CACHE.ttlSeconds * 1000))
    }, 'CacheManager.get');
    
    return entry.data;
  }

  /**
   * Set item in cache
   */
  set<T>(key: string, data: T, options: CacheOptions = {}): void {
    const ttl = options.ttl || CONFIG.CACHE.ttlSeconds;
    const size = this.estimateSize(data);
    const tags = new Set(options.tags || []);
    
    // Check if we need to evict entries
    this.evictIfNeeded(size);
    
    const entry: CacheEntry<T> = {
      data,
      expiry: Date.now() + (ttl * 1000),
      accessCount: 0,
      lastAccessed: Date.now(),
      size,
      tags
    };
    
    this.cache.set(key, entry);
    this.stats.totalEntries = this.cache.size;
    this.stats.totalSize += size;
    
    logger.debug('Cache set', { 
      key, 
      size, 
      ttl, 
      tags: Array.from(tags),
      totalEntries: this.stats.totalEntries 
    }, 'CacheManager.set');
  }

  /**
   * Delete item from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.stats.totalSize -= entry.size;
      this.stats.totalEntries = this.cache.size;
      logger.debug('Cache delete', { key }, 'CacheManager.delete');
      return true;
    }
    return false;
  }

  /**
   * Clear cache by tags
   */
  invalidateByTags(tags: string[]): number {
    let count = 0;
    const tagSet = new Set(tags);
    
    for (const [key, entry] of this.cache.entries()) {
      const hasMatchingTag = Array.from(entry.tags).some(tag => tagSet.has(tag));
      if (hasMatchingTag) {
        this.cache.delete(key);
        this.stats.totalSize -= entry.size;
        count++;
      }
    }
    
    this.stats.totalEntries = this.cache.size;
    this.stats.evictions += count;
    
    logger.info('Cache invalidated by tags', { 
      tags, 
      entriesRemoved: count 
    }, 'CacheManager.invalidateByTags');
    
    return count;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    const entriesRemoved = this.cache.size;
    this.cache.clear();
    this.stats.totalEntries = 0;
    this.stats.totalSize = 0;
    this.stats.evictions += entriesRemoved;
    
    logger.info('Cache cleared', { 
      entriesRemoved 
    }, 'CacheManager.clear');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Get cache keys by pattern
   */
  getKeys(pattern?: RegExp): string[] {
    const keys = Array.from(this.cache.keys());
    return pattern ? keys.filter(key => pattern.test(key)) : keys;
  }

  /**
   * Get cache info for debugging
   */
  getDebugInfo(): {
    entries: Array<{
      key: string;
      size: number;
      accessCount: number;
      lastAccessed: string;
      expiry: string;
      tags: string[];
    }>;
    stats: CacheStats;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      size: entry.size,
      accessCount: entry.accessCount,
      lastAccessed: new Date(entry.lastAccessed).toISOString(),
      expiry: new Date(entry.expiry).toISOString(),
      tags: Array.from(entry.tags)
    }));

    return {
      entries: entries.sort((a, b) => b.accessCount - a.accessCount),
      stats: this.getStats()
    };
  }

  /**
   * Cache decorator for methods
   */
  cached<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    keyGenerator: (...args: Parameters<T>) => string,
    options: CacheOptions = {}
  ): T {
    return (async (...args: Parameters<T>) => {
      const cacheKey = keyGenerator(...args);
      
      // Try to get from cache first
      const cached = this.get(cacheKey);
      if (cached !== null) {
        return cached;
      }
      
      // Execute function and cache result
      const result = await fn(...args);
      this.set(cacheKey, result, options);
      
      return result;
    }) as T;
  }

  // Private methods

  private estimateSize(data: any): number {
    if (data === null || data === undefined) return 0;
    
    if (typeof data === 'string') return data.length * 2; // 2 bytes per char
    if (typeof data === 'number') return 8;
    if (typeof data === 'boolean') return 4;
    
    try {
      return JSON.stringify(data).length * 2;
    } catch {
      return 1024; // Default estimate for complex objects
    }
  }

  private evictIfNeeded(newEntrySize: number): void {
    // Check total size limit
    while (this.stats.totalSize + newEntrySize > this.maxTotalSize && this.cache.size > 0) {
      this.evictLeastUsed();
    }
    
    // Check entry count limit
    while (this.cache.size >= this.maxEntries) {
      this.evictLeastUsed();
    }
  }

  private evictLeastUsed(): void {
    let leastUsedKey = '';
    let leastAccessCount = Infinity;
    let oldestAccess = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < leastAccessCount || 
          (entry.accessCount === leastAccessCount && entry.lastAccessed < oldestAccess)) {
        leastUsedKey = key;
        leastAccessCount = entry.accessCount;
        oldestAccess = entry.lastAccessed;
      }
    }
    
    if (leastUsedKey) {
      const entry = this.cache.get(leastUsedKey);
      if (entry) {
        this.cache.delete(leastUsedKey);
        this.stats.totalSize -= entry.size;
        this.stats.evictions++;
        
        logger.debug('Cache eviction', { 
          key: leastUsedKey, 
          accessCount: entry.accessCount,
          reason: 'LRU'
        }, 'CacheManager.evictLeastUsed');
      }
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry < now) {
        this.cache.delete(key);
        this.stats.totalSize -= entry.size;
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      this.stats.totalEntries = this.cache.size;
      this.stats.evictions += expiredCount;
      
      logger.debug('Expired cache cleanup', { 
        expiredCount,
        remainingEntries: this.cache.size 
      }, 'CacheManager.cleanupExpired');
    }
  }

  private recordAccessTime(time: number): void {
    this.accessTimes.push(time);
    
    // Keep only last 1000 access times for average calculation
    if (this.accessTimes.length > 1000) {
      this.accessTimes = this.accessTimes.slice(-1000);
    }
  }

  private updateStats(): void {
    const totalRequests = this.stats.hits + this.stats.misses;
    this.stats.hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    
    if (this.accessTimes.length > 0) {
      this.stats.averageAccessTime = 
        this.accessTimes.reduce((sum, time) => sum + time, 0) / this.accessTimes.length;
    }
    
    this.stats.totalEntries = this.cache.size;
  }
}

/**
 * Global cache manager instance
 */
export const cacheManager = new CacheManager();

/**
 * Cache decorator for easy use
 */
export function Cache(options: CacheOptions & { keyGenerator?: (...args: any[]) => string } = {}) {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const keyGenerator = options.keyGenerator || 
      ((...args: any[]) => `${target.constructor.name}.${propertyKey}:${JSON.stringify(args)}`);
    
    descriptor.value = cacheManager.cached(originalMethod, keyGenerator, options);
    return descriptor;
  };
} 