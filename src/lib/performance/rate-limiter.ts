import { logger } from '@/lib/utils/logger';
import { CONFIG } from '@/lib/config';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  burstLimit?: number; // Maximum burst requests
  skipFailedRequests?: boolean; // Don't count failed requests
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  keyGenerator?: (identifier: string) => string; // Custom key generator
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

/**
 * Rate limit entry
 */
interface RateLimitEntry {
  requests: number[];
  burstCount: number;
  lastReset: number;
}

/**
 * Advanced rate limiter with sliding window and burst handling
 */
export class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      windowMs: CONFIG.RATE_LIMIT.windowMs,
      maxRequests: CONFIG.RATE_LIMIT.requests,
      burstLimit: Math.floor(CONFIG.RATE_LIMIT.requests * 0.2), // 20% of max as burst
      skipFailedRequests: false,
      skipSuccessfulRequests: false,
      keyGenerator: (id) => id,
      ...config
    };

    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if request is allowed
   */
  checkLimit(identifier: string): RateLimitResult {
    const key = this.config.keyGenerator!(identifier);
    const now = Date.now();
    
    let entry = this.limits.get(key);
    if (!entry) {
      entry = {
        requests: [],
        burstCount: 0,
        lastReset: now
      };
      this.limits.set(key, entry);
    }

    // Clean old requests outside the window
    const windowStart = now - this.config.windowMs;
    entry.requests = entry.requests.filter(time => time > windowStart);

    // Reset burst counter if window has passed
    if (now - entry.lastReset > this.config.windowMs) {
      entry.burstCount = 0;
      entry.lastReset = now;
    }

    const currentRequests = entry.requests.length;
    const remaining = Math.max(0, this.config.maxRequests - currentRequests);
    const resetTime = entry.lastReset + this.config.windowMs;

    // Check main rate limit
    if (currentRequests >= this.config.maxRequests) {
      logger.warn('Rate limit exceeded', {
        identifier,
        currentRequests,
        maxRequests: this.config.maxRequests,
        windowMs: this.config.windowMs
      }, 'RateLimiter.checkLimit');

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter: Math.ceil((resetTime - now) / 1000)
      };
    }

    // Check burst limit
    if (this.config.burstLimit && entry.burstCount >= this.config.burstLimit) {
      const burstWindow = 60 * 1000; // 1 minute burst window
      const retryAfter = Math.ceil(burstWindow / 1000);

      logger.warn('Burst limit exceeded', {
        identifier,
        burstCount: entry.burstCount,
        burstLimit: this.config.burstLimit
      }, 'RateLimiter.checkLimit');

      return {
        allowed: false,
        remaining,
        resetTime,
        retryAfter
      };
    }

    // Allow the request
    entry.requests.push(now);
    entry.burstCount++;

    logger.debug('Rate limit check passed', {
      identifier,
      currentRequests: currentRequests + 1,
      remaining: remaining - 1,
      burstCount: entry.burstCount
    }, 'RateLimiter.checkLimit');

    return {
      allowed: true,
      remaining: remaining - 1,
      resetTime
    };
  }

  /**
   * Record a failed request (if configured to skip them)
   */
  recordFailure(identifier: string): void {
    if (this.config.skipFailedRequests) {
      const key = this.config.keyGenerator!(identifier);
      const entry = this.limits.get(key);
      
      if (entry && entry.requests.length > 0) {
        entry.requests.pop(); // Remove the last request
        entry.burstCount = Math.max(0, entry.burstCount - 1);
        
        logger.debug('Failed request removed from rate limit', {
          identifier,
          remainingRequests: entry.requests.length
        }, 'RateLimiter.recordFailure');
      }
    }
  }

  /**
   * Record a successful request (if configured to skip them)
   */
  recordSuccess(identifier: string): void {
    if (this.config.skipSuccessfulRequests) {
      const key = this.config.keyGenerator!(identifier);
      const entry = this.limits.get(key);
      
      if (entry && entry.requests.length > 0) {
        entry.requests.pop(); // Remove the last request
        entry.burstCount = Math.max(0, entry.burstCount - 1);
        
        logger.debug('Successful request removed from rate limit', {
          identifier,
          remainingRequests: entry.requests.length
        }, 'RateLimiter.recordSuccess');
      }
    }
  }

  /**
   * Get current status for an identifier
   */
  getStatus(identifier: string): {
    requests: number;
    remaining: number;
    resetTime: number;
    burstCount: number;
  } {
    const key = this.config.keyGenerator!(identifier);
    const entry = this.limits.get(key);
    const now = Date.now();

    if (!entry) {
      return {
        requests: 0,
        remaining: this.config.maxRequests,
        resetTime: now + this.config.windowMs,
        burstCount: 0
      };
    }

    // Clean old requests
    const windowStart = now - this.config.windowMs;
    entry.requests = entry.requests.filter(time => time > windowStart);

    return {
      requests: entry.requests.length,
      remaining: Math.max(0, this.config.maxRequests - entry.requests.length),
      resetTime: entry.lastReset + this.config.windowMs,
      burstCount: entry.burstCount
    };
  }

  /**
   * Clear limits for an identifier
   */
  reset(identifier: string): void {
    const key = this.config.keyGenerator!(identifier);
    this.limits.delete(key);
    
    logger.info('Rate limit reset', { identifier }, 'RateLimiter.reset');
  }

  /**
   * Clear all limits
   */
  resetAll(): void {
    const entriesCleared = this.limits.size;
    this.limits.clear();
    
    logger.info('All rate limits cleared', { entriesCleared }, 'RateLimiter.resetAll');
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeIdentifiers: number;
    totalRequests: number;
    blockedRequests: number;
  } {
    let totalRequests = 0;
    let blockedRequests = 0;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const entry of this.limits.values()) {
      const validRequests = entry.requests.filter(time => time > windowStart);
      totalRequests += validRequests.length;
      
      if (validRequests.length >= this.config.maxRequests) {
        blockedRequests++;
      }
    }

    return {
      activeIdentifiers: this.limits.size,
      totalRequests,
      blockedRequests
    };
  }

  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - (this.config.windowMs * 2); // Keep data for 2x window
    let cleanedEntries = 0;

    for (const [key, entry] of this.limits.entries()) {
      // Remove entries with no recent requests
      entry.requests = entry.requests.filter(time => time > cutoff);
      
      if (entry.requests.length === 0 && entry.lastReset < cutoff) {
        this.limits.delete(key);
        cleanedEntries++;
      }
    }

    if (cleanedEntries > 0) {
      logger.debug('Rate limiter cleanup', {
        cleanedEntries,
        remainingEntries: this.limits.size
      }, 'RateLimiter.cleanup');
    }
  }
}

