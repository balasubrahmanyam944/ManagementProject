import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { getJiraOAuthAuthorizeUrl, generateJiraOAuthState } from '@/lib/jira-oauth';

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  const { tenant } = params;
  
  try {
    // Get the current session
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL(`/${tenant}/auth/signin?callbackUrl=/${tenant}/integrations`, req.url));
    }

    // Get the tenant port from the request
    const port = req.nextUrl.port || '9005'; // Default to 9005 if not specified
    const hostname = req.nextUrl.hostname;
    
    console.log(`🔄 Tenant Jira OAuth Start for tenant: ${tenant}, port: ${port}, hostname: ${hostname}`);

    // Generate OAuth state with tenant information
    const state = generateJiraOAuthState(tenant, parseInt(port), session.user.id);
    
    // Generate the Jira OAuth authorization URL
    const authUrl = getJiraOAuthAuthorizeUrl(state);
    
    console.log(`✅ Tenant Jira OAuth Start: Redirecting to Jira OAuth: ${authUrl}`);
    
    // Redirect to Jira OAuth
    return NextResponse.redirect(authUrl);
    
  } catch (error) {
    console.error(`❌ Tenant Jira OAuth Start Error for tenant ${tenant}:`, error);
    return NextResponse.redirect(new URL(`/${tenant}/integrations?jira_error=${encodeURIComponent('Failed to start Jira OAuth')}`, req.url));
  }
}