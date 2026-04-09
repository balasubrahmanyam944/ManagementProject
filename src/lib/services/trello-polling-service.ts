/**
 * Trello Polling Service
 * Polls Trello for changes when webhooks aren't available or reliable
 * Detects changes made by ANY user in the Trello board
 */

import { trelloService } from '@/lib/integrations/trello-service'
import { broadcastWebhookUpdate } from './realtime-service'
import { db } from '@/lib/db/database'

interface BoardPollState {
  userId: string
  boardId: string
  boardName?: string
  lastPollTime: Date
  lastCardIds: Set<string>
  lastCardUpdates: Map<string, { updated: Date; listId: string; listName: string }>
  isPolling: boolean
}

// Store polling state per board
const pollingStates = new Map<string, BoardPollState>()

// Polling intervals (in milliseconds)
const POLL_INTERVAL = 30000 // 30 seconds
const INITIAL_POLL_DELAY = 5000 // 5 seconds after start

/**
 * Start polling for a Trello board
 */
export async function startPollingBoard(userId: string, boardId: string): Promise<void> {
  const stateKey = `${userId}:${boardId}`
  
  // Don't start if already polling
  if (pollingStates.has(stateKey)) {
    const state = pollingStates.get(stateKey)!
    if (state.isPolling) {
      console.log(`🔄 TRELLO POLLING: Already polling board ${boardId} for user ${userId}`)
      return
    }
  }

  console.log(`🔄 TRELLO POLLING: ========== STARTING POLLING ==========`)
  console.log(`   Board ID: ${boardId}`)
  console.log(`   User ID: ${userId}`)
  console.log(`   Poll Interval: ${POLL_INTERVAL / 1000} seconds`)
  console.log(`🔄 TRELLO POLLING: ======================================`)

  const state: BoardPollState = {
    userId,
    boardId,
    lastPollTime: new Date(),
    lastCardIds: new Set(),
    lastCardUpdates: new Map(),
    isPolling: true,
  }

  pollingStates.set(stateKey, state)

  // Initial poll after delay
  setTimeout(() => {
    pollBoard(userId, boardId)
  }, INITIAL_POLL_DELAY)

  // Set up interval polling
  const intervalId = setInterval(async () => {
    const currentState = pollingStates.get(stateKey)
    if (!currentState || !currentState.isPolling) {
      clearInterval(intervalId)
      return
    }
    await pollBoard(userId, boardId)
  }, POLL_INTERVAL)

  // Store interval ID in state for cleanup
  ;(state as any).intervalId = intervalId
}

/**
 * Stop polling for a board
 */
export function stopPollingBoard(userId: string, boardId: string): void {
  const stateKey = `${userId}:${boardId}`
  const state = pollingStates.get(stateKey)
  
  if (state && (state as any).intervalId) {
    clearInterval((state as any).intervalId)
  }
  
  pollingStates.delete(stateKey)
  console.log(`🔄 TRELLO POLLING: Stopped polling for board ${boardId}`)
}

/**
 * Poll a board for changes
 */
