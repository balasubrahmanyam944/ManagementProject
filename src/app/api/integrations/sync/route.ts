import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { jiraService } from '@/lib/integrations/jira-service';
import { nangoService } from '@/lib/integrations/nango-service';

// Helper to extract tenantId from request URL path or query params
function getTenantIdFromRequest(request: NextRequest): string {
  // Try query param first
  const queryTenantId = request.nextUrl.searchParams.get('tenantId')
  if (queryTenantId) return queryTenantId
  
  // Extract from URL path (e.g., /gmail/api/integrations/sync)
  const pathname = request.nextUrl.pathname
  const pathParts = pathname.split('/').filter(Boolean)
  // Path format: [tenant]/api/integrations/sync
  if (pathParts.length > 0 && pathParts[0] !== 'api') {
    return pathParts[0]
  }
  
  // Fall back to environment variable or default
  return process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 'default'
}

export async function POST(req: NextRequest) {
  console.log('🔄 INTEGRATIONS SYNC: Starting sync process');
  
  try {
    // Get the current session
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      console.log('❌ INTEGRATIONS SYNC: No valid session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get tenant ID from request
    const tenantId = getTenantIdFromRequest(req)

    console.log('🔍 INTEGRATIONS SYNC: User ID:', session.user.id, 'Tenant:', tenantId);

    // Sync Jira projects - check Nango first, then fall back to DB integration
    let jiraProjects = [];
    try {
      console.log('🔄 INTEGRATIONS SYNC: Fetching Jira projects...');
      
      // Check if connected via Nango
      const jiraNangoConnected = await nangoService.isConnected('jira', tenantId, session.user.id);
      
      if (jiraNangoConnected) {
        console.log('📥 INTEGRATIONS SYNC: Using Nango service for Jira');
        const { jiraNangoService } = await import('@/lib/integrations/jira-nango-service');
        jiraProjects = await jiraNangoService.fetchAndStoreProjects(session.user.id, tenantId);
      } else {
        console.log('📥 INTEGRATIONS SYNC: Using database service for Jira');
        jiraProjects = await jiraService.fetchAndStoreProjects(session.user.id);
      }
      
      console.log('✅ INTEGRATIONS SYNC: Jira projects synced:', jiraProjects.length);
    } catch (jiraError) {
      console.warn('⚠️ INTEGRATIONS SYNC: Jira sync failed:', jiraError);
      // Don't fail the entire sync if Jira fails
    }

    // TODO: Add other integrations (Trello, TestRail, etc.) here

    console.log('✅ INTEGRATIONS SYNC: Sync completed successfully');
    
    return NextResponse.json({
      success: true,
      message: 'Integrations synced successfully',
      data: {
        jiraProjects: jiraProjects.length,
        trelloProjects: 0, // TODO: Implement Trello sync
        testrailProjects: 0, // TODO: Implement TestRail sync
      }
    });

  } catch (error: any) {
    console.error('❌ INTEGRATIONS SYNC: Error during sync:', error);
    return NextResponse.json(
      { 
        error: 'Failed to sync integrations',
        message: error.message || 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}