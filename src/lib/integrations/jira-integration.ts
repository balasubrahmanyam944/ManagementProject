'use server'

import { JiraService } from './jira-service'
import { db } from '../db/database'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import type { 
  DetailedJiraProject, 
  JiraDashboardIssue 
} from '@/types/integrations'

export async function getJiraProjectDetailsAction(projectKey: string) {
  try {
    console.log(`🔍 getJiraProjectDetailsAction: Starting for project ${projectKey}`)
    
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      console.log('❌ getJiraProjectDetailsAction: No session found')
      return { success: false, error: 'Not authenticated' }
    }

    console.log(`🔍 getJiraProjectDetailsAction: User ID: ${session.user.id}`)

    const jiraService = new JiraService()
    const integration = await jiraService.getIntegration(session.user.id)
    
    if (!integration || integration.status !== 'CONNECTED') {
      console.log('❌ getJiraProjectDetailsAction: Jira integration not connected', { 
        hasIntegration: !!integration, 
        status: integration?.status 
      })
      return { success: false, error: 'Jira integration not connected' }
    }

    console.log(`🔍 getJiraProjectDetailsAction: Integration found, status: ${integration.status}`)

    // Get project from database
    const projects = await db.findProjectsByUserId(session.user.id)
    const project = projects.find(p => p.key === projectKey && p.isActive)
    
    if (!project) {
      console.log(`❌ getJiraProjectDetailsAction: Project ${projectKey} not found in database`, {
        availableProjects: projects.map(p => ({ key: p.key, isActive: p.isActive }))
      })
      return { success: false, error: 'Project not found' }
    }

    console.log(`🔍 getJiraProjectDetailsAction: Project found in database:`, {
      key: project.key,
      name: project.name,
      externalId: project.externalId
    })

    // Fetch issues and available statuses from Jira API in parallel
    console.log(`🔍 getJiraProjectDetailsAction: Fetching issues from Jira API...`)
    let issues: JiraDashboardIssue[] = []
    let statuses: Array<{ name: string }> = []
    try {
      const [fetchedIssues, fetchedStatuses] = await Promise.all([
        fetchJiraIssues(integration, projectKey),
        fetchJiraProjectStatuses(integration, projectKey),
      ])
      issues = fetchedIssues
      statuses = fetchedStatuses
      console.log(`🔍 getJiraProjectDetailsAction: Retrieved ${issues.length} issues, ${statuses.length} statuses`)
    } catch (error) {
      // Check if this is an authentication failure
      if (error instanceof Error && error.message === 'JIRA_AUTH_FAILED') {
        console.log('🔌 getJiraProjectDetailsAction: Jira authentication failed. Disconnecting integration...')
        try {
          await jiraService.removeIntegration(session.user.id)
          console.log('✅ getJiraProjectDetailsAction: Integration disconnected successfully')
        } catch (disconnectError) {
          console.error('❌ getJiraProjectDetailsAction: Failed to disconnect integration:', disconnectError)
        }
        return { 
          success: false, 
          error: 'Jira connection has expired or been revoked. Please reconnect Jira from the Integrations page.' 
        }
      }
      // For other errors, log but continue with empty issues
      console.error('❌ getJiraProjectDetailsAction: Error fetching issues (non-auth):', error)
      issues = []
    }

    const detailedProject: DetailedJiraProject = {
      id: project.externalId || '',
      key: project.key || '',
      name: project.name,
      description: project.description || '',
      avatarUrls: { '48x48': project.avatarUrl || '' },
      projectTypeKey: 'software',
      analytics: {
        totalIssues: issues.length,
        openIssues: issues.filter(i => i.status.name === 'Open').length,
        inProgressIssues: issues.filter(i => i.status.name === 'In Progress').length,
        doneIssues: issues.filter(i => i.status.name === 'Done').length,
      },
      lead: { 
        displayName: 'Project Lead',
        avatarUrls: { '48x48': '' }
      }
    }

    console.log(`✅ getJiraProjectDetailsAction: Successfully loaded project ${projectKey} with ${issues.length} issues`)

    return {
      success: true,
      project: detailedProject,
      issues: issues,
      statuses: statuses,
      message: 'Project details loaded successfully'
    }
  } catch (error) {
    console.error('❌ Error getting Jira project details:', error)
    return { success: false, error: 'Failed to load project details' }
  }
}

