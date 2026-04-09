"use server";

import { cookies } from 'next/headers';
import { testJiraApiTokenConnection, storeJiraApiTokenCredentials, JiraApiTokenConfig } from '@/lib/jira-api-token';

export interface JiraApiTokenResponse {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Connect to Jira using API token
 */
export async function connectJiraApiTokenAction(
  email: string,
  apiToken: string,
  siteUrl: string
): Promise<JiraApiTokenResponse> {
  try {
    // Validate inputs
    if (!email || !apiToken || !siteUrl) {
      return {
        success: false,
        message: 'All fields are required',
        error: 'Please provide email, API token, and site URL'
      };
    }

    // Ensure site URL is properly formatted
    let formattedSiteUrl = siteUrl.trim();
    if (!formattedSiteUrl.startsWith('http')) {
      formattedSiteUrl = `https://${formattedSiteUrl}`;
    }
    if (formattedSiteUrl.endsWith('/')) {
      formattedSiteUrl = formattedSiteUrl.slice(0, -1);
    }

    const config: JiraApiTokenConfig = {
      email: email.trim(),
      apiToken: apiToken.trim(),
      siteUrl: formattedSiteUrl
    };

    // Test the connection
    console.log('Testing Jira API token connection...');
    const isValid = await testJiraApiTokenConnection(config);

    if (!isValid) {
      return {
        success: false,
        message: 'Failed to connect to Jira',
        error: 'Invalid credentials or site URL. Please check your email, API token, and site URL.'
      };
    }

    // Store the credentials
    await storeJiraApiTokenCredentials(config);

    return {
      success: true,
      message: 'Successfully connected to Jira using API token'
    };

  } catch (error: any) {
    console.error('Error connecting to Jira with API token:', error);
    return {
      success: false,
      message: 'Failed to connect to Jira',
      error: error.message || 'An unexpected error occurred'
    };
  }
}

/**
 * Disconnect from Jira
 */
export async function disconnectJiraAction(): Promise<JiraApiTokenResponse> {
  try {
    const cookieStore = await cookies();

    // Clear all Jira-related cookies
    cookieStore.delete('jira_api_email');
    cookieStore.delete('jira_api_token');
    cookieStore.delete('jira_site_url');
    cookieStore.delete('jira_auth_method');
    cookieStore.delete('jira_oauth_access_token');
    cookieStore.delete('jira_oauth_refresh_token');
    cookieStore.delete('jira_oauth_cloud_id');
    cookieStore.delete('jira_oauth_site_url');

    return {
      success: true,
      message: 'Successfully disconnected from Jira'
    };

  } catch (error: any) {
    console.error('Error disconnecting from Jira:', error);
    return {
      success: false,
      message: 'Failed to disconnect from Jira',
      error: error.message || 'An unexpected error occurred'
    };
  }
} 