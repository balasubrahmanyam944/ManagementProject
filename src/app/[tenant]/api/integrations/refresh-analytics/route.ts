import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { jiraService } from '@/lib/integrations/jira-service'
import { trelloService } from '@/lib/integrations/trello-service'
import { testrailService } from '@/lib/integrations/testrail-service'
import { db } from '@/lib/db/database'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log(`🔄 Refreshing analytics for user ${session.user.id} (tenant)`)

    // Get all user's projects
    const projects = await db.findProjectsByUserId(session.user.id)
    const integrations = await db.findIntegrationsByUserId(session.user.id)
    
    let refreshedCount = 0
    const errors: string[] = []

    for (const project of projects) {
      try {
        const integration = integrations.find(i => i._id.toString() === project.integrationId.toString())
        if (!integration || integration.status !== 'CONNECTED') {
          console.log(`⚠️ Skipping project ${project.key || project.name} - integration not connected`)
          continue
        }

        console.log(`🔄 Refreshing analytics for project ${project.key || project.name}`)

        if (integration.type === 'JIRA') {
          // Force refresh Jira project analytics
          await jiraService.fetchAndStoreProjects(session.user.id)
          refreshedCount++
        } else if (integration.type === 'TRELLO') {
          // Force refresh Trello board analytics
          await trelloService.fetchAndStoreBoards(session.user.id)
          refreshedCount++
        } else if (integration.type === 'TESTRAIL') {
          // Force refresh TestRail project analytics
          await testrailService.fetchAndStoreProjects(session.user.id)
          refreshedCount++
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

