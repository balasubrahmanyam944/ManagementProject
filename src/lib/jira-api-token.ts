import { cookies } from 'next/headers';

export interface JiraApiTokenConfig {
  email: string;
  apiToken: string;
  siteUrl: string;
}

/**
 * Helper to make authenticated requests to Jira using API token
 */
export async function fetchWithJiraApiToken(url: string, options: RequestInit = {}) {
  const cookieStore = await cookies();
  const jiraEmail = cookieStore.get('jira_api_email')?.value;
  const jiraApiToken = cookieStore.get('jira_api_token')?.value;
  const jiraSiteUrl = cookieStore.get('jira_site_url')?.value;

  if (!jiraEmail || !jiraApiToken || !jiraSiteUrl) {
    throw new Error('Jira API token credentials not found');
  }

  // Create basic auth header
  const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');

  // Ensure URL is absolute
  let finalUrl = url;
  if (!url.startsWith('http')) {
    finalUrl = `${jiraSiteUrl}${url}`;
  }

  console.log('fetchWithJiraApiToken: Making request to:', finalUrl);

  return fetch(finalUrl, {
    ...options,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * Test Jira API token connection
 */
export async function testJiraApiTokenConnection(config: JiraApiTokenConfig): Promise<boolean> {
  try {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    
    const response = await fetch(`${config.siteUrl}/rest/api/3/myself`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Jira API token test failed:', error);
    return false;
  }
}

/**
 * Store Jira API token credentials
 */
export async function storeJiraApiTokenCredentials(config: JiraApiTokenConfig) {
  const cookieStore = await cookies();
  
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    path: '/',
    sameSite: 'lax' as const,
    maxAge: 365 * 24 * 60 * 60, // 1 year
  };

  cookieStore.set('jira_api_email', config.email, cookieOptions);
  cookieStore.set('jira_api_token', config.apiToken, cookieOptions);
  cookieStore.set('jira_site_url', config.siteUrl, cookieOptions);
  cookieStore.set('jira_auth_method', 'api_token', cookieOptions);

  // Clear OAuth cookies if they exist
  cookieStore.delete('jira_oauth_access_token');
  cookieStore.delete('jira_oauth_refresh_token');
  cookieStore.delete('jira_oauth_cloud_id');
  cookieStore.delete('jira_oauth_site_url');
} 