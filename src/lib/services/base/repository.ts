import { logger } from '@/lib/utils/logger';
import { ValidationError } from '@/lib/errors/error-handler';

/**
 * Base interface for all repositories
 */
export interface Repository<T, K = string> {
  /**
   * Find entity by ID
   */
  findById(id: K): Promise<T | null>;
  
  /**
   * Find all entities with optional filters
   */
  findAll(filters?: Record<string, any>): Promise<T[]>;
  
  /**
   * Create a new entity
   */
  create(entity: Omit<T, 'id'>): Promise<T>;
  
  /**
   * Update an existing entity
   */
  update(id: K, updates: Partial<T>): Promise<T>;
  
  /**
   * Delete an entity
   */
  delete(id: K): Promise<boolean>;
  
  /**
   * Check if entity exists
   */
  exists(id: K): Promise<boolean>;
}

/**
 * Base pagination interface
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

/**
 * Extended repository interface with pagination
 */
export interface PaginatedRepository<T, K = string> extends Repository<T, K> {
  findAllPaginated(
    filters?: Record<string, any>, 
    options?: PaginationOptions
  ): Promise<PaginatedResult<T>>;
}

/**
 * Abstract base repository class with common functionality
 */
export abstract class BaseRepository<T, K = string> implements Repository<T, K> {
  protected abstract entityName: string;
  
  abstract findById(id: K): Promise<T | null>;
  abstract findAll(filters?: Record<string, any>): Promise<T[]>;
  abstract create(entity: Omit<T, 'id'>): Promise<T>;
  abstract update(id: K, updates: Partial<T>): Promise<T>;
  abstract delete(id: K): Promise<boolean>;
  
  async exists(id: K): Promise<boolean> {
    const context = `${this.entityName}Repository.exists`;
    try {
      const entity = await this.findById(id);
      return entity !== null;
    } catch (error) {
      logger.error(`Error checking existence of ${this.entityName}`, { id, error }, context);
      return false;
    }
  }

  /**
   * Validates entity data before operations
   */
  protected validateEntity(entity: any, context: string): void {
    if (!entity) {
      throw new ValidationError(`${this.entityName} cannot be null or undefined`, context);
    }
  }

  /**
   * Logs repository operations
   */
  protected logOperation(operation: string, details?: Record<string, any>): void {
    const context = `${this.entityName}Repository.${operation}`;
    logger.info(`${this.entityName} ${operation}`, details, context);
  }

  /**
   * Handles repository errors consistently
   */
  protected handleError(operation: string, error: any, context?: string): never {
    const repositoryContext = context || `${this.entityName}Repository.${operation}`;
    logger.error(`${this.entityName} ${operation} failed`, { error }, repositoryContext);
    throw error;
  }
}

/**
 * Cache-enabled repository mixin
 */
export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  key?: string; // Custom cache key
}

export abstract class CachedRepository<T, K = string> extends BaseRepository<T, K> {
  protected abstract cachePrefix: string;
  private cache = new Map<string, { data: any; expiry: number }>();

  /**
   * Get data from cache
   */
  protected getCached<R>(key: string): R | null {
    const cacheKey = `${this.cachePrefix}:${key}`;
    const cached = this.cache.get(cacheKey);
    
    if (!cached) return null;
    
    if (cached.expiry < Date.now()) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    return cached.data as R;
  }

  /**
   * Set data in cache
   */
  protected setCached<R>(key: string, data: R, ttlSeconds: number = 300): void {
    const cacheKey = `${this.cachePrefix}:${key}`;
    const expiry = Date.now() + (ttlSeconds * 1000);
    
    this.cache.set(cacheKey, { data, expiry });
    
    // Clean up expired entries periodically
    if (this.cache.size > 1000) {
      this.cleanupCache();
    }
  }

  /**
   * Clear cache for a specific key or all
   */
  protected clearCache(key?: string): void {
    if (key) {
      const cacheKey = `${this.cachePrefix}:${key}`;
      this.cache.delete(cacheKey);
    } else {
      // Clear all cache entries with this prefix
      for (const cacheKey of this.cache.keys()) {
        if (cacheKey.startsWith(this.cachePrefix)) {
          this.cache.delete(cacheKey);
        }
      }
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (value.expiry < now) {
        this.cache.delete(key);
      }
    }
  }

  async findById(id: K): Promise<T | null> {
    const cached = this.getCached<T>(`findById:${id}`);
    if (cached) {
      this.logOperation('findById (cached)', { id });
      return cached;
    }

    const result = await this.findByIdUncached(id);
    if (result) {
      this.setCached(`findById:${id}`, result, 300); // 5 minutes
    }
    
    return result;
  }

  /**
   * Abstract method for uncached findById - to be implemented by subclasses
   */
  protected abstract findByIdUncached(id: K): Promise<T | null>;
}

/**
 * Generic query builder interface for flexible filtering
 */
export interface QueryBuilder<T> {
  where(field: keyof T, operator: string, value: any): QueryBuilder<T>;
  whereIn(field: keyof T, values: any[]): QueryBuilder<T>;
  whereBetween(field: keyof T, start: any, end: any): QueryBuilder<T>;
  orderBy(field: keyof T, direction?: 'asc' | 'desc'): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  offset(count: number): QueryBuilder<T>;
  execute(): Promise<T[]>;
  count(): Promise<number>;
}

/**
 * Transaction interface for operations that need to be atomic
 */
export interface Transaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface TransactionalRepository<T, K = string> extends Repository<T, K> {
  beginTransaction(): Promise<Transaction>;
  executeInTransaction<R>(operation: (tx: Transaction) => Promise<R>): Promise<R>;
} 