/**
 * Jira Webhook Service
 * Handles registration, verification, and processing of Jira webhooks
 */

import { db, type Integration } from '../db/database'
import type {
  JiraWebhookPayload,
  JiraWebhookEventType,
  JiraWebhookRegistration,
  JiraWebhookResponse,
  WebhookProcessResult,
} from '@/types/webhooks'
import { jiraService } from './jira-service'
import { broadcastWebhookUpdate } from '../services/realtime-service'
import crypto from 'crypto'

// Jira webhook events we want to subscribe to
const JIRA_WEBHOOK_EVENTS: JiraWebhookEventType[] = [
  'jira:issue_created',
  'jira:issue_updated',
  'jira:issue_deleted',
  'sprint_created',
  'sprint_updated',
  'sprint_started',
  'sprint_closed',
  'project_updated',
]

export class JiraWebhookService {
  /**
   * Generate the webhook callback URL for a tenant
   */
  getCallbackUrl(baseUrl: string, basePath: string = ''): string {
    // Remove trailing slash from baseUrl and basePath
    const cleanBaseUrl = baseUrl.replace(/\/$/, '')
    const cleanBasePath = basePath.replace(/\/$/, '')
    
    // For local IPs (172.x, 192.x, 10.x, 127.x), use HTTP instead of HTTPS
    // Jira Cloud requires HTTPS, but local development can use HTTP
    let url = `${cleanBaseUrl}${cleanBasePath}/api/webhooks/jira`
    
    // If baseUrl is HTTPS but contains local IP, change to HTTP
    if (url.startsWith('https://') && (
      url.includes('172.16.') || 
      url.includes('192.168.') || 
      url.includes('10.') || 
      url.includes('127.0.0.1') ||
      url.includes('localhost')
    )) {
      url = url.replace('https://', 'http://')
      console.log('🔗 JIRA WEBHOOK: Changed HTTPS to HTTP for local IP:', url)
    }
    
    return url
  }

