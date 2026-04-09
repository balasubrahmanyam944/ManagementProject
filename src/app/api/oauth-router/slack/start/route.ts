import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;

export async function GET(req: NextRequest) {
  console.log('🚀 MAIN SERVER SLACK OAUTH START: ===== STARTING OAUTH FLOW =====');
  console.log('🔍 MAIN SERVER SLACK OAUTH START: Request URL:', req.url);
  
  // Extract tenant information from query parameters (passed from tenant)
  const { searchParams } = new URL(req.url);
  const tenant = searchParams.get('tenant') || 'main';
  const port = searchParams.get('port') || '9003';
  const userId = searchParams.get('userId');
  
  // Validate required parameters
  if (!userId) {
    console.error('❌ MAIN SERVER SLACK OAUTH START: Missing userId parameter');
    return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
  }

  if (!SLACK_CLIENT_ID) {
    console.error('❌ MAIN SERVER SLACK OAUTH START: SLACK_CLIENT_ID not configured');
    return NextResponse.json({ error: 'Slack OAuth not configured' }, { status: 500 });
  }

  console.log('🔍 MAIN SERVER SLACK OAUTH START: Tenant info from params:', { tenant, port, userId });

  // Generate OAuth state with tenant information (Slack OAuth 2.0 supports state parameter)
  const stateObject = {
    tenant,
    port,
    userId,
    nonce: randomBytes(16).toString('hex'),
    timestamp: Date.now()
  };
  
  const state = JSON.stringify(stateObject);
  console.log('🔍 MAIN SERVER SLACK OAUTH START: Generated state:', stateObject);

  // Build Slack authorization URL with centralized callback
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:9003';
  const redirectUri = `${baseUrl}/api/oauth-router/slack/callback`;
  console.log('🔍 MAIN SERVER SLACK OAUTH START: Using redirect URI:', redirectUri);
  
  const authorizeUrl = new URL('https://slack.com/oauth/v2/authorize');
  
  authorizeUrl.searchParams.set('client_id', SLACK_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);  // CRITICAL: Must match Slack app config
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('scope', [
    'app_mentions:read',
    'channels:read',
    'channels:join',
    'chat:write',
    'chat:write.public',
    'incoming-webhook',
    'team:read',
    'channels:history',
    'groups:history',
  ].join(','));
  authorizeUrl.searchParams.set('user_scope', [
    'channels:history',
    'groups:history',
    'channels:read',
    'groups:read',
    'users:read',
  ].join(','));

  console.log('🔄 MAIN SERVER SLACK OAUTH START: Redirecting to Slack authorization URL:', authorizeUrl.toString());
  console.log('🚀 MAIN SERVER SLACK OAUTH START: ===== OAUTH FLOW INITIATED =====');

  return NextResponse.redirect(authorizeUrl.toString());
}

