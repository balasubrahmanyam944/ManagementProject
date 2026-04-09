import { logger } from '@/lib/utils/logger';
import { AuthenticationError } from '@/lib/errors/error-handler';

/**
 * Base interface for all authentication strategies
 */
export interface AuthStrategy {
  /**
   * Authenticates a request and returns the response
   */
  authenticate(url: string, options: RequestInit): Promise<Response>;
  
  /**
   * Checks if the authentication method is valid/available
   */
  isValid(): Promise<boolean>;
  
  /**
   * Refreshes the authentication token if possible
   */
  refresh(): Promise<boolean>;
  
  /**
   * Gets the strategy name for logging/debugging
   */
  getName(): string;
}

/**
 * Authentication context that uses a strategy to handle requests
 */
export class AuthContext {
  constructor(private strategy: AuthStrategy) {}

  /**
   * Sets a new authentication strategy
   */
  setStrategy(strategy: AuthStrategy): void {
    this.strategy = strategy;
  }

  /**
   * Authenticates a request using the current strategy
   */
  async authenticate(url: string, options: RequestInit = {}): Promise<Response> {
    const context = `AuthContext.authenticate:${this.strategy.getName()}`;
    
    try {
      // Check if the current strategy is valid
      if (!(await this.strategy.isValid())) {
        logger.warn(`Strategy ${this.strategy.getName()} is invalid, attempting refresh`, undefined, context);
        
        // Try to refresh the authentication
        const refreshSuccess = await this.strategy.refresh();
        if (!refreshSuccess) {
          throw new AuthenticationError(
            `Authentication failed for strategy: ${this.strategy.getName()}`,
            context
          );
        }
      }

      logger.debug(`Using strategy: ${this.strategy.getName()}`, { url }, context);
      return await this.strategy.authenticate(url, options);
    } catch (error) {
      logger.error(`Authentication failed for strategy: ${this.strategy.getName()}`, { error }, context);
      throw error;
    }
  }

  /**
   * Gets the current strategy name
   */
  getCurrentStrategyName(): string {
    return this.strategy.getName();
  }
}

/**
 * Base abstract class for authentication strategies
 */
export abstract class BaseAuthStrategy implements AuthStrategy {
  protected abstract strategyName: string;

  abstract authenticate(url: string, options: RequestInit): Promise<Response>;
  abstract isValid(): Promise<boolean>;
  abstract refresh(): Promise<boolean>;

  getName(): string {
    return this.strategyName;
  }

  protected logRequest(method: string, url: string): void {
    logger.apiRequest(method, url, this.strategyName);
  }

  protected logSuccess(method: string, url: string, status: number): void {
    logger.apiSuccess(method, url, status, this.strategyName);
  }

  protected logError(method: string, url: string, status: number, error: string): void {
    logger.apiError(method, url, status, error, this.strategyName);
  }
} 