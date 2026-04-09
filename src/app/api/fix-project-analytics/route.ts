import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { db } from '@/lib/db/database'
import { jiraService } from '@/lib/integrations/jira-service'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { projectKey } = await request.json()
    
    console.log(`🔧 Fixing analytics for project: ${projectKey}`)

    // Get the project and its integration
    const projects = await db.findProjectsByUserId(session.user.id)
    const project = projects.find(p => p.key === projectKey || p.name.includes(projectKey))
    
    if (!project) {
      return NextResponse.json({ 
        success: false, 
        error: `Project ${projectKey} not found` 
      }, { status: 404 })
    }

    console.log(`🔧 Found project: ${project.name} (${project.key})`)

    // Get the integration
    const integrations = await db.findIntegrationsByUserId(session.user.id)
    const integration = integrations.find(i => i._id.toString() === project.integrationId.toString())
    
    if (!integration) {
      return NextResponse.json({ 
        success: false, 
        error: 'Integration not found for project' 
      }, { status: 404 })
    }

    console.log(`🔧 Found integration: ${integration.type} (${integration.status})`)

    if (integration.type !== 'JIRA') {
      return NextResponse.json({ 
        success: false, 
        error: 'Only Jira projects supported currently' 
      }, { status: 400 })
    }

    if (integration.status !== 'CONNECTED') {
      return NextResponse.json({ 
        success: false, 
        error: 'Integration not connected' 
      }, { status: 400 })
    }

    // Fetch issues directly using the enhanced Jira service
    console.log(`🔧 Fetching issues for project ${project.key}...`)
    
    const cloudId = integration.metadata?.cloudId
    if (!cloudId) {
      return NextResponse.json({ 
        success: false, 
        error: 'No cloud ID found in integration' 
      }, { status: 400 })
    }

    // Get valid access token
    const validAccessToken = await jiraService.getValidAccessToken(integration)
    
    // Fetch issues
    const apiUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`
    const jql = `project = ${project.key} ORDER BY updated DESC`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validAccessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'UPMY-Integration/1.0',
      },
      body: JSON.stringify({
        jql: jql,
        maxResults: 100,
        fields: ['summary', 'status', 'assignee', 'issuetype', 'priority', 'created', 'updated']
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`🔧 Jira API error: ${response.status} - ${errorText}`)
      return NextResponse.json({ 
        success: false, 
        error: `Jira API error: ${response.status}`,
        details: errorText
      }, { status: 400 })
    }

    const data = await response.json()
    const issues = data.issues || []
    
    console.log(`🔧 Fetched ${issues.length} issues for project ${project.key}`)

    // Calculate analytics
    const statusCounts: Record<string, number> = {}
    const typeCounts: Record<string, number> = {}
    let openCount = 0, inProgressCount = 0, doneCount = 0

    for (const issue of issues) {
      const status = issue.fields?.status?.name || 'Unknown'
      const type = issue.fields?.issuetype?.name || 'Unknown'
      
      statusCounts[status] = (statusCounts[status] || 0) + 1
      typeCounts[type] = (typeCounts[type] || 0) + 1

      const statusLower = status.toLowerCase()
      if (statusLower.includes('done') || statusLower.includes('complete') || statusLower.includes('closed')) {
        doneCount++
      } else if (statusLower.includes('progress') || statusLower.includes('doing') || statusLower.includes('review')) {
        inProgressCount++
      } else {
        openCount++
      }
    }

    const analytics = {
      totalIssues: issues.length,
      openIssues: openCount,
      inProgressIssues: inProgressCount,
      doneIssues: doneCount,
      statusCounts,
      typeCounts,
      dataSource: 'live' as const,
      lastUpdated: new Date().toISOString()
    }

    console.log(`🔧 Calculated analytics:`, analytics)

    // Update project in database
    await db.updateProject(project._id.toString(), { 
      analytics,
      lastSyncAt: new Date()
    })

    console.log(`✅ Updated project ${project.key} with analytics`)

    return NextResponse.json({
      success: true,
      message: `Updated ${project.name} with ${issues.length} issues`,
      projectKey: project.key,
      analytics,
      issuesFound: issues.length
    })

  } catch (error) {
    console.error('🔧 Fix project analytics error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fix project analytics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 