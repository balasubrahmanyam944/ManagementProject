import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  
  const trelloAccessToken = cookieStore.get('trello_access_token')?.value;
  const trelloTokenSecret = cookieStore.get('trello_oauth_token_secret')?.value;
  
  const debugInfo = {
    trello_access_token: trelloAccessToken ? `${trelloAccessToken.substring(0, 10)}...` : 'not found',
    trello_oauth_token_secret: trelloTokenSecret ? `${trelloTokenSecret.substring(0, 10)}...` : 'not found',
    all_cookies: Array.from(cookieStore.getAll()).map(cookie => ({
      name: cookie.name,
      value: cookie.value.substring(0, 20) + '...',
      hasValue: !!cookie.value
    }))
  };
  
  console.log('🔍 Trello Cookie Debug:', debugInfo);
  
  return NextResponse.json(debugInfo);
} 