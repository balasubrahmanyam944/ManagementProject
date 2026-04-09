import { cookies } from 'next/headers';
import { fetchWithJiraApiToken } from './jira-api-token';

export const JIRA_OAUTH_CLIENT_ID = process.env.JIRA_OAUTH_CLIENT_ID;
export const JIRA_OAUTH_CLIENT_SECRET = process.env.JIRA_OAUTH_CLIENT_SECRET;
export const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

// Jira OAuth 2.0 endpoints
const JIRA_OAUTH_BASE = 'https://auth.atlassian.com';
const JIRA_API_BASE = 'https://api.atlassian.com';

// Helper to generate OAuth state with tenant information
export function generateJiraOAuthState(tenant: string, port: number, userId: string): string {
  console.log('🔄 JIRA OAUTH STATE: Generating OAuth state...');
  console.log('🔍 JIRA OAUTH STATE: Input parameters:', { tenant, port, userId });
  
  const state = {
    tenant,
    port,
    userId,
    nonce: Math.random().toString(36).substring(2, 15),
    timestamp: Date.now()
  };
  
  const stateString = JSON.stringify(state);
  console.log('🔍 JIRA OAUTH STATE: Generated state object:', state);
  console.log('🔍 JIRA OAUTH STATE: Generated state string:', stateString);
  console.log('✅ JIRA OAUTH STATE: State generation completed');
  
  return stateString;
}

// Helper to generate the Jira OAuth authorization URL
export function getJiraOAuthAuthorizeUrl(state: string) {
  console.log('🔄 JIRA OAUTH URL: Generating authorization URL...');
  console.log('🔍 JIRA OAUTH URL: Input state:', state);
  console.log('🔍 JIRA OAUTH URL: Environment variables:', {
    JIRA_OAUTH_CLIENT_ID: JIRA_OAUTH_CLIENT_ID ? 'SET' : 'NOT SET',
    NEXT_PUBLIC_APP_URL: NEXT_PUBLIC_APP_URL || 'NOT SET',
    JIRA_OAUTH_BASE: JIRA_OAUTH_BASE
  });
  
  // Use the main application URL for the centralized OAuth callback
  // Remove tenant path and ensure we use port 9003
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:9003';
  const mainAppUrl = baseUrl.replace(/:\d+.*/, ':9003');
  const redirectUri = `${mainAppUrl}/api/oauth-router/jira/callback`;
  console.log('🔍 JIRA OAUTH URL: Original URL:', baseUrl);
  console.log('🔍 JIRA OAUTH URL: Main app URL:', mainAppUrl);
  console.log('🔍 JIRA OAUTH URL: Redirect URI:', redirectUri);
  
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: JIRA_OAUTH_CLIENT_ID || '',
    scope: 'read:jira-work write:jira-work manage:jira-project read:jira-user offline_access',
    redirect_uri: redirectUri,
    state: state,
    response_type: 'code',
    prompt: 'consent',
    // Force consent to ensure user sees all permission requests
    consent: 'true'
  });

  const authUrl = `${JIRA_OAUTH_BASE}/authorize?${params.toString()}`;
  console.log('🔍 JIRA OAUTH URL: Generated parameters:', Object.fromEntries(params.entries()));
  console.log('🔍 JIRA OAUTH URL: Final authorization URL:', authUrl);
  console.log('✅ JIRA OAUTH URL: Authorization URL generation completed');
  
  return authUrl;
}

// Helper to exchange authorization code for access token
export async function exchangeJiraOAuthCode(code: string, state: string) {
  console.log('🔄 JIRA TOKEN EXCHANGE: Starting token exchange...');
  console.log('🔍 JIRA TOKEN EXCHANGE: Input parameters:', {
    code: code ? 'PRESENT' : 'MISSING',
    state: state ? 'PRESENT' : 'MISSING',
    codeLength: code?.length || 0
  });
  
  const tokenUrl = `${JIRA_OAUTH_BASE}/oauth/token`;
  console.log('🔍 JIRA TOKEN EXCHANGE: Token URL:', tokenUrl);
  
  // Use the main application URL for the centralized OAuth callback
  // Remove tenant path and ensure we use port 9003
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:9003';
  const mainAppUrl = baseUrl.replace(/:\d+.*/, ':9003');
  const redirectUri = `${mainAppUrl}/api/oauth-router/jira/callback`;
  console.log('🔍 JIRA TOKEN EXCHANGE: Original URL:', baseUrl);
  console.log('🔍 JIRA TOKEN EXCHANGE: Main app URL:', mainAppUrl);
  console.log('🔍 JIRA TOKEN EXCHANGE: Redirect URI:', redirectUri);
  console.log('🔍 JIRA TOKEN EXCHANGE: Environment variables:', {
    JIRA_OAUTH_CLIENT_ID: JIRA_OAUTH_CLIENT_ID ? 'SET' : 'NOT SET',
    JIRA_OAUTH_CLIENT_SECRET: JIRA_OAUTH_CLIENT_SECRET ? 'SET' : 'NOT SET',
    NEXT_PUBLIC_APP_URL: NEXT_PUBLIC_APP_URL || 'NOT SET'
  });

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: JIRA_OAUTH_CLIENT_ID || '',
    client_secret: JIRA_OAUTH_CLIENT_SECRET || '',
    code: code,
    redirect_uri: redirectUri,
  });

  console.log('🔍 JIRA TOKEN EXCHANGE: Request body parameters:', Object.fromEntries(body.entries()));

  console.log('🔄 JIRA TOKEN EXCHANGE: Making request to Jira token endpoint...');
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  console.log('🔍 JIRA TOKEN EXCHANGE: Response status:', response.status);
  console.log('🔍 JIRA TOKEN EXCHANGE: Response headers:', Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ JIRA TOKEN EXCHANGE: Token exchange failed!');
    console.error('❌ JIRA TOKEN EXCHANGE: Status:', response.status);
    console.error('❌ JIRA TOKEN EXCHANGE: Error response:', errorText);
    throw new Error(`Failed to exchange Jira OAuth code: ${errorText}`);
  }

  const tokenData = await response.json();
  console.log('🔍 JIRA TOKEN EXCHANGE: Token response data:', {
    hasAccessToken: !!tokenData.access_token,
    hasRefreshToken: !!tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
    tokenType: tokenData.token_type,
    scope: tokenData.scope
  });
  console.log('✅ JIRA TOKEN EXCHANGE: Token exchange completed successfully');
  
  return tokenData;
}