async function pollBoard(userId: string, boardId: string): Promise<void> {
  const stateKey = `${userId}:${boardId}`
  const state = pollingStates.get(stateKey)
  
  if (!state || !state.isPolling) {
    return
  }
  const isFirstPoll =
  state.lastCardIds.size === 0 &&
  state.lastCardUpdates.size === 0

  const pollStartTime = new Date()
  const pollStartTimeISO = pollStartTime.toISOString()
  
  try {
    // Get integration FIRST - if not connected, stop polling for this board
    const integration = await trelloService.getIntegration(userId)
    if (!integration || integration.status !== 'CONNECTED') {
      console.log(`🔄 TRELLO POLLING: ⚠️ Integration not connected for board ${boardId} - stopping polling`)
      stopPollingBoard(userId, boardId)
      return
    }
    
    console.log(`🔄 TRELLO POLLING: ========== POLLING CYCLE START ==========`)
    console.log(`   Board ID: ${boardId}`)
    console.log(`   Time: ${pollStartTimeISO}`)
    console.log(`   User ID: ${userId}`)

    // Get API key from environment
    const apiKey = process.env.TRELLO_API_KEY
    
    // Get access token - from Nango if managed, otherwise from DB
    let token = integration.accessToken
    if (integration.metadata?.nangoManaged) {
      try {
        const { nangoService } = await import('@/lib/integrations/nango-service')
        const tenantId = integration.metadata.tenantId || 'default'
        token = await nangoService.getAccessToken('trello', tenantId, userId)
      } catch (nangoError) {
        console.error(`❌ TRELLO POLLING: Failed to get Nango token for board ${boardId}:`, nangoError)
        return
      }
    }
    
    if (!apiKey || !token) {
      console.log(`🔄 TRELLO POLLING: Missing API key or token for board ${boardId}`)
      return
    }

    const response = await fetch(
      `https://api.trello.com/1/boards/${boardId}/cards?key=${apiKey}&token=${token}&fields=id,name,desc,idList,closed,dateLastActivity,due,dueComplete&lists=all`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      console.error(`❌ TRELLO POLLING: API error for board ${boardId}:`, response.status)
      return
    }

    const cards = await response.json()

    // Also fetch lists to get list names
    const listsResponse = await fetch(
      `https://api.trello.com/1/boards/${boardId}/lists?key=${apiKey}&token=${token}&fields=id,name`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    )

    let listsMap = new Map<string, string>()
    if (listsResponse.ok) {
      const lists = await listsResponse.json()
      lists.forEach((list: any) => {
        listsMap.set(list.id, list.name)
      })
    }

    const currentCardIds = new Set<string>()
    const currentCardUpdates = new Map<string, { updated: Date; listId: string; listName: string }>()

    // Process each card
    for (const card of cards) {
      const cardId = card.id
      const updated = new Date(card.dateLastActivity)
      const listId = card.idList
      const listName = listsMap.get(listId) || 'Unknown List'
      
      currentCardIds.add(cardId)
      currentCardUpdates.set(cardId, { updated, listId, listName })

      // Check if this is a new card
      if (!state.lastCardIds.has(cardId)) {
        if (!isFirstPoll) {
        console.log(`🔄 TRELLO POLLING: ✅ NEW CARD DETECTED`)
        console.log(`   Board: ${boardId}`)
        console.log(`   Card: ${cardId}`)
        console.log(`   Name: ${card.name}`)
        console.log(`   List: ${listName}`)
        console.log(`   User ID: ${userId}`)
        await broadcastChange(userId, boardId, cardId, card, listName, 'createCard')
        }
        continue
      }

      // Check if card was updated since last poll
      const lastUpdate = state.lastCardUpdates.get(cardId)
      if (lastUpdate) {
        const wasUpdated = updated > lastUpdate.updated
        const listChanged = listId !== lastUpdate.listId
        
        // Always log for debugging
        console.log(`🔄 TRELLO POLLING: Checking card ${cardId}:`, {
          wasUpdated,
          listChanged,
          lastUpdated: lastUpdate.updated.toISOString(),
          currentUpdated: updated.toISOString(),
          lastList: lastUpdate.listName,
          currentList: listName,
        })
        
        if (!isFirstPoll && (wasUpdated || listChanged)) {
          const timeDiff = Math.round((updated.getTime() - lastUpdate.updated.getTime()) / 1000)
          
          console.log(`🔄 TRELLO POLLING: ✅ CARD UPDATED DETECTED`)
          console.log(`   Board: ${boardId}`)
          console.log(`   Card: ${cardId}`)
          console.log(`   Name: ${card.name}`)
          console.log(`   List: ${listName}`)
          if (listChanged) {
            console.log(`   Moved From: ${lastUpdate.listName}`)
            console.log(`   Moved To: ${listName}`)
          }
          console.log(`   Last Updated: ${lastUpdate.updated.toISOString()}`)
          console.log(`   Current Updated: ${updated.toISOString()}`)
          console.log(`   Time Since Last Update: ${timeDiff} seconds`)
          console.log(`   User ID: ${userId}`)
          
          await broadcastChange(userId, boardId, cardId, card, listName, 'updateCard')
        } else {
          console.log(`🔄 TRELLO POLLING: ⏭️ Card ${cardId} unchanged (no update needed)`)
        }
      } else {
        // First time seeing this card in polling (but not new, so it was in initial state)
        console.log(`🔄 TRELLO POLLING: 📋 Card ${cardId} in initial state (no previous update to compare)`)
      }
    }

    // Check for archived/deleted cards
    for (const oldCardId of state.lastCardIds) {
      if (!isFirstPoll && !currentCardIds.has(oldCardId)) {
        console.log(`🔄 TRELLO POLLING: ✅ CARD ARCHIVED/DELETED DETECTED`)
        console.log(`   Board: ${boardId}`)
        console.log(`   Card: ${oldCardId}`)
        console.log(`   User ID: ${userId}`)
        await broadcastChange(userId, boardId, oldCardId, null, 'Unknown', 'deleteCard')
      }
    }
    
    const pollEndTime = new Date()
    const pollDuration = Math.round((pollEndTime.getTime() - pollStartTime.getTime()) / 1000)
    
    if (cards.length > 0) {
      console.log(`🔄 TRELLO POLLING: ✅ Poll completed for board ${boardId}`)
      console.log(`   Cards checked: ${cards.length}`)
      console.log(`   Duration: ${pollDuration}s`)
      console.log(`🔄 TRELLO POLLING: ========== POLLING CYCLE END ==========`)
    } else {
      console.log(`🔄 TRELLO POLLING: ✅ Poll completed for board ${boardId} - No cards found`)
      console.log(`   Duration: ${pollDuration}s`)
      console.log(`🔄 TRELLO POLLING: ========== POLLING CYCLE END ==========`)
    }

    // Update state
    state.lastPollTime = new Date()
    state.lastCardIds = currentCardIds
    state.lastCardUpdates = currentCardUpdates

  } catch (error) {
    console.error(`❌ TRELLO POLLING: Error polling board ${boardId}:`, error)
    console.log(`🔄 TRELLO POLLING: ========== POLLING CYCLE END (ERROR) ==========`)
  }
}

