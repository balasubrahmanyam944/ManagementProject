/**
 * Trello Service with Nango Integration
 * 
 * This service replaces the OAuth 1.0a token management with Nango while
 * keeping the exact same interface and functionality.
 * 
 * Key changes:
 * - No more file-based OAuth state storage
 * - Automatic token management by Nango
 * - Tenant-scoped connections for multi-tenant support
 */

import { db } from '../db/database';
import { nangoService } from './nango-service';

export interface TrelloBoard {
  id: string;
  name: string;
  desc?: string;
  url: string;
  shortUrl: string;
  closed: boolean;
  prefs?: {
    backgroundColor?: string;
    backgroundImage?: string;
  };
}

export interface TrelloList {
  id: string;
  name: string;
  closed: boolean;
  pos: number;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc?: string;
  idList: string;
  idBoard: string;
  url: string;
  shortUrl: string;
  closed: boolean;
  due?: string;
  dueComplete?: boolean;
  labels: Array<{ id: string; name: string; color: string }>;
  list?: { id: string; name: string };
  members?: Array<{ id: string; fullName: string; avatarUrl?: string }>;
  dateLastActivity?: string;
}

export interface TrelloMember {
  id: string;
  fullName: string;
  username: string;
  avatarUrl?: string;
}

/**
 * Trello Service using Nango for OAuth management
 */
export class TrelloNangoService {
  private provider: 'trello' = 'trello';
  private apiBase = 'https://api.trello.com/1';

  /**
   * Get tenant ID from context
   */
  private getTenantId(): string {
    return process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 'default';
  }

  /**
   * Check if user has active Trello integration
   */
  async isConnected(userId: string, tenantId?: string): Promise<boolean> {
    const tenant = tenantId || this.getTenantId();
    return await nangoService.isConnected(this.provider, tenant, userId);
  }

  /**
   * Get valid access token - Nango handles refresh automatically!
   */
  async getAccessToken(userId: string, tenantId?: string): Promise<string> {
    const tenant = tenantId || this.getTenantId();
    return await nangoService.getAccessToken(this.provider, tenant, userId);
  }

  /**
   * Get API key from connection metadata or environment
   */
  private getApiKeyFromEnv(): string | null {
    const apiKey =
      process.env.TRELLO_API_KEY ||
      process.env.TRELLO_CLIENT_ID ||
      process.env.TRELLO_OAUTH_CLIENT_ID;
    return apiKey || null;
  }

  private cachedApiKey: string | null = null;

  /**
   * Resolve Trello API key.
   * Priority:
   * 1) Explicit env vars (TRELLO_API_KEY, TRELLO_CLIENT_ID, TRELLO_OAUTH_CLIENT_ID)
   * 2) Nango provider config (oauth_client_id set in Nango dashboard)
   * 3) Nango connection metadata/raw oauth payload
   */
  private async resolveApiKey(userId: string, tenantId: string): Promise<string> {
    if (this.cachedApiKey) return this.cachedApiKey;

    const fromEnv = this.getApiKeyFromEnv();
    if (fromEnv) {
      this.cachedApiKey = fromEnv;
      return fromEnv;
    }

    // Fetch from Nango provider config (contains the oauth_client_id / consumer key)
    try {
      const config = await nangoService.getProviderConfig(this.provider);
      const configKey = config?.oauth_client_id || config?.app_id || config?.client_id;
      if (configKey) {
        console.log('✅ Trello Nango: Resolved API key from Nango provider config');
        this.cachedApiKey = String(configKey);
        return this.cachedApiKey;
      }
    } catch (error) {
      console.warn('⚠️ Trello Nango: Could not read API key from Nango provider config:', error);
    }

    // Fallback: connection metadata
    try {
      const metadata = await nangoService.getConnectionMetadata(this.provider, tenantId, userId);
      const candidates = [
        metadata?.api_key,
        metadata?.apiKey,
        metadata?.client_id,
        metadata?.clientId,
        metadata?.consumer_key,
        metadata?.consumerKey,
        metadata?.key
      ].filter(Boolean);

      if (candidates.length > 0) {
        console.log('✅ Trello Nango: Resolved API key from Nango connection metadata');
        this.cachedApiKey = String(candidates[0]);
        return this.cachedApiKey;
      }
    } catch (error) {
      console.warn('⚠️ Trello Nango: Could not read API key from Nango connection metadata:', error);
    }

    throw new Error(
      'Trello API key is missing. Set TRELLO_API_KEY (or TRELLO_CLIENT_ID) in Render environment variables, ' +
      'or ensure your Nango Trello integration has oauth_client_id configured.'
    );
  }