  /**
   * Generate a secret for webhook verification
   */
  generateSecret(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Register a webhook with Jira for all projects
   */
  async registerWebhook(
    userId: string,
    baseUrl: string,
    basePath: string = ''
  ): Promise<{ success: boolean; webhookId?: string; error?: string }> {
    try {
      console.log('🔗 JIRA WEBHOOK: Registering webhook for user:', userId)

      // Get Jira integration
      const integration = await jiraService.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        return { success: false, error: 'Jira integration not connected' }
      }

      const cloudId = integration.metadata?.cloudId
      if (!cloudId) {
        return { success: false, error: 'No Jira cloud ID found' }
      }

      // Generate callback URL and secret
      const callbackUrl = this.getCallbackUrl(baseUrl, basePath)
      const secret = this.generateSecret()

      console.log('🔗 JIRA WEBHOOK: Callback URL:', callbackUrl)

      // Get valid access token
      const accessToken = await jiraService.getValidAccessToken(integration)

      // Register webhook with Jira
      const webhookPayload: JiraWebhookRegistration = {
        name: `UPMY Webhook - ${userId.substring(0, 8)}`,
        url: callbackUrl,
        events: JIRA_WEBHOOK_EVENTS,
        excludeBody: false,
      }

      const apiUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`
      
      // First, list existing webhooks to check if we already have one
      const listResponse = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      })

      if (listResponse.ok) {
        const existingWebhooks = await listResponse.json()
        // Check if we already have a webhook for this callback URL
        const existingWebhook = existingWebhooks.values?.find(
          (wh: any) => wh.url === callbackUrl
        )
        
        if (existingWebhook) {
          console.log('🔗 JIRA WEBHOOK: Webhook already exists, updating...')
          // Update existing webhook in database
          await db.createWebhook({
            webhookId: existingWebhook.self || existingWebhook.id || `jira-${userId}`,
            userId: require('mongodb').ObjectId.createFromHexString(userId),
            integrationType: 'JIRA',
            callbackUrl,
            events: JIRA_WEBHOOK_EVENTS,
            secret,
            status: 'ACTIVE',
            errorCount: 0,
          })
          
          return { success: true, webhookId: existingWebhook.self || existingWebhook.id }
        }
      }

      // Register new webhook
      // Note: Jira Cloud uses POST to register webhooks
      // The API might vary based on Jira version
      const registerResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhooks: [webhookPayload]
        }),
      })

      if (!registerResponse.ok) {
        const errorText = await registerResponse.text()
        console.error('❌ JIRA WEBHOOK: Registration failed:', registerResponse.status, errorText)
        
        // Try alternative registration method for Jira Cloud
        return await this.registerWebhookAlternative(userId, integration, callbackUrl, secret)
      }

      const result = await registerResponse.json()
      const webhookId = result.webhookRegistrationResult?.[0]?.createdWebhookId || 
                       result.id || 
                       `jira-${userId}-${Date.now()}`

      console.log('✅ JIRA WEBHOOK: Webhook registered:', webhookId)

      // Store webhook config in database
      await db.createWebhook({
        webhookId,
        userId: require('mongodb').ObjectId.createFromHexString(userId),
        integrationType: 'JIRA',
        callbackUrl,
        events: JIRA_WEBHOOK_EVENTS,
        secret,
        status: 'ACTIVE',
        errorCount: 0,
      })

      return { success: true, webhookId }
    } catch (error) {
      console.error('❌ JIRA WEBHOOK: Registration error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Alternative webhook registration using Jira Connect app webhooks
   * This is used when the standard webhook API doesn't work
   */
  private async registerWebhookAlternative(
    userId: string,
    integration: Integration,
    callbackUrl: string,
    secret: string
  ): Promise<{ success: boolean; webhookId?: string; error?: string }> {
    try {
      console.log('🔗 JIRA WEBHOOK: Trying alternative registration method...')
      
      // For Jira Cloud OAuth apps, webhooks might need to be registered differently
      // Store as a "pending" webhook that will work via polling fallback
      const webhookId = `jira-poll-${userId}-${Date.now()}`
      
      await db.createWebhook({
        webhookId,
        userId: require('mongodb').ObjectId.createFromHexString(userId),
        integrationType: 'JIRA',
        callbackUrl,
        events: JIRA_WEBHOOK_EVENTS,
        secret,
        status: 'PENDING', // Mark as pending - will use polling fallback
        errorCount: 0,
      })

      console.log('⚠️ JIRA WEBHOOK: Using polling fallback mode')
      return { 
        success: true, 
        webhookId,
      }
    } catch (error) {
      console.error('❌ JIRA WEBHOOK: Alternative registration failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Unregister a webhook from Jira
   */
  async unregisterWebhook(userId: string): Promise<boolean> {
    try {
      console.log('🔗 JIRA WEBHOOK: Unregistering webhooks for user:', userId)

      // Get all webhooks for this user
      const webhooks = await db.findWebhooksByIntegration(userId, 'JIRA')
      
      if (webhooks.length === 0) {
        console.log('🔗 JIRA WEBHOOK: No webhooks found to unregister')
        return true
      }

      // Get Jira integration
      const integration = await jiraService.getIntegration(userId)
      
      if (integration && integration.status === 'CONNECTED') {
        const cloudId = integration.metadata?.cloudId
        
        if (cloudId) {
          try {
            const accessToken = await jiraService.getValidAccessToken(integration)
            
            // Try to delete each webhook from Jira
            for (const webhook of webhooks) {
              if (webhook.webhookId && !webhook.webhookId.startsWith('jira-poll-')) {
                const deleteUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`
                
                await fetch(deleteUrl, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    webhookIds: [webhook.webhookId]
                  }),
                })
              }
            }
          } catch (error) {
            console.warn('⚠️ JIRA WEBHOOK: Could not delete from Jira API:', error)
            // Continue to delete from database even if Jira API fails
          }
        }
      }

      // Delete from database
      const deletedCount = await db.deleteWebhooksByUser(userId, 'JIRA')
      console.log('✅ JIRA WEBHOOK: Deleted', deletedCount, 'webhooks from database')

      return true
    } catch (error) {
      console.error('❌ JIRA WEBHOOK: Unregister error:', error)
      return false
    }
  }

  /**
   * Verify webhook signature (if applicable)
   */
  verifyWebhookSignature(
    payload: string,
    signature: string | null,
    secret: string
  ): boolean {
    if (!signature) {
      // Jira might not send a signature for all webhook types
      return true
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    } catch (error) {
      console.error('❌ JIRA WEBHOOK: Signature verification error:', error)
      return false
    }
  }

  /**
   * Process incoming webhook payload
   */
  async processWebhook(payload: JiraWebhookPayload): Promise<WebhookProcessResult> {
    try {
      console.log('📥 JIRA WEBHOOK: Processing event:', payload.webhookEvent)

      const eventType = payload.webhookEvent
      let projectId: string | undefined
      let userId: string | undefined

      // Extract project info from payload
      if (payload.issue?.fields?.project) {
        projectId = payload.issue.fields.project.key
      } else if (payload.project) {
        projectId = payload.project.key
      }

      // Find user by project (we need to look up who owns this project)
      if (projectId) {
        console.log('📥 JIRA WEBHOOK: Looking up project:', projectId)
        const webhook = await this.findWebhookByProject(projectId)
        if (webhook) {
          userId = webhook.userId.toString()
          console.log('✅ JIRA WEBHOOK: Found user:', userId, 'for project:', projectId)
          
          // Update last triggered time
          if (webhook.webhookId && !webhook.webhookId.startsWith('auto-')) {
            await db.updateWebhookLastTriggered(webhook.webhookId)
          }
        } else {
          console.warn('⚠️ JIRA WEBHOOK: No webhook found for project:', projectId)
        }
      } else {
        console.warn('⚠️ JIRA WEBHOOK: No project ID found in payload')
      }

      if (!userId) {
        console.error('❌ JIRA WEBHOOK: Cannot process - no userId found for project:', projectId)
        return {
          success: false,
          eventType,
          error: `No user found for project ${projectId}`,
        }
      }

      // Store the event
      await db.createWebhookEvent({
        userId: require('mongodb').ObjectId.createFromHexString(userId),
        integrationType: 'JIRA',
        eventType,
        projectId,
        payload,
        processed: false,
        retryCount: 0,
      })

      // Process based on event type
      switch (eventType) {
        case 'jira:issue_created':
        case 'jira:issue_updated':
        case 'jira:issue_deleted':
          return await this.processIssueEvent(payload, userId, projectId)
        
        case 'sprint_created':
        case 'sprint_updated':
        case 'sprint_started':
        case 'sprint_closed':
          return await this.processSprintEvent(payload, userId, projectId)
        
        case 'project_updated':
          return await this.processProjectEvent(payload, userId, projectId)
        
        default:
          console.log('⚠️ JIRA WEBHOOK: Unhandled event type:', eventType)
          return {
            success: true,
            eventType,
            projectId,
          }
      }
    } catch (error) {
      console.error('❌ JIRA WEBHOOK: Processing error:', error)
      return {
        success: false,
        eventType: payload.webhookEvent,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Process issue-related events
   */
  private async processIssueEvent(
    payload: JiraWebhookPayload,
    userId?: string,
    projectId?: string
  ): Promise<WebhookProcessResult> {
    console.log('📋 JIRA WEBHOOK: Processing issue event for project:', projectId)

    if (!userId || !projectId) {
      return {
        success: false,
        eventType: payload.webhookEvent,
        error: 'Could not determine user or project',
      }
    }

    try {
      // Trigger a project sync to update analytics
      // This will refresh the issue counts and status distribution
      await jiraService.fetchAndStoreProjects(userId)

      const updatedData = {
        issueKey: payload.issue?.key,
        issueSummary: payload.issue?.fields?.summary,
        status: payload.issue?.fields?.status?.name,
      }

      console.log('📡 JIRA WEBHOOK: ========== BROADCASTING UPDATE ==========')
      console.log(`   Event Type: ${payload.webhookEvent}`)
      console.log(`   Project: ${projectId}`)
      console.log(`   Issue: ${updatedData.issueKey}`)
      console.log(`   Summary: ${updatedData.issueSummary}`)
      console.log(`   Status: ${updatedData.status}`)
      console.log(`   User ID: ${userId}`)
      console.log('📡 JIRA WEBHOOK: =========================================')

      // Broadcast update to connected clients
      await broadcastWebhookUpdate(userId, 'JIRA', payload.webhookEvent, projectId, updatedData)
      
      console.log(`✅ JIRA WEBHOOK: Broadcast completed for ${updatedData.issueKey}`)

      return {
        success: true,
        userId,
        projectId,
        eventType: payload.webhookEvent,
        updatedData,
      }
    } catch (error) {
      console.error('❌ JIRA WEBHOOK: Issue event processing error:', error)
      return {
        success: false,
        eventType: payload.webhookEvent,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Process sprint-related events
   */
  private async processSprintEvent(
    payload: JiraWebhookPayload,
    userId?: string,
    projectId?: string
  ): Promise<WebhookProcessResult> {
    console.log('🏃 JIRA WEBHOOK: Processing sprint event')

    if (!userId) {
      return {
        success: false,
        eventType: payload.webhookEvent,
        error: 'Could not determine user',
      }
    }

    try {
      // Trigger project sync
      await jiraService.fetchAndStoreProjects(userId)

      return {
        success: true,
        userId,
        projectId,
        eventType: payload.webhookEvent,
        updatedData: {
          sprintId: payload.sprint?.id,
          sprintName: payload.sprint?.name,
          sprintState: payload.sprint?.state,
        },
      }
    } catch (error) {
      console.error('❌ JIRA WEBHOOK: Sprint event processing error:', error)
      return {
        success: false,
        eventType: payload.webhookEvent,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Process project-related events
   */
  private async processProjectEvent(
    payload: JiraWebhookPayload,
    userId?: string,
    projectId?: string
  ): Promise<WebhookProcessResult> {
    console.log('📁 JIRA WEBHOOK: Processing project event for:', projectId)

    if (!userId) {
      return {
        success: false,
        eventType: payload.webhookEvent,
        error: 'Could not determine user',
      }
    }

    try {
      // Trigger project sync
      await jiraService.fetchAndStoreProjects(userId)

      return {
        success: true,
        userId,
        projectId,
        eventType: payload.webhookEvent,
        updatedData: {
          projectKey: payload.project?.key,
          projectName: payload.project?.name,
        },
      }
    } catch (error) {
      console.error('❌ JIRA WEBHOOK: Project event processing error:', error)
      return {
        success: false,
        eventType: payload.webhookEvent,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Find webhook by project key
   */
  private async findWebhookByProject(projectKey: string): Promise<any> {
    // Look through all JIRA webhooks and find the one that matches this project
    // This is a simplified approach - in production you might want to store project mappings
    const { getCollection, COLLECTIONS } = await import('../db/mongodb')
    const webhooksCollection = await getCollection(COLLECTIONS.WEBHOOKS)
    const projectsCollection = await getCollection(COLLECTIONS.PROJECTS)

    // Find the project by external ID (Jira key)
    const project = await projectsCollection.findOne({ 
      $or: [
        { externalId: projectKey },
        { key: projectKey }
      ]
    })

    if (!project) {
      console.log('⚠️ JIRA WEBHOOK: Could not find project:', projectKey)
      return null
    }

    // First try to find a registered webhook for this user
    const webhook = await webhooksCollection.findOne({
      userId: project.userId,
      integrationType: 'JIRA',
      status: { $in: ['ACTIVE', 'PENDING'] }
    })

    // If no webhook found, still return user info for broadcasting
    // This allows updates even if webhook wasn't formally registered
    if (!webhook) {
      console.log('📡 JIRA WEBHOOK: No registered webhook, but found project owner:', project.userId.toString())
      return {
        userId: project.userId,
        webhookId: 'auto-' + projectKey, // Placeholder ID
        integrationType: 'JIRA',
        status: 'ACTIVE',
      }
    }

    return webhook
  }

  /**
   * Get webhook status for a user
   */
  async getWebhookStatus(userId: string): Promise<{
    registered: boolean
    status: string
    lastTriggered?: Date
    errorCount: number
  }> {
    const webhooks = await db.findWebhooksByIntegration(userId, 'JIRA')
    
    if (webhooks.length === 0) {
      return {
        registered: false,
        status: 'NOT_REGISTERED',
        errorCount: 0,
      }
    }

    const webhook = webhooks[0]
    return {
      registered: true,
      status: webhook.status,
      lastTriggered: webhook.lastTriggeredAt,
      errorCount: webhook.errorCount,
    }
  }
}

export const jiraWebhookService = new JiraWebhookService()

