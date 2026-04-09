/**
 * Trello Webhook Service
 * Handles registration, verification, and processing of Trello webhooks
 */

import { db, type Integration } from '../db/database'
import type {
  TrelloWebhookPayload,
  TrelloWebhookActionType,
  WebhookProcessResult,
} from '@/types/webhooks'
import { trelloService } from './trello-service'
import { broadcastWebhookUpdate } from '../services/realtime-service'
import crypto from 'crypto'

// Trello doesn't filter events on registration - all model events are sent
// We filter on the processing side
const RELEVANT_TRELLO_ACTIONS: TrelloWebhookActionType[] = [
  'createCard',
  'updateCard',
  'deleteCard',
  'moveCardFromBoard',
  'moveCardToBoard',
  'createList',
  'updateList',
  'updateBoard',
  'addMemberToCard',
  'removeMemberFromCard',
  'addLabelToCard',
  'removeLabelFromCard',
  'commentCard',
]

export class TrelloWebhookService {
  /**
   * Generate the webhook callback URL for a tenant
   */
  getCallbackUrl(baseUrl: string, basePath: string = ''): string {
    const cleanBaseUrl = baseUrl.replace(/\/$/, '')
    const cleanBasePath = basePath.replace(/\/$/, '')
    
    // Use HTTP for local IPs (like Jira does)
    let finalBaseUrl = cleanBaseUrl
    if (cleanBaseUrl.includes('172.16.') || cleanBaseUrl.includes('192.168.') || cleanBaseUrl.includes('localhost') || cleanBaseUrl.includes('127.0.0.1')) {
      finalBaseUrl = cleanBaseUrl.replace(/^https:/, 'http:')
      console.log('🔗 TRELLO WEBHOOK: Using HTTP for local IP:', finalBaseUrl)
    }
    
    const callbackUrl = `${finalBaseUrl}${cleanBasePath}/api/webhooks/trello`
    console.log('🔗 TRELLO WEBHOOK: Generated callback URL:', callbackUrl)
    return callbackUrl
  }

