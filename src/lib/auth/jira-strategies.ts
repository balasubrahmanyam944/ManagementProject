import { cookies } from 'next/headers';
import { BaseAuthStrategy } from './auth-strategy';
import { AuthenticationError } from '@/lib/errors/error-handler';

/**
 * Jira OAuth authentication strategy
 */
export class JiraOAuthStrategy extends BaseAuthStrategy {
  protected strategyName = 'JiraOAuth';

  async authenticate(url: string, options: RequestInit = {}): Promise<Response> {
    this.logRequest(options.method || 'GET', url);

    const cookieStore = await cookies();
    const accessToken = cookieStore.get('jira_oauth_access_token')?.value;
    const cloudId = cookieStore.get('jira_oauth_cloud_id')?.value;

    if (!accessToken) {
      throw new AuthenticationError('Jira OAuth access token not found', this.strategyName);
    }

    // Convert traditional Jira URL to OAuth API format
    let finalUrl = url;
    if (cloudId && !url.includes('api.atlassian.com')) {
      const urlPath = url.replace(/^https?:\/\/[^\/]+/, '');
      finalUrl = `https://api.atlassian.com/ex/jira/${cloudId}${urlPath}`;
    }

    const response = await fetch(finalUrl, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      this.logError(options.method || 'GET', finalUrl, response.status, 'OAuth request failed');
    } else {
      this.logSuccess(options.method || 'GET', finalUrl, response.status);
    }

    return response;
  }

  async isValid(): Promise<boolean> {
    try {
      const cookieStore = await cookies();
      const accessToken = cookieStore.get('jira_oauth_access_token')?.value;
      const cloudId = cookieStore.get('jira_oauth_cloud_id')?.value;
      
      return !!(accessToken && cloudId);
    } catch (error) {
      return false;
    }
  }

  async refresh(): Promise<boolean> {
    // OAuth token refresh would need to be implemented based on Jira's OAuth flow
    // For now, return false as we don't have refresh token logic
    return false;
  }
}

/**
 * Jira API Token authentication strategy
 */
export class JiraApiTokenStrategy extends BaseAuthStrategy {
  protected strategyName = 'JiraApiToken';

  async authenticate(url: string, options: RequestInit = {}): Promise<Response> {
    this.logRequest(options.method || 'GET', url);

    const cookieStore = await cookies();
    const email = cookieStore.get('jira_api_email')?.value;
    const apiToken = cookieStore.get('jira_api_token')?.value;

    if (!email || !apiToken) {
      throw new AuthenticationError('Jira API Token credentials not found', this.strategyName);
    }

    const basicAuth = Buffer.from(`${email}:${apiToken}`).toString('base64');

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      this.logError(options.method || 'GET', url, response.status, 'API Token request failed');
    } else {
      this.logSuccess(options.method || 'GET', url, response.status);
    }

    return response;
  }

  async isValid(): Promise<boolean> {
    try {
      const cookieStore = await cookies();
      const email = cookieStore.get('jira_api_email')?.value;
      const apiToken = cookieStore.get('jira_api_token')?.value;
      
      return !!(email && apiToken);
    } catch (error) {
      return false;
    }
  }

  async refresh(): Promise<boolean> {
    // API tokens don't typically need refresh, they're long-lived
    // We could implement a validation call here if needed
    return this.isValid();
  }
}

/**
 * Factory for creating Jira authentication strategies
 */
export class JiraAuthStrategyFactory {
  static async createStrategy(): Promise<BaseAuthStrategy> {
    const cookieStore = await cookies();
    const authMethod = cookieStore.get('jira_auth_method')?.value;

    switch (authMethod) {
      case 'oauth':
        return new JiraOAuthStrategy();
      case 'api_token':
        return new JiraApiTokenStrategy();
      default:
        throw new AuthenticationError(
          `Unknown Jira authentication method: ${authMethod}`,
          'JiraAuthStrategyFactory'
        );
    }
  }

  static async createAuthContext(): Promise<import('./auth-strategy').AuthContext> {
    const strategy = await this.createStrategy();
    const { AuthContext } = await import('./auth-strategy');
    return new AuthContext(strategy);
  }
} 