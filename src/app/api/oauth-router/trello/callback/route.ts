import { NextRequest, NextResponse } from 'next/server';
import { exchangeTrelloOAuthToken, parseTrelloOAuthState } from '@/lib/trello-auth';

const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || '';

export async function GET(req: NextRequest) {
  console.log('🚀 CENTRALIZED TRELLO OAUTH CALLBACK: ===== STARTING CALLBACK PROCESS =====');
  console.log('🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Request URL:', req.url);
  console.log('🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Request headers:', Object.fromEntries(req.headers.entries()));
  
  const { searchParams } = new URL(req.url);
  const oauth_token = searchParams.get('oauth_token');
  const oauth_verifier = searchParams.get('oauth_verifier');
  const error = searchParams.get('error');

  console.log('🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Received parameters:', {
    oauth_token: oauth_token ? 'present' : 'missing',
    oauth_verifier: oauth_verifier ? 'present' : 'missing',
    error: error || 'none'
  });
  
  console.log('🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Full search params:', Object.fromEntries(searchParams.entries()));

  if (error) {
    console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: OAuth error received from Trello:', error);
    const errorUrl = `${NEXT_PUBLIC_APP_URL}/oauth-error?error=${encodeURIComponent(error)}`;
    console.log('🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
    return NextResponse.redirect(errorUrl);
  }

  if (!oauth_token || !oauth_verifier) {
    console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: Missing required parameters');
    console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: oauth_token present:', !!oauth_token);
    console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: oauth_verifier present:', !!oauth_verifier);
    const errorUrl = `${NEXT_PUBLIC_APP_URL}/oauth-error?error=missing_parameters`;
    console.log('🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
    return NextResponse.redirect(errorUrl);
  }

  try {
    // Parse state from oauth_token to get tenant information
    // For Trello OAuth 1.0a, we need to retrieve the state from the stored request token
    console.log('🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Parsing state from stored request token...');
    let tenantInfo;
    try {
      tenantInfo = await parseTrelloOAuthState(oauth_token);
      console.log('🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Successfully parsed tenant info:', tenantInfo);
    } catch (stateError) {
      console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: Failed to parse tenant info from oauth_token');
      console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: oauth_token value:', oauth_token);
      console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: Parse error:', stateError);
      const errorUrl = `${NEXT_PUBLIC_APP_URL}/oauth-error?error=invalid_state`;
      console.log('🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
      return NextResponse.redirect(errorUrl);
    }

    const { tenant, port, userId, requestTokenSecret } = tenantInfo;
    console.log('🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Extracted tenant info:', { tenant, port, userId });
    
    if (!tenant || !port || !userId || !requestTokenSecret) {
      console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: Missing required fields in tenant info');
      console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: Tenant present:', !!tenant);
      console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: Port present:', !!port);
      console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: UserId present:', !!userId);
      console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: RequestTokenSecret present:', !!requestTokenSecret);
      const errorUrl = `${NEXT_PUBLIC_APP_URL}/oauth-error?error=invalid_tenant_info`;
      console.log('🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
      return NextResponse.redirect(errorUrl);
    }

    console.log(`🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Processing for tenant ${tenant} on port ${port} for user ${userId}`);

    // Exchange the OAuth token and verifier for access token
    console.log('🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Exchanging OAuth token for access token...');
    const tokenResponse = await exchangeTrelloOAuthToken(oauth_token, oauth_verifier, requestTokenSecret);
    console.log('✅ CENTRALIZED TRELLO OAUTH CALLBACK: Successfully exchanged token');
    
    // Parse the token response
    const params = new URLSearchParams(tokenResponse);
    const access_token = params.get('oauth_token');
    const access_token_secret = params.get('oauth_token_secret');
    
    console.log('🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Token data received:', {
      hasAccessToken: !!access_token,
      hasAccessTokenSecret: !!access_token_secret
    });

    if (!access_token || !access_token_secret) {
      console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: Missing access token or secret in response');
      const errorUrl = `${NEXT_PUBLIC_APP_URL}/oauth-error?error=no_access_token`;
      console.log('🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
      return NextResponse.redirect(errorUrl);
    }

    // Prepare integration data for the tenant
    console.log('🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Preparing integration data...');
    const integrationData = {
      tenant,
      port,
      userId,
      accessToken: access_token,
      accessTokenSecret: access_token_secret,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year (Trello tokens don't expire)
      serverUrl: 'https://api.trello.com',
      consumerKey: process.env.TRELLO_API_KEY || '',
      metadata: {
        oauthToken: oauth_token,
        scopes: 'read,write,account',
        tenant: tenant
      }
    };
    console.log('🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Integration data prepared:', {
      tenant: integrationData.tenant,
      port: integrationData.port,
      userId: integrationData.userId,
      hasAccessToken: !!integrationData.accessToken,
      hasAccessTokenSecret: !!integrationData.accessTokenSecret,
      expiresAt: integrationData.expiresAt
    });

    // Forward the OAuth data to the specific tenant
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:9003';
    const tenantBaseUrl = baseUrl.replace(/:\d+.*/, `:${port}`);
    const tenantUrl = `${tenantBaseUrl}/${tenant}/api/oauth-callback/trello`;
    console.log(`🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Forwarding to tenant at ${tenantUrl}`);
    
    try {
      console.log('🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Making POST request to tenant...');
      
      // Use node-fetch with custom agent to bypass SSL verification
      const https = await import('https');
      const fetch = (await import('node-fetch')).default;
      
      const agent = new https.Agent({
        rejectUnauthorized: false
      });
      
      const response = await fetch(tenantUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(integrationData),
        agent: agent
      });

      console.log('🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Tenant response status:', response.status);
      console.log('🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Tenant response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: Tenant callback failed');
        console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: Status:', response.status);
        console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: Error response:', errorText);
        throw new Error(`Tenant callback failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const tenantResponse = await response.json();
      console.log('🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Tenant response data:', tenantResponse);
      console.log('✅ CENTRALIZED TRELLO OAUTH CALLBACK: Successfully forwarded to tenant');
      
      // Redirect to the tenant's integrations page
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:9003';
      const tenantBaseUrl = baseUrl.replace(/:\d+.*/, `:${port}`);
      const redirectUrl = `${tenantBaseUrl}/${tenant}/integrations`;
      console.log('🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Redirecting to tenant integrations page:', redirectUrl);
      console.log('🚀 CENTRALIZED TRELLO OAUTH CALLBACK: ===== CALLBACK PROCESS COMPLETED =====');
      return NextResponse.redirect(redirectUrl);
      
    } catch (forwardError) {
      console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: ===== FORWARD ERROR OCCURRED =====');
      console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: Failed to forward to tenant:', forwardError);
      console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: Error message:', forwardError instanceof Error ? forwardError.message : 'Unknown error');
      console.error('❌ CENTRALIZED TRELLO OAUTH CALLBACK: Error stack:', forwardError instanceof Error ? forwardError.stack : 'No stack trace');
      console.error('🚀 CENTRALIZED TRELLO OAUTH CALLBACK: ===== FORWARD ERROR HANDLING COMPLETED =====');
      
      const errorUrl = `${NEXT_PUBLIC_APP_URL}/oauth-error?error=tenant_forward_failed&tenant=${tenant}&port=${port}`;
      console.log('🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
      return NextResponse.redirect(errorUrl);
    }

  } catch (error: any) {
    console.error('❌ Centralized Trello OAuth Callback: Error during callback process:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return NextResponse.redirect(`${NEXT_PUBLIC_APP_URL}/oauth-error?error=${encodeURIComponent(error.message || 'callback_failed')}`);
  }
}