  /**
   * Generate a secret for webhook verification
   */
  generateSecret(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Register a webhook with Trello for a specific board
   */
  async registerWebhookForBoard(
    userId: string,
    boardId: string,
    baseUrl: string,
    basePath: string = ''
  ): Promise<{ success: boolean; webhookId?: string; error?: string }> {
    try {
      console.log('🔗 TRELLO WEBHOOK: Registering webhook for board:', boardId)

      // Get Trello integration
      const integration = await trelloService.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        return { success: false, error: 'Trello integration not connected' }
      }

      // Generate callback URL
      const callbackUrl = this.getCallbackUrl(baseUrl, basePath)
      const secret = this.generateSecret()

      // Get API credentials first (before logging them)
      const apiKey = integration.consumerKey
      const token = integration.accessToken

      console.log('🔗 TRELLO WEBHOOK: ========== REGISTRATION START ==========')
      console.log('🔗 TRELLO WEBHOOK: Board ID:', boardId)
      console.log('🔗 TRELLO WEBHOOK: Base URL:', baseUrl)
      console.log('🔗 TRELLO WEBHOOK: Base Path:', basePath)
      console.log('🔗 TRELLO WEBHOOK: Final Callback URL:', callbackUrl)
      console.log('🔗 TRELLO WEBHOOK: API Key:', apiKey ? `${apiKey.substring(0, 8)}...` : 'MISSING')
      console.log('🔗 TRELLO WEBHOOK: Token:', token ? `${token.substring(0, 8)}...` : 'MISSING')

      if (!apiKey || !token) {
        console.error('❌ TRELLO WEBHOOK: Missing API key or token')
        return { success: false, error: 'Missing Trello API key or access token. Please reconnect Trello.' }
      }

      // Check if webhook already exists for this board
      const existingWebhook = await db.findWebhookByProject(userId, 'TRELLO', boardId)
      if (existingWebhook) {
        console.log('🔗 TRELLO WEBHOOK: Webhook already exists in database for board:', boardId)
        console.log('🔗 TRELLO WEBHOOK: Status:', existingWebhook.status)
        console.log('🔗 TRELLO WEBHOOK: Webhook ID:', existingWebhook.webhookId)
        
        // If it's PENDING, it means registration failed - try again
        if (existingWebhook.status === 'PENDING') {
          console.log('⚠️ TRELLO WEBHOOK: Existing webhook is PENDING - registration likely failed')
          console.log('⚠️ TRELLO WEBHOOK: Attempting to register again...')
          // Continue with registration attempt
        } else {
          // Check if it's actually registered in Trello API
          const trelloWebhooks = await this.listRegisteredWebhooks(userId)
          const isInTrello = trelloWebhooks.some(w => w.idModel === boardId)
          
          if (isInTrello) {
            console.log('✅ TRELLO WEBHOOK: Webhook is registered in Trello API')
            return { success: true, webhookId: existingWebhook.webhookId }
          } else {
            console.log('⚠️ TRELLO WEBHOOK: Webhook in database but NOT in Trello API - re-registering')
            // Continue with registration attempt
          }
        }
      }

      // Register webhook with Trello

      const response = await fetch(
        `https://api.trello.com/1/webhooks?key=${apiKey}&token=${token}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            callbackURL: callbackUrl,
            idModel: boardId,
            description: `UPMY Webhook - Board ${boardId}`,
            active: true,
          }),
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ TRELLO WEBHOOK: ========== REGISTRATION FAILED ==========')
        console.error('❌ TRELLO WEBHOOK: Status:', response.status)
        console.error('❌ TRELLO WEBHOOK: Error:', errorText)
        console.error('❌ TRELLO WEBHOOK: Callback URL:', callbackUrl)
        console.error('❌ TRELLO WEBHOOK: =========================================')
        
        // If it's a callback URL verification issue, try with HEAD request support
        if (response.status === 400 && errorText.includes('URL')) {
          console.log('⚠️ TRELLO WEBHOOK: Callback URL verification failed, using polling fallback')
          console.log('⚠️ TRELLO WEBHOOK: Trello cannot reach the callback URL')
          console.log('⚠️ TRELLO WEBHOOK: This might be due to:')
          console.log('⚠️ TRELLO WEBHOOK:   1. Server not accessible from internet')
          console.log('⚠️ TRELLO WEBHOOK:   2. Firewall blocking Trello IPs')
          console.log('⚠️ TRELLO WEBHOOK:   3. SSL certificate issues')
          console.log('⚠️ TRELLO WEBHOOK:   4. Wrong URL format')
          return await this.registerWebhookFallback(userId, boardId, callbackUrl, secret)
        }
        
        return { success: false, error: `Trello API error: ${response.status} - ${errorText}` }
      }

      const result = await response.json()
      const webhookId = result.id

      console.log('✅ TRELLO WEBHOOK: ========== REGISTRATION SUCCESS ==========')
      console.log('✅ TRELLO WEBHOOK: Webhook ID:', webhookId)
      console.log('✅ TRELLO WEBHOOK: Callback URL:', callbackUrl)
      console.log('✅ TRELLO WEBHOOK: Board ID:', boardId)
      console.log('✅ TRELLO WEBHOOK: Full Response:', JSON.stringify(result, null, 2))
      console.log('✅ TRELLO WEBHOOK: ==========================================')

      // Store webhook config in database
      await db.createWebhook({
        webhookId,
        userId: require('mongodb').ObjectId.createFromHexString(userId),
        integrationType: 'TRELLO',
        projectId: boardId,
        callbackUrl,
        events: RELEVANT_TRELLO_ACTIONS,
        secret,
        status: 'ACTIVE',
        errorCount: 0,
      })

      return { success: true, webhookId }
    } catch (error) {
      console.error('❌ TRELLO WEBHOOK: Registration error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Register webhooks for all user's Trello boards
   */
  async registerWebhooksForAllBoards(
    userId: string,
    baseUrl: string,
    basePath: string = ''
  ): Promise<{ success: boolean; registered: number; failed: number; errors: string[] }> {
    const results = {
      success: true,
      registered: 0,
      failed: 0,
      errors: [] as string[],
    }

    try {
      console.log('🔗 TRELLO WEBHOOK: Registering webhooks for all boards')

      // Get Trello integration
      const integration = await trelloService.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        return { ...results, success: false, errors: ['Trello integration not connected'] }
      }

      // Fetch user's boards
      const boards = await trelloService.fetchAndStoreBoards(userId)

      for (const board of boards) {
        const result = await this.registerWebhookForBoard(userId, board.id, baseUrl, basePath)
        
        if (result.success) {
          results.registered++
        } else {
          results.failed++
          results.errors.push(`Board ${board.name}: ${result.error}`)
        }
      }

      results.success = results.failed === 0

      console.log(`✅ TRELLO WEBHOOK: Registered ${results.registered}/${boards.length} webhooks`)
      return results
    } catch (error) {
      console.error('❌ TRELLO WEBHOOK: Bulk registration error:', error)
      return {
        ...results,
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      }
    }
  }

  /**
   * Fallback registration when webhook URL verification fails
   */
  private async registerWebhookFallback(
    userId: string,
    boardId: string,
    callbackUrl: string,
    secret: string
  ): Promise<{ success: boolean; webhookId?: string; error?: string }> {
    try {
      console.log('⚠️ TRELLO WEBHOOK: ========== USING FALLBACK MODE ==========')
      console.log('⚠️ TRELLO WEBHOOK: Trello cannot verify the callback URL')
      console.log('⚠️ TRELLO WEBHOOK: Callback URL:', callbackUrl)
      console.log('⚠️ TRELLO WEBHOOK: This means webhooks will NOT work automatically')
      console.log('⚠️ TRELLO WEBHOOK: You will need to use polling or make server publicly accessible')
      console.log('⚠️ TRELLO WEBHOOK: =========================================')
      
      // Store as a "pending" webhook that will use polling fallback
      const webhookId = `trello-poll-${boardId}-${Date.now()}`
      
      await db.createWebhook({
        webhookId,
        userId: require('mongodb').ObjectId.createFromHexString(userId),
        integrationType: 'TRELLO',
        projectId: boardId,
        callbackUrl,
        events: RELEVANT_TRELLO_ACTIONS,
        secret,
        status: 'PENDING',
        errorCount: 0,
      })

      console.log('⚠️ TRELLO WEBHOOK: Stored as PENDING webhook (not registered in Trello API)')
      return { 
        success: true, 
        webhookId,
        warning: 'Webhook stored but not registered in Trello API - Trello cannot reach callback URL'
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Unregister a specific webhook
   */
  async unregisterWebhook(userId: string, boardId?: string): Promise<boolean> {
    try {
      console.log('🔗 TRELLO WEBHOOK: Unregistering webhook(s) for user:', userId)

      // Get webhooks to delete
      let webhooks
      if (boardId) {
        const webhook = await db.findWebhookByProject(userId, 'TRELLO', boardId)
        webhooks = webhook ? [webhook] : []
      } else {
        webhooks = await db.findWebhooksByIntegration(userId, 'TRELLO')
      }

      if (webhooks.length === 0) {
        console.log('🔗 TRELLO WEBHOOK: No webhooks found to unregister')
        return true
      }

      // Get Trello integration
      const integration = await trelloService.getIntegration(userId)

      if (integration && integration.status === 'CONNECTED') {
        const apiKey = integration.consumerKey
        const token = integration.accessToken

        // Delete each webhook from Trello
        for (const webhook of webhooks) {
          if (!webhook.webhookId.startsWith('trello-poll-')) {
            try {
              await fetch(
                `https://api.trello.com/1/webhooks/${webhook.webhookId}?key=${apiKey}&token=${token}`,
                { method: 'DELETE' }
              )
              console.log('✅ TRELLO WEBHOOK: Deleted webhook:', webhook.webhookId)
            } catch (error) {
              console.warn('⚠️ TRELLO WEBHOOK: Could not delete from Trello API:', error)
            }
          }
        }
      }

      // Delete from database
      if (boardId) {
        await db.deleteWebhook(webhooks[0].webhookId)
      } else {
        await db.deleteWebhooksByUser(userId, 'TRELLO')
      }

      return true
    } catch (error) {
      console.error('❌ TRELLO WEBHOOK: Unregister error:', error)
      return false
    }
  }

  /**
   * Verify Trello webhook signature
   * Trello uses a double HMAC-SHA1 signature
   */
  verifyWebhookSignature(
    payload: string,
    signature: string | null,
    callbackUrl: string,
    secret: string
  ): boolean {
    if (!signature) {
      console.warn('⚠️ TRELLO WEBHOOK: No signature provided')
      return false
    }

    try {
      // Trello's signature is base64(HMAC-SHA1(payload + callbackURL, secret))
      const expectedSignature = crypto
        .createHmac('sha1', secret)
        .update(payload + callbackUrl)
        .digest('base64')

      return signature === expectedSignature
    } catch (error) {
      console.error('❌ TRELLO WEBHOOK: Signature verification error:', error)
      return false
    }
  }

  /**
   * Handle HEAD request for webhook verification
   * Trello sends a HEAD request to verify the callback URL
   */
  handleVerificationRequest(): { status: number } {
    return { status: 200 }
  }

  /**
   * Process incoming webhook payload
   */
  async processWebhook(payload: TrelloWebhookPayload): Promise<WebhookProcessResult> {
    try {
      // Validate payload structure
      if (!payload || !payload.action) {
        console.error('❌ TRELLO WEBHOOK: Invalid payload - missing action')
        console.error('❌ TRELLO WEBHOOK: Payload:', JSON.stringify(payload, null, 2))
        return {
          success: false,
          eventType: 'unknown',
          error: 'Invalid payload structure - missing action',
        }
      }

      const actionType = payload.action.type
      const boardId = payload.action.data?.board?.id || payload.model?.id

      if (!actionType) {
        console.error('❌ TRELLO WEBHOOK: Invalid payload - missing action type')
        return {
          success: false,
          eventType: 'unknown',
          error: 'Invalid payload structure - missing action type',
        }
      }

      if (!boardId) {
        console.error('❌ TRELLO WEBHOOK: Invalid payload - missing board ID')
        return {
          success: false,
          eventType: actionType,
          error: 'Invalid payload structure - missing board ID',
        }
      }

      console.log('📥 TRELLO WEBHOOK: Processing action:', actionType, 'for board:', boardId)

      // Skip irrelevant actions
      if (!RELEVANT_TRELLO_ACTIONS.includes(actionType)) {
        console.log('⏭️ TRELLO WEBHOOK: Skipping irrelevant action:', actionType)
        return {
          success: true,
          eventType: actionType,
          projectId: boardId,
        }
      }

      // Find the webhook and user
      // First try to find webhook registration
      let webhook = await this.findWebhookByBoard(boardId)
      let userId: string | null = null
      
      if (webhook) {
        userId = webhook.userId.toString()
        console.log('📥 TRELLO WEBHOOK: Found webhook registration for board:', boardId, 'user:', userId)
      } else {
        console.warn('⚠️ TRELLO WEBHOOK: No webhook registration found for board:', boardId)
        console.log('📥 TRELLO WEBHOOK: Attempting to find board in database to get userId...')
        
        // Fallback: Find the board in projects to get userId (like Jira does)
        // This allows updates to work even if webhook registration failed
        const { getCollection, COLLECTIONS } = await import('../db/mongodb')
        const projectsCollection = await getCollection(COLLECTIONS.PROJECTS)
        const project = await projectsCollection.findOne({ 
          externalId: boardId,
          integrationType: 'TRELLO'
        })
        
        if (project) {
          userId = project.userId.toString()
          console.log('✅ TRELLO WEBHOOK: Found board in database, userId:', userId)
          console.log('📥 TRELLO WEBHOOK: Will broadcast update even without webhook registration')
        } else {
          console.warn('⚠️ TRELLO WEBHOOK: Board not found in database:', boardId)
          return {
            success: false,
            eventType: actionType,
            error: 'No webhook configuration or project found',
          }
        }
      }

      // Update last triggered time (only if webhook exists and has a real webhookId)
      if (webhook && webhook.webhookId && !webhook.webhookId.startsWith('auto-')) {
        await db.updateWebhookLastTriggered(webhook.webhookId)
      }

      // Store the event (only if we have userId)
      if (userId) {
        const { toObjectId } = await import('../db/mongodb')
        const userIdObjectId = toObjectId(userId)
        if (userIdObjectId) {
          await db.createWebhookEvent({
            userId: userIdObjectId,
            integrationType: 'TRELLO',
            eventType: actionType,
            projectId: boardId,
            payload,
            processed: false,
            retryCount: 0,
          })
        }
      }

      // Process based on action type (only if we have userId)
      if (!userId) {
        return {
          success: false,
          eventType: actionType,
          error: 'Could not determine user ID for board',
        }
      }
      
      return await this.processAction(payload, userId, boardId)
    } catch (error) {
      console.error('❌ TRELLO WEBHOOK: Processing error:', error)
      return {
        success: false,
        eventType: payload.action.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Process Trello action
   */
  private async processAction(
    payload: TrelloWebhookPayload,
    userId: string,
    boardId: string
  ): Promise<WebhookProcessResult> {
    const actionType = payload.action.type

    try {
      // Trigger a board sync to update analytics
      // This refreshes the card counts and status distribution
      await trelloService.fetchAndStoreBoards(userId)

      // Build updated data based on action type
      let updatedData: any = {
        actionType,
        boardId,
        boardName: payload.action.data.board?.name || payload.model.name,
      }

      if (payload.action.data.card) {
        updatedData.cardId = payload.action.data.card.id
        updatedData.cardName = payload.action.data.card.name
      }

      if (payload.action.data.list) {
        updatedData.listId = payload.action.data.list.id
        updatedData.listName = payload.action.data.list.name
      }

      if (payload.action.data.listBefore && payload.action.data.listAfter) {
        updatedData.movedFrom = payload.action.data.listBefore.name
        updatedData.movedTo = payload.action.data.listAfter.name
      }

      console.log('✅ TRELLO WEBHOOK: Processed action:', actionType)

      console.log('📡 TRELLO WEBHOOK: ========== BROADCASTING UPDATE ==========')
      console.log(`   Event Type: ${actionType}`)
      console.log(`   Board: ${boardId}`)
      if (updatedData.cardName) {
        console.log(`   Card: ${updatedData.cardName}`)
      }
      if (updatedData.cardId) {
        console.log(`   Card ID: ${updatedData.cardId}`)
      }
      if (updatedData.movedTo) {
        console.log(`   Moved To: ${updatedData.movedTo}`)
      }
      if (updatedData.movedFrom) {
        console.log(`   Moved From: ${updatedData.movedFrom}`)
      }
      console.log(`   User ID: ${userId}`)
      console.log('📡 TRELLO WEBHOOK: =========================================')

      // Broadcast update to connected clients
      await broadcastWebhookUpdate(userId, 'TRELLO', actionType, boardId, updatedData)
      
      console.log(`✅ TRELLO WEBHOOK: Broadcast completed for board ${boardId}`)

      return {
        success: true,
        userId,
        projectId: boardId,
        eventType: actionType,
        updatedData,
      }
    } catch (error) {
      console.error('❌ TRELLO WEBHOOK: Action processing error:', error)
      return {
        success: false,
        eventType: actionType,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Find webhook by board ID
   */
  private async findWebhookByBoard(boardId: string): Promise<any> {
    const { getCollection, COLLECTIONS } = await import('../db/mongodb')
    const webhooksCollection = await getCollection(COLLECTIONS.WEBHOOKS)
    const projectsCollection = await getCollection(COLLECTIONS.PROJECTS)

    // First try to find a registered webhook for this board
    const webhook = await webhooksCollection.findOne({
      integrationType: 'TRELLO',
      projectId: boardId,
      status: { $in: ['ACTIVE', 'PENDING'] }
    })

    if (webhook) {
      return webhook
    }

    // If no webhook found, try to find the project owner
    const project = await projectsCollection.findOne({
      externalId: boardId,
      integrationType: 'TRELLO',
    })

    if (project) {
      console.log('📡 TRELLO WEBHOOK: No registered webhook, but found project owner:', project.userId.toString())
      return {
        userId: project.userId,
        webhookId: 'auto-' + boardId, // Placeholder ID
        integrationType: 'TRELLO',
        status: 'ACTIVE',
        projectId: boardId,
      }
    }

    return null
  }

  /**
   * List webhooks registered in Trello API for a user
   */
  async listRegisteredWebhooks(userId: string): Promise<Array<{
    id: string
    description: string
    idModel: string
    callbackURL: string
    active: boolean
  }>> {
    try {
      const integration = await trelloService.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        return []
      }

      const apiKey = integration.consumerKey
      const token = integration.accessToken

      const response = await fetch(
        `https://api.trello.com/1/tokens/${token}/webhooks?key=${apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ TRELLO WEBHOOK: Failed to list webhooks:', response.status, errorText)
        return []
      }

      const webhooks = await response.json()
      console.log('📋 TRELLO WEBHOOK: Found', webhooks.length, 'webhooks registered in Trello')
      return webhooks
    } catch (error) {
      console.error('❌ TRELLO WEBHOOK: Error listing webhooks:', error)
      return []
    }
  }

  /**
   * Get webhook status for a user
   */
  async getWebhookStatus(userId: string): Promise<{
    registered: boolean
    boardCount: number
    activeCount: number
    pendingCount: number
    webhooks: Array<{
      boardId: string
      status: string
      lastTriggered?: Date
      callbackURL?: string
    }>
    trelloRegisteredWebhooks?: Array<{
      id: string
      description: string
      idModel: string
      callbackURL: string
      active: boolean
    }>
  }> {
    const webhooks = await db.findWebhooksByIntegration(userId, 'TRELLO')
    
    // Also check what's actually registered in Trello
    const trelloRegisteredWebhooks = await this.listRegisteredWebhooks(userId)

    if (webhooks.length === 0 && trelloRegisteredWebhooks.length === 0) {
      return {
        registered: false,
        boardCount: 0,
        activeCount: 0,
        pendingCount: 0,
        webhooks: [],
        trelloRegisteredWebhooks: [],
      }
    }

    const activeCount = webhooks.filter(w => w.status === 'ACTIVE').length
    const pendingCount = webhooks.filter(w => w.status === 'PENDING').length

    return {
      registered: true,
      boardCount: webhooks.length,
      activeCount,
      pendingCount,
      webhooks: webhooks.map(w => ({
        boardId: w.projectId || 'unknown',
        status: w.status,
        lastTriggered: w.lastTriggeredAt,
        callbackURL: w.callbackUrl,
      })),
      trelloRegisteredWebhooks,
    }
  }
}

export const trelloWebhookService = new TrelloWebhookService()