  /**
   * Get connection status with details
   */
  async getConnectionStatus(userId: string, tenantId?: string) {
    const tenant = tenantId || this.getTenantId();
    return await nangoService.getConnectionStatus(this.provider, tenant, userId);
  }

  /**
   * Disconnect Trello integration
   */
  async disconnect(userId: string, tenantId?: string): Promise<void> {
    const tenant = tenantId || this.getTenantId();
    
    console.log(`🔄 Trello Nango: Disconnecting for user ${userId} in tenant ${tenant}`);
    
    await nangoService.deleteConnection(this.provider, tenant, userId);
    
    // Mark Trello projects as inactive in local DB (only Trello projects, not all projects)
    try {
      const projects = await db.findProjectsByUserId(userId);
      const virtualIntegrationId = `nango_${this.provider}_${tenant}_${userId}`;
      
      for (const project of projects) {
        // Only deactivate projects that belong to this Trello integration
        if (project.integrationId?.toString() === virtualIntegrationId || 
            (project as any).integrationType === 'TRELLO' ||
            (project.integrationId && project.integrationId.toString().includes('trello'))) {
          await db.updateProject(project._id.toString(), { isActive: false });
          console.log(`🔄 Trello Nango: Deactivated Trello project: ${project.name}`);
        }
      }
    } catch (error) {
      console.error('Error deactivating Trello projects:', error);
    }
    
    console.log(`✅ Trello Nango: Disconnected for user ${userId}`);
  }

