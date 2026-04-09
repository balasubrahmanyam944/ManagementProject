import { db } from '../db/database'
import type { Integration } from '../db/database'
import { nangoService } from './nango-service';

export interface TrelloBoard {
  id: string
  name: string
  desc: string
  url: string
  shortUrl: string
  closed: boolean
  idOrganization?: string
  prefs?: {
    backgroundColor?: string
    backgroundImage?: string
  }
}

export interface TrelloList {
  id: string
  name: string
  closed: boolean
  idBoard: string
  pos: number
}

export interface TrelloCard {
  id: string
  name: string
  desc: string
  idList: string
  idBoard: string
  url: string
  shortUrl: string
  closed: boolean
  due?: string
  dueComplete?: boolean
  labels?: Array<{
    id: string
    name: string
    color: string
  }>
  list?: {
    id: string
    name: string
  }
  members?: Array<{
    id: string
    fullName: string
    avatarUrl?: string
  }>
  dateLastActivity?: string
}

export class TrelloService {
  /**
   * Get access token - from Nango if Nango-managed, otherwise from DB
   */
  private async getAccessToken(userId: string, integration: Integration): Promise<string> {
    if (integration.metadata?.nangoManaged) {
      const tenantId = integration.metadata.tenantId || 
                       process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 
                       'default';
      console.log('🔑 TrelloService: Getting access token from Nango');
      return await nangoService.getAccessToken('trello', tenantId, userId);
    }
    
    if (!integration.accessToken) {
      throw new Error('No Trello access token available');
    }
    return integration.accessToken;
  }

  /**
   * Get API key - from environment (required for Trello)
   */
  private getApiKey(): string {
    const apiKey = process.env.TRELLO_API_KEY;
    if (!apiKey) {
      throw new Error('TRELLO_API_KEY environment variable is not set');
    }
    return apiKey;
  }

  /**
   * Store Trello integration data for a user
   */
  async storeIntegration(userId: string, integrationData: {
    accessToken: string
    accessTokenSecret?: string
    refreshToken?: string
    expiresAt?: Date
    serverUrl?: string
    consumerKey?: string
    metadata?: any
  }) {
    try {
      // Store accessTokenSecret in metadata for OAuth 1.0a
      const metadata = {
        ...integrationData.metadata,
        accessTokenSecret: integrationData.accessTokenSecret
      };

      const integration = await db.upsertIntegration(userId, 'TRELLO', {
        status: 'CONNECTED',
        accessToken: integrationData.accessToken,
        refreshToken: integrationData.refreshToken,
        expiresAt: integrationData.expiresAt,
        serverUrl: integrationData.serverUrl || 'https://api.trello.com',
        consumerKey: integrationData.consumerKey,
        metadata: metadata,
        lastSyncAt: new Date(),
      })

      return integration
    } catch (error) {
      console.error('Error storing Trello integration:', error)
      throw new Error('Failed to store Trello integration')
    }
  }

  /**
   * Get Trello integration for a user
   */
  async getIntegration(userId: string): Promise<Integration | null> {
    try {
      const integrations = await db.findIntegrationsByUserId(userId)
      return integrations.find(integration => integration.type === 'TRELLO') || null
    } catch (error) {
      console.error('Error getting Trello integration:', error)
      return null
    }
  }

  /**
   * Remove Trello integration for a user
   */
  async removeIntegration(userId: string) {
    try {
      // Update integration status to disconnected
      await db.upsertIntegration(userId, 'TRELLO', {
        status: 'DISCONNECTED',
        accessToken: undefined,
        refreshToken: undefined,
        expiresAt: undefined,
        lastSyncAt: new Date(),
      })

      // Remove associated Trello projects only (not all projects)
      const projects = await db.findProjectsByUserId(userId)
      const trelloIntegration = await db.findIntegrationsByUserId(userId);
      const trelloIntegrationIds = new Set(
        trelloIntegration
          .filter(i => i.type === 'TRELLO')
          .map(i => i._id.toString())
      );
      
      for (const project of projects) {
        // Only deactivate projects that belong to Trello integration
        if (project.integrationId && 
            (trelloIntegrationIds.has(project.integrationId.toString()) ||
             (project as any).integrationType === 'TRELLO' ||
             project.integrationId.toString().includes('trello'))) {
          await db.updateProject(project._id.toString(), { isActive: false })
          console.log(`🔄 Trello Service: Deactivated Trello project: ${project.name}`);
        }
      }
    } catch (error) {
      console.error('Error removing Trello integration:', error)
      throw new Error('Failed to remove Trello integration')
    }
  }

