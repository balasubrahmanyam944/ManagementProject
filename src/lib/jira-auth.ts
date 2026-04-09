import { cookies } from 'next/headers';
import { ErrorHandler, AuthenticationError } from './errors/error-handler';
import { logger } from './utils/logger';

export async function fetchWithJiraAuth(url: string, options: RequestInit = {}) {
  const cookieStore = await cookies();
  const authMethod = cookieStore.get('jira_auth_method')?.value;

  if (authMethod === 'oauth') {
    return fetchWithJiraOAuth(url, options);
  } else if (authMethod === 'api_token') {
    return fetchWithJiraApiToken(url, options);
  } else {
    // For OAuth integrations, we should use the OAuth method directly
    // since the cookie-based approach is deprecated
    return fetchWithJiraOAuth(url, options);
  }
}

async function fetchWithJiraOAuth(url: string, options: RequestInit = {}) {
  const context = 'fetchWithJiraOAuth';
  logger.apiRequest('GET', url, context);

  try {
    // Import the database and JiraService here to avoid circular dependencies
    const { db } = await import('./db/database');
    const { getServerSession } = await import('next-auth');
    const { authConfig } = await import('./auth/config');
    
    // Get the current user session
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      throw new AuthenticationError('No authenticated user found', context);
    }

    // Get the user's Jira integration from database
    const integrations = await db.findIntegrationsByUserId(session.user.id);
    const jiraIntegration = integrations.find((integration: any) => integration.type === 'JIRA');
    
    if (!jiraIntegration || jiraIntegration.status !== 'CONNECTED') {
      throw new AuthenticationError('Jira integration not connected', context);
    }

    // Get valid access token (handles refresh if needed)
    const { JiraService } = await import('./integrations/jira-service');
    const jiraService = new JiraService();
    const accessToken = await jiraService.getValidAccessToken(jiraIntegration);
    
    const cloudId = jiraIntegration.metadata?.cloudId;
    if (!cloudId) {
      throw new AuthenticationError('No cloud ID found in integration metadata', context);
    }

    // Convert traditional Jira URL to OAuth API format
    let finalUrl = url;
    if (!url.includes('api.atlassian.com')) {
      // URL is a traditional Jira instance URL, convert to OAuth API format
      const urlPath = url.replace(/^https?:\/\/[^\/]+/, '');
      finalUrl = `https://api.atlassian.com/ex/jira/${cloudId}${urlPath}`;
    } else if (!url.includes(`/ex/jira/${cloudId}`)) {
      // URL is already api.atlassian.com but doesn't have the cloud ID prefix
      const urlPath = url.replace('https://api.atlassian.com', '');
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
      logger.apiError('GET', finalUrl, response.status, 'OAuth request failed', context);
    } else {
      logger.apiSuccess('GET', finalUrl, response.status, context);
    }

    return response;
  } catch (error: any) {
    logger.apiError('GET', url, 500, error.message, context);
    throw new AuthenticationError(error.message, context);
  }
}

async function fetchWithJiraApiToken(url: string, options: RequestInit = {}) {
  const context = 'fetchWithJiraApiToken';
  logger.apiRequest('GET', url, context);

  const cookieStore = await cookies();
  const email = cookieStore.get('jira_api_email')?.value;
  const apiToken = cookieStore.get('jira_api_token')?.value;

  if (!email || !apiToken) {
    throw new AuthenticationError('Jira API Token credentials not found', context);
  }

  const basicAuth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  logger.debug(`Using Basic Auth with email: ${email.substring(0, 3)}...`, undefined, context);

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Basic ${basicAuth}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    logger.apiError('GET', url, response.status, 'API Token request failed', context);
  } else {
    logger.apiSuccess('GET', url, response.status, context);
  }

  return response;
}
