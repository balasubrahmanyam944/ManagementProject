import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { jiraService } from '@/lib/integrations/jira-service'
import { trelloService } from '@/lib/integrations/trello-service'
import { testrailService } from '@/lib/integrations/testrail-service'
import { nangoService } from '@/lib/integrations/nango-service'
import { db } from '@/lib/db/database'

// Helper to extract tenantId from request URL path or query params
function getTenantIdFromRequest(request: NextRequest): string {
  // Try query param first
  const queryTenantId = request.nextUrl.searchParams.get('tenantId')
  if (queryTenantId) return queryTenantId
  
  // Extract from URL path (e.g., /gmail/api/integrations/refresh-analytics)
  const pathname = request.nextUrl.pathname
  const pathParts = pathname.split('/').filter(Boolean)
  // Path format: [tenant]/api/integrations/refresh-analytics
  if (pathParts.length > 0 && pathParts[0] !== 'api') {
    return pathParts[0]
  }
  
  // Fall back to environment variable or default
  return process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 'default'
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get tenant ID from request
    const tenantId = getTenantIdFromRequest(request)

    console.log(`🔄 Refreshing analytics for user ${session.user.id} in tenant ${tenantId}`)

    // Get all user's projects
    const projects = await db.findProjectsByUserId(session.user.id)
    const integrations = await db.findIntegrationsByUserId(session.user.id)
    
    let refreshedCount = 0
    const errors: string[] = []

    for (const project of projects) {
      try {
        const integrationIdStr = project.integrationId?.toString() || ''
        
        // Check if this is a Nango-based project (virtual integration ID)
        const isNangoJira = integrationIdStr.startsWith('nango_jira_')
        const isNangoTrello = integrationIdStr.startsWith('nango_trello_')
        const isNangoTestrail = integrationIdStr.startsWith('nango_testrail_')
        
        if (isNangoJira) {
          // Check if Nango connection exists
          const isConnected = await nangoService.isConnected('jira', tenantId, session.user.id)
          if (!isConnected) {
            console.log(`⚠️ Skipping project ${project.key} - Nango Jira not connected`)
            continue
          }
          
          console.log(`🔄 Refreshing analytics for Nango Jira project ${project.key || project.name}`)
          const { jiraNangoService } = await import('@/lib/integrations/jira-nango-service')
          await jiraNangoService.fetchAndStoreProjects(session.user.id, tenantId)
          refreshedCount++
        } else if (isNangoTrello) {
          const isConnected = await nangoService.isConnected('trello', tenantId, session.user.id)
          if (!isConnected) {
            console.log(`⚠️ Skipping project ${project.key} - Nango Trello not connected`)
            continue
          }
          
          console.log(`🔄 Refreshing analytics for Nango Trello project ${project.key || project.name}`)
          const { trelloNangoService } = await import('@/lib/integrations/trello-nango-service')
          await trelloNangoService.fetchAndStoreBoards(session.user.id, tenantId)
          refreshedCount++
        } else if (isNangoTestrail) {
          const isConnected = await nangoService.isConnected('testrail', tenantId, session.user.id)
          if (!isConnected) {
            console.log(`⚠️ Skipping project ${project.key} - Nango TestRail not connected`)
            continue
          }
          
          console.log(`🔄 Refreshing analytics for Nango TestRail project ${project.key || project.name}`)
          // TestRail Nango service not implemented yet, skip for now
          refreshedCount++
        } else {
          // Traditional DB-based integration
          const integration = integrations.find(i => i._id.toString() === integrationIdStr)
          if (!integration || integration.status !== 'CONNECTED') {
            console.log(`⚠️ Skipping project ${project.key} - integration not connected`)
            continue
          }

          console.log(`🔄 Refreshing analytics for project ${project.key || project.name}`)

          if (integration.type === 'JIRA') {
            await jiraService.fetchAndStoreProjects(session.user.id)
            refreshedCount++
          } else if (integration.type === 'TRELLO') {
            await trelloService.fetchAndStoreBoards(session.user.id)
            refreshedCount++
          } else if (integration.type === 'TESTRAIL') {
            await testrailService.fetchAndStoreProjects(session.user.id)
            refreshedCount++
          }
        }
      } catch (error) {
        const errorMsg = `Failed to refresh ${project.key || project.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(`❌ ${errorMsg}`)
        errors.push(errorMsg)
      }
    }

    console.log(`✅ Analytics refresh completed: ${refreshedCount} projects refreshed, ${errors.length} errors`)

    return NextResponse.json({
      success: true,
      message: `Analytics refreshed for ${refreshedCount} projects`,
      refreshedCount,
      totalProjects: projects.length,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error) {
    console.error('❌ Analytics refresh failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to refresh analytics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 