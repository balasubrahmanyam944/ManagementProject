/**
 * Board Create Card API (Tenant-specific)
 * Create cards/issues in Jira, Trello, or TestRail
 * Uses the same approach as testcases for Jira (fetchWithJiraAuth + sprint detection)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { jiraService } from '@/lib/integrations/jira-service'
import { trelloService } from '@/lib/integrations/trello-service'
import { fetchWithJiraAuth } from '@/lib/jira-auth'
import { nangoService } from '@/lib/integrations/nango-service'

/**
 * POST /[tenant]/api/board/create-card
 * Create a new card/issue in the respective tool
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      integrationType, 
      projectId, 
      projectKey, 
      listId, 
      summary, 
      description,
      issueType = 'Story', // Default to Story to match testcases
      targetStatus
    } = body

    if (!integrationType || !summary) {
      return NextResponse.json(
        { error: 'integrationType and summary are required' },
        { status: 400 }
      )
    }

    console.log(`🆕 CREATE CARD API: Creating ${integrationType} card:`, { projectId, projectKey, listId, summary, issueType, targetStatus })

    let result: any

    switch (integrationType) {
      case 'JIRA':
        if (!projectKey) {
          return NextResponse.json(
            { error: 'projectKey is required for Jira' },
            { status: 400 }
          )
        }
        
        // Use the same approach as testcases - fetchWithJiraAuth
        const jiraResult = await createJiraIssueWithSprint(
          session.user.id,
          projectKey,
          summary,
          description || '',
          issueType,
          targetStatus
        )
        
        if (!jiraResult.success) {
          return NextResponse.json(
            { error: jiraResult.error },
            { status: 500 }
          )
        }
        
        return NextResponse.json({
          success: true,
          card: {
            id: jiraResult.id,
            key: jiraResult.key,
            summary,
            integrationType: 'JIRA'
          }
        })

      case 'TRELLO':
        if (!listId) {
          return NextResponse.json(
            { error: 'listId is required for Trello' },
            { status: 400 }
          )
        }
        result = await trelloService.createCard(
          session.user.id, 
          listId, 
          {
            name: summary,
            desc: description || undefined
          }
        )
        return NextResponse.json({
          success: true,
          card: {
            id: result.id,
            name: result.name,
            summary,
            integrationType: 'TRELLO'
          }
        })

      case 'TESTRAIL':
        return NextResponse.json(
          { error: 'TestRail card creation is not supported via board' },
          { status: 400 }
        )

      default:
        return NextResponse.json(
          { error: `Unknown integration type: ${integrationType}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('❌ CREATE CARD API: Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create card' },
      { status: 500 }
    )
  }
}

/**
 * Create Jira issue with sprint assignment - using same approach as testcases
 */
