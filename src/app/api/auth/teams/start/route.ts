import { NextRequest, NextResponse } from 'next/server';
import { getTeamsOAuthAuthorizeUrl } from '@/lib/teams-auth';
import { randomBytes } from 'crypto';

export async function GET(req: NextRequest) {
  const state = randomBytes(32).toString('hex');
  // TODO: Store state in cookie/session for CSRF protection
  const authorizeUrl = getTeamsOAuthAuthorizeUrl(state);
  return NextResponse.redirect(authorizeUrl);
} 