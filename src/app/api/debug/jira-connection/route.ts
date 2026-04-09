import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { JiraService } from '@/lib/integrations/jira-service'
import { db } from '@/lib/db/database'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const jiraService = new JiraService()
    const integration = await jiraService.getIntegration(session.user.id)
    
    if (!integration) {
      return NextResponse.json({
        status: 'not_connected',
        message: 'No Jira integration found',
        debug: {
          userId: session.user.id,
          timestamp: new Date().toISOString()
        }
      })
    }

    const diagnostics = {
      status: integration.status,
      hasAccessToken: !!integration.accessToken,
      hasRefreshToken: !!integration.refreshToken,
      tokenExpired: integration.expiresAt ? integration.expiresAt <= new Date() : 'unknown',
      expiresAt: integration.expiresAt?.toISOString(),
      serverUrl: integration.serverUrl,
      hasCloudId: !!integration.metadata?.cloudId,
      cloudId: integration.metadata?.cloudId,
      lastUpdated: integration.updatedAt?.toISOString(),
      timestamp: new Date().toISOString()
    }

    // Test token validity
    let tokenTest = { valid: false, error: null }
    try {
      await jiraService.getValidAccessToken(integration)
      tokenTest.valid = true
    } catch (error) {
      tokenTest.error = error instanceof Error ? error.message : 'Unknown token error'
    }

    // Test API connectivity
    let apiTest = { accessible: false, error: null, projects: 0 }
    try {
      const projects = await jiraService.fetchProjects(session.user.id)
      apiTest.accessible = true
      apiTest.projects = projects.length
    } catch (error) {
      apiTest.error = error instanceof Error ? error.message : 'Unknown API error'
    }

    // Get projects from database
    const dbProjects = await db.findProjectsByUserId(session.user.id)
    const jiraProjects = dbProjects.filter(p => p.source === 'JIRA' && p.isActive)

    return NextResponse.json({
      status: 'connected',
      diagnostics,
      tokenTest,
      apiTest,
      database: {
        totalProjects: dbProjects.length,
        jiraProjects: jiraProjects.length,
        projectKeys: jiraProjects.map(p => p.key).filter(Boolean)
      },
      recommendations: generateRecommendations(diagnostics, tokenTest, apiTest)
    })

  } catch (error) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json({
      error: 'Failed to run diagnostics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

function generateRecommendations(diagnostics: any, tokenTest: any, apiTest: any): string[] {
  const recommendations: string[] = []

  if (diagnostics.status !== 'CONNECTED') {
    recommendations.push('Reconnect your Jira integration from the Integrations page')
  }

  if (!diagnostics.hasAccessToken) {
    recommendations.push('Access token is missing - reconnect Jira integration')
  }

  if (diagnostics.tokenExpired === true) {
    if (!diagnostics.hasRefreshToken) {
      recommendations.push('Token expired and no refresh token available - reconnect Jira')
    } else {
      recommendations.push('Token expired but refresh token available - try refreshing the page')
    }
  }

  if (!tokenTest.valid) {
    recommendations.push(`Token validation failed: ${tokenTest.error}`)
  }

  if (!apiTest.accessible) {
    recommendations.push(`API connectivity failed: ${apiTest.error}`)
  }

  if (!diagnostics.hasCloudId) {
    recommendations.push('Cloud ID is missing from integration metadata')
  }

  if (apiTest.accessible && apiTest.projects === 0) {
    recommendations.push('No projects found - check Jira permissions or project visibility')
  }

  if (recommendations.length === 0) {
    recommendations.push('Connection appears healthy - try refreshing the project page')
  }

  return recommendations
} 