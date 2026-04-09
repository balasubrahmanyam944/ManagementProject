import { NextRequest, NextResponse } from 'next/server';

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || '';

export async function GET(req: NextRequest) {
  console.log('🚀 CENTRALIZED SLACK OAUTH CALLBACK: ===== STARTING CALLBACK PROCESS =====');
  console.log('🔍 CENTRALIZED SLACK OAUTH CALLBACK: Request URL:', req.url);
  console.log('🔍 CENTRALIZED SLACK OAUTH CALLBACK: Request headers:', Object.fromEntries(req.headers.entries()));
  
  // Get base URL once at the top of the function
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:9003';
  
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  console.log('🔍 CENTRALIZED SLACK OAUTH CALLBACK: Received parameters:', {
    code: code ? 'present' : 'missing',
    state: state ? 'present' : 'missing',
    error: error || 'none'
  });
  
  console.log('🔍 CENTRALIZED SLACK OAUTH CALLBACK: Full search params:', Object.fromEntries(searchParams.entries()));

  if (error) {
    console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: OAuth error received from Slack:', error);
    const errorUrl = `${baseUrl}/oauth-error?error=${encodeURIComponent(error)}`;
    console.log('🔄 CENTRALIZED SLACK OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
    return NextResponse.redirect(errorUrl);
  }

  if (!code || !state) {
    console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Missing required parameters');
    console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Code present:', !!code);
    console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: State present:', !!state);
    const errorUrl = `${baseUrl}/oauth-error?error=missing_parameters`;
    console.log('🔄 CENTRALIZED SLACK OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
    return NextResponse.redirect(errorUrl);
  }

  try {
    // Parse state to get tenant information
    console.log('🔄 CENTRALIZED SLACK OAUTH CALLBACK: Parsing state parameter...');
    let tenantInfo;
    try {
      tenantInfo = JSON.parse(state);
      console.log('🔍 CENTRALIZED SLACK OAUTH CALLBACK: Successfully parsed state:', tenantInfo);
    } catch (stateError) {
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Failed to parse state parameter');
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: State value:', state);
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Parse error:', stateError);
      const errorUrl = `${baseUrl}/oauth-error?error=invalid_state`;
      console.log('🔄 CENTRALIZED SLACK OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
      return NextResponse.redirect(errorUrl);
    }

    const { tenant, port, userId } = tenantInfo;
    console.log('🔍 CENTRALIZED SLACK OAUTH CALLBACK: Extracted tenant info:', { tenant, port, userId });
    
    if (!tenant || !port || !userId) {
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Missing required fields in state');
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Tenant present:', !!tenant);
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Port present:', !!port);
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: UserId present:', !!userId);
      const errorUrl = `${baseUrl}/oauth-error?error=invalid_tenant_info`;
      console.log('🔄 CENTRALIZED SLACK OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
      return NextResponse.redirect(errorUrl);
    }

    console.log(`🔄 CENTRALIZED SLACK OAUTH CALLBACK: Processing for tenant ${tenant} on port ${port} for user ${userId}`);

    if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Slack OAuth not configured');
      const errorUrl = `${baseUrl}/oauth-error?error=slack_not_configured`;
      return NextResponse.redirect(errorUrl);
    }

    // Exchange the authorization code for access token
    console.log('🔄 CENTRALIZED SLACK OAUTH CALLBACK: Exchanging authorization code for access token...');
    const redirectUri = `${baseUrl}/api/oauth-router/slack/callback`;
    
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Token exchange failed');
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Status:', tokenResponse.status);
      throw new Error('Slack token exchange failed');
    }

    const tokenData = await tokenResponse.json();
    console.log('✅ CENTRALIZED SLACK OAUTH CALLBACK: Successfully exchanged code for token');
    console.log('🔍 CENTRALIZED SLACK OAUTH CALLBACK: Token data received:', {
      ok: tokenData.ok,
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      teamId: tokenData.team?.id,
      teamName: tokenData.team?.name
    });

    if (!tokenData.ok) {
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Slack API returned error');
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Error:', tokenData.error);
      throw new Error(tokenData.error || 'Slack OAuth error');
    }

    // Prepare integration data for the tenant
    console.log('🔄 CENTRALIZED SLACK OAUTH CALLBACK: Preparing integration data...');
    const expiresAt = tokenData.expires_in 
      ? new Date(Date.now() + tokenData.expires_in * 1000) 
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default 1 year

    const integrationData = {
      tenant,
      port,
      userId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt,
      teamId: tokenData.team?.id,
      teamName: tokenData.team?.name,
      webhookUrl: tokenData.incoming_webhook?.url,
      metadata: {
        scope: tokenData.scope,
        authed_user: tokenData.authed_user,
        tenant: tenant
      }
    };
    
    console.log('🔍 CENTRALIZED SLACK OAUTH CALLBACK: Integration data prepared:', {
      tenant: integrationData.tenant,
      port: integrationData.port,
      userId: integrationData.userId,
      hasAccessToken: !!integrationData.accessToken,
      hasRefreshToken: !!integrationData.refreshToken,
      expiresAt: integrationData.expiresAt,
      teamName: integrationData.teamName
    });

    // Forward the OAuth data to the specific tenant
    const tenantBaseUrl = baseUrl.replace(/:\d+.*/, `:${port}`);
    const tenantUrl = `${tenantBaseUrl}/${tenant}/api/oauth-callback/slack`;
    console.log(`🔄 CENTRALIZED SLACK OAUTH CALLBACK: Forwarding to tenant at ${tenantUrl}`);
    
    try {
      console.log('🔄 CENTRALIZED SLACK OAUTH CALLBACK: Making POST request to tenant...');
      
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

      console.log('🔍 CENTRALIZED SLACK OAUTH CALLBACK: Tenant response status:', response.status);
      console.log('🔍 CENTRALIZED SLACK OAUTH CALLBACK: Tenant response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Tenant callback failed');
        console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Status:', response.status);
        console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Error response:', errorText);
        throw new Error(`Tenant callback failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const tenantResponse = await response.json();
      console.log('🔍 CENTRALIZED SLACK OAUTH CALLBACK: Tenant response data:', tenantResponse);
      console.log('✅ CENTRALIZED SLACK OAUTH CALLBACK: Successfully forwarded to tenant');
      
      // Redirect to the tenant's integrations page
      const redirectUrl = `${tenantBaseUrl}/${tenant}/integrations?slack=connected`;
      console.log('🔄 CENTRALIZED SLACK OAUTH CALLBACK: Redirecting to tenant integrations page:', redirectUrl);
      console.log('🚀 CENTRALIZED SLACK OAUTH CALLBACK: ===== CALLBACK PROCESS COMPLETED =====');
      return NextResponse.redirect(redirectUrl);
      
    } catch (forwardError) {
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: ===== FORWARD ERROR OCCURRED =====');
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Failed to forward to tenant:', forwardError);
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Error message:', forwardError instanceof Error ? forwardError.message : 'Unknown error');
      console.error('❌ CENTRALIZED SLACK OAUTH CALLBACK: Error stack:', forwardError instanceof Error ? forwardError.stack : 'No stack trace');
      console.error('🚀 CENTRALIZED SLACK OAUTH CALLBACK: ===== FORWARD ERROR HANDLING COMPLETED =====');
      
      const errorUrl = `${baseUrl}/oauth-error?error=tenant_forward_failed&tenant=${tenant}&port=${port}`;
      console.log('🔄 CENTRALIZED SLACK OAUTH CALLBACK: Redirecting to error URL:', errorUrl);
      return NextResponse.redirect(errorUrl);
    }

  } catch (error: any) {
    console.error('❌ Centralized Slack OAuth Callback: Error during callback process:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return NextResponse.redirect(`${baseUrl}/oauth-error?error=${encodeURIComponent(error.message || 'callback_failed')}`);
  }
}

