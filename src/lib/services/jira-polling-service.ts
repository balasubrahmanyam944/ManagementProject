/**
 * Jira Polling Service
 * Polls Jira for changes when webhooks aren't available or reliable
 * Detects changes made by ANY user in the Jira project
 */

import { jiraService } from '@/lib/integrations/jira-service'
import { broadcastWebhookUpdate } from './realtime-service'
import { db } from '@/lib/db/database'

interface ProjectPollState {
  userId: string
  projectKey: string
  lastPollTime: Date
  lastIssueKeys: Set<string>
  lastIssueUpdates: Map<string, Date> // issueKey -> lastUpdated timestamp
  isPolling: boolean
}

// Store polling state per project
const pollingStates = new Map<string, ProjectPollState>()

// Polling intervals (in milliseconds)
const POLL_INTERVAL = 30000 // 30 seconds
const INITIAL_POLL_DELAY = 5000 // 5 seconds after start

/**
 * Start polling for a Jira project
 */
export async function startPollingProject(userId: string, projectKey: string): Promise<void> {
  const stateKey = `${userId}:${projectKey}`
  
  // Don't start if already polling
  if (pollingStates.has(stateKey)) {
    const state = pollingStates.get(stateKey)!
    if (state.isPolling) {
      console.log(`🔄 JIRA POLLING: Already polling ${projectKey} for user ${userId}`)
      return
    }
  }

  console.log(`🔄 JIRA POLLING: ========== STARTING POLLING ==========`)
  console.log(`   Project: ${projectKey}`)
  console.log(`   User ID: ${userId}`)
  console.log(`   Poll Interval: ${POLL_INTERVAL / 1000} seconds`)
  console.log(`🔄 JIRA POLLING: ======================================`)

  const state: ProjectPollState = {
    userId,
    projectKey,
    lastPollTime: new Date(),
    lastIssueKeys: new Set(),
    lastIssueUpdates: new Map(),
    isPolling: true,
  }

  pollingStates.set(stateKey, state)

  // Initial poll after delay
  setTimeout(() => {
    pollProject(userId, projectKey)
  }, INITIAL_POLL_DELAY)

  // Set up interval polling
  const intervalId = setInterval(async () => {
    const currentState = pollingStates.get(stateKey)
    if (!currentState || !currentState.isPolling) {
      clearInterval(intervalId)
      return
    }
    await pollProject(userId, projectKey)
  }, POLL_INTERVAL)

  // Store interval ID in state for cleanup
  ;(state as any).intervalId = intervalId
}

/**
 * Stop polling for a project
 */
export function stopPollingProject(userId: string, projectKey: string): void {
  const stateKey = `${userId}:${projectKey}`
  const state = pollingStates.get(stateKey)
  
  if (state && (state as any).intervalId) {
    clearInterval((state as any).intervalId)
  }
  
  pollingStates.delete(stateKey)
  console.log(`🔄 JIRA POLLING: Stopped polling for project ${projectKey}`)
}

/**
 * Poll a project for changes
 */
