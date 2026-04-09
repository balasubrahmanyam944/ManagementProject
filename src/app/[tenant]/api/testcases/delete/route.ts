import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { db } from '@/lib/db/database';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { documentId } = await request.json();
    
    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID is required' },
        { status: 400 }
      );
    }

    console.log('🗑️ Deleting test cases for document:', documentId, 'user:', session.user.id);
    
    await db.deleteTestcasesByDocumentId(session.user.id, documentId);
    
    console.log('✅ Successfully deleted test cases for document:', documentId);
    
    return NextResponse.json({
      success: true,
      message: 'Test cases deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting test cases:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete test cases' },
      { status: 500 }
    );
  }
}