/**
 * Broadcast a change event
 */
async function broadcastChange(
  userId: string,
  boardId: string,
  cardId: string,
  card: any,
  listName: string,
  eventType: string
): Promise<void> {
  const cardName = card?.name || 'Unknown'
  const updated = card?.dateLastActivity || new Date().toISOString()

  const updatedData = {
    cardId,
    cardName,
    boardId,
    listName,
    status: listName,
    updated,
  }

  console.log(`📡 TRELLO POLLING: ========== BROADCASTING UPDATE ==========`)
  console.log(`   Event Type: ${eventType}`)
  console.log(`   Board: ${boardId}`)
  console.log(`   Card: ${cardId}`)
  console.log(`   Name: ${cardName}`)
  console.log(`   List/Status: ${listName}`)
  console.log(`   Updated: ${updated}`)
  console.log(`   User ID: ${userId}`)
  console.log(`📡 TRELLO POLLING: =========================================`)
  
  await broadcastWebhookUpdate(
    userId,
    'TRELLO',
    eventType,
    boardId,
    updatedData
  )
  
  console.log(`✅ TRELLO POLLING: Broadcast completed for card ${cardId}`)
}

/**
 * Start polling for all active boards for a user
 */
export async function startPollingForUser(userId: string): Promise<void> {
  try {
    console.log(`🔄 TRELLO POLLING: ========== CHECKING IF POLLING NEEDED ==========`)
    console.log(`   User ID: ${userId}`)
    
    // Check webhook status first
    const { trelloWebhookService } = await import('../integrations/trello-webhook-service')
    const webhookStatus = await trelloWebhookService.getWebhookStatus(userId)
    
    console.log(`   🔍 Webhook Status Check:`)
    console.log(`      Registered: ${webhookStatus.registered}`)
    console.log(`      Board Count: ${webhookStatus.boardCount}`)
    console.log(`      Active Count: ${webhookStatus.activeCount}`)
    console.log(`      Pending Count: ${webhookStatus.pendingCount}`)
    
    // If webhooks are fully ACTIVE, don't start polling
    if (webhookStatus.registered && webhookStatus.activeCount > 0 && webhookStatus.pendingCount === 0) {
      console.log(`   ✅ Webhooks are ACTIVE - skipping polling`)
      console.log(`🔄 TRELLO POLLING: ===============================================`)
      return
    }
    
    // If all webhooks are pending, use polling as fallback
    if (webhookStatus.pendingCount > 0) {
      console.log(`   ⚠️  Webhooks are PENDING (Trello cannot reach callback URL)`)
      console.log(`   🔄 Starting polling as fallback`)
    } else {
      console.log(`   ❌ Webhooks are NOT registered`)
      console.log(`   🔄 Starting polling as primary method`)
    }
    
    console.log(`🔄 TRELLO POLLING: ========== STARTING POLLING FOR USER ==========`)
    
    // Find Trello integration
    const trelloIntegration = await db.findIntegrationByType(userId, 'TRELLO')
    
    if (!trelloIntegration) {
      console.log(`   ❌ No Trello integration found for user`)
      console.log(`🔄 TRELLO POLLING: ===============================================`)
      return
    }
    
    if (trelloIntegration.status !== 'CONNECTED') {
      console.log(`   ❌ Trello integration not connected (status: ${trelloIntegration.status})`)
      console.log(`🔄 TRELLO POLLING: ===============================================`)
      return
    }
    
    console.log(`   ✅ Trello integration found (ID: ${trelloIntegration._id}, Status: ${trelloIntegration.status})`)
    
    // Get all Trello boards for this user
    const allProjects = await db.findProjectsByUserId(userId)
    const trelloIntegrationIdStr = trelloIntegration._id?.toString()
    
    const trelloBoards = allProjects.filter(p => {
      const integrationIdStr = p.integrationId?.toString()
      const isTrelloProject = integrationIdStr === trelloIntegrationIdStr
      const hasId = !!(p.externalId)
      const isActive = p.isActive !== false
      
      return isTrelloProject && hasId && isActive
    })

    console.log(`   Found ${trelloBoards.length} active Trello board(s) from ${allProjects.length} total projects`)
    if (trelloBoards.length > 0) {
      console.log(`   ✅ Boards to poll: ${trelloBoards.map(b => `${b.name} (${b.externalId})`).join(', ')}`)
    }

    // Verify integration is still active before starting polling for each board
    // This prevents starting polling for boards when integration becomes inactive
    const currentIntegration = await trelloService.getIntegration(userId)
    if (!currentIntegration || currentIntegration.status !== 'CONNECTED') {
      console.log(`   ⚠️ Integration is not active - skipping all boards`)
      console.log(`🔄 TRELLO POLLING: ===============================================`)
      return
    }

    for (const board of trelloBoards) {
      const boardId = board.externalId
      if (boardId) {
        console.log(`   🚀 Starting polling for board: ${boardId}`)
        await startPollingBoard(userId, boardId)
      }
    }
    
    console.log(`✅ TRELLO POLLING: Polling started for ${trelloBoards.length} board(s)`)
    console.log(`🔄 TRELLO POLLING: ===============================================`)
  } catch (error) {
    console.error('❌ TRELLO POLLING: Error starting polling for user:', error)
  }
}

/**
 * Stop all polling for a user
 */
export function stopPollingForUser(userId: string): void {
  for (const [key, state] of pollingStates.entries()) {
    if (state.userId === userId) {
      stopPollingBoard(userId, state.boardId)
    }
  }
}

/**
 * Get polling status
 */
export function getPollingStatus(): {
  activePolls: number
  boards: Array<{ userId: string; boardId: string; lastPollTime: Date }>
} {
  const boards = Array.from(pollingStates.values())
    .filter(s => s.isPolling)
    .map(s => ({
      userId: s.userId,
      boardId: s.boardId,
      lastPollTime: s.lastPollTime,
    }))

  return {
    activePolls: boards.length,
    boards,
  }
}

