import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { db } from '@/lib/db/database';

// Default allowedPages for each role
const getDefaultAllowedPages = (role: string): string[] => {
  switch (role) {
    case 'ADMIN':
      return ['dashboard', 'project-overview', 'velocity', 'sentiment-analysis', 'integrations', 'testcases', 'settings', 'admin']
    case 'MANAGER':
      return ['dashboard', 'project-overview', 'velocity', 'sentiment-analysis', 'integrations', 'testcases', 'settings']
    case 'DEVELOPER':
      return ['dashboard', 'velocity', 'sentiment-analysis', 'integrations', 'settings']
    case 'TESTER':
      return ['dashboard', 'velocity', 'sentiment-analysis', 'integrations', 'testcases', 'settings']
    case 'PREMIUM':
      return ['dashboard', 'project-overview', 'velocity', 'sentiment-analysis', 'integrations', 'testcases', 'settings']
    case 'USER':
    default:
      return ['dashboard', 'velocity', 'sentiment-analysis', 'integrations', 'settings']
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const adminUser = await db.findUserByEmail(session.user.email);
    if (!adminUser || adminUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all users
    const users = await db.findAllUsers();
    let updatedCount = 0;

    // Update users who don't have allowedPages
    for (const user of users) {
      if (!user.allowedPages || user.allowedPages.length === 0) {
        const defaultPages = getDefaultAllowedPages(user.role);
        await db.updateUser(user._id.toString(), { allowedPages: defaultPages });
        updatedCount++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Updated ${updatedCount} users with default allowedPages`,
      updatedCount 
    });
  } catch (error) {
    console.error('Error updating existing users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

