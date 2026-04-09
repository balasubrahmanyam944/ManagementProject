/**
 * Webhook types and interfaces for Jira and Trello integrations
 */

// ==================== Common Types ====================

export type WebhookIntegrationType = 'JIRA' | 'TRELLO'

export type WebhookStatus = 'ACTIVE' | 'INACTIVE' | 'FAILED' | 'PENDING'

export interface WebhookConfig {
  id: string
  webhookId: string
  userId: string
  integrationType: WebhookIntegrationType
  projectId?: string // External project ID (Jira key or Trello board ID)
  callbackUrl: string
  events: string[]
  secret?: string
  status: WebhookStatus
  lastTriggeredAt?: Date
  errorCount: number
  lastError?: string
  createdAt: Date
  updatedAt: Date
}

export interface WebhookEvent {
  id: string
  userId: string
  integrationType: WebhookIntegrationType
  eventType: string
  projectId?: string
  payload: any
  processed: boolean
  processedAt?: Date
  error?: string
  retryCount: number
  createdAt: Date
}

export interface WebhookProcessResult {
  success: boolean
  userId?: string
  projectId?: string
  eventType: string
  updatedData?: any
  error?: string
}

// ==================== Jira Webhook Types ====================

export type JiraWebhookEventType = 
  | 'jira:issue_created'
  | 'jira:issue_updated'
  | 'jira:issue_deleted'
  | 'sprint_created'
  | 'sprint_updated'
  | 'sprint_deleted'
  | 'sprint_started'
  | 'sprint_closed'
  | 'board_created'
  | 'board_updated'
  | 'board_deleted'
  | 'project_created'
  | 'project_updated'
  | 'project_deleted'

export interface JiraWebhookPayload {
  timestamp: number
  webhookEvent: JiraWebhookEventType
  issue_event_type_name?: string
  user?: {
    accountId: string
    displayName: string
    emailAddress?: string
  }
  issue?: {
    id: string
    key: string
    self: string
    fields: {
      summary: string
      status: {
        name: string
        statusCategory: {
          key: string
          name: string
        }
      }
      issuetype: {
        name: string
      }
      priority?: {
        name: string
      }
      assignee?: {
        accountId: string
        displayName: string
      }
      created: string
      updated: string
      duedate?: string
      resolutiondate?: string
      project: {
        id: string
        key: string
        name: string
      }
    }
  }
  changelog?: {
    id: string
    items: Array<{
      field: string
      fieldtype: string
      from: string | null
      fromString: string | null
      to: string | null
      toString: string | null
    }>
  }
  sprint?: {
    id: number
    name: string
    state: string
    startDate?: string
    endDate?: string
    completeDate?: string
    originBoardId: number
    goal?: string
  }
  project?: {
    id: string
    key: string
    name: string
  }
}

export interface JiraWebhookRegistration {
  name: string
  url: string
  events: JiraWebhookEventType[]
  filters?: {
    'issue-related-events-section'?: string
  }
  excludeBody?: boolean
}

export interface JiraWebhookResponse {
  self: string
  name: string
  url: string
  events: string[]
  filters: any
  lastUpdatedUser: {
    accountId: string
    displayName: string
  }
  lastUpdatedDisplayName: string
  lastUpdated: number
  expirationDate?: number
}

// ==================== Trello Webhook Types ====================

export type TrelloWebhookActionType = 
  | 'createCard'
  | 'updateCard'
  | 'deleteCard'
  | 'moveCardFromBoard'
  | 'moveCardToBoard'
  | 'addMemberToCard'
  | 'removeMemberFromCard'
  | 'createList'
  | 'updateList'
  | 'moveListFromBoard'
  | 'moveListToBoard'
  | 'createBoard'
  | 'updateBoard'
  | 'addMemberToBoard'
  | 'removeMemberFromBoard'
  | 'addLabelToCard'
  | 'removeLabelFromCard'
  | 'commentCard'
  | 'addChecklistToCard'
  | 'updateCheckItemStateOnCard'

export interface TrelloWebhookPayload {
  action: {
    id: string
    idMemberCreator: string
    data: {
      board?: {
        id: string
        name: string
        shortLink: string
      }
      list?: {
        id: string
        name: string
      }
      listBefore?: {
        id: string
        name: string
      }
      listAfter?: {
        id: string
        name: string
      }
      card?: {
        id: string
        name: string
        idShort: number
        shortLink: string
        idList?: string
        due?: string
        dueComplete?: boolean
        closed?: boolean
      }
      old?: Record<string, any>
    }
    type: TrelloWebhookActionType
    date: string
    memberCreator: {
      id: string
      username: string
      fullName: string
    }
  }
  model: {
    id: string
    name: string
    desc?: string
    url?: string
  }
}

export interface TrelloWebhookRegistration {
  callbackURL: string
  idModel: string // Board ID or other model ID
  description?: string
  active?: boolean
}

export interface TrelloWebhookResponse {
  id: string
  description: string
  idModel: string
  callbackURL: string
  active: boolean
  consecutiveFailures: number
  firstConsecutiveFailDate: string | null
}

// ==================== Broadcast Types ====================

export interface WebhookBroadcastMessage {
  type: 'project_update' | 'issue_update' | 'analytics_update'
  userId: string
  integrationType: WebhookIntegrationType
  projectId?: string
  eventType: string
  data: any
  timestamp: Date
}

