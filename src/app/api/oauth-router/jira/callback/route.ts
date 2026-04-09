import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { exchangeJiraOAuthCode } from '@/lib/jira-oauth';

const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || '';

export async function GET(req: NextRequest) {
  console.log('🚀 CENTRALIZED OAUTH CALLBACK: ===== STARTING CALLBACK PROCESS =====');
  console.log('🔍 CENTRALIZED OAUTH CALLBACK: Request URL:', req.url);
  console.log('🔍 CENTRALIZED OAUTH CALLBACK: Request headers:', Object.fromEntries(req.headers.entries()));
  
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  console.log('🔍 CENTRALIZED OAUTH CALLBACK: Received parameters:', {
    code: code ? 'present' : 'missing',
    state: state ? 'present' : 'missing',
    error: error || 'none',
    codeLength: code?.length || 0,
    stateLength: state?.length || 0
  });
  
  console.log('🔍 CENTRALIZED OAUTH CALLBACK: Full search params:', Object.fromEntries(searchParams.entries()));

  if (error) {
    console.error('❌ CENTRALIZED OAUTH CALLBACK: OAuth error received from Jira:', error);
    const errorUrl = `${NEXT_PUBLIC_APP_URL}/oauth-error?error=${encodeURIComponent(error)}`;
    console.log('🔄 CENTRALIZED OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
    return NextResponse.redirect(errorUrl);
  }

  if (!code || !state) {
    console.error('❌ CENTRALIZED OAUTH CALLBACK: Missing required parameters');
    console.error('❌ CENTRALIZED OAUTH CALLBACK: Code present:', !!code);
    console.error('❌ CENTRALIZED OAUTH CALLBACK: State present:', !!state);
    const errorUrl = `${NEXT_PUBLIC_APP_URL}/oauth-error?error=missing_parameters`;
    console.log('🔄 CENTRALIZED OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
    return NextResponse.redirect(errorUrl);
  }

  try {
    // Parse state to get tenant information
    console.log('🔄 CENTRALIZED OAUTH CALLBACK: Parsing state parameter...');
    let tenantInfo;
    try {
      tenantInfo = JSON.parse(state);
      console.log('🔍 CENTRALIZED OAUTH CALLBACK: Successfully parsed state:', tenantInfo);
    } catch (stateError) {
      console.error('❌ CENTRALIZED OAUTH CALLBACK: Failed to parse state parameter');
      console.error('❌ CENTRALIZED OAUTH CALLBACK: State value:', state);
      console.error('❌ CENTRALIZED OAUTH CALLBACK: Parse error:', stateError);
      const errorUrl = `${NEXT_PUBLIC_APP_URL}/oauth-error?error=invalid_state`;
      console.log('🔄 CENTRALIZED OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
      return NextResponse.redirect(errorUrl);
    }

    const { tenant, port, userId } = tenantInfo;
    console.log('🔍 CENTRALIZED OAUTH CALLBACK: Extracted tenant info:', { tenant, port, userId });
    
    if (!tenant || !port || !userId) {
      console.error('❌ CENTRALIZED OAUTH CALLBACK: Missing required fields in state');
      console.error('❌ CENTRALIZED OAUTH CALLBACK: Tenant present:', !!tenant);
      console.error('❌ CENTRALIZED OAUTH CALLBACK: Port present:', !!port);
      console.error('❌ CENTRALIZED OAUTH CALLBACK: UserId present:', !!userId);
      const errorUrl = `${NEXT_PUBLIC_APP_URL}/oauth-error?error=invalid_tenant_info`;
      console.log('🔄 CENTRALIZED OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
      return NextResponse.redirect(errorUrl);
    }

    console.log(`🔄 CENTRALIZED OAUTH CALLBACK: Processing for tenant ${tenant} on port ${port} for user ${userId}`);

    // Exchange the authorization code for access token
    console.log('🔄 CENTRALIZED OAUTH CALLBACK: Exchanging authorization code for access token...');
    const tokenData = await exchangeJiraOAuthCode(code, state);
    console.log('✅ CENTRALIZED OAUTH CALLBACK: Successfully exchanged code for token');
    console.log('🔍 CENTRALIZED OAUTH CALLBACK: Token data received:', {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type
    });

    // Fetch accessible resources to get cloudId
    console.log('🔄 CENTRALIZED OAUTH CALLBACK: Fetching accessible resources to get cloudId...');
    const { getJiraAccessibleResources } = await import('@/lib/jira-oauth');
    const accessibleResources = await getJiraAccessibleResources(tokenData.access_token);
    console.log('🔍 CENTRALIZED OAUTH CALLBACK: Accessible resources:', accessibleResources);
    
    // Extract cloudId from the first accessible resource
    const cloudId = accessibleResources?.[0]?.id;
    console.log('🔍 CENTRALIZED OAUTH CALLBACK: Extracted cloudId:', cloudId);
    
    if (!cloudId) {
      console.error('❌ CENTRALIZED OAUTH CALLBACK: No cloudId found in accessible resources');
      const errorUrl = `${NEXT_PUBLIC_APP_URL}/oauth-error?error=no_cloud_id`;
      console.log('🔄 CENTRALIZED OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
      return NextResponse.redirect(errorUrl);
    }

    // Store the integration data temporarily (you might want to use Redis or database)
    console.log('🔄 CENTRALIZED OAUTH CALLBACK: Preparing integration data...');
    const integrationData = {
      tenant,
      port,
      userId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      serverUrl: 'https://api.atlassian.com',
      metadata: {
        cloudId: cloudId,
        tenant: tenant
      }
    };
    console.log('🔍 CENTRALIZED OAUTH CALLBACK: Integration data prepared:', {
      tenant: integrationData.tenant,
      port: integrationData.port,
      userId: integrationData.userId,
      hasAccessToken: !!integrationData.accessToken,
      hasRefreshToken: !!integrationData.refreshToken,
      expiresAt: integrationData.expiresAt
    });

    // Forward the OAuth data to the specific tenant
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:9003';
    const tenantBaseUrl = baseUrl.replace(/:\d+.*/, `:${port}`);
    const tenantUrl = `${tenantBaseUrl}/${tenant}/api/oauth-callback/jira`;
    console.log(`🔄 CENTRALIZED OAUTH CALLBACK: Forwarding to tenant at ${tenantUrl}`);
    
           try {
             console.log('🔄 CENTRALIZED OAUTH CALLBACK: Making POST request to tenant...');
             
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

      console.log('🔍 CENTRALIZED OAUTH CALLBACK: Tenant response status:', response.status);
      console.log('🔍 CENTRALIZED OAUTH CALLBACK: Tenant response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ CENTRALIZED OAUTH CALLBACK: Tenant callback failed');
        console.error('❌ CENTRALIZED OAUTH CALLBACK: Status:', response.status);
        console.error('❌ CENTRALIZED OAUTH CALLBACK: Error response:', errorText);
        throw new Error(`Tenant callback failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const tenantResponse = await response.json();
      console.log('🔍 CENTRALIZED OAUTH CALLBACK: Tenant response data:', tenantResponse);
      console.log('✅ CENTRALIZED OAUTH CALLBACK: Successfully forwarded to tenant');
      
      // Redirect to the tenant's integrations page
      // Don't include tenant in path since the tenant application already has basePath configured
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:9003';
      const tenantBaseUrl = baseUrl.replace(/:\d+.*/, `:${port}`);
      const redirectUrl = `${tenantBaseUrl}/${tenant}/integrations`;
      console.log('🔄 CENTRALIZED OAUTH CALLBACK: Redirecting to tenant integrations page:', redirectUrl);
      console.log('🚀 CENTRALIZED OAUTH CALLBACK: ===== CALLBACK PROCESS COMPLETED =====');
      return NextResponse.redirect(redirectUrl);
      
    } catch (forwardError) {
      console.error('❌ CENTRALIZED OAUTH CALLBACK: ===== FORWARD ERROR OCCURRED =====');
      console.error('❌ CENTRALIZED OAUTH CALLBACK: Failed to forward to tenant:', forwardError);
      console.error('❌ CENTRALIZED OAUTH CALLBACK: Error message:', forwardError instanceof Error ? forwardError.message : 'Unknown error');
      console.error('❌ CENTRALIZED OAUTH CALLBACK: Error stack:', forwardError instanceof Error ? forwardError.stack : 'No stack trace');
      console.error('🚀 CENTRALIZED OAUTH CALLBACK: ===== FORWARD ERROR HANDLING COMPLETED =====');
      
      const errorUrl = `${NEXT_PUBLIC_APP_URL}/oauth-error?error=tenant_forward_failed&tenant=${tenant}&port=${port}`;
      console.log('🔄 CENTRALIZED OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
      return NextResponse.redirect(errorUrl);
    }

  } catch (error: any) {
    console.error('❌ Centralized Jira OAuth Callback: Error during callback process:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return NextResponse.redirect(`${NEXT_PUBLIC_APP_URL}/oauth-error?error=${encodeURIComponent(error.message || 'callback_failed')}`);
  }
}
