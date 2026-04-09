import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { sendTestCaseToTrelloAction } from '../../../testcases/actions';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { testCase, boardId, listId, testCaseId, documentId } = await request.json();
    
    if (!testCase || !boardId || !listId) {
      return NextResponse.json(
        { success: false, error: 'Test case, board ID, and list ID are required' },
        { status: 400 }
      );
    }

    console.log('🚀 API: Sending test case to Trello:', {
      testCase: testCase.title,
      boardId,
      listId,
      testCaseId,
      documentId
    });

    const result = await sendTestCaseToTrelloAction(
      testCase,
      boardId,
      listId,
      testCaseId,
      documentId
    );

    console.log('✅ API: Trello send result:', result);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('❌ API: Error sending test case to Trello:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to send test case to Trello' 
      },
      { status: 500 }
    );
  }
}
