import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { jiraService } from '@/lib/integrations/jira-service';

export async function DELETE(req: NextRequest) {
  console.log('🔄 JIRA DISCONNECT: Starting disconnect process');
  
  try {
    // Get the current session
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      console.log('❌ JIRA DISCONNECT: No valid session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔍 JIRA DISCONNECT: User ID:', session.user.id);

    // Get tenant ID from request or URL
    const tenantId = req.nextUrl.searchParams.get('tenantId') || 'default';
    
    // Disconnect Jira integration
    try {
      // First, try to disconnect from Nango (if connected via Nango)
      try {
        const { jiraNangoService } = await import('@/lib/integrations/jira-nango-service');
        const isNangoConnected = await jiraNangoService.getConnectionStatus(session.user.id, tenantId);
        
        if (isNangoConnected.connected) {
          console.log('🔄 JIRA DISCONNECT: Disconnecting from Nango');
          await jiraNangoService.disconnect(session.user.id, tenantId);
          console.log('✅ JIRA DISCONNECT: Successfully disconnected from Nango');
        }
      } catch (nangoError) {
        console.log('🔄 JIRA DISCONNECT: Not connected via Nango or Nango disconnect failed:', nangoError);
        // Continue to database disconnect
      }
      
      // Also remove from database (old integrations)
      console.log('🔄 JIRA DISCONNECT: Disconnecting from database...');
      await jiraService.disconnectIntegration(session.user.id);
      console.log('✅ JIRA DISCONNECT: Successfully disconnected from database');
    } catch (jiraError) {
      console.error('❌ JIRA DISCONNECT: Jira disconnect failed:', jiraError);
      // Don't fail - disconnection might be partial
    }

    console.log('✅ JIRA DISCONNECT: Disconnect completed successfully');
    
    return NextResponse.json({
      success: true,
      message: 'Jira integration disconnected successfully'
    });

  } catch (error: any) {
    console.error('❌ JIRA DISCONNECT: Error during disconnect:', error);
    return NextResponse.json(
      { 
        error: 'Failed to disconnect Jira integration',
        message: error.message || 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}