/**
 * Request queue for handling rate-limited requests
 */
export class RequestQueue {
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
    identifier: string;
    priority: number;
  }> = [];
  
  private processing = false;
  private rateLimiter: RateLimiter;

  constructor(rateLimitConfig?: Partial<RateLimitConfig>) {
    this.rateLimiter = new RateLimiter(rateLimitConfig);
  }

  /**
   * Add a request to the queue
   */
  async enqueue<T>(
    fn: () => Promise<T>,
    identifier: string,
    priority: number = 0
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn,
        resolve,
        reject,
        identifier,
        priority
      });

      // Sort by priority (higher first)
      this.queue.sort((a, b) => b.priority - a.priority);

      this.processQueue();
    });
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      const limitResult = this.rateLimiter.checkLimit(item.identifier);

      if (limitResult.allowed) {
        try {
          const result = await item.fn();
          this.rateLimiter.recordSuccess(item.identifier);
          item.resolve(result);
        } catch (error) {
          this.rateLimiter.recordFailure(item.identifier);
          item.reject(error);
        }
      } else {
        // Put the item back at the front of the queue
        this.queue.unshift(item);
        
        // Wait for the rate limit to reset
        const delay = limitResult.retryAfter ? limitResult.retryAfter * 1000 : 1000;
        logger.debug('Request queued due to rate limit', {
          identifier: item.identifier,
          retryAfter: limitResult.retryAfter,
          queueLength: this.queue.length
        }, 'RequestQueue.processQueue');
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    this.processing = false;
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queueLength: number;
    processing: boolean;
    rateLimitStats: ReturnType<RateLimiter['getStats']>;
  } {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      rateLimitStats: this.rateLimiter.getStats()
    };
  }
}

/**
 * Create rate limiters for different services
 */
export const rateLimiters = {
  jira: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // Jira's typical rate limit
    burstLimit: 20,
    keyGenerator: (id) => `jira:${id}`
  }),
  
  trello: new RateLimiter({
    windowMs: 10 * 1000, // 10 seconds
    maxRequests: 100, // Trello's rate limit
    burstLimit: 10,
    keyGenerator: (id) => `trello:${id}`
  }),
  
  general: new RateLimiter() // Uses default config
};

/**
 * Request queues for different services
 */
export const requestQueues = {
  jira: new RequestQueue({
    windowMs: 60 * 1000,
    maxRequests: 100,
    burstLimit: 20
  }),
  
  trello: new RequestQueue({
    windowMs: 10 * 1000,
    maxRequests: 100,
    burstLimit: 10
  })
}; 