async function pollProject(userId: string, projectKey: string): Promise<void> {
  const stateKey = `${userId}:${projectKey}`
  const state = pollingStates.get(stateKey)
  // 🧱 FIRST POLL BASELINE (DO NOT BROADCAST)
  
    if (!state || !state.isPolling) {
      return
    }
    const isFirstPoll =
    state.lastIssueKeys.size === 0 &&
    state.lastIssueUpdates.size === 0

  const pollStartTime = new Date()
  const pollStartTimeISO = pollStartTime.toISOString()
  
  try {
    // Get integration FIRST - if not connected, stop polling for this project
    const integration = await jiraService.getIntegration(userId)
    if (!integration || integration.status !== 'CONNECTED') {
      console.log(`🔄 JIRA POLLING: ⚠️ Integration not connected for ${projectKey} - stopping polling`)
      stopPollingProject(userId, projectKey)
      return
    }
    
    console.log(`🔄 JIRA POLLING: ========== POLLING CYCLE START ==========`)
    console.log(`   Project: ${projectKey}`)
    console.log(`   Time: ${pollStartTimeISO}`)
    console.log(`   User ID: ${userId}`)

    // Fetch recent issues using Jira API
    const cloudId = integration.metadata?.cloudId
    if (!cloudId) {
      console.log(`🔄 JIRA POLLING: No cloud ID for ${projectKey}`)
      return
    }

    const accessToken = await jiraService.getValidAccessToken(integration)
    const apiUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`
    const jql = `project = ${projectKey} ORDER BY updated DESC`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jql: jql,
        maxResults: 50, // Check last 50 issues
        fields: ['key', 'summary', 'status', 'updated'],
      }),
    })

    if (!response.ok) {
      console.error(`❌ JIRA POLLING: API error for ${projectKey}:`, response.status)
      return
    }

    const data = await response.json()
    const issues = data.issues || []

    const currentIssueKeys = new Set<string>()
    const currentIssueUpdates = new Map<string, Date>()

    // Process each issue
    for (const issue of issues) {
      const issueKey = issue.key
      const updated = new Date(issue.fields?.updated || issue.updated || new Date())
      
      currentIssueKeys.add(issueKey)
      currentIssueUpdates.set(issueKey, updated)

      // Check if this is a new issue
      if (!state.lastIssueKeys.has(issueKey)) {
        if (!isFirstPoll) {
        const issueSummary = issue.fields?.summary || 'Unknown'
        const status = issue.fields?.status?.name || 'Unknown'
        console.log(`🔄 JIRA POLLING: ✅ NEW ISSUE DETECTED`)
        console.log(`   Project: ${projectKey}`)
        console.log(`   Issue: ${issueKey}`)
        console.log(`   Summary: ${issueSummary}`)
        console.log(`   Status: ${status}`)
        console.log(`   User ID: ${userId}`)
        await broadcastChange(userId, projectKey, issueKey, issue, 'jira:issue_created')
        }
        continue
      }

      // Check if issue was updated since last poll
      const lastUpdate = state.lastIssueUpdates.get(issueKey)
      if (!isFirstPoll && lastUpdate && updated > lastUpdate) {
        const issueSummary = issue.fields?.summary || 'Unknown'
        const oldStatus = state.lastIssueUpdates.get(issueKey) ? 'Unknown' : 'Unknown' // We don't store old status, but we can log the new one
        const newStatus = issue.fields?.status?.name || 'Unknown'
        const timeDiff = Math.round((updated.getTime() - lastUpdate.getTime()) / 1000) // seconds
        
        console.log(`🔄 JIRA POLLING: ✅ ISSUE UPDATED DETECTED`)
        console.log(`   Project: ${projectKey}`)
        console.log(`   Issue: ${issueKey}`)
        console.log(`   Summary: ${issueSummary}`)
        console.log(`   Status: ${newStatus}`)
        console.log(`   Last Updated: ${lastUpdate.toISOString()}`)
        console.log(`   Current Updated: ${updated.toISOString()}`)
        console.log(`   Time Since Last Update: ${timeDiff} seconds`)
        console.log(`   User ID: ${userId}`)
        
        await broadcastChange(userId, projectKey, issueKey, issue, 'jira:issue_updated')
      }
    }

    // Check for deleted issues (issues that were in last poll but not in current)
    for (const oldIssueKey of state.lastIssueKeys) {
      if (!isFirstPoll && !currentIssueKeys.has(oldIssueKey)) {
        console.log(`🔄 JIRA POLLING: ✅ ISSUE DELETED DETECTED`)
        console.log(`   Project: ${projectKey}`)
        console.log(`   Issue: ${oldIssueKey}`)
        console.log(`   User ID: ${userId}`)
        await broadcastChange(userId, projectKey, oldIssueKey, null, 'jira:issue_deleted')
      }
    }
    
    const pollEndTime = new Date()
    const pollEndTimeISO = pollEndTime.toISOString()
    const pollDuration = Math.round((pollEndTime.getTime() - pollStartTime.getTime()) / 1000)
    
    if (issues.length > 0) {
      console.log(`🔄 JIRA POLLING: ✅ Poll completed for ${projectKey}`)
      console.log(`   Issues checked: ${issues.length}`)
      console.log(`   Duration: ${pollDuration}s`)
      console.log(`   Time: ${pollEndTimeISO}`)
      console.log(`🔄 JIRA POLLING: ========== POLLING CYCLE END ==========`)
    } else {
      console.log(`🔄 JIRA POLLING: ✅ Poll completed for ${projectKey} - No issues found`)
      console.log(`   Duration: ${pollDuration}s`)
      console.log(`   Time: ${pollEndTimeISO}`)
      console.log(`🔄 JIRA POLLING: ========== POLLING CYCLE END ==========`)
    }

    // Update state
    state.lastPollTime = new Date()
    state.lastIssueKeys = currentIssueKeys
    state.lastIssueUpdates = currentIssueUpdates

  } catch (error) {
    console.error(`❌ JIRA POLLING: Error polling ${projectKey}:`, error)
    console.error(`   Time: ${new Date().toISOString()}`)
    console.log(`🔄 JIRA POLLING: ========== POLLING CYCLE END (ERROR) ==========`)
  }
}

/**
 * Broadcast a change event
 */
async function broadcastChange(
  userId: string,
  projectKey: string,
  issueKey: string,
  issue: any,
  eventType: string
): Promise<void> {
  // Handle both Jira API format (fields.*) and our internal format
  const issueSummary = issue?.fields?.summary || issue?.summary || 'Unknown'
  const status = issue?.fields?.status?.name || issue?.status?.name || 'Unknown'
  const updated = issue?.fields?.updated || issue?.updated || new Date().toISOString()

  const updatedData = {
    issueKey,
    issueSummary,
    status,
    updated,
  }

  console.log(`📡 JIRA POLLING: ========== BROADCASTING UPDATE ==========`)
  console.log(`   Event Type: ${eventType}`)
  console.log(`   Project: ${projectKey}`)
  console.log(`   Issue: ${issueKey}`)
  console.log(`   Summary: ${issueSummary}`)
  console.log(`   Status: ${status}`)
  console.log(`   Updated: ${updated}`)
  console.log(`   User ID: ${userId}`)
  console.log(`📡 JIRA POLLING: =========================================`)
  
  await broadcastWebhookUpdate(
    userId,
    'JIRA',
    eventType,
    projectKey,
    updatedData
  )
  
  console.log(`✅ JIRA POLLING: Broadcast completed for ${issueKey}`)
}

/**
 * Start polling for all active projects for a user
 * NOTE: Polling is a FALLBACK mechanism. Webhooks should be the primary method.
 * Polling will only start if webhooks are not active or have errors.
 */
export async function startPollingForUser(userId: string): Promise<void> {
  try {
    console.log(`🔄 JIRA POLLING: ========== CHECKING IF POLLING NEEDED ==========`)
    console.log(`   User ID: ${userId}`)
    
    // FIRST: Check if webhooks are active
    // Polling should only be used as a fallback when webhooks fail
    const { jiraWebhookService } = await import('../integrations/jira-webhook-service')
    const webhookStatus = await jiraWebhookService.getWebhookStatus(userId)
    
    console.log(`   🔍 Webhook Status Check:`)
    console.log(`      Registered: ${webhookStatus.registered}`)
    console.log(`      Status: ${webhookStatus.status}`)
    console.log(`      Error Count: ${webhookStatus.errorCount}`)
    console.log(`      Last Triggered: ${webhookStatus.lastTriggered || 'Never'}`)
    
    // If webhooks are ACTIVE and working, don't start polling
    if (webhookStatus.registered && webhookStatus.status === 'ACTIVE') {
      const timeSinceLastTrigger = webhookStatus.lastTriggered 
        ? Date.now() - new Date(webhookStatus.lastTriggered).getTime()
        : Infinity
      
      // If webhook was triggered recently (within last 5 minutes), it's working
      if (timeSinceLastTrigger < 5 * 60 * 1000) {
        console.log(`   ✅ Webhooks are ACTIVE and working (last triggered ${Math.round(timeSinceLastTrigger / 1000)}s ago)`)
        console.log(`   ⏭️  Skipping polling - webhooks are handling updates`)
        console.log(`🔄 JIRA POLLING: ===============================================`)
        return
      }
      
      // If webhook hasn't been triggered recently but has low error count, still trust it
      if (webhookStatus.errorCount < 3) {
        console.log(`   ⚠️  Webhooks are ACTIVE but haven't been triggered recently`)
        console.log(`   🔄 Starting polling as backup (webhooks may be working but no updates yet)`)
      } else {
        console.log(`   ⚠️  Webhooks are ACTIVE but have ${webhookStatus.errorCount} errors`)
        console.log(`   🔄 Starting polling as fallback due to webhook errors`)
      }
    } else if (webhookStatus.registered && webhookStatus.status === 'PENDING') {
      console.log(`   ⚠️  Webhooks are PENDING (not yet active)`)
      console.log(`   🔄 Starting polling as fallback until webhooks become active`)
    } else {
      console.log(`   ❌ Webhooks are NOT registered or NOT active`)
      console.log(`   🔄 Attempting to auto-register webhooks...`)
      
      // Try to auto-register webhooks if integration is connected
      try {
        const integration = await jiraService.getIntegration(userId)
        if (integration && integration.status === 'CONNECTED') {
          // Get base URL and path from environment
          // For tenant environments, try to detect from environment variables
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:9003'
          
          // Try to get tenant from user's projects or integration metadata
          let basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
          const userProjects = await db.findProjectsByUserId(userId)
          if (userProjects.length > 0 && userProjects[0].tenantId) {
            // Extract tenant from project if available
            const tenantMatch = userProjects[0].tenantId.toString().match(/^[^/]+/)
            if (tenantMatch) {
              basePath = `/${tenantMatch[0]}`
            }
          }
          
          // Determine base URL - use the port from appUrl or default to 9003
          const urlMatch = appUrl.match(/:(\d+)/)
          const port = urlMatch ? urlMatch[1] : '9003'
          const baseUrl = appUrl.replace(/:\d+.*/, `:${port}`)
          
          console.log(`   🔗 Attempting webhook registration with:`)
          console.log(`      Base URL: ${baseUrl}`)
          console.log(`      Base Path: ${basePath}`)
          
          const registerResult = await jiraWebhookService.registerWebhook(userId, baseUrl, basePath)
          if (registerResult.success) {
            console.log(`   ✅ Webhooks auto-registered successfully: ${registerResult.webhookId}`)
            console.log(`   ⏭️  Skipping polling - webhooks should handle updates`)
            console.log(`🔄 JIRA POLLING: ===============================================`)
            return
          } else {
            console.log(`   ⚠️  Webhook auto-registration failed: ${registerResult.error}`)
            console.log(`   🔄 Starting polling as primary method (webhooks unavailable)`)
          }
        }
      } catch (autoRegisterError) {
        console.log(`   ⚠️  Webhook auto-registration error:`, autoRegisterError)
        console.log(`   🔄 Starting polling as primary method (webhooks unavailable)`)
      }
    }
    
    console.log(`🔄 JIRA POLLING: ========== STARTING POLLING FOR USER ==========`)
    
    // First, find the Jira integration for this user
    console.log(`   🔍 Looking for Jira integration...`)
    let jiraIntegration
    try {
      jiraIntegration = await db.findIntegrationByType(userId, 'JIRA')
      console.log(`   🔍 findIntegrationByType returned:`, jiraIntegration ? `Found (ID: ${jiraIntegration._id})` : 'null')
    } catch (integrationError) {
      console.error(`   ❌ Error finding Jira integration:`, integrationError)
      console.log(`🔄 JIRA POLLING: ===============================================`)
      return
    }
    
    if (!jiraIntegration) {
      console.log(`   ❌ No Jira integration found for user`)
      // Let's also check all integrations to debug
      try {
        const allIntegrations = await db.findIntegrationsByUserId(userId)
        console.log(`   🔍 User has ${allIntegrations.length} total integration(s):`)
        allIntegrations.forEach((int, i) => {
          console.log(`      ${i + 1}. Type: ${int.type}, Status: ${int.status}, ID: ${int._id}`)
        })
      } catch (err) {
        console.error(`   ❌ Error fetching all integrations:`, err)
      }
      console.log(`🔄 JIRA POLLING: ===============================================`)
      return
    }
    
    if (jiraIntegration.status !== 'CONNECTED') {
      console.log(`   ❌ Jira integration not connected (status: ${jiraIntegration.status})`)
      console.log(`🔄 JIRA POLLING: ===============================================`)
      return
    }
    
    console.log(`   ✅ Jira integration found (ID: ${jiraIntegration._id}, Status: ${jiraIntegration.status})`)
    
    // Get all projects for this user that belong to the Jira integration
    console.log(`   🔍 Fetching all projects for user...`)
    let allProjects
    try {
      allProjects = await db.findProjectsByUserId(userId)
      console.log(`   📊 Total projects in DB: ${allProjects.length}`)
    } catch (projectsError) {
      console.error(`   ❌ Error fetching projects:`, projectsError)
      console.log(`🔄 JIRA POLLING: ===============================================`)
      return
    }
    
    // Filter to only Jira projects (by matching integrationId)
    const jiraIntegrationIdStr = jiraIntegration._id?.toString()
    console.log(`   🔍 Filtering projects by integrationId: ${jiraIntegrationIdStr}`)
    
    const jiraProjects = allProjects.filter(p => {
      const integrationIdStr = p.integrationId?.toString()
      const isJiraProject = integrationIdStr === jiraIntegrationIdStr
      const hasKey = !!(p.key || p.externalId)
      const isActive = p.isActive !== false // Default to true if undefined
      
      // Only include if it matches the integration and has required fields
      return isJiraProject && hasKey && isActive
    })
    
    // Log summary instead of per-project details
    console.log(`   📋 Filtered ${jiraProjects.length} active Jira project(s) from ${allProjects.length} total`)
    if (jiraProjects.length > 0) {
      console.log(`   ✅ Projects to poll: ${jiraProjects.map(p => p.key || p.externalId).join(', ')}`)
    }

    console.log(`   Found ${jiraProjects.length} active Jira project(s)`)
    if (jiraProjects.length > 0) {
      jiraProjects.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.name} (${p.key || p.externalId})`)
      })
    } else {
      console.log(`   ⚠️ No matching projects found. Check integrationId matching above.`)
    }

    // Verify integration is still active before starting polling for each project
    // This prevents starting polling for projects when integration becomes inactive
    const currentIntegration = await jiraService.getIntegration(userId)
    if (!currentIntegration || currentIntegration.status !== 'CONNECTED') {
      console.log(`   ⚠️ Integration is not active - skipping all projects`)
      console.log(`🔄 JIRA POLLING: ===============================================`)
      return
    }

    for (const project of jiraProjects) {
      const projectKey = project.key || project.externalId
      if (projectKey) {
        console.log(`   🚀 Starting polling for project: ${projectKey}`)
        await startPollingProject(userId, projectKey)
      }
    }
    
    console.log(`✅ JIRA POLLING: Polling started for ${jiraProjects.length} project(s)`)
    console.log(`🔄 JIRA POLLING: ===============================================`)
  } catch (error) {
    console.error('❌ JIRA POLLING: Error starting polling for user:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
      console.error('   Error stack:', error.stack)
    }
  }
}

/**
 * Stop all polling for a user
 */
export function stopPollingForUser(userId: string): void {
  for (const [key, state] of pollingStates.entries()) {
    if (state.userId === userId) {
      stopPollingProject(userId, state.projectKey)
    }
  }
}

/**
 * Get polling status
 */
export function getPollingStatus(): {
  activePolls: number
  projects: Array<{ userId: string; projectKey: string; lastPollTime: Date }>
} {
  const projects = Array.from(pollingStates.values())
    .filter(s => s.isPolling)
    .map(s => ({
      userId: s.userId,
      projectKey: s.projectKey,
      lastPollTime: s.lastPollTime,
    }))

  return {
    activePolls: projects.length,
    projects,
  }
}

