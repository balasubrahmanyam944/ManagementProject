/**
 * Get Current User Info
 * 
 * Returns the current user's information including user ID.
 * Used by frontend to get userId for Nango connection IDs.
 * 
 * Note: This route is at /api/user/info to avoid conflict with NextAuth's /api/auth/session
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';

export async function GET() {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user) {
      return NextResponse.json(
        { user: null, authenticated: false },
        { status: 401 }
      );
    }
    
    return NextResponse.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      authenticated: true,
    });
  } catch (error) {
    console.error('Error getting user info:', error);
    return NextResponse.json(
      { error: 'Failed to get user info', user: null },
      { status: 500 }
    );
  }
}