// Helper to get accessible resources (Jira instances)
export async function getJiraAccessibleResources(accessToken: string) {
  const response = await fetch(`${JIRA_API_BASE}/oauth/token/accessible-resources`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Jira accessible resources error:', response.status, errorText);
    throw new Error(`Failed to get Jira accessible resources: ${errorText}`);
  }

  return await response.json();
}

// Helper to make authenticated requests to Jira using OAuth token or API token
export async function fetchWithJiraOAuth(url: string, options: RequestInit = {}) {
  const cookieStore = await cookies();
  const jiraAuthMethod = cookieStore.get('jira_auth_method')?.value;

  // If using API token method, delegate to API token function
  if (jiraAuthMethod === 'api_token') {
    return fetchWithJiraApiToken(url, options);
  }

  // OAuth method - use database-driven approach
  // Import the database and JiraService here to avoid circular dependencies
  const { db } = await import('./db/database');
  const { getServerSession } = await import('next-auth');
  const { authConfig } = await import('./auth/config');
  
  // Get the current user session
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    throw new Error('No authenticated user found');
  }

  // Get the user's Jira integration from database
  const integrations = await db.findIntegrationsByUserId(session.user.id);
  const jiraIntegration = integrations.find((integration: any) => integration.type === 'JIRA');
  
  if (!jiraIntegration || jiraIntegration.status !== 'CONNECTED') {
    throw new Error('Jira integration not connected');
  }

  // Get valid access token (handles refresh if needed)
  const { JiraService } = await import('./integrations/jira-service');
  const jiraService = new JiraService();
  const accessToken = await jiraService.getValidAccessToken(jiraIntegration);
  
  const cloudId = jiraIntegration.metadata?.cloudId;
  if (!cloudId) {
    throw new Error('No cloud ID found in integration metadata');
  }

  // If the URL doesn't include the cloud ID, add it
  let finalUrl = url;
  if (!url.includes('.atlassian.net')) {
    // Convert API URL to use cloud ID format
    if (url.includes('/rest/api/')) {
      finalUrl = `${JIRA_API_BASE}/ex/jira/${cloudId}${url.replace(/.*\/rest\/api\//, '/rest/api/')}`;
    }
  }

  console.log('fetchWithJiraOAuth: Making request to:', finalUrl);

  return fetch(finalUrl, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

export async function refreshJiraAccessToken(refreshToken: string) {
  const tokenUrl = 'https://auth.atlassian.com/oauth/token';
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: JIRA_OAUTH_CLIENT_ID || '',
    client_secret: JIRA_OAUTH_CLIENT_SECRET || '',
    refresh_token: refreshToken,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Jira access token: ${errorText}`);
  }

  return await response.json(); // { access_token, expires_in, ... }
}

// Helper to check if the connected user has the required permissions
export async function checkJiraPermissions(accessToken: string, cloudId: string, projectKey: string) {
  try {
    // Check if user can create issues in the project
    const permissionsUrl = `${JIRA_API_BASE}/ex/jira/${cloudId}/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=CREATE_ISSUES`;
    
    const response = await fetch(permissionsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Permission check failed:', response.status, await response.text());
      return false;
    }

    const permissions = await response.json();
    console.log('Jira permissions check result:', permissions);
    
    // Check if CREATE_ISSUES permission is granted
    const createIssuesPermission = permissions.permissions?.CREATE_ISSUES;
    return createIssuesPermission?.havePermission === true;
  } catch (error) {
    console.error('Error checking Jira permissions:', error);
    return false;
  }
} 