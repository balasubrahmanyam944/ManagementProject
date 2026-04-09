import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeTrelloOAuthToken, NEXT_PUBLIC_APP_URL } from '@/lib/trello-auth';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { DatabaseService } from '@/lib/db/database';
import { trelloService } from '@/lib/integrations/trello-service';

export async function GET(req: NextRequest) {
  console.log('🔄 Trello OAuth Callback: Starting callback process');
  const { searchParams } = new URL(req.url);
  const oauth_token = searchParams.get('oauth_token');
  const oauth_verifier = searchParams.get('oauth_verifier');

  console.log('🔍 Trello OAuth Callback: Received parameters:', {
    oauth_token: oauth_token ? 'present' : 'missing',
    oauth_verifier: oauth_verifier ? 'present' : 'missing'
  });

  if (!oauth_token || !oauth_verifier) {
    console.error('❌ Trello OAuth Callback: Missing required parameters');
    return NextResponse.json({ error: 'Missing Trello OAuth parameters' }, { status: 400 });
  }

  // Retrieve the request token secret from the cookie
  const cookieStore = await cookies();
  const oauth_token_secret = cookieStore.get('trello_oauth_token_secret')?.value;
  console.log('🔍 Trello OAuth Callback: Token secret from cookie:', oauth_token_secret ? 'present' : 'missing');
  
  if (!oauth_token_secret) {
    console.error('❌ Trello OAuth Callback: Missing token secret from cookie');
    return NextResponse.json({ error: 'Missing Trello OAuth token secret' }, { status: 400 });
  }

  try {
    // Get the current user session
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      console.error('❌ Trello OAuth Callback: No authenticated user found');
      const redirectUrl = `${NEXT_PUBLIC_APP_URL}/integrations?trello_error=not_authenticated`;
      return NextResponse.redirect(redirectUrl);
    }

    console.log('🔄 Trello OAuth Callback: Attempting to exchange tokens');
    // Exchange the request token and verifier for an access token
    const tokenResponse = await exchangeTrelloOAuthToken(oauth_token, oauth_verifier);
    console.log('✅ Trello OAuth Callback: Token exchange successful, parsing response');
    
    // Trello returns oauth_token and oauth_token_secret in query string format
    const params = new URLSearchParams(tokenResponse);
    const access_token = params.get('oauth_token');
    console.log('🔍 Trello OAuth Callback: Access token from response:', access_token ? 'present' : 'missing');

    if (!access_token) {
      console.error('❌ Trello OAuth Callback: No access token in response:', tokenResponse);
      const redirectUrl = `${NEXT_PUBLIC_APP_URL}/integrations?trello_error=no_access_token`;
      return NextResponse.redirect(redirectUrl);
    }

    console.log('💾 Trello OAuth Callback: Saving integration to database');
    // Save the integration to the database
    const dbService = new DatabaseService();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

    const integration = await dbService.upsertIntegration(session.user.id, 'TRELLO', {
      status: 'CONNECTED',
      accessToken: access_token,
      expiresAt: expiresAt,
      serverUrl: 'https://api.trello.com',
      consumerKey: process.env.TRELLO_API_KEY || '',
      metadata: {
        oauthToken: oauth_token,
        scopes: 'read,write,account'
      }
    });

    console.log('✅ Trello OAuth Callback: Integration saved to database successfully');

    // Fetch and save Trello boards
    console.log('🔄 Trello OAuth Callback: Fetching Trello boards');
    try {
      const trelloBoards = await trelloService.fetchAndStoreBoards(session.user.id);
      console.log('🔍 Trello OAuth Callback: Found Trello boards:', trelloBoards.length);
      console.log('✅ Trello OAuth Callback: Boards saved to database successfully');
    } catch (boardError) {
      console.warn('⚠️ Trello OAuth Callback: Failed to fetch boards:', boardError);
      // Don't fail the entire OAuth flow if board fetching fails
    }
    
    console.log('🧹 Trello OAuth Callback: Cleaning up temporary token secret');
    // Clean up the temporary token secret
    cookieStore.delete('trello_oauth_token_secret');

    console.log('🔄 Trello OAuth Callback: Redirecting to integrations page');
    // Redirect to integrations page (absolute URL required)
    const redirectUrl = `${NEXT_PUBLIC_APP_URL}/integrations?trello_connected=true`;
    return NextResponse.redirect(redirectUrl);
  } catch (error: any) {
    console.error('❌ Trello OAuth Callback: Error during callback process:', error);
    const redirectUrl = `${NEXT_PUBLIC_APP_URL}/integrations?trello_error=${encodeURIComponent(error.message || 'callback_failed')}`;
    return NextResponse.redirect(redirectUrl);
  }
} 