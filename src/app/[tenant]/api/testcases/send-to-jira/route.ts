import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { sendTestCaseToJiraAction } from '../../../testcases/actions';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { testCase, projectKey, sprintId, testCaseId, documentId } = await request.json();
    
    if (!testCase || !projectKey) {
      return NextResponse.json(
        { success: false, error: 'Test case and project key are required' },
        { status: 400 }
      );
    }

    console.log('🚀 API: Sending test case to Jira:', {
      testCase: testCase.title,
      projectKey,
      sprintId,
      testCaseId,
      documentId
    });

    const result = await sendTestCaseToJiraAction(
      testCase,
      projectKey,
      sprintId,
      testCaseId,
      documentId
    );

    console.log('✅ API: Jira send result:', result);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('❌ API: Error sending test case to Jira:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to send test case to Jira' 
      },
      { status: 500 }
    );
  }
}
