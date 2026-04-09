import { AuthContext } from './auth-strategy';
import { JiraAuthStrategyFactory } from './jira-strategies';
import { TrelloAuthStrategyFactory } from './trello-strategies';
import { ErrorHandler } from '@/lib/errors/error-handler';
import { logger } from '@/lib/utils/logger';

export type AuthProvider = 'jira' | 'trello';

/**
 * Unified authentication client that uses strategy pattern
 */
export class AuthClient {
  private authContexts: Map<AuthProvider, AuthContext> = new Map();

  /**
   * Initializes authentication for a specific provider
   */
  async initializeProvider(provider: AuthProvider): Promise<void> {
    const context = `AuthClient.initializeProvider:${provider}`;
    
    try {
      let authContext: AuthContext;
      
      switch (provider) {
        case 'jira':
          authContext = await JiraAuthStrategyFactory.createAuthContext();
          break;
        case 'trello':
          authContext = await TrelloAuthStrategyFactory.createAuthContext();
          break;
        default:
          throw new Error(`Unknown auth provider: ${provider}`);
      }
      
      this.authContexts.set(provider, authContext);
      logger.info(`Initialized auth provider: ${provider}`, undefined, context);
    } catch (error) {
      logger.error(`Failed to initialize auth provider: ${provider}`, { error }, context);
      throw error;
    }
  }

  /**
   * Makes an authenticated request using the specified provider
   */
  async authenticatedFetch(
    provider: AuthProvider,
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const context = `AuthClient.authenticatedFetch:${provider}`;
    
    // Initialize provider if not already done
    if (!this.authContexts.has(provider)) {
      await this.initializeProvider(provider);
    }

    const authContext = this.authContexts.get(provider);
    if (!authContext) {
      throw new Error(`Auth context not found for provider: ${provider}`);
    }

    return await authContext.authenticate(url, options);
  }

  /**
   * Gets data from an authenticated endpoint and handles the response
   */
  async get<T>(
    provider: AuthProvider,
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await this.authenticatedFetch(provider, url, {
      ...options,
      method: 'GET'
    });

    return await ErrorHandler.handleApiResponse(response, `AuthClient.get:${provider}`);
  }

  /**
   * Posts data to an authenticated endpoint and handles the response
   */
  async post<T>(
    provider: AuthProvider,
    url: string,
    data: any,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await this.authenticatedFetch(provider, url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    return await ErrorHandler.handleApiResponse(response, `AuthClient.post:${provider}`);
  }

  /**
   * Gets the current strategy name for a provider
   */
  getCurrentStrategy(provider: AuthProvider): string | null {
    const authContext = this.authContexts.get(provider);
    return authContext ? authContext.getCurrentStrategyName() : null;
  }

  /**
   * Clears the auth context for a provider (useful for logout)
   */
  clearProvider(provider: AuthProvider): void {
    this.authContexts.delete(provider);
    logger.info(`Cleared auth provider: ${provider}`, undefined, 'AuthClient.clearProvider');
  }

  /**
   * Clears all auth contexts
   */
  clearAll(): void {
    this.authContexts.clear();
    logger.info('Cleared all auth providers', undefined, 'AuthClient.clearAll');
  }
}

// Singleton instance
let authClientInstance: AuthClient | null = null;

/**
 * Gets the singleton AuthClient instance
 */
export function getAuthClient(): AuthClient {
  if (!authClientInstance) {
    authClientInstance = new AuthClient();
  }
  return authClientInstance;
}

/**
 * Convenience functions for common operations
 */
export async function authenticatedJiraFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const client = getAuthClient();
  return client.authenticatedFetch('jira', url, options);
}

export async function authenticatedTrelloFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const client = getAuthClient();
  return client.authenticatedFetch('trello', url, options);
}

export async function jiraGet<T>(url: string): Promise<T> {
  const client = getAuthClient();
  return client.get<T>('jira', url);
}

export async function trelloGet<T>(url: string): Promise<T> {
  const client = getAuthClient();
  return client.get<T>('trello', url);
} 