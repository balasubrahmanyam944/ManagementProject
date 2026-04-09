import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { sendTestCaseToTestRailAction } from '../../../testcases/actions';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { testCase, projectId, sectionId, testCaseId, documentId } = await request.json();
    
    if (!testCase || !projectId) {
      return NextResponse.json(
        { success: false, error: 'Test case and project ID are required' },
        { status: 400 }
      );
    }

    console.log('🚀 API: Sending test case to TestRail:', {
      testCase: testCase.title,
      projectId,
      sectionId,
      testCaseId,
      documentId
    });

    const result = await sendTestCaseToTestRailAction(
      testCase,
      projectId,
      sectionId,
      testCaseId,
      documentId
    );

    console.log('✅ API: TestRail send result:', result);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('❌ API: Error sending test case to TestRail:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to send test case to TestRail' 
      },
      { status: 500 }
    );
  }
}
