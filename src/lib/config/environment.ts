import { z } from 'zod';
import { ValidationService } from '@/lib/validation';

/**
 * Environment types
 */
export type EnvironmentType = 'development' | 'staging' | 'production' | 'test';

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Environment configuration schema
 */
const EnvironmentConfigSchema = z.object({
  // Basic environment info
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  
  // Application settings
  APP_NAME: z.string().default('UPMY Dashboard'),
  APP_VERSION: z.string().default('1.0.0'),
  APP_URL: z.string().url().optional(),
  
  // Next.js settings
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  // AI Configuration
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  
  // Jira Configuration
  JIRA_OAUTH_CLIENT_ID: z.string().optional(),
  JIRA_OAUTH_CLIENT_SECRET: z.string().optional(),
  JIRA_OAUTH_REDIRECT_URI: z.string().url().optional(),
  
  // Trello Configuration
  TRELLO_API_KEY: z.string().optional(),
  TRELLO_OAUTH_SECRET: z.string().optional(),
  
  // Cache settings
  CACHE_TTL_SECONDS: z.string().transform(val => parseInt(val) || 300),
  CACHE_MAX_ENTRIES: z.string().transform(val => parseInt(val) || 1000),
  
  // Rate limiting
  RATE_LIMIT_REQUESTS: z.string().transform(val => parseInt(val) || 100),
  RATE_LIMIT_WINDOW_MS: z.string().transform(val => parseInt(val) || 60000),
  
  // API settings
  API_TIMEOUT_MS: z.string().transform(val => parseInt(val) || 30000),
  API_RETRY_ATTEMPTS: z.string().transform(val => parseInt(val) || 3),
  
  // Feature flags
  FEATURE_ANALYTICS: z.string().transform(val => val === 'true').default('true'),
  FEATURE_EXPORT: z.string().transform(val => val === 'true').default('true'),
  FEATURE_MOCK_DATA: z.string().transform(val => val === 'true').default('false'),
  
  // Database (if needed in future)
  DATABASE_URL: z.string().url().optional(),
  DATABASE_POOL_SIZE: z.string().transform(val => parseInt(val) || 10),
  
  // Security
  CSRF_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  
  // Monitoring
  SENTRY_DSN: z.string().url().optional(),
  ANALYTICS_ID: z.string().optional(),
});

export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

/**
 * Environment configuration class
 */
