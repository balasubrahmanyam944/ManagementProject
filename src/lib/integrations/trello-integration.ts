'use server'

import { TrelloService } from './trello-service'
import { db } from '../db/database'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { nangoService } from './nango-service'
import { trelloNangoService } from './trello-nango-service'
import type { 
  DetailedTrelloProject, 
  TrelloCard 
} from '@/types/integrations'

export async function getTrelloProjectDetailsAction(projectId: string) {
  try {
    console.log('getTrelloProjectDetailsAction called for board:', projectId);
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' }
    }

    const trelloService = new TrelloService()
    const integration = await trelloService.getIntegration(session.user.id)
    
    if (!integration || integration.status !== 'CONNECTED') {
      return { success: false, error: 'Trello integration not connected' }
    }

    // Get project from database
    const projects = await db.findProjectsByUserId(session.user.id)
    const project = projects.find(p => p.externalId === projectId && p.isActive)
    
    if (!project) {
      return { success: false, error: 'Project not found' }
    }

    // Get access token (handles both Nango and DB tokens)
    let accessToken = integration.accessToken
    if (integration.metadata?.nangoManaged) {
      const tenantId = integration.metadata.tenantId || 'default'
      accessToken = await nangoService.getAccessToken('trello', tenantId, session.user.id)
    }
    
    if (!accessToken) {
      return { success: false, error: 'Trello access token not available' }
    }

    // Fetch cards/lists via the same path used by the working Nango Trello service in status sync.
    const tenantId = integration.metadata?.tenantId || 'default';
    let cards: TrelloCard[] = [];
    let lists: Array<{ id: string; name: string }> = [];

    if (integration.metadata?.nangoManaged) {
      cards = await trelloNangoService.fetchCards(session.user.id, projectId, tenantId);
      const trelloLists = await trelloNangoService.fetchLists(session.user.id, projectId, tenantId);
      lists = trelloLists.map((l) => ({ id: l.id, name: l.name }));
    } else {
      const legacyData = await fetchTrelloCardsAndLists(accessToken, projectId);
      cards = legacyData.cards;
      lists = legacyData.lists;
    }
    console.log('Cards fetched for board', projectId, ':', cards.length, cards[0]);

    // Calculate analytics for Trello board
    const analytics = calculateTrelloAnalytics(cards);

    const detailedProject: DetailedTrelloProject = {
      id: project.externalId || '',
      name: project.name,
      desc: project.description || '',
      url: `https://trello.com/b/${projectId}`,
      shortUrl: `https://trello.com/b/${projectId}`,
      shortLink: projectId,
      closed: false,
      prefs: {
        backgroundColor: '#0079BF',
        backgroundImage: project.avatarUrl
      },
      members: [],
      lists: [],
      labels: [],
      analytics
    }

    // Convert Trello cards to Jira-like issues for consistency
    const { convertTrelloCardsToIssues } = await import('@/lib/chart-data-utils')
    const issues = convertTrelloCardsToIssues(cards)

    return {
      success: true,
      data: {
        project: detailedProject,
        issues: issues
      },
      // Also include direct properties for backward compatibility
      project: detailedProject,
      cards: cards,
      lists: lists,
      message: 'Project details loaded successfully'
    }
  } catch (error) {
    console.error('Error getting Trello project details:', error)
    return { success: false, error: 'Failed to load project details' }
  }
}

async function fetchTrelloCardsAndLists(accessToken: string, boardId: string): Promise<{ cards: TrelloCard[]; lists: Array<{ id: string; name: string }> }> {
  try {
    const TRELLO_API_KEY = process.env.TRELLO_API_KEY
    if (!TRELLO_API_KEY) {
      throw new Error('TRELLO_API_KEY not configured')
    }
    
    // Fetch all lists for the board
    const listsUrl = `https://api.trello.com/1/boards/${boardId}/lists?key=${TRELLO_API_KEY}&token=${accessToken}&fields=id,name`;
    const listsResponse = await fetch(listsUrl, {
      headers: { 'Accept': 'application/json' },
    });
    if (!listsResponse.ok) throw new Error(`Trello API error (lists): ${listsResponse.status}`);
    const lists = await listsResponse.json();
    const listMap = Object.fromEntries(lists.map((l: any) => [l.id, l.name]));

    // Fetch all cards for the board
    const url = `https://api.trello.com/1/boards/${boardId}/cards?key=${TRELLO_API_KEY}&token=${accessToken}&fields=id,name,desc,idList,idBoard,url,shortUrl,closed,due,dueComplete,labels,dateLastActivity&members=true&member_fields=fullName,avatarUrl`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Trello API error: ${response.status}`);
    }
    const cards = await response.json();
    console.log('Fetched Trello cards for board', boardId, ':', cards.length, cards[0]);
    const mappedCards = cards.map((card: any) => ({
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
      list: { id: card.idList, name: listMap[card.idList] || 'Unknown' },
      members: card.members || [],
      dateLastActivity: card.dateLastActivity
    }));
    return { cards: mappedCards, lists: lists.map((l: any) => ({ id: l.id, name: l.name })) };
  } catch (error) {
    console.error('Error fetching Trello cards for board', boardId, ':', error);
    return { cards: [], lists: [] };
  }
}

export async function fetchTrelloCards(accessToken: string, boardId: string): Promise<TrelloCard[]> {
  const { cards } = await fetchTrelloCardsAndLists(accessToken, boardId);
  return cards;
}

// Add analytics calculation helper
function calculateTrelloAnalytics(cards: TrelloCard[]) {
  const totalIssues = cards.length;
  let openIssues = 0, inProgressIssues = 0, doneIssues = 0;
  for (const card of cards) {
    const status = card.list?.name?.toLowerCase() || '';
    if (status.includes('done') || status.includes('complete') || status.includes('closed')) {
      doneIssues++;
    } else if (status.includes('progress') || status.includes('doing') || status.includes('review') || status.includes('testing')) {
      inProgressIssues++;
    } else {
      openIssues++;
    }
  }
  return { totalIssues, openIssues, inProgressIssues, doneIssues };
} 