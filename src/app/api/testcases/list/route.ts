import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { db } from '@/lib/db/database';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('🔍 Fetching test cases for user:', session.user.id);
    
    const testcases = await db.findTestcasesByUserGroupedByDocument(session.user.id);
    
    console.log('📋 Found test cases:', testcases.length);
    
    return NextResponse.json({
      success: true,
      testcases
    });

  } catch (error) {
    console.error('❌ Error fetching test cases:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch test cases' },
      { status: 500 }
    );
  }
}