  /**
   * Fetch and store Trello boards for a user with analytics
   */
  async fetchAndStoreBoards(userId: string): Promise<TrelloBoard[]> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        throw new Error('Trello integration not connected')
      }

      // Fetch boards from Trello API
      const boards = await this.fetchBoardsFromTrello(integration)
      console.log(`🔍 TrelloService: Fetched ${boards.length} boards, now calculating analytics...`)
      
      // Store boards as projects in database with analytics
      for (const board of boards) {
        if (!board.closed) {
          console.log(`🔍 TrelloService: Processing board ${board.name} (${board.id})...`)
          
          // Fetch cards for analytics calculation
          let analytics = {
            totalIssues: 0,
            openIssues: 0,
            inProgressIssues: 0,
            doneIssues: 0,
            statusCounts: {} as Record<string, number>,
            typeCounts: {} as Record<string, number>,
            dataSource: 'live' as const,
            lastUpdated: new Date().toISOString()
          }

          try {
            // Fetch cards to calculate analytics
            // Get access token (handles both Nango and DB tokens)
            const accessToken = await this.getAccessToken(userId, integration)
            const { fetchTrelloCards } = await import('./trello-integration')
            const cards = await fetchTrelloCards(accessToken, board.id)
            console.log(`🔍 TrelloService: Fetched ${cards.length} cards for board ${board.name}`)
            
            // Calculate analytics from cards
            const statusCounts: Record<string, number> = {}
            const typeCounts: Record<string, number> = {}
            
            for (const card of cards) {
              // Status is the list name
              const status = card.list?.name || 'Unknown'
              statusCounts[status] = (statusCounts[status] || 0) + 1
              
              // Type is from labels or default to "Card"
              const type = card.labels && card.labels.length > 0 
                ? card.labels[0].name || 'Card' 
                : 'Card'
              typeCounts[type] = (typeCounts[type] || 0) + 1
            }
            
            // Calculate open/in-progress/done counts
            const openIssues = cards.filter(card => {
              const status = card.list?.name || 'Unknown'
              return !status.toLowerCase().includes('done') && 
                     !status.toLowerCase().includes('complete') && 
                     !status.toLowerCase().includes('closed')
            }).length
            
            const inProgressIssues = cards.filter(card => {
              const status = card.list?.name || 'Unknown'
              return status.toLowerCase().includes('progress') || 
                     status.toLowerCase().includes('doing') || 
                     status.toLowerCase().includes('review')
            }).length
            
            const doneIssues = cards.filter(card => {
              const status = card.list?.name || 'Unknown'
              return status.toLowerCase().includes('done') || 
                     status.toLowerCase().includes('complete') || 
                     status.toLowerCase().includes('closed')
            }).length
            
            analytics = {
              totalIssues: cards.length,
              openIssues,
              inProgressIssues,
              doneIssues,
              statusCounts,
              typeCounts,
              dataSource: 'live' as const,
              lastUpdated: new Date().toISOString()
            }
            
            console.log(`✅ TrelloService: Calculated analytics for board ${board.name}:`, {
              totalIssues: analytics.totalIssues,
              statusCounts: Object.keys(analytics.statusCounts).length,
              typeCounts: Object.keys(analytics.typeCounts).length
            })
          } catch (cardError) {
            console.error(`Error fetching cards for board ${board.name}:`, cardError)
            // Keep default analytics if card fetch fails
          }
          
          // Store board with analytics
          await db.upsertProject(userId, integration._id.toString(), {
            externalId: board.id,
            name: board.name,
            key: board.id,
            description: board.desc,
            avatarUrl: board.prefs?.backgroundImage,
            isActive: true,
            lastSyncAt: new Date(),
            analytics: analytics,
            integrationType: 'TRELLO',  // Store type directly for reliable filtering
          })
        }
      }

      return boards.filter(board => !board.closed)
    } catch (error) {
      console.error('Error fetching and storing Trello boards:', error)
      throw new Error('Failed to fetch Trello boards')
    }
  }

  /**
   * Fetch boards from Trello API
   */
  private async fetchBoardsFromTrello(integration: Integration): Promise<TrelloBoard[]> {
    try {
      // Get API key and access token (handles Nango-managed vs DB)
      const apiKey = integration.metadata?.nangoManaged 
        ? this.getApiKey() 
        : (integration.consumerKey || this.getApiKey());
      const accessToken = await this.getAccessToken(integration.userId.toString(), integration);
      
      const url = `https://api.trello.com/1/members/me/boards?key=${apiKey}&token=${accessToken}&fields=id,name,desc,url,shortUrl,closed,idOrganization,prefs`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Trello API error: ${response.status}`)
      }

      const boards = await response.json()
      return boards.map((board: any) => ({
        id: board.id,
        name: board.name,
        desc: board.desc,
        url: board.url,
        shortUrl: board.shortUrl,
        closed: board.closed,
        idOrganization: board.idOrganization,
        prefs: board.prefs,
      }))
    } catch (error) {
      console.error('Error fetching boards from Trello:', error)
      throw new Error('Failed to fetch boards from Trello')
    }
  }

  /**
   * Fetch lists for a specific board
   */
  async fetchLists(userId: string, boardId: string): Promise<TrelloList[]> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        throw new Error('Trello integration not connected')
      }

      // Get API key and access token (handles Nango-managed vs DB)
      const apiKey = integration.metadata?.nangoManaged 
        ? this.getApiKey() 
        : (integration.consumerKey || this.getApiKey());
      const accessToken = await this.getAccessToken(userId, integration);

      const url = `https://api.trello.com/1/boards/${boardId}/lists?key=${apiKey}&token=${accessToken}&fields=id,name,closed,idBoard,pos`

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Trello API error: ${response.status}`)
      }

      const lists = await response.json()
      return lists.map((list: any) => ({
        id: list.id,
        name: list.name,
        closed: list.closed,
        idBoard: list.idBoard,
        pos: list.pos,
      }))
    } catch (error) {
      console.error('Error fetching Trello lists:', error)
      throw new Error('Failed to fetch Trello lists')
    }
  }

  /**
   * Fetch cards for a specific list
   */
  async fetchCards(userId: string, listId: string): Promise<TrelloCard[]> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        throw new Error('Trello integration not connected')
      }

      const accessToken = await this.getAccessToken(userId, integration)
      const apiKey = this.getApiKey()
      const url = `https://api.trello.com/1/lists/${listId}/cards?key=${apiKey}&token=${accessToken}&fields=id,name,desc,idList,idBoard,url,shortUrl,closed,due,dueComplete,labels`

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Trello API error: ${response.status}`)
      }

      const cards = await response.json()
      return cards.map((card: any) => ({
        id: card.id,
        name: card.name,
        desc: card.desc,
        idList: card.idList,
        idBoard: card.idBoard,
        url: card.url,
        shortUrl: card.shortUrl,
        closed: card.closed,
        due: card.due,
        dueComplete: card.dueComplete,
        labels: card.labels,
      }))
    } catch (error) {
      console.error('Error fetching Trello cards:', error)
      throw new Error('Failed to fetch Trello cards')
    }
  }

  /**
   * Create a card in a specific list
   */
  async createCard(userId: string, listId: string, cardData: {
    name: string
    desc?: string
    due?: string
  }): Promise<TrelloCard> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        throw new Error('Trello integration not connected')
      }

      const accessToken = await this.getAccessToken(userId, integration)
      const apiKey = this.getApiKey()
      const url = `https://api.trello.com/1/cards?key=${apiKey}&token=${accessToken}&idList=${listId}&name=${encodeURIComponent(cardData.name)}`

      const body: any = {}
      if (cardData.desc) body.desc = cardData.desc
      if (cardData.due) body.due = cardData.due

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      })

      if (!response.ok) {
        throw new Error(`Trello API error: ${response.status}`)
      }

      const card = await response.json()
      return {
        id: card.id,
        name: card.name,
        desc: card.desc,
        idList: card.idList,
        idBoard: card.idBoard,
        url: card.url,
        shortUrl: card.shortUrl,
        closed: card.closed,
        due: card.due,
        dueComplete: card.dueComplete,
        labels: card.labels,
      }
    } catch (error) {
      console.error('Error creating Trello card:', error)
      throw new Error('Failed to create Trello card')
    }
  }

  /**
   * Check if user has active Trello integration
   */
  async isConnected(userId: string): Promise<boolean> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        return false
      }

      // Check for Nango-managed connections (no token validation needed here)
      if (integration.metadata?.nangoManaged) {
        return true
      }

      // Validate token by making a simple API call
      try {
        const accessToken = await this.getAccessToken(userId, integration)
        const apiKey = this.getApiKey()
        const url = `https://api.trello.com/1/members/me?key=${apiKey}&token=${accessToken}&fields=id,fullName`
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
        })
        
        if (!response.ok) {
          console.error('Trello token validation failed:', response.status)
          return false
        }
        
        return true
      } catch (apiError) {
        console.error('Trello API validation failed:', apiError)
        return false
      }
    } catch (error) {
      console.error('Error checking Trello connection:', error)
      return false
    }
  }

  /**
   * Get all lists for a board (lists represent status in Trello)
   */
  async getBoardLists(userId: string, boardId: string): Promise<TrelloList[]> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        throw new Error('Trello integration not connected')
      }

      const accessToken = await this.getAccessToken(userId, integration)
      const apiKey = this.getApiKey()
      const url = `https://api.trello.com/1/boards/${boardId}/lists?key=${apiKey}&token=${accessToken}&fields=id,name,closed,pos`

      console.log('🔍 TRELLO SERVICE: Fetching lists for board:', boardId)

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ TRELLO SERVICE: Failed to fetch board lists:', response.status, errorText)
        throw new Error(`Failed to fetch board lists: ${response.status}`)
      }

      const lists = await response.json()
      // Filter out closed lists
      const openLists = lists.filter((list: any) => !list.closed)
      
      console.log('✅ TRELLO SERVICE: Found', openLists.length, 'lists for board:', boardId)
      
      return openLists.map((list: any) => ({
        id: list.id,
        name: list.name,
        closed: list.closed,
        idBoard: boardId,
        pos: list.pos,
      }))
    } catch (error) {
      console.error('Error fetching Trello board lists:', error)
      throw new Error('Failed to fetch Trello board lists')
    }
  }

  /**
   * Move a card to a different list (change status)
   */
  async moveCard(userId: string, cardId: string, targetListId: string): Promise<boolean> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        throw new Error('Trello integration not connected')
      }

      const accessToken = await this.getAccessToken(userId, integration)
      const apiKey = this.getApiKey()
      const url = `https://api.trello.com/1/cards/${cardId}?key=${apiKey}&token=${accessToken}`

      console.log('🔄 TRELLO SERVICE: Moving card:', cardId, 'to list:', targetListId)

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idList: targetListId
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ TRELLO SERVICE: Failed to move card:', response.status, errorText)
        throw new Error(`Failed to move card: ${response.status} - ${errorText}`)
      }

      console.log('✅ TRELLO SERVICE: Successfully moved card:', cardId)
      return true
    } catch (error) {
      console.error('Error moving Trello card:', error)
      throw new Error('Failed to move Trello card')
    }
  }

  /**
   * Get card details including current list
   */
  async getCard(userId: string, cardId: string): Promise<TrelloCard | null> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        throw new Error('Trello integration not connected')
      }

      const accessToken = await this.getAccessToken(userId, integration)
      const apiKey = this.getApiKey()
      const url = `https://api.trello.com/1/cards/${cardId}?key=${apiKey}&token=${accessToken}&fields=id,name,desc,idList,idBoard,url,shortUrl,closed,due,dueComplete,labels,dateLastActivity&list=true&members=true`

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        console.error('Failed to fetch card:', response.status)
        return null
      }

      const card = await response.json()
      return {
        id: card.id,
        name: card.name,
        desc: card.desc,
        idList: card.idList,
        idBoard: card.idBoard,
        url: card.url,
        shortUrl: card.shortUrl,
        closed: card.closed,
        due: card.due,
        dueComplete: card.dueComplete,
        labels: card.labels,
        list: card.list,
        members: card.members || [],
        dateLastActivity: card.dateLastActivity,
      }
    } catch (error) {
      console.error('Error fetching Trello card:', error)
      return null
    }
  }
}

export const trelloService = new TrelloService() 
