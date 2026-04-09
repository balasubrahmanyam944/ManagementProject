import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { getJiraOAuthAuthorizeUrl, generateJiraOAuthState } from '@/lib/jira-oauth';

export async function GET(req: NextRequest) {
  console.log('🚀 JIRA OAUTH START: ===== STARTING OAUTH FLOW =====');
  console.log('🔍 JIRA OAUTH START: Request URL:', req.url);
  console.log('🔍 JIRA OAUTH START: Request headers:', Object.fromEntries(req.headers.entries()));
  
  try {
    // Get the current session
    console.log('🔄 JIRA OAUTH START: Getting server session...');
    const session = await getServerSession(authConfig);
    console.log('🔍 JIRA OAUTH START: Session data:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      userId: session?.user?.id,
      userEmail: session?.user?.email,
      userName: session?.user?.name
    });
    
    if (!session?.user?.id) {
      console.log('❌ JIRA OAUTH START: No valid session found, redirecting to signin');
      const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
      const redirectUrl = `${basePath}/auth/signin?callbackUrl=${basePath}/integrations`;
      console.log('🔄 JIRA OAUTH START: Redirecting to:', redirectUrl);
      return NextResponse.redirect(new URL(redirectUrl, req.url));
    }

    // Get the tenant from the basePath environment variable
    const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
    const tenant = basePath.replace(/^\//, '');
    
    // Get the tenant port from the request headers (external port)
    const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const port = forwardedHost?.split(':')[1] || '9005';
    console.log('🔍 JIRA OAUTH START: Request URL details:', {
      fullUrl: req.url,
      host: req.headers.get('host'),
      forwardedHost: req.headers.get('x-forwarded-host'),
      extractedPort: port
    });
    
    console.log('🔍 JIRA OAUTH START: Environment variables:', {
      basePath,
      tenant,
      port,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      JIRA_OAUTH_CLIENT_ID: process.env.JIRA_OAUTH_CLIENT_ID ? 'SET' : 'NOT SET'
    });
    
    console.log(`🔄 JIRA OAUTH START: Processing for tenant: ${tenant}, port: ${port}, userId: ${session.user.id}`);

    // Generate OAuth state with tenant information
    console.log('🔄 JIRA OAUTH START: Generating OAuth state...');
    const state = generateJiraOAuthState(tenant, parseInt(port), session.user.id);
    console.log('🔍 JIRA OAUTH START: Generated state:', state);
    
    // Generate the Jira OAuth authorization URL
    console.log('🔄 JIRA OAUTH START: Generating Jira OAuth authorization URL...');
    const authUrl = getJiraOAuthAuthorizeUrl(state);
    console.log('🔍 JIRA OAUTH START: Generated auth URL:', authUrl);
    
    console.log(`✅ JIRA OAUTH START: Successfully prepared OAuth flow - redirecting to Jira`);
    console.log('🚀 JIRA OAUTH START: ===== OAUTH START COMPLETED =====');
    
    // Redirect to Jira OAuth
    return NextResponse.redirect(authUrl);
    
  } catch (error) {
    console.error('❌ JIRA OAUTH START: ===== ERROR OCCURRED =====');
    console.error('❌ JIRA OAUTH START: Error details:', error);
    console.error('❌ JIRA OAUTH START: Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('❌ JIRA OAUTH START: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('🚀 JIRA OAUTH START: ===== ERROR HANDLING COMPLETED =====');
    
    const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
    const errorUrl = `${basePath}/integrations?jira_error=${encodeURIComponent('Failed to start Jira OAuth')}`;
    console.log('🔄 JIRA OAUTH START: Redirecting to error URL:', errorUrl);
    return NextResponse.redirect(new URL(errorUrl, req.url));
  }
}
