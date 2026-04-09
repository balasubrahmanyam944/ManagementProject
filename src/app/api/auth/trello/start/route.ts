import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';

export async function GET(req: NextRequest) {
  console.log('🚀 TENANT TRELLO OAUTH START: ===== STARTING OAUTH FLOW =====');
  console.log('🔍 TENANT TRELLO OAUTH START: Request URL:', req.url);
  
  // Get the current user session
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    console.error('❌ TENANT TRELLO OAUTH START: No authenticated user found');
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  console.log('🔍 TENANT TRELLO OAUTH START: Authenticated user:', session.user.id);

  // Extract tenant information from environment variables
  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
  const tenant = basePath.replace(/^\//, '') || 'main';
  
  // Get the tenant port from the request headers (external port that users see)
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const port = forwardedHost?.split(':')[1] || '9005';
  
  console.log('🔍 TENANT TRELLO OAUTH START: Request URL details:', {
    fullUrl: req.url,
    host: req.headers.get('host'),
    forwardedHost: req.headers.get('x-forwarded-host'),
    extractedPort: port
  });
  console.log('🔍 TENANT TRELLO OAUTH START: Tenant info:', { tenant, port, userId: session.user.id });

  // Make server-to-server API call to main server (user's browser never sees port 9003)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:9003';
  const mainAppUrl = baseUrl.replace(/:\d+.*/, ':9003');
  const mainServerUrl = `${mainAppUrl}/api/oauth-router/trello/start?tenant=${encodeURIComponent(tenant)}&port=${encodeURIComponent(port)}&userId=${encodeURIComponent(session.user.id)}`;
  console.log('🔄 TENANT TRELLO OAUTH START: Calling main server API:', mainServerUrl);
  
  try {
    // Use node-fetch with custom agent to bypass SSL verification
    const https = await import('https');
    const fetch = (await import('node-fetch')).default;
    
    const agent = new https.Agent({
      rejectUnauthorized: false
    });
    
    const response = await fetch(mainServerUrl, {
      method: 'GET',
      agent: agent,
      redirect: 'manual' // Don't follow redirects, we want the Trello URL
    });

    console.log('🔍 TENANT TRELLO OAUTH START: Main server response status:', response.status);

    if (response.status === 302 || response.status === 307) {
      // Main server returned a redirect to Trello
      const trelloAuthUrl = response.headers.get('location');
      console.log('🔄 TENANT TRELLO OAUTH START: Got Trello auth URL from main server:', trelloAuthUrl);
      
      if (trelloAuthUrl) {
        console.log('✅ TENANT TRELLO OAUTH START: Redirecting user to Trello (user never sees port 9003)');
        console.log('🚀 TENANT TRELLO OAUTH START: ===== OAUTH FLOW INITIATED =====');
        return NextResponse.redirect(trelloAuthUrl);
      }
    }

    // If not a redirect, something went wrong
    const errorText = await response.text();
    console.error('❌ TENANT TRELLO OAUTH START: Unexpected response from main server');
    console.error('❌ TENANT TRELLO OAUTH START: Status:', response.status);
    console.error('❌ TENANT TRELLO OAUTH START: Body:', errorText);
    
    return NextResponse.json({ 
      error: 'Failed to initiate OAuth flow',
      details: errorText
    }, { status: 500 });

  } catch (error) {
    console.error('❌ TENANT TRELLO OAUTH START: Error calling main server:', error);
    return NextResponse.json({ 
      error: 'Failed to contact main server',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 