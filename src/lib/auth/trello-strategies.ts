import { cookies } from 'next/headers';
import { BaseAuthStrategy } from './auth-strategy';
import { AuthenticationError } from '@/lib/errors/error-handler';

/**
 * Trello OAuth authentication strategy
 */
export class TrelloOAuthStrategy extends BaseAuthStrategy {
  protected strategyName = 'TrelloOAuth';
  private readonly apiKey = process.env.TRELLO_API_KEY;

  async authenticate(url: string, options: RequestInit = {}): Promise<Response> {
    this.logRequest(options.method || 'GET', url);

    const cookieStore = await cookies();
    const trelloToken = cookieStore.get('trello_access_token')?.value;

    if (!trelloToken) {
      throw new AuthenticationError('Trello access token not found', this.strategyName);
    }

    if (!this.apiKey) {
      throw new AuthenticationError('Trello API key not configured', this.strategyName);
    }

    // Trello uses query parameters for authentication, not Authorization header
    const urlWithAuth = new URL(url);
    urlWithAuth.searchParams.set('key', this.apiKey);
    urlWithAuth.searchParams.set('token', trelloToken);

    const response = await fetch(urlWithAuth.toString(), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      this.logError(options.method || 'GET', url, response.status, 'Trello OAuth request failed');
    } else {
      this.logSuccess(options.method || 'GET', url, response.status);
    }

    return response;
  }

  async isValid(): Promise<boolean> {
    try {
      const cookieStore = await cookies();
      const trelloToken = cookieStore.get('trello_access_token')?.value;
      
      return !!(trelloToken && this.apiKey);
    } catch (error) {
      return false;
    }
  }

  async refresh(): Promise<boolean> {
    // Trello tokens are typically long-lived and don't need refresh
    // We could implement a validation call here if needed
    return this.isValid();
  }
}

/**
 * Factory for creating Trello authentication strategies
 */
export class TrelloAuthStrategyFactory {
  static async createStrategy(): Promise<BaseAuthStrategy> {
    // For now, Trello only supports OAuth
    return new TrelloOAuthStrategy();
  }

  static async createAuthContext(): Promise<import('./auth-strategy').AuthContext> {
    const strategy = await this.createStrategy();
    const { AuthContext } = await import('./auth-strategy');
    return new AuthContext(strategy);
  }
} 