async function fetchJiraProjectStatuses(integration: any, projectKey: string): Promise<Array<{ name: string }>> {
  try {
    const cloudId = integration.metadata?.cloudId
    if (!cloudId) return []

    const jiraService = new JiraService()
    const validAccessToken = await jiraService.getValidAccessToken(integration)

    const apiUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/${projectKey}/statuses`
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${validAccessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'UPMY-Integration/1.0',
      },
    })

    if (!response.ok) {
      console.error(`Failed to fetch Jira statuses: ${response.status}`)
      return []
    }

    const data = await response.json()
    const uniqueStatuses = new Map<string, { name: string }>()
    if (Array.isArray(data)) {
      data.forEach((issueType: any) => {
        if (Array.isArray(issueType.statuses)) {
          issueType.statuses.forEach((s: any) => {
            if (s.name && !uniqueStatuses.has(s.name.toUpperCase())) {
              uniqueStatuses.set(s.name.toUpperCase(), { name: s.name })
            }
          })
        }
      })
    }
    return Array.from(uniqueStatuses.values())
  } catch (error) {
    console.error('Error fetching Jira project statuses:', error)
    return []
  }
}

async function fetchJiraIssues(integration: any, projectKey: string, retryCount = 0): Promise<JiraDashboardIssue[]> {
  const maxRetries = 2
  
  try {
    const cloudId = integration.metadata?.cloudId
    if (!cloudId) {
      throw new Error('No cloud ID found in integration metadata')
    }

    // Use JiraService to get a valid access token (handles token refresh)
    const jiraService = new JiraService()
    const validAccessToken = await jiraService.getValidAccessToken(integration)

    const apiUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`
    const jql = `project = ${projectKey} ORDER BY updated DESC`
    
    console.log(`🔍 fetchJiraIssues: Fetching issues for project ${projectKey} with JQL: ${jql} (attempt ${retryCount + 1}/${maxRetries + 1})`)
    
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
        fields: ['summary', 'status', 'assignee', 'issuetype', 'priority', 'created', 'updated', 'duedate', 'resolutiondate', 'customfield_10015', 'customfield_10016', 'customfield_10018', 'customfield_10019', 'description']
      })
    })

    console.log(`🔍 fetchJiraIssues: Response status: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ fetchJiraIssues: API error response (attempt ${retryCount + 1}):`, errorText)
      
      // Check for authentication/authorization errors - these indicate broken connection
      if (response.status === 401 || response.status === 403) {
        const errorMessage = errorText.toLowerCase()
        if (
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('forbidden') ||
          errorMessage.includes('invalid token') ||
          errorMessage.includes('expired') ||
          errorMessage.includes('authentication') ||
          errorMessage.includes('authorization')
        ) {
          console.log('🔌 fetchJiraIssues: Authentication failure detected. Will disconnect integration.')
          // Throw a special error that will trigger disconnection
          throw new Error('JIRA_AUTH_FAILED')
        }
      }
      
      // Retry on certain error conditions
      if (retryCount < maxRetries && (response.status === 429 || response.status >= 500)) {
        console.log(`🔄 fetchJiraIssues: Retrying in ${(retryCount + 1) * 1000}ms...`)
        await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000))
        return fetchJiraIssues(integration, projectKey, retryCount + 1)
      }
      
      throw new Error(`Jira API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log(`🔍 fetchJiraIssues: Raw response data:`, { 
      hasIssues: !!data.issues, 
      issuesLength: data.issues?.length || 0,
      total: data.total,
      startAt: data.startAt,
      maxResults: data.maxResults 
    })
    
    // Validate response structure
    if (!data.issues || !Array.isArray(data.issues)) {
      console.error(`❌ fetchJiraIssues: Invalid response structure:`, data)
      throw new Error('Invalid response structure from Jira API')
    }

    console.log(`🔍 fetchJiraIssues: Found ${data.issues.length} issues for project ${projectKey}`)
    
    // Transform issues with better error handling
    const transformedIssues = data.issues.map((issue: any, index: number) => {
      try {
        if (!issue || !issue.fields) {
          console.warn(`⚠️ fetchJiraIssues: Issue at index ${index} has invalid structure:`, issue)
          return null
        }

        return {
          id: issue.id || '',
          key: issue.key || '',
          summary: issue.fields.summary || 'No summary',
          status: issue.fields.status || { name: 'Unknown', statusCategory: { key: 'undefined' } },
          issuetype: issue.fields.issuetype || { name: 'Unknown', iconUrl: '' },
          assignee: issue.fields.assignee || null,
          priority: issue.fields.priority || { name: 'Medium', iconUrl: '' },
          created: issue.fields.created || new Date().toISOString(),
          updated: issue.fields.updated || new Date().toISOString(),
          duedate: issue.fields.duedate || null,
          resolutiondate: issue.fields.resolutiondate || null,
          customfield_10015: issue.fields.customfield_10015 || null,
          customfield_10016: issue.fields.customfield_10016 || null,
          customfield_10018: issue.fields.customfield_10018 || null,
          customfield_10019: issue.fields.customfield_10019 || null,
          description: issue.fields.description || ''
        }
      } catch (transformError) {
        console.error(`❌ fetchJiraIssues: Error transforming issue at index ${index}:`, transformError, issue)
        return null
      }
    }).filter(Boolean) // Remove null entries

    console.log(`✅ fetchJiraIssues: Successfully transformed ${transformedIssues.length} issues`)
    return transformedIssues as JiraDashboardIssue[]
    
  } catch (error) {
    console.error(`❌ Error fetching Jira issues (attempt ${retryCount + 1}):`, error)
    
    // Check if this is an authentication failure that should trigger disconnection
    if (error instanceof Error && error.message === 'JIRA_AUTH_FAILED') {
      // Re-throw to let getJiraProjectDetailsAction handle disconnection
      throw error
    }
    
    // Retry on network errors or token issues
    if (retryCount < maxRetries && (
      error instanceof Error && (
        error.message.includes('fetch') ||
        error.message.includes('network') ||
        error.message.includes('timeout') ||
        (error.message.includes('token') && !error.message.includes('JIRA_AUTH_FAILED'))
      )
    )) {
      console.log(`🔄 fetchJiraIssues: Retrying due to ${error.message}...`)
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000))
      return fetchJiraIssues(integration, projectKey, retryCount + 1)
    }
    
    // Return empty array on final failure (non-auth errors)
    console.error(`❌ fetchJiraIssues: Final failure after ${retryCount + 1} attempts`)
    return []
  }
}

export async function getTrelloProjectDetailsAction(projectId: string) {
  // This function is not used for Trello projects, but kept for compatibility
  return { success: false, error: 'Use Trello integration for Trello projects' }
} 