async function createJiraIssueWithSprint(
  userId: string,
  projectKey: string,
  summary: string,
  description: string,
  issueType: string,
  targetStatus?: string
): Promise<{ success: boolean; id?: string; key?: string; error?: string }> {
  try {
    // Get Jira integration to find serverUrl
    const integration = await jiraService.getIntegration(userId)
    if (!integration || integration.status !== 'CONNECTED') {
      return { success: false, error: 'Jira integration not connected' }
    }

    // Get the site URL from integration metadata or Nango
    let jiraSiteUrl = integration.serverUrl
    
    // For Nango-managed integrations, get serverUrl from Nango if not in DB
    if (!jiraSiteUrl && integration.metadata?.nangoManaged) {
      try {
        const tenantId = integration.metadata.tenantId || 'default'
        const nangoMetadata = await nangoService.getConnectionMetadata('jira', tenantId, userId)
        const cloudId = nangoMetadata.cloudId || nangoMetadata.cloud_id
        if (cloudId) {
          jiraSiteUrl = `https://api.atlassian.com/ex/jira/${cloudId}`
          console.log('🔍 CREATE CARD: Got Jira serverUrl from Nango:', jiraSiteUrl)
        }
      } catch (nangoError) {
        console.error('⚠️ CREATE CARD: Failed to get Jira serverUrl from Nango:', nangoError)
      }
    }
    
    if (!jiraSiteUrl) {
      return { success: false, error: 'Jira site URL not found. Please reconnect Jira.' }
    }

    // ========== SPRINT DETECTION (same as testcases) ==========
    let targetSprintId: string | null = null
    
    console.log(`🔍 SPRINT DETECTION: Starting auto-sprint detection for project ${projectKey}`)
    
    // Method 1: Try to get active sprint from board (this often fails with 401)
    try {
      console.log(`🔍 Method 1: Getting active sprint from board for project ${projectKey}`)
      const boardResponse = await fetchWithJiraAuth(
        `${jiraSiteUrl}/rest/agile/1.0/board`,
        { method: 'GET', headers: { 'Accept': 'application/json' } }
      )

      if (boardResponse.ok) {
        const boards = await boardResponse.json()
        const projectBoard = boards.values?.find((board: any) => 
          board.location?.projectKey === projectKey || 
          board.location?.projectId === projectKey
        )
        
        if (projectBoard) {
          console.log(`📋 Found board for project: ${projectBoard.name} (ID: ${projectBoard.id})`)
          
          const sprintResponse = await fetchWithJiraAuth(
            `${jiraSiteUrl}/rest/agile/1.0/board/${projectBoard.id}/sprint?state=active`,
            { method: 'GET', headers: { 'Accept': 'application/json' } }
          )

          if (sprintResponse.ok) {
            const sprints = await sprintResponse.json()
            if (sprints.values && sprints.values.length > 0) {
              targetSprintId = sprints.values[0].id.toString()
              console.log(`✅ Found active sprint: ${sprints.values[0].name} (ID: ${targetSprintId})`)
            }
          }
        }
      }
    } catch (err) {
      console.log('⚠️ Method 1 failed, trying Method 2...')
    }

    // Method 2: Search for issues with sprint assignments (same as testcases - this works!)
    if (!targetSprintId) {
      console.log(`🔍 Method 2: Searching for issues with sprint assignments`)
      
      try {
        const searchUrl = `${jiraSiteUrl}/rest/api/3/search/jql`
        console.log(`🔎 Searching for issues with sprint assignments: ${searchUrl}`)
        
        const recentIssuesResponse = await fetchWithJiraAuth(searchUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jql: `project=${projectKey} AND sprint is not EMPTY ORDER BY updated DESC`,
            maxResults: 10,
            fields: ['*all']
          })
        })

        if (recentIssuesResponse.ok) {
          const searchResult = await recentIssuesResponse.json()
          console.log(`📊 Search Result: Found ${searchResult.issues?.length || 0} issues with sprints`)
          
          // Look for sprint field in issues
          for (const issue of searchResult.issues || []) {
            console.log(`🔍 Inspecting fields in issue ${issue.key}:`)
            
            const fieldNames = Object.keys(issue.fields || {})
            const sprintFields = fieldNames.filter(field => 
              field.toLowerCase().includes('sprint') || 
              field.includes('customfield_')
            )
            console.log(`📋 Available sprint-related fields:`, sprintFields)
            
            for (const fieldName of sprintFields) {
              const fieldValue = issue.fields[fieldName]
              if (fieldValue) {
                if (Array.isArray(fieldValue)) {
                  for (const item of fieldValue) {
                    if (item && (item.name || item.id) && item.state) {
                      console.log(`🏃 Found sprint in ${fieldName}: ${item.name} (ID: ${item.id}, State: ${item.state})`)
                      if (item.state === 'active') {
                        targetSprintId = item.id.toString()
                        console.log(`✅ Found active sprint: ${item.name} (${item.id})`)
                        break
                      }
                    }
                  }
                }
              }
              if (targetSprintId) break
            }
            if (targetSprintId) break
          }
        }
      } catch (err) {
        console.log('⚠️ Method 2 failed:', err)
      }
    }

    // ========== CREATE ISSUE (same as testcases) ==========
    
    // Build issue data
    const issueData: any = {
      fields: {
        project: { key: projectKey },
        summary: summary,
        description: description ? {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: description }]
            }
          ]
        } : undefined,
        issuetype: { name: issueType }
      }
    }

    // Add sprint assignment if found
    if (targetSprintId) {
      issueData.fields['customfield_10020'] = parseInt(targetSprintId)
      console.log(`🎯 SPRINT ASSIGNMENT: Attempting to assign to sprint ${targetSprintId}`)
      console.log(`🎯 Using sprint field customfield_10020 with value ${targetSprintId}`)
    } else {
      console.log(`⚠️ No sprint found, creating issue without sprint assignment`)
    }

    console.log('Creating Jira issue with payload:', JSON.stringify(issueData, null, 2))

    // Create the issue using fetchWithJiraAuth
    const createResponse = await fetchWithJiraAuth(
      `${jiraSiteUrl}/rest/api/3/issue`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(issueData)
      }
    )

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error('❌ Jira issue creation failed:', createResponse.status, errorText)
      
      // If sprint field error, retry without sprint
      if (errorText.includes('customfield_10020') || errorText.includes('sprint')) {
        console.log('🔄 Retrying without sprint assignment...')
        delete issueData.fields['customfield_10020']
        
        const retryResponse = await fetchWithJiraAuth(
          `${jiraSiteUrl}/rest/api/3/issue`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(issueData)
          }
        )
        
        if (retryResponse.ok) {
          const retryData = await retryResponse.json()
          console.log(`✅ Created issue without sprint: ${retryData.key}`)
          return { success: true, id: retryData.id, key: retryData.key }
        }
        
        const retryError = await retryResponse.text()
        return { success: false, error: `Failed to create issue: ${retryError}` }
      }
      
      return { success: false, error: `Failed to create issue: ${errorText}` }
    }

    const result = await createResponse.json()
    console.log(`✅ Created Jira issue: ${result.key}${targetSprintId ? ` (Sprint: ${targetSprintId})` : ''}`)

    // ========== TRANSITION IF NEEDED ==========
    if (targetStatus && !['TO DO', 'TODO', 'OPEN', 'BACKLOG'].includes(targetStatus.toUpperCase())) {
      try {
        console.log(`🔄 Attempting to transition ${result.key} to ${targetStatus}`)
        
        const transitions = await jiraService.getIssueTransitions(userId, result.key)
        const transition = transitions?.find((t: any) => 
          t.to?.name?.toUpperCase() === targetStatus.toUpperCase() ||
          t.name?.toUpperCase() === targetStatus.toUpperCase()
        )
        
        if (transition) {
          await jiraService.transitionIssue(userId, result.key, transition.id)
          console.log(`✅ Transitioned ${result.key} to ${targetStatus}`)
        } else {
          console.warn(`⚠️ No transition found to ${targetStatus}`)
        }
      } catch (transitionError) {
        console.error(`⚠️ Failed to transition issue:`, transitionError)
      }
    }

    return { success: true, id: result.id, key: result.key }
    
  } catch (error) {
    console.error('❌ createJiraIssueWithSprint error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}