  /**
   * Make authenticated request to Trello API
   */
  private async makeRequest<T>(
    userId: string,
    endpoint: string,
    options: RequestInit = {},
    tenantId?: string
  ): Promise<T> {
    const tenant = tenantId || this.getTenantId();
    const accessToken = await this.getAccessToken(userId, tenant);
    const apiKey = await this.resolveApiKey(userId, tenant);

    const url = new URL(`${this.apiBase}${endpoint}`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('token', accessToken);

    const response = await fetch(url.toString(), {
      ...options,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Trello API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Fetch all boards for the authenticated user
   */
  async fetchBoards(userId: string, tenantId?: string): Promise<TrelloBoard[]> {
    const tenant = tenantId || this.getTenantId();
    
    console.log(`🔍 Trello Nango: Fetching boards for user ${userId}`);
    
    try {
      const boards = await this.makeRequest<any[]>(
        userId,
        '/members/me/boards',
        { method: 'GET' },
        tenant
      );
      
      console.log(`✅ Trello Nango: Found ${boards.length} boards`);
      
      return boards.map((board) => ({
        id: board.id,
        name: board.name,
        desc: board.desc,
        url: board.url,
        shortUrl: board.shortUrl,
        closed: board.closed,
        prefs: board.prefs,
      }));
    } catch (error) {
      console.error('❌ Trello Nango: Error fetching boards:', error);
      throw error;
    }
  }

  /**
   * Fetch and store boards with analytics
   */
  async fetchAndStoreBoards(userId: string, tenantId?: string): Promise<TrelloBoard[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const boards = await this.fetchBoards(userId, tenant);
      
      console.log(`🔍 Trello Nango: Processing ${boards.length} boards`);
      
      for (const board of boards) {
        if (board.closed) continue;
        
        let analytics = {
          totalIssues: 0,
          openIssues: 0,
          inProgressIssues: 0,
          doneIssues: 0,
          dataSource: 'live' as const,
          lastUpdated: new Date().toISOString()
        };

        try {
          const cards = await this.fetchCards(userId, board.id, tenant);
          const lists = await this.fetchLists(userId, board.id, tenant);
          
          // Create list name map
          const listMap = new Map(lists.map(l => [l.id, l.name.toLowerCase()]));
          
          let openCount = 0, inProgressCount = 0, doneCount = 0;
          
          for (const card of cards) {
            const listName = listMap.get(card.idList) || '';
            
            if (listName.includes('done') || listName.includes('complete') || listName.includes('closed')) {
              doneCount++;
            } else if (listName.includes('progress') || listName.includes('doing') || listName.includes('review')) {
              inProgressCount++;
            } else {
              openCount++;
            }
          }
          
          analytics = {
            totalIssues: cards.length,
            openIssues: openCount,
            inProgressIssues: inProgressCount,
            doneIssues: doneCount,
            dataSource: 'live' as const,
            lastUpdated: new Date().toISOString()
          };
        } catch (cardError) {
          console.error(`⚠️ Trello Nango: Failed to fetch cards for ${board.name}:`, cardError);
        }

        // Store in local database
        const virtualIntegrationId = `nango_trello_${tenant}_${userId}`;
        
        await db.upsertProject(userId, virtualIntegrationId, {
          externalId: board.id,
          name: board.name,
          key: board.id,
          description: board.desc,
          avatarUrl: board.prefs?.backgroundImage,
          isActive: true,
          lastSyncAt: new Date(),
          analytics
        });
        
        console.log(`✅ Trello Nango: Stored board ${board.name} with ${analytics.totalIssues} cards`);
      }

      return boards.filter(b => !b.closed);
    } catch (error) {
      console.error('❌ Trello Nango: Error in fetchAndStoreBoards:', error);
      throw error;
    }
  }

  /**
   * Fetch lists for a board
   */
  async fetchLists(userId: string, boardId: string, tenantId?: string): Promise<TrelloList[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const lists = await this.makeRequest<any[]>(
        userId,
        `/boards/${boardId}/lists`,
        { method: 'GET' },
        tenant
      );
      
      return lists.map((list) => ({
        id: list.id,
        name: list.name,
        closed: list.closed,
        pos: list.pos,
      }));
    } catch (error) {
      console.error('❌ Trello Nango: Error fetching lists:', error);
      throw error;
    }
  }

  /**
   * Fetch cards for a board
   */
  async fetchCards(userId: string, boardId: string, tenantId?: string): Promise<TrelloCard[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      // First get lists for list name mapping
      const lists = await this.fetchLists(userId, boardId, tenant);
      const listMap = new Map(lists.map(l => [l.id, l.name]));
      
      // Fetch cards with member info
      const accessToken = await this.getAccessToken(userId, tenant);
      const apiKey = await this.resolveApiKey(userId, tenant);
      
      const url = new URL(`${this.apiBase}/boards/${boardId}/cards`);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('token', accessToken);
      url.searchParams.set('fields', 'id,name,desc,idList,idBoard,url,shortUrl,closed,due,dueComplete,labels,dateLastActivity');
      url.searchParams.set('members', 'true');
      url.searchParams.set('member_fields', 'fullName,avatarUrl');
      
      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Trello API error: ${response.status}`);
      }
      
      const cards = await response.json();
      
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
        labels: card.labels || [],
        list: { id: card.idList, name: listMap.get(card.idList) || 'Unknown' },
        members: card.members || [],
        dateLastActivity: card.dateLastActivity
      }));
    } catch (error) {
      console.error('❌ Trello Nango: Error fetching cards:', error);
      throw error;
    }
  }

  /**
   * Create a card
   */
  async createCard(
    userId: string,
    listId: string,
    cardData: {
      name: string;
      desc?: string;
      due?: string;
      labels?: string[];
    },
    tenantId?: string
  ): Promise<TrelloCard> {
    const tenant = tenantId || this.getTenantId();
    
    console.log(`🔄 Trello Nango: Creating card in list ${listId}`);
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const apiKey = await this.resolveApiKey(userId, tenant);
      
      const url = new URL(`${this.apiBase}/cards`);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('token', accessToken);
      url.searchParams.set('idList', listId);
      url.searchParams.set('name', cardData.name);
      
      if (cardData.desc) url.searchParams.set('desc', cardData.desc);
      if (cardData.due) url.searchParams.set('due', cardData.due);
      if (cardData.labels) url.searchParams.set('idLabels', cardData.labels.join(','));
      
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create card: ${response.status} - ${errorText}`);
      }
      
      const card = await response.json();
      console.log(`✅ Trello Nango: Created card ${card.id}`);
      
      return card;
    } catch (error) {
      console.error('❌ Trello Nango: Error creating card:', error);
      throw error;
    }
  }

  /**
   * Update a card
   */
  async updateCard(
    userId: string,
    cardId: string,
    updateData: {
      name?: string;
      desc?: string;
      due?: string;
      dueComplete?: boolean;
      idList?: string;
      closed?: boolean;
    },
    tenantId?: string
  ): Promise<TrelloCard> {
    const tenant = tenantId || this.getTenantId();
    
    console.log(`🔄 Trello Nango: Updating card ${cardId}`);
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const apiKey = await this.resolveApiKey(userId, tenant);
      
      const url = new URL(`${this.apiBase}/cards/${cardId}`);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('token', accessToken);
      
      // Add update fields as query params
      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
      
      const response = await fetch(url.toString(), {
        method: 'PUT',
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update card: ${response.status} - ${errorText}`);
      }
      
      const card = await response.json();
      console.log(`✅ Trello Nango: Updated card ${card.id}`);
      
      return card;
    } catch (error) {
      console.error('❌ Trello Nango: Error updating card:', error);
      throw error;
    }
  }

  /**
   * Move a card to a different list (status change)
   */
  async moveCard(
    userId: string,
    cardId: string,
    targetListId: string,
    tenantId?: string
  ): Promise<TrelloCard> {
    return this.updateCard(userId, cardId, { idList: targetListId }, tenantId);
  }

  /**
   * Archive/close a card
   */
  async archiveCard(userId: string, cardId: string, tenantId?: string): Promise<TrelloCard> {
    return this.updateCard(userId, cardId, { closed: true }, tenantId);
  }

  /**
   * Delete a card
   */
  async deleteCard(userId: string, cardId: string, tenantId?: string): Promise<void> {
    const tenant = tenantId || this.getTenantId();
    
    console.log(`🔄 Trello Nango: Deleting card ${cardId}`);
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const apiKey = await this.resolveApiKey(userId, tenant);
      
      const url = new URL(`${this.apiBase}/cards/${cardId}`);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('token', accessToken);
      
      const response = await fetch(url.toString(), {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete card: ${response.status} - ${errorText}`);
      }
      
      console.log(`✅ Trello Nango: Deleted card ${cardId}`);
    } catch (error) {
      console.error('❌ Trello Nango: Error deleting card:', error);
      throw error;
    }
  }

  /**
   * Get board members
   */
  async getBoardMembers(userId: string, boardId: string, tenantId?: string): Promise<TrelloMember[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const members = await this.makeRequest<any[]>(
        userId,
        `/boards/${boardId}/members`,
        { method: 'GET' },
        tenant
      );
      
      return members.map((member) => ({
        id: member.id,
        fullName: member.fullName,
        username: member.username,
        avatarUrl: member.avatarUrl,
      }));
    } catch (error) {
      console.error('❌ Trello Nango: Error fetching board members:', error);
      throw error;
    }
  }

  /**
   * Create a list on a board
   */
  async createList(
    userId: string,
    boardId: string,
    name: string,
    tenantId?: string
  ): Promise<TrelloList> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const apiKey = this.getApiKey();
      
      const url = new URL(`${this.apiBase}/lists`);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('token', accessToken);
      url.searchParams.set('name', name);
      url.searchParams.set('idBoard', boardId);
      
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Trello API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('❌ Trello Nango: Error creating list:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const trelloNangoService = new TrelloNangoService();