export class Environment {
  private static instance: Environment;
  private config: EnvironmentConfig;
  private isValidated = false;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): Environment {
    if (!Environment.instance) {
      Environment.instance = new Environment();
    }
    return Environment.instance;
  }

  /**
   * Load and validate environment configuration
   */
  private loadConfig(): EnvironmentConfig {
    try {
      const result = EnvironmentConfigSchema.safeParse(process.env);
      
      if (result.success) {
        this.isValidated = true;
        return result.data;
      } else {
        console.warn('Environment configuration validation failed:', result.error.errors);
        // Return default config in case of validation failure
        const defaultConfig = EnvironmentConfigSchema.parse({});
        this.isValidated = false;
        return defaultConfig;
      }
    } catch (error) {
      console.error('Environment configuration validation failed:', error);
      // Return default config in case of validation failure
      return EnvironmentConfigSchema.parse({});
    }
  }

  /**
   * Get the current environment
   */
  getEnvironment(): EnvironmentType {
    return this.config.NODE_ENV as EnvironmentType;
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development';
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  /**
   * Check if running in test mode
   */
  isTest(): boolean {
    return this.config.NODE_ENV === 'test';
  }

  /**
   * Get application settings
   */
  getApp() {
    return {
      name: this.config.APP_NAME,
      version: this.config.APP_VERSION,
      url: this.config.APP_URL || this.config.NEXT_PUBLIC_APP_URL,
    };
  }

  /**
   * Get logging configuration
   */
  getLogging() {
    return {
      level: this.config.LOG_LEVEL as LogLevel,
    };
  }

  /**
   * Get Jira configuration
   */
  getJira() {
    return {
      oauth: {
        clientId: this.config.JIRA_OAUTH_CLIENT_ID,
        clientSecret: this.config.JIRA_OAUTH_CLIENT_SECRET,
        redirectUri: this.config.JIRA_OAUTH_REDIRECT_URI,
      },
    };
  }

  /**
   * Get AI configuration
   */
  getAI() {
    return {
      googleApiKey: this.config.GOOGLE_GENERATIVE_AI_API_KEY,
    };
  }

  /**
   * Get Trello configuration
   */
  getTrello() {
    return {
      apiKey: this.config.TRELLO_API_KEY,
      oauthSecret: this.config.TRELLO_OAUTH_SECRET,
    };
  }

  /**
   * Get cache configuration
   */
  getCache() {
    return {
      ttlSeconds: this.config.CACHE_TTL_SECONDS,
      maxEntries: this.config.CACHE_MAX_ENTRIES,
    };
  }

  /**
   * Get rate limiting configuration
   */
  getRateLimit() {
    return {
      requests: this.config.RATE_LIMIT_REQUESTS,
      windowMs: this.config.RATE_LIMIT_WINDOW_MS,
    };
  }

  /**
   * Get API configuration
   */
  getApi() {
    return {
      timeoutMs: this.config.API_TIMEOUT_MS,
      retryAttempts: this.config.API_RETRY_ATTEMPTS,
    };
  }

  /**
   * Get feature flags
   */
  getFeatures() {
    return {
      analytics: this.config.FEATURE_ANALYTICS,
      export: this.config.FEATURE_EXPORT,
      mockData: this.config.FEATURE_MOCK_DATA,
    };
  }

  /**
   * Get database configuration
   */
  getDatabase() {
    return {
      url: this.config.DATABASE_URL,
      poolSize: this.config.DATABASE_POOL_SIZE,
    };
  }

  /**
   * Get security configuration
   */
  getSecurity() {
    return {
      csrfSecret: this.config.CSRF_SECRET,
      sessionSecret: this.config.SESSION_SECRET,
    };
  }

  /**
   * Get monitoring configuration
   */
  getMonitoring() {
    return {
      sentryDsn: this.config.SENTRY_DSN,
      analyticsId: this.config.ANALYTICS_ID,
    };
  }

  /**
   * Get specific configuration value
   */
  get<K extends keyof EnvironmentConfig>(key: K): EnvironmentConfig[K] {
    return this.config[key];
  }

  /**
   * Check if configuration is valid
   */
  isValid(): boolean {
    return this.isValidated;
  }

  /**
   * Get all configuration (for debugging)
   */
  getAll(): EnvironmentConfig {
    if (!this.isDevelopment()) {
      throw new Error('Configuration dump only available in development');
    }
    return { ...this.config };
  }

  /**
   * Validate required settings for specific features
   */
  validateJiraConfig(): boolean {
    return !!(this.config.JIRA_OAUTH_CLIENT_ID && this.config.JIRA_OAUTH_CLIENT_SECRET);
  }

  validateTrelloConfig(): boolean {
    const trello = this.getTrello();
    return !!(trello.apiKey && trello.oauthSecret);
  }

  validateDatabaseConfig(): boolean {
    const db = this.getDatabase();
    return !!db.url;
  }

  /**
   * Get environment-specific defaults
   */
  getDefaults() {
    const env = this.getEnvironment();
    
    switch (env) {
      case 'development':
        return {
          logLevel: 'debug' as LogLevel,
          cacheEnabled: false,
          mockData: true,
          strictValidation: false,
        };
      
      case 'staging':
        return {
          logLevel: 'info' as LogLevel,
          cacheEnabled: true,
          mockData: false,
          strictValidation: true,
        };
      
      case 'production':
        return {
          logLevel: 'warn' as LogLevel,
          cacheEnabled: true,
          mockData: false,
          strictValidation: true,
        };
      
      case 'test':
        return {
          logLevel: 'error' as LogLevel,
          cacheEnabled: false,
          mockData: true,
          strictValidation: true,
        };
      
      default:
        return {
          logLevel: 'info' as LogLevel,
          cacheEnabled: true,
          mockData: false,
          strictValidation: true,
        };
    }
  }
}

/**
 * Global environment instance
 */
export const env = Environment.getInstance();

/**
 * Convenience functions
 */
export const isDevelopment = () => env.isDevelopment();
export const isProduction = () => env.isProduction();
export const isTest = () => env.isTest();

/**
 * Configuration constants
 */
export const CONFIG = {
  APP: env.getApp(),
  LOGGING: env.getLogging(),
  JIRA: env.getJira(),
  AI: env.getAI(),
  TRELLO: env.getTrello(),
  CACHE: env.getCache(),
  RATE_LIMIT: env.getRateLimit(),
  API: env.getApi(),
  FEATURES: env.getFeatures(),
  DATABASE: env.getDatabase(),
  SECURITY: env.getSecurity(),
  MONITORING: env.getMonitoring(),
} as const; 