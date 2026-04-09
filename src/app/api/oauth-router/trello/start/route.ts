import { NextRequest, NextResponse } from 'next/server';
import { getTrelloOAuthRequestTokenUrl, getTrelloOAuthAuthorizeUrl, storeTrelloOAuthState, TRELLO_API_KEY, TRELLO_API_SECRET } from '@/lib/trello-auth';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  console.log('🚀 MAIN SERVER TRELLO OAUTH START: ===== STARTING OAUTH FLOW =====');
  console.log('🔍 MAIN SERVER TRELLO OAUTH START: Request URL:', req.url);
  
  // Extract tenant information from query parameters (passed from tenant)
  const { searchParams } = new URL(req.url);
  const tenant = searchParams.get('tenant') || 'main';
  const port = searchParams.get('port') || '9003';
  const userId = searchParams.get('userId');
  
  // Validate required parameters
  if (!userId) {
    console.error('❌ MAIN SERVER TRELLO OAUTH START: Missing userId parameter');
    return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
  }

  console.log('🔍 MAIN SERVER TRELLO OAUTH START: Tenant info from params:', { tenant, port, userId });

  // Step 1: Get request token from Trello
  console.log('🔄 MAIN SERVER TRELLO OAUTH START: Getting request token from Trello...');
  const requestTokenUrl = getTrelloOAuthRequestTokenUrl();
  console.log('🔍 MAIN SERVER TRELLO OAUTH START: Request token URL:', requestTokenUrl);

  // Set up OAuth 1.0a
  const oauth = new OAuth({
    consumer: { key: TRELLO_API_KEY || '', secret: TRELLO_API_SECRET || '' },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
      return crypto.createHmac('sha1', key).update(base_string).digest('base64');
    },
  });

  const request_data = {
    url: requestTokenUrl,
    method: 'POST',
    data: {},
  };

  const headers = oauth.toHeader(oauth.authorize(request_data));

  const response = await fetch(requestTokenUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ MAIN SERVER TRELLO OAUTH START: Trello request token error:', response.status, errorText);
    return NextResponse.json({ error: 'Failed to get Trello request token', status: response.status, body: errorText }, { status: 500 });
  }
  
  const text = await response.text();
  console.log('🔍 MAIN SERVER TRELLO OAUTH START: Received response from Trello');
  
  // Trello returns oauth_token and oauth_token_secret in query string format
  const params = new URLSearchParams(text);
  const oauth_token = params.get('oauth_token');
  const oauth_token_secret = params.get('oauth_token_secret');

  console.log('🔍 MAIN SERVER TRELLO OAUTH START: Parsed response:', {
    oauth_token: oauth_token ? 'present' : 'missing',
    oauth_token_secret: oauth_token_secret ? 'present' : 'missing'
  });

  if (!oauth_token || !oauth_token_secret) {
    console.error('❌ MAIN SERVER TRELLO OAUTH START: Invalid Trello OAuth response');
    return NextResponse.json({ error: 'Invalid Trello OAuth response', body: text }, { status: 500 });
  }

  // Store the tenant information with the oauth_token for later retrieval IN MAIN SERVER MEMORY
  console.log('🔄 MAIN SERVER TRELLO OAUTH START: Storing tenant information in MAIN SERVER memory...');
  storeTrelloOAuthState(oauth_token, tenant, port, userId, oauth_token_secret);
  console.log('✅ MAIN SERVER TRELLO OAUTH START: Tenant information stored in main server');

  // Step 2: Redirect user to Trello authorization URL
  const authorizeUrl = getTrelloOAuthAuthorizeUrl(oauth_token);
  console.log('🔄 MAIN SERVER TRELLO OAUTH START: Redirecting to Trello authorization URL:', authorizeUrl);
  console.log('🚀 MAIN SERVER TRELLO OAUTH START: ===== OAUTH FLOW INITIATED =====');
  
  return NextResponse.redirect(authorizeUrl);
}

