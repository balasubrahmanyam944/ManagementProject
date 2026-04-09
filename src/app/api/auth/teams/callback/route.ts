import { NextRequest, NextResponse } from 'next/server';
import { exchangeTeamsOAuthCode } from '@/lib/teams-auth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  if (error) return NextResponse.redirect('/integrations?teams_error=' + encodeURIComponent(error));
  if (!code) return NextResponse.redirect('/integrations?teams_error=missing_code');

  try {
    const tokenData = await exchangeTeamsOAuthCode(code);
    // TODO: Store access_token in cookie/session
    return NextResponse.redirect('/integrations?teams_connected=true');
  } catch (e) {
    return NextResponse.redirect('/integrations?teams_error=oauth_failed');
  }
} 