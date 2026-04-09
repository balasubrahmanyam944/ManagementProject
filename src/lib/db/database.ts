import { ObjectId, Collection } from 'mongodb'
import { getCollection, COLLECTIONS, toObjectId, fromObjectId } from './mongodb'

// Helper function to safely convert string to ObjectId for queries
function safeObjectId(id: string): ObjectId | undefined {
  const objectId = toObjectId(id)
  return objectId || undefined
}

// Types based on your schema
export type UserRole = 'USER' | 'ADMIN' | 'PREMIUM' | 'MANAGER' | 'TESTER' | 'DEVELOPER'
export type SubscriptionType = 'FREE' | 'PRO' | 'ENTERPRISE'
export type SubscriptionStatus = 'ACTIVE' | 'INACTIVE' | 'CANCELLED' | 'EXPIRED'
export type IntegrationType = 'JIRA' | 'TRELLO' | 'TESTRAIL' | 'SLACK'
export type IntegrationStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'EXPIRED'
export type AuditAction = 'LOGIN' | 'LOGOUT' | 'REGISTER' | 'UPDATE_PROFILE' | 'CONNECT_INTEGRATION' | 'DISCONNECT_INTEGRATION' | 'CREATE_PROJECT' | 'UPDATE_PROJECT' | 'DELETE_PROJECT' | 'SYNC_DATA' | 'EXPORT_DATA' | 'CHANGE_SUBSCRIPTION' | 'ADMIN_ACTION'

// Database interfaces
export interface User {
  _id: ObjectId
  name?: string
  email: string
  image?: string
  password?: string
  role: UserRole
  isActive: boolean
  isVerified: boolean
  verifyToken?: string
  verifyTokenExpires?: Date
  lastLoginAt?: Date
  createdAt: Date
  updatedAt: Date
  allowedPages?: string[]
}

export interface Subscription {
  _id: ObjectId
  userId: ObjectId
  type: SubscriptionType
  status: SubscriptionStatus
  currentPeriodEnd?: Date
  customerId?: string
  subscriptionId?: string
  createdAt: Date
  updatedAt: Date
}

export interface Integration {
  _id: ObjectId
  userId: ObjectId
  type: IntegrationType
  status: IntegrationStatus
  accessToken?: string
  refreshToken?: string
  expiresAt?: Date
  serverUrl?: string
  consumerKey?: string
  metadata?: any
  createdAt: Date
  updatedAt: Date
  lastSyncAt?: Date
}

export interface Project {
  _id: ObjectId
  userId: ObjectId
  integrationId: ObjectId | string  // Can be ObjectId or Nango virtual ID (string)
  integrationType?: 'JIRA' | 'TRELLO' | 'TESTRAIL' | 'SLACK'  // Direct type for fast filtering
  externalId: string
  name: string
  key?: string
  description?: string
  avatarUrl?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  lastSyncAt?: Date
  analytics?: {
    totalIssues: number
    openIssues: number
    inProgressIssues: number
    doneIssues: number
    statusCounts?: Record<string, number>
    typeCounts?: Record<string, number>
    dataSource?: 'live' | 'cached'
    lastUpdated?: string
  }
}

// Shared project snapshot for public sharing
export interface SharedProject {
  _id: ObjectId;
  shareId: string;
  projectId: string;
  projectType: 'jira' | 'trello';
  name: string;
  key?: string;
  externalId?: string;
  description?: string;
  analytics: {
    totalIssues: number;
    openIssues: number;
    inProgressIssues: number;
    doneIssues: number;
    statusCounts: Record<string, number>;
    typeCounts: Record<string, number>;
    dataSource: 'live' | 'cached';
    lastUpdated?: string;
  };
  issues: any[];
  sharedAt: Date;
  sharedBy: string;
  expiresAt?: Date;
}

export interface AuditLog {
  _id: ObjectId
  userId?: ObjectId
  action: AuditAction
  resource?: string
  details?: any
  ipAddress?: string
  userAgent?: string
  createdAt: Date
}

export interface Account {
  _id: ObjectId
  userId: ObjectId
  type: string
  provider: string
  providerAccountId: string
  refresh_token?: string
  access_token?: string
  expires_at?: number
  token_type?: string
  scope?: string
  id_token?: string
  session_state?: string
}

export interface Session {
  _id: ObjectId
  sessionToken: string
  userId: ObjectId
  expires: Date
}

// Webhook types
export type WebhookStatus = 'ACTIVE' | 'INACTIVE' | 'FAILED' | 'PENDING'

export interface Webhook {
  _id: ObjectId
  webhookId: string // External webhook ID from Jira/Trello
  userId: ObjectId
  integrationType: IntegrationType
  projectId?: string // External project ID
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
  _id: ObjectId
  userId: ObjectId
  integrationType: IntegrationType
  eventType: string
  projectId?: string
  payload: any
  processed: boolean
  processedAt?: Date
  error?: string
  retryCount: number
  createdAt: Date
}


// Database service class
export class DatabaseService {
  private async getUsersCollection(): Promise<Collection<User>> {
    return getCollection(COLLECTIONS.USERS) as unknown as Promise<Collection<User>>
  }

  private async getSubscriptionsCollection(): Promise<Collection<Subscription>> {
    return getCollection(COLLECTIONS.SUBSCRIPTIONS) as unknown as Promise<Collection<Subscription>>
  }

  private async getIntegrationsCollection(): Promise<Collection<Integration>> {
    return getCollection(COLLECTIONS.INTEGRATIONS) as unknown as Promise<Collection<Integration>>
  }

  private async getProjectsCollection(): Promise<Collection<Project>> {
    return getCollection(COLLECTIONS.PROJECTS) as unknown as Promise<Collection<Project>>
  }

  private async getAuditLogsCollection(): Promise<Collection<AuditLog>> {
    return getCollection(COLLECTIONS.AUDIT_LOGS) as unknown as Promise<Collection<AuditLog>>
  }

  private async getAccountsCollection(): Promise<Collection<Account>> {
    return getCollection(COLLECTIONS.ACCOUNTS) as unknown as Promise<Collection<Account>>
  }

  private async getSessionsCollection(): Promise<Collection<Session>> {
    return getCollection(COLLECTIONS.SESSIONS) as unknown as Promise<Collection<Session>>
  }


  private async getTestcasesCollection(): Promise<Collection<any>> {
    return getCollection(COLLECTIONS.TESTCASES) as unknown as Promise<Collection<any>>
  }

  private async getWebhooksCollection(): Promise<Collection<Webhook>> {
    return getCollection(COLLECTIONS.WEBHOOKS) as unknown as Promise<Collection<Webhook>>
  }

  private async getWebhookEventsCollection(): Promise<Collection<WebhookEvent>> {
    return getCollection(COLLECTIONS.WEBHOOK_EVENTS) as unknown as Promise<Collection<WebhookEvent>>
  }

  // User operations
  async createUser(userData: Omit<User, '_id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const collection = await this.getUsersCollection()
    const now = new Date()
    
    const user: Omit<User, '_id'> = {
      ...userData,
      isVerified: userData.isVerified ?? false,
      createdAt: now,
      updatedAt: now,
    }

    const result = await collection.insertOne(user as any)
    return { ...user, _id: result.insertedId }
  }

  async findUserByVerifyToken(token: string): Promise<User | null> {
    const collection = await this.getUsersCollection()
    const user = await collection.findOne({ verifyToken: token })
    
    // Check if token is expired
    if (user && user.verifyTokenExpires && user.verifyTokenExpires < new Date()) {
      return null
    }
    
    return user
  }

  async findUserById(userId: string): Promise<User | null> {
    const collection = await this.getUsersCollection()
    return collection.findOne({ _id: safeObjectId(userId) })
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const collection = await this.getUsersCollection()
    return collection.findOne({ email })
  }

  async updateUser(userId: string, updateData: Partial<User>): Promise<User | null> {
    const collection = await this.getUsersCollection()
    const result = await collection.findOneAndUpdate(
      { _id: safeObjectId(userId) },
      { 
        $set: { 
          ...updateData, 
          updatedAt: new Date() 
        } 
      },
      { returnDocument: 'after' }
    )
    return result || null
  }

  async deleteUser(userId: string): Promise<boolean> {
    const collection = await this.getUsersCollection()
    const result = await collection.deleteOne({ _id: safeObjectId(userId) })
    return result.deletedCount > 0
  }

  async findUserWithSubscription(userId: string): Promise<(User & { subscription?: Subscription }) | null> {
    const collection = await this.getUsersCollection()
    
    // Try to convert to ObjectId if it's a valid format, otherwise search by other fields
    let user;
    const objectId = toObjectId(userId);
    
    if (objectId) {
      // Valid ObjectId format - search by _id
      user = await collection.findOne({ _id: objectId });
    } else {
      // Invalid ObjectId format - search by other fields
      console.warn('Invalid userId format for ObjectId, searching by other fields:', userId);
      user = await collection.findOne({ 
        $or: [
          { userId: userId }, // Try as userId field
          { email: userId } // Try as email (fallback)
        ]
      });
    }
    
    if (!user) return null

    const subscription = await this.findSubscriptionByUserId(userId)
    return { ...user, subscription: subscription || undefined }
  }

  async findAllUsers(): Promise<User[]> {
    const collection = await this.getUsersCollection();
    return collection.find({}).toArray();
  }

  // Subscription operations
  async createSubscription(subscriptionData: Omit<Subscription, '_id' | 'createdAt' | 'updatedAt'>): Promise<Subscription> {
    const collection = await this.getSubscriptionsCollection()
    const now = new Date()
    
    const subscription: Omit<Subscription, '_id'> = {
      ...subscriptionData,
      createdAt: now,
      updatedAt: now,
    }

    const result = await collection.insertOne(subscription as any)
    return { ...subscription, _id: result.insertedId }
  }

  async findSubscriptionByUserId(userId: string): Promise<Subscription | null> {
    const collection = await this.getSubscriptionsCollection()
    
    // Try to convert to ObjectId if it's a valid format, otherwise search by other fields
    const objectId = toObjectId(userId);
    
    if (objectId) {
      // Valid ObjectId format - search by userId
      return collection.findOne({ userId: objectId });
    } else {
      // Invalid ObjectId format - search by other fields
      console.warn('Invalid userId format for ObjectId in subscription search:', userId);
      return null; // Subscriptions should have valid ObjectId user references
    }
  }

  async upsertSubscription(userId: string, subscriptionData: Partial<Subscription>): Promise<Subscription> {
    const collection = await this.getSubscriptionsCollection()
    const now = new Date()
    
    const result = await collection.findOneAndUpdate(
      { userId: safeObjectId(userId) },
      { 
        $set: { 
          ...subscriptionData, 
          updatedAt: now 
        },
        $setOnInsert: { 
          userId: safeObjectId(userId),
          createdAt: now 
        }
      },
      { 
        upsert: true, 
        returnDocument: 'after' 
      }
    )
    
    if (!result) {
      throw new Error('Failed to upsert subscription')
    }
    
    return result
  }

  // Integration operations
  async createIntegration(integrationData: Omit<Integration, '_id' | 'createdAt' | 'updatedAt'>): Promise<Integration> {
    const collection = await this.getIntegrationsCollection()
    const now = new Date()
    
    const integration: Omit<Integration, '_id'> = {
      ...integrationData,
      createdAt: now,
      updatedAt: now,
    }

    const result = await collection.insertOne(integration as any)
    return { ...integration, _id: result.insertedId }
  }

  async findIntegrationsByUserId(userId: string): Promise<Integration[]> {
    const collection = await this.getIntegrationsCollection()
    
    // Try to convert to ObjectId if it's a valid format, otherwise return empty array
    const objectId = toObjectId(userId);
    
    if (objectId) {
      // Valid ObjectId format - search by userId
      return collection.find({ userId: objectId }).toArray();
    } else {
      // Invalid ObjectId format - can't search by userId field
      console.warn('Invalid userId format for ObjectId in integrations search:', userId);
      return [];
    }
  }

  async findIntegrationByType(userId: string, type: IntegrationType): Promise<Integration | null> {
    const collection = await this.getIntegrationsCollection()
    
    // Try to convert to ObjectId if it's a valid format
    const objectId = toObjectId(userId);
    
    if (objectId) {
      // Valid ObjectId format - search by userId and type
      return collection.findOne({ userId: objectId, type: type });
    } else {
      // Invalid ObjectId format - can't search by userId field
      console.warn('Invalid userId format for ObjectId in integration search by type:', userId);
      return null;
    }
  }

  async upsertIntegration(userId: string, type: IntegrationType, integrationData: Partial<Integration>): Promise<Integration> {
    const collection = await this.getIntegrationsCollection()
    const now = new Date()
    
    // Try to convert to ObjectId if it's a valid format
    const objectId = toObjectId(userId);
    if (!objectId) {
      throw new Error('Invalid userId format for integration upsert');
    }
    
    // Exclude createdAt from $set to avoid conflict with $setOnInsert
    const { createdAt, ...dataToSet } = integrationData
    
    const result = await collection.findOneAndUpdate(
      { userId: objectId, type },
      { 
        $set: { 
          ...dataToSet, 
          updatedAt: now 
        },
        $setOnInsert: { 
          createdAt: now 
        }
      },
      { 
        upsert: true, 
        returnDocument: 'after' 
      }
    )
    
    if (!result) {
      throw new Error('Failed to upsert integration')
    }
    
    return result
  }

  async deleteIntegration(integrationId: string): Promise<boolean> {
    const collection = await this.getIntegrationsCollection()
    const result = await collection.deleteOne({ _id: safeObjectId(integrationId) })
    return result.deletedCount > 0
  }

  async removeIntegration(userId: string, type: IntegrationType): Promise<boolean> {
    const collection = await this.getIntegrationsCollection()
    
    // Try to convert to ObjectId if it's a valid format
    const objectId = toObjectId(userId);
    if (!objectId) {
      throw new Error('Invalid userId format for integration removal');
    }
    
    const result = await collection.deleteOne({ userId: objectId, type })
    return result.deletedCount > 0
  }

  // Project operations
  async findProjectsByUserId(userId: string): Promise<Project[]> {
    const collection = await this.getProjectsCollection()
    
    // Try to convert to ObjectId if it's a valid format, otherwise return empty array
    const objectId = toObjectId(userId);
    
    if (objectId) {
      // Valid ObjectId format - search by userId
      return collection.find({ userId: objectId }).toArray();
    } else {
      // Invalid ObjectId format - can't search by userId field
      console.warn('Invalid userId format for ObjectId in projects search:', userId);
      return [];
    }
  }

  async countProjectsByUserId(userId: string): Promise<number> {
    const collection = await this.getProjectsCollection()
    
    // Try to convert to ObjectId if it's a valid format, otherwise return 0
    const objectId = toObjectId(userId);
    
    if (objectId) {
      // Valid ObjectId format - search by userId
      return collection.countDocuments({ userId: objectId });
    } else {
      // Invalid ObjectId format - can't search by userId field
      console.warn('Invalid userId format for ObjectId in projects count:', userId);
      return 0;
    }
  }

  async updateProject(projectId: string, updateData: Partial<Project>): Promise<Project | null> {
    const collection = await this.getProjectsCollection()
    const result = await collection.findOneAndUpdate(
      { _id: safeObjectId(projectId) },
      { 
        $set: { 
          ...updateData, 
          updatedAt: new Date() 
        } 
      },
      { returnDocument: 'after' }
    )
    return result || null
  }

  async upsertProject(userId: string, integrationId: string, projectData: {
    externalId: string
    name: string
    key?: string
    description?: string
    avatarUrl?: string
    isActive: boolean
    lastSyncAt?: Date
    integrationType?: 'JIRA' | 'TRELLO' | 'TESTRAIL' | 'SLACK'
    analytics?: {
      totalIssues: number
      openIssues: number
      inProgressIssues: number
      doneIssues: number
      statusCounts?: Record<string, number>
      typeCounts?: Record<string, number>
      dataSource?: 'live' | 'cached'
      lastUpdated?: string
    }
  }): Promise<Project> {
    const collection = await this.getProjectsCollection()
    const now = new Date()
    
    // Handle Nango virtual integration IDs (strings) vs traditional ObjectId integration IDs
    const isNangoId = integrationId.startsWith('nango_')
    const integrationIdValue = isNangoId ? integrationId : safeObjectId(integrationId)
    
    // Infer integrationType from Nango ID if not provided
    let integrationType = projectData.integrationType
    if (!integrationType && isNangoId) {
      if (integrationId.startsWith('nango_jira_')) integrationType = 'JIRA'
      else if (integrationId.startsWith('nango_trello_')) integrationType = 'TRELLO'
      else if (integrationId.startsWith('nango_testrail_')) integrationType = 'TESTRAIL'
      else if (integrationId.startsWith('nango_slack_')) integrationType = 'SLACK'
    }
    
    const result = await collection.findOneAndUpdate(
      { 
        userId: safeObjectId(userId), 
        integrationId: integrationIdValue,
        externalId: projectData.externalId
      },
      { 
        $set: { 
          ...projectData, 
          ...(integrationType && { integrationType }),
          updatedAt: now,
          lastSyncAt: projectData.lastSyncAt || now
        },
        $setOnInsert: { 
          userId: safeObjectId(userId),
          integrationId: integrationIdValue,
          createdAt: now 
        }
      },
      { 
        upsert: true, 
        returnDocument: 'after' 
      }
    )
    
    if (!result) {
      throw new Error('Failed to upsert project')
    }
    
    return result
  }

  async countIntegrationsByUserId(userId: string): Promise<number> {
    const collection = await this.getIntegrationsCollection()
    return collection.countDocuments({ userId: safeObjectId(userId) })
  }

  async countConnectedIntegrationsByUserId(userId: string): Promise<number> {
    const collection = await this.getIntegrationsCollection()
    return collection.countDocuments({ 
      userId: safeObjectId(userId), 
      status: 'CONNECTED' 
    })
  }

  // Audit log operations
  async createAuditLog(auditData: Omit<AuditLog, '_id' | 'createdAt'>): Promise<AuditLog> {
    const collection = await this.getAuditLogsCollection()
    const now = new Date()
    
    const auditLog: Omit<AuditLog, '_id'> = {
      ...auditData,
      createdAt: now,
    }

    const result = await collection.insertOne(auditLog as any)
    return { ...auditLog, _id: result.insertedId }
  }

  async findRecentAuditLogsByUserId(userId: string, limit: number = 5): Promise<AuditLog[]> {
    const collection = await this.getAuditLogsCollection()
    return collection
      .find({ userId: safeObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()
  }

  // System operations
  async countUsers(): Promise<number> {
    const collection = await this.getUsersCollection()
    return collection.countDocuments()
  }

  async countProjects(): Promise<number> {
    const collection = await this.getProjectsCollection()
    return collection.countDocuments()
  }

  async countIntegrations(): Promise<number> {
    const collection = await this.getIntegrationsCollection()
    return collection.countDocuments()
  }

  // NextAuth specific operations
  async findAccountByProvider(provider: string, providerAccountId: string): Promise<Account | null> {
    const collection = await this.getAccountsCollection()
    return collection.findOne({ provider, providerAccountId })
  }

  async createAccount(accountData: Omit<Account, '_id'>): Promise<Account> {
    const collection = await this.getAccountsCollection()
    const result = await collection.insertOne(accountData as any)
    return { ...accountData, _id: result.insertedId }
  }

  async findSessionByToken(sessionToken: string): Promise<Session | null> {
    const collection = await this.getSessionsCollection()
    return collection.findOne({ sessionToken })
  }

  async createSession(sessionData: Omit<Session, '_id'>): Promise<Session> {
    const collection = await this.getSessionsCollection()
    const result = await collection.insertOne(sessionData as any)
    return { ...sessionData, _id: result.insertedId }
  }

  async deleteSession(sessionToken: string): Promise<void> {
    const collection = await this.getSessionsCollection()
    await collection.deleteOne({ sessionToken })
  }


  async findTestcasesByUserGroupedByDocument(userId: string) {
    const collection = await this.getTestcasesCollection();
    // Fetch all testcases for the user
    const testcases = await collection.find({ userId: safeObjectId(userId) }).toArray();
    // Group by documentId
    const grouped: Record<string, { documentId: string, documentName: string, testcases: any[] }> = {};
    for (const tc of testcases) {
      if (!grouped[tc.documentId]) {
        grouped[tc.documentId] = {
          documentId: tc.documentId,
          documentName: tc.documentName,
          testcases: [],
        };
      }
      grouped[tc.documentId].testcases.push(tc);
    }
    return Object.values(grouped);
  }

  async saveGeneratedTestcases({ userId, documentId, documentName, testCases }: { userId: string, documentId: string, documentName: string, testCases: any[] }) {
    const collection = await this.getTestcasesCollection();
    // Remove any existing testcases for this user/document (optional, for idempotency)
    await collection.deleteMany({ userId: safeObjectId(userId), documentId });
    // Insert new testcases
    const now = new Date();
    const docs = testCases.map(tc => ({
      ...tc,
      userId: safeObjectId(userId),
      documentId,
      documentName,
      sentStatus: {
        jira: false,
        trello: false,
        testrail: false
      },
      createdAt: now,
      updatedAt: now,
    }));
    await collection.insertMany(docs);
  }

  async updateTestcaseSentStatus(userId: string, documentId: string, testCaseId: string, integration: 'jira' | 'trello' | 'testrail', status: boolean) {
    const collection = await this.getTestcasesCollection();
    const result = await collection.findOneAndUpdate(
      { 
        userId: safeObjectId(userId), 
        documentId,
        _id: safeObjectId(testCaseId)
      },
      { 
        $set: { 
          [`sentStatus.${integration}`]: status,
          updatedAt: new Date()
        } 
      },
      { returnDocument: 'after' }
    );
    return result;
  }

  async findTestcaseById(testCaseId: string) {
    const collection = await this.getTestcasesCollection();
    return collection.findOne({ _id: safeObjectId(testCaseId) });
  }

  async deleteTestcasesByDocument(userId: string, documentId: string) {
    const collection = await this.getTestcasesCollection();
    await collection.deleteMany({ userId: safeObjectId(userId), documentId });
  }

  // ==================== Webhook Operations ====================

  async createWebhook(webhookData: Omit<Webhook, '_id' | 'createdAt' | 'updatedAt'>): Promise<Webhook> {
    const collection = await this.getWebhooksCollection()
    const now = new Date()
    
    const webhook: Omit<Webhook, '_id'> = {
      ...webhookData,
      createdAt: now,
      updatedAt: now,
    }

    const result = await collection.insertOne(webhook as any)
    return { ...webhook, _id: result.insertedId }
  }

  async findWebhooksByUserId(userId: string): Promise<Webhook[]> {
    const collection = await this.getWebhooksCollection()
    const objectId = toObjectId(userId)
    
    if (!objectId) {
      console.warn('Invalid userId format for webhooks search:', userId)
      return []
    }
    
    return collection.find({ userId: objectId }).toArray()
  }

  async findWebhookByExternalId(webhookId: string): Promise<Webhook | null> {
    const collection = await this.getWebhooksCollection()
    return collection.findOne({ webhookId })
  }

  async findWebhooksByIntegration(userId: string, integrationType: IntegrationType): Promise<Webhook[]> {
    const collection = await this.getWebhooksCollection()
    const objectId = toObjectId(userId)
    
    if (!objectId) {
      return []
    }
    
    return collection.find({ userId: objectId, integrationType }).toArray()
  }

  async findWebhookByProject(userId: string, integrationType: IntegrationType, projectId: string): Promise<Webhook | null> {
    const collection = await this.getWebhooksCollection()
    const objectId = toObjectId(userId)
    
    if (!objectId) {
      return null
    }
    
    return collection.findOne({ userId: objectId, integrationType, projectId })
  }

  async updateWebhook(webhookId: string, updateData: Partial<Webhook>): Promise<Webhook | null> {
    const collection = await this.getWebhooksCollection()
    
    // Remove fields that shouldn't be updated
    const { _id, createdAt, ...dataToUpdate } = updateData as any
    
    const result = await collection.findOneAndUpdate(
      { webhookId },
      { 
        $set: { 
          ...dataToUpdate, 
          updatedAt: new Date() 
        } 
      },
      { returnDocument: 'after' }
    )
    return result || null
  }

  async updateWebhookStatus(webhookId: string, status: WebhookStatus, error?: string): Promise<Webhook | null> {
    const collection = await this.getWebhooksCollection()
    
    const updateData: any = {
      status,
      updatedAt: new Date()
    }
    
    if (error) {
      updateData.lastError = error
      updateData.$inc = { errorCount: 1 }
    }
    
    const result = await collection.findOneAndUpdate(
      { webhookId },
      { $set: updateData },
      { returnDocument: 'after' }
    )
    return result || null
  }

  async updateWebhookLastTriggered(webhookId: string): Promise<void> {
    const collection = await this.getWebhooksCollection()
    await collection.updateOne(
      { webhookId },
      { 
        $set: { 
          lastTriggeredAt: new Date(),
          updatedAt: new Date()
        } 
      }
    )
  }

  async deleteWebhook(webhookId: string): Promise<boolean> {
    const collection = await this.getWebhooksCollection()
    const result = await collection.deleteOne({ webhookId })
    return result.deletedCount > 0
  }

  async deleteWebhooksByUser(userId: string, integrationType?: IntegrationType): Promise<number> {
    const collection = await this.getWebhooksCollection()
    const objectId = toObjectId(userId)
    
    if (!objectId) {
      return 0
    }
    
    const filter: any = { userId: objectId }
    if (integrationType) {
      filter.integrationType = integrationType
    }
    
    const result = await collection.deleteMany(filter)
    return result.deletedCount
  }

  // ==================== Webhook Event Operations ====================

  async createWebhookEvent(eventData: Omit<WebhookEvent, '_id' | 'createdAt'>): Promise<WebhookEvent> {
    const collection = await this.getWebhookEventsCollection()
    const now = new Date()
    
    const event: Omit<WebhookEvent, '_id'> = {
      ...eventData,
      createdAt: now,
    }

    const result = await collection.insertOne(event as any)
    return { ...event, _id: result.insertedId }
  }

  async findUnprocessedWebhookEvents(limit: number = 100): Promise<WebhookEvent[]> {
    const collection = await this.getWebhookEventsCollection()
    return collection
      .find({ processed: false, retryCount: { $lt: 5 } })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray()
  }

  async markWebhookEventProcessed(eventId: string, error?: string): Promise<void> {
    const collection = await this.getWebhookEventsCollection()
    const objectId = safeObjectId(eventId)
    
    if (!objectId) return
    
    const updateData: any = {
      processed: !error,
      processedAt: new Date()
    }
    
    if (error) {
      updateData.error = error
      await collection.updateOne(
        { _id: objectId },
        { 
          $set: updateData,
          $inc: { retryCount: 1 }
        }
      )
    } else {
      await collection.updateOne(
        { _id: objectId },
        { $set: updateData }
      )
    }
  }

  async findRecentWebhookEvents(userId: string, limit: number = 50): Promise<WebhookEvent[]> {
    const collection = await this.getWebhookEventsCollection()
    const objectId = toObjectId(userId)
    
    if (!objectId) {
      return []
    }
    
    return collection
      .find({ userId: objectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()
  }

  async cleanupOldWebhookEvents(daysOld: number = 30): Promise<number> {
    const collection = await this.getWebhookEventsCollection()
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)
    
    const result = await collection.deleteMany({
      processed: true,
      createdAt: { $lt: cutoffDate }
    })
    return result.deletedCount
  }
}

// =====================================================
// Task Dependencies - Cross-project dependency tracking
// =====================================================

export interface TaskDependency {
  _id: ObjectId
  userId: ObjectId
  // Source task (the task that has the dependency)
  sourceProjectId: string
  sourceIntegrationType: IntegrationType
  sourceTaskId: string
  sourceTaskKey?: string
  // Dependency target (can be in same or different project)
  targetProjectId: string
  targetIntegrationType: IntegrationType
  targetTaskId: string
  targetTaskKey?: string
  targetTaskSummary: string
  // Dependency metadata
  dependencyType: 'depends_on' | 'blocked_by'
  status: 'active' | 'resolved'
  resolvedAt?: Date
  resolvedBy?: string
  createdAt: Date
  updatedAt: Date
}

export async function upsertTaskDependency(
  userId: string,
  sourceProjectId: string,
  sourceIntegrationType: IntegrationType,
  sourceTaskId: string,
  sourceTaskKey: string,
  targetProjectId: string,
  targetIntegrationType: IntegrationType,
  targetTaskId: string,
  targetTaskKey: string,
  targetTaskSummary: string,
  dependencyType: 'depends_on' | 'blocked_by'
): Promise<TaskDependency> {
  const collection = await getCollection('task_dependencies')
  const now = new Date()
  const userObjectId = toObjectId(userId)
  
  if (!userObjectId) {
    throw new Error('Invalid user ID')
  }
  
  // Check if this exact dependency already exists
  const existing = await collection.findOne({
    userId: userObjectId,
    sourceProjectId,
    sourceTaskId,
    targetProjectId,
    targetTaskId,
    dependencyType,
    status: 'active',
  })
  
  if (existing) {
    // Update existing dependency
    await collection.updateOne(
      { _id: existing._id },
      { $set: { updatedAt: now } }
    )
    return existing as TaskDependency
  }
  
  // Create new dependency
  const dependency: TaskDependency = {
    _id: new ObjectId(),
    userId: userObjectId,
    sourceProjectId,
    sourceIntegrationType,
    sourceTaskId,
    sourceTaskKey,
    targetProjectId,
    targetIntegrationType,
    targetTaskId,
    targetTaskKey,
    targetTaskSummary,
    dependencyType,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  
  await collection.insertOne(dependency)
  return dependency
}

export async function getTaskDependenciesForProjects(
  userId: string,
  projectIds: string[],
  taskIds?: string[]
): Promise<TaskDependency[]> {
  const collection = await getCollection('task_dependencies')
  const userObjectId = toObjectId(userId)
  
  if (!userObjectId) {
    return []
  }
  
  const query: any = {
    userId: userObjectId,
    status: 'active',
    $or: [
      { sourceProjectId: { $in: projectIds } },
      { targetProjectId: { $in: projectIds } },
    ],
  }
  
  if (taskIds && taskIds.length > 0) {
    query.$or.push(
      { sourceTaskId: { $in: taskIds } },
      { targetTaskId: { $in: taskIds } }
    )
  }
  
  return collection.find(query).toArray() as Promise<TaskDependency[]>
}

export async function resolveDependency(
  userId: string,
  sourceProjectId: string,
  sourceTaskId: string,
  targetProjectId: string,
  targetTaskId: string,
  dependencyType: 'depends_on' | 'blocked_by',
  resolvedBy: string
): Promise<void> {
  const collection = await getCollection('task_dependencies')
  const userObjectId = toObjectId(userId)
  
  if (!userObjectId) return
  
  const now = new Date()
  
  await collection.updateOne(
    {
      userId: userObjectId,
      sourceProjectId,
      sourceTaskId,
      targetProjectId,
      targetTaskId,
      dependencyType,
      status: 'active',
    },
    {
      $set: {
        status: 'resolved',
        resolvedAt: now,
        resolvedBy,
        updatedAt: now,
      },
    }
  )
}

export async function deleteDependency(
  userId: string,
  dependencyId: string
): Promise<void> {
  const collection = await getCollection('task_dependencies')
  const userObjectId = toObjectId(userId)
  const depObjectId = toObjectId(dependencyId)
  
  if (!userObjectId || !depObjectId) return
  
  await collection.deleteOne({
    _id: depObjectId,
    userId: userObjectId,
  })
}

// =====================================================
// Column Mappings - Merge columns across different tools
// =====================================================

export interface ColumnMapping {
  _id: ObjectId
  userId: ObjectId
  mergedColumnName: string
  originalColumns: Array<{
    projectId: string
    integrationType: IntegrationType
    originalColumnName: string
  }>
  displayOrder?: number
  color?: string
  createdAt: Date
  updatedAt: Date
}

export async function upsertColumnMapping(
  userId: string,
  mergedColumnName: string,
  originalColumns: Array<{
    projectId: string
    integrationType: IntegrationType
    originalColumnName: string
  }>,
  displayOrder?: number,
  color?: string
): Promise<ColumnMapping> {
  const collection = await getCollection('column_mappings')
  const now = new Date()
  const userObjectId = toObjectId(userId)
  
  if (!userObjectId) {
    throw new Error('Invalid user ID')
  }
  
  // Check if this merged column already exists for this user
  const existing = await collection.findOne({
    userId: userObjectId,
    mergedColumnName: { $regex: new RegExp(`^${mergedColumnName}$`, 'i') },
  })
  
  if (existing) {
    // Update existing mapping
    await collection.updateOne(
      { _id: existing._id },
      {
        $set: {
          originalColumns,
          displayOrder: displayOrder ?? existing.displayOrder,
          color: color || existing.color,
          updatedAt: now,
        },
      }
    )
    return {
      ...existing,
      originalColumns,
      displayOrder: displayOrder ?? existing.displayOrder,
      color: color || existing.color,
      updatedAt: now,
    } as ColumnMapping
  }
  
  // Create new mapping
  const mapping: ColumnMapping = {
    _id: new ObjectId(),
    userId: userObjectId,
    mergedColumnName,
    originalColumns,
    displayOrder,
    color,
    createdAt: now,
    updatedAt: now,
  }
  
  await collection.insertOne(mapping)
  return mapping
}

export async function getColumnMappings(
  userId: string,
  projectIds?: string[]
): Promise<ColumnMapping[]> {
  const collection = await getCollection('column_mappings')
  const userObjectId = toObjectId(userId)
  
  if (!userObjectId) {
    return []
  }
  
  const query: any = {
    userId: userObjectId,
  }
  
  if (projectIds && projectIds.length > 0) {
    query['originalColumns.projectId'] = { $in: projectIds }
  }
  
  return collection
    .find(query)
    .sort({ displayOrder: 1, mergedColumnName: 1 })
    .toArray() as Promise<ColumnMapping[]>
}

export async function deleteColumnMapping(
  userId: string,
  mappingId: string
): Promise<void> {
  const collection = await getCollection('column_mappings')
  const userObjectId = toObjectId(userId)
  const mapObjectId = toObjectId(mappingId)
  
  if (!userObjectId || !mapObjectId) return
  
  await collection.deleteOne({
    _id: mapObjectId,
    userId: userObjectId,
  })
}

// =====================================================
// Custom Boards - Jira-like custom Kanban boards
// =====================================================

export interface CustomBoard {
  _id: ObjectId
  name: string
  columns: string[]
  createdBy: ObjectId
  createdByName: string
  subscribers: string[] // user IDs who added this to sidebar
  allowedUsers: string[] // user IDs who can view this board (empty = all users)
  createdAt: Date
  updatedAt: Date
}

export interface CustomBoardCard {
  _id: ObjectId
  boardId: ObjectId
  sprintId?: ObjectId | null
  columnName: string
  title: string
  description: string
  assigneeId?: string
  assigneeName?: string
  assigneeEmail?: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  dueDate?: Date
  labels: string[]
  order: number
  storyPoints?: number
  dependencies: Array<{
    cardId: string
    cardTitle?: string
    type: 'depends_on' | 'blocked_by'
  }>
  completedAt?: Date
  createdBy: string
  createdByName?: string
  createdAt: Date
  updatedAt: Date
}

export type SprintStatus = 'planning' | 'active' | 'completed'

export interface Sprint {
  _id: ObjectId
  boardId: ObjectId
  name: string
  goal?: string
  status: SprintStatus
  startDate?: Date
  endDate?: Date
  completedAt?: Date
  createdBy: string
  createdByName?: string
  createdAt: Date
  updatedAt: Date
}

// Custom Board CRUD

export async function createCustomBoard(
  name: string,
  columns: string[],
  userId: string,
  userName: string
): Promise<CustomBoard> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
  const userObjectId = toObjectId(userId)
  if (!userObjectId) throw new Error('Invalid user ID')

  const now = new Date()
  const board: CustomBoard = {
    _id: new ObjectId(),
    name,
    columns,
    createdBy: userObjectId,
    createdByName: userName,
    subscribers: [userId],
    allowedUsers: [], // empty = all users can view
    createdAt: now,
    updatedAt: now,
  }

  await collection.insertOne(board)
  return board
}

export async function getCustomBoards(userId?: string): Promise<CustomBoard[]> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
  // If userId is provided, filter to boards where:
  //  - allowedUsers is empty (accessible to all), OR
  //  - user is in allowedUsers, OR
  //  - user is the creator
  if (userId) {
    const userObjectId = toObjectId(userId)
    return collection
      .find({
        $or: [
          { allowedUsers: { $exists: false } },
          { allowedUsers: { $size: 0 } },
          { allowedUsers: userId },
          ...(userObjectId ? [{ createdBy: userObjectId }] : []),
        ],
      })
      .sort({ createdAt: -1 })
      .toArray() as Promise<CustomBoard[]>
  }
  return collection
    .find({})
    .sort({ createdAt: -1 })
    .toArray() as Promise<CustomBoard[]>
}

export async function getCustomBoardById(boardId: string): Promise<CustomBoard | null> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
  const objectId = toObjectId(boardId)
  if (!objectId) return null
  return collection.findOne({ _id: objectId }) as Promise<CustomBoard | null>
}

export async function getCustomBoardsForUser(userId: string): Promise<CustomBoard[]> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
  const userObjectId = toObjectId(userId)
  
  // Return boards where user:
  // 1. Is subscribed (manually added to sidebar), OR
  // 2. Has access via allowedUsers (manager gave permission), OR
  // 3. Is the creator, OR
  // 4. Board has no access restrictions (allowedUsers is empty)
  return collection
    .find({
      $or: [
        { subscribers: userId },
        { allowedUsers: userId },
        ...(userObjectId ? [{ createdBy: userObjectId }] : []),
        { allowedUsers: { $exists: false } },
        { allowedUsers: { $size: 0 } },
      ],
    })
    .sort({ createdAt: -1 })
    .toArray() as Promise<CustomBoard[]>
}

export async function deleteCustomBoard(boardId: string, userId: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
  const objectId = toObjectId(boardId)
  const userObjectId = toObjectId(userId)
  if (!objectId || !userObjectId) throw new Error('Invalid ID')

  // Only creator can delete
  const board = await collection.findOne({ _id: objectId, createdBy: userObjectId })
  if (!board) throw new Error('Board not found or you do not have permission to delete it')

  await collection.deleteOne({ _id: objectId })
  // Also delete all cards for this board
  const cardsCollection = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
  await cardsCollection.deleteMany({ boardId: objectId })
}

export async function addColumnToBoard(boardId: string, columnName: string): Promise<CustomBoard | null> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
  const objectId = toObjectId(boardId)
  if (!objectId) return null

  await collection.updateOne(
    { _id: objectId },
    { $push: { columns: columnName } as any, $set: { updatedAt: new Date() } }
  )
  return collection.findOne({ _id: objectId }) as Promise<CustomBoard | null>
}

export async function reorderBoardColumns(
  boardId: string,
  columns: string[]
): Promise<CustomBoard | null> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
  const objectId = toObjectId(boardId)
  if (!objectId) throw new Error('Invalid board ID')

  await collection.updateOne(
    { _id: objectId },
    { $set: { columns, updatedAt: new Date() } }
  )
  return collection.findOne({ _id: objectId }) as Promise<CustomBoard | null>
}

export async function removeColumnFromBoard(boardId: string, columnName: string): Promise<CustomBoard | null> {
  const boardCollection = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
  const cardsCollection = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
  const objectId = toObjectId(boardId)
  if (!objectId) throw new Error('Invalid board ID')

  const board = await boardCollection.findOne({ _id: objectId }) as CustomBoard | null
  if (!board || !board.columns || board.columns.length <= 1) {
    throw new Error('Cannot remove the only column or board not found')
  }
  const newColumns = board.columns.filter((c) => c !== columnName)
  if (newColumns.length === board.columns.length) {
    throw new Error('Column not found')
  }
  const fallbackColumn = newColumns[0]
  await boardCollection.updateOne(
    { _id: objectId },
    { $set: { columns: newColumns, updatedAt: new Date() } }
  )
  await cardsCollection.updateMany(
    { boardId: objectId, columnName },
    { $set: { columnName: fallbackColumn, updatedAt: new Date() } }
  )
  return boardCollection.findOne({ _id: objectId }) as Promise<CustomBoard | null>
}

export async function subscribeToBoard(boardId: string, userId: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
  const objectId = toObjectId(boardId)
  if (!objectId) throw new Error('Invalid board ID')

  await collection.updateOne(
    { _id: objectId },
    { $addToSet: { subscribers: userId } as any }
  )
}

export async function unsubscribeFromBoard(boardId: string, userId: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
  const objectId = toObjectId(boardId)
  if (!objectId) throw new Error('Invalid board ID')

  await collection.updateOne(
    { _id: objectId },
    { $pull: { subscribers: userId } as any }
  )
}

export async function updateBoardAccessControl(
  boardId: string,
  allowedUsers: string[]
): Promise<CustomBoard | null> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
  const objectId = toObjectId(boardId)
  if (!objectId) throw new Error('Invalid board ID')

  await collection.updateOne(
    { _id: objectId },
    { $set: { allowedUsers, updatedAt: new Date() } }
  )
  return collection.findOne({ _id: objectId }) as Promise<CustomBoard | null>
}

// Custom Board Cards CRUD

export async function createCustomBoardCard(
  boardId: string,
  columnName: string,
  title: string,
  description: string,
  createdBy: string,
  createdByName: string,
  assigneeId?: string,
  assigneeName?: string,
  assigneeEmail?: string,
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM',
  dueDate?: Date,
  labels: string[] = [],
  sprintId?: string,
  storyPoints?: number
): Promise<CustomBoardCard> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
  const boardObjectId = toObjectId(boardId)
  if (!boardObjectId) throw new Error('Invalid board ID')

  const sprintObjectId = sprintId ? toObjectId(sprintId) : null

  // Get the next order
  const maxOrderCard = await collection
    .find({ boardId: boardObjectId, columnName })
    .sort({ order: -1 })
    .limit(1)
    .toArray()
  const order = maxOrderCard.length > 0 ? ((maxOrderCard[0] as any).order || 0) + 1 : 0

  const now = new Date()
  const card: CustomBoardCard = {
    _id: new ObjectId(),
    boardId: boardObjectId,
    sprintId: sprintObjectId,
    columnName,
    title,
    description,
    assigneeId,
    assigneeName,
    assigneeEmail,
    priority,
    dueDate,
    labels,
    order,
    dependencies: [],
    storyPoints,
    createdBy,
    createdByName,
    createdAt: now,
    updatedAt: now,
  }

  await collection.insertOne(card)
  return card
}

export async function getCustomBoardCards(boardId: string): Promise<CustomBoardCard[]> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
  const boardObjectId = toObjectId(boardId)
  if (!boardObjectId) return []

  return collection
    .find({ boardId: boardObjectId })
    .sort({ order: 1, createdAt: 1 })
    .toArray() as Promise<CustomBoardCard[]>
}

export async function updateCustomBoardCard(
  cardId: string,
  updates: Partial<Pick<CustomBoardCard, 'title' | 'description' | 'assigneeId' | 'assigneeName' | 'assigneeEmail' | 'priority' | 'dueDate' | 'labels' | 'columnName' | 'order' | 'dependencies' | 'sprintId' | 'storyPoints'>>
): Promise<CustomBoardCard | null> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
  const objectId = toObjectId(cardId)
  if (!objectId) return null

  await collection.updateOne(
    { _id: objectId },
    { $set: { ...updates, updatedAt: new Date() } }
  )
  return collection.findOne({ _id: objectId }) as Promise<CustomBoardCard | null>
}

export async function deleteCustomBoardCard(cardId: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
  const objectId = toObjectId(cardId)
  if (!objectId) throw new Error('Invalid card ID')
  await collection.deleteOne({ _id: objectId })
}

export async function moveCustomBoardCard(
  cardId: string,
  targetColumn: string,
  targetOrder?: number
): Promise<CustomBoardCard | null> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
  const objectId = toObjectId(cardId)
  if (!objectId) return null

  const updateData: any = { columnName: targetColumn, updatedAt: new Date() }
  if (targetOrder !== undefined) {
    updateData.order = targetOrder
  }

  await collection.updateOne({ _id: objectId }, { $set: updateData })
  return collection.findOne({ _id: objectId }) as Promise<CustomBoardCard | null>
}

export async function addCardDependency(
  cardId: string,
  targetCardId: string,
  targetCardTitle: string,
  type: 'depends_on' | 'blocked_by'
): Promise<void> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
  const objectId = toObjectId(cardId)
  if (!objectId) throw new Error('Invalid card ID')

  await collection.updateOne(
    { _id: objectId },
    {
      $push: { dependencies: { cardId: targetCardId, cardTitle: targetCardTitle, type } } as any,
      $set: { updatedAt: new Date() },
    }
  )
}

export async function removeCardDependency(
  cardId: string,
  targetCardId: string,
  type: 'depends_on' | 'blocked_by'
): Promise<void> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
  const objectId = toObjectId(cardId)
  if (!objectId) throw new Error('Invalid card ID')

  await collection.updateOne(
    { _id: objectId },
    {
      $pull: { dependencies: { cardId: targetCardId, type } } as any,
      $set: { updatedAt: new Date() },
    }
  )
}

// =====================================================
// Sprint CRUD
// =====================================================

export async function createSprint(
  boardId: string,
  name: string,
  goal: string,
  createdBy: string,
  createdByName: string,
  startDate?: Date,
  endDate?: Date
): Promise<Sprint> {
  const collection = await getCollection(COLLECTIONS.SPRINTS)
  const boardObjectId = toObjectId(boardId)
  if (!boardObjectId) throw new Error('Invalid board ID')

  const now = new Date()
  const sprint: Sprint = {
    _id: new ObjectId(),
    boardId: boardObjectId,
    name,
    goal: goal || undefined,
    status: 'planning',
    startDate,
    endDate,
    createdBy,
    createdByName,
    createdAt: now,
    updatedAt: now,
  }

  await collection.insertOne(sprint)
  return sprint
}

export async function getSprintsByBoard(boardId: string): Promise<Sprint[]> {
  const collection = await getCollection(COLLECTIONS.SPRINTS)
  const boardObjectId = toObjectId(boardId)
  if (!boardObjectId) return []

  return collection
    .find({ boardId: boardObjectId })
    .sort({ createdAt: -1 })
    .toArray() as Promise<Sprint[]>
}

export async function getSprintById(sprintId: string): Promise<Sprint | null> {
  const collection = await getCollection(COLLECTIONS.SPRINTS)
  const objectId = toObjectId(sprintId)
  if (!objectId) return null
  return collection.findOne({ _id: objectId }) as Promise<Sprint | null>
}

export async function getActiveSprintForBoard(boardId: string): Promise<Sprint | null> {
  const collection = await getCollection(COLLECTIONS.SPRINTS)
  const boardObjectId = toObjectId(boardId)
  if (!boardObjectId) return null

  return collection.findOne({
    boardId: boardObjectId,
    status: 'active',
  }) as Promise<Sprint | null>
}

export async function startSprint(
  sprintId: string,
  startDate: Date,
  endDate: Date
): Promise<Sprint | null> {
  const collection = await getCollection(COLLECTIONS.SPRINTS)
  const objectId = toObjectId(sprintId)
  if (!objectId) throw new Error('Invalid sprint ID')

  const sprint = await collection.findOne({ _id: objectId }) as Sprint | null
  if (!sprint) throw new Error('Sprint not found')
  if (sprint.status !== 'planning') throw new Error('Sprint is not in planning state')

  // Ensure no other active sprint exists for this board
  const activeSprint = await collection.findOne({
    boardId: sprint.boardId,
    status: 'active',
  })
  if (activeSprint) throw new Error('There is already an active sprint for this board. Complete it first.')

  await collection.updateOne(
    { _id: objectId },
    { $set: { status: 'active', startDate, endDate, updatedAt: new Date() } }
  )
  return collection.findOne({ _id: objectId }) as Promise<Sprint | null>
}

export async function completeSprint(
  sprintId: string,
  moveIncompleteToBacklog: boolean = true,
  moveToSprintId?: string
): Promise<Sprint | null> {
  const collection = await getCollection(COLLECTIONS.SPRINTS)
  const cardsCollection = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
  const objectId = toObjectId(sprintId)
  if (!objectId) throw new Error('Invalid sprint ID')

  const sprint = await collection.findOne({ _id: objectId }) as Sprint | null
  if (!sprint) throw new Error('Sprint not found')
  if (sprint.status !== 'active') throw new Error('Sprint is not active')

  // Get the board to find "done" columns (last column is typically done)
  const boardCollection = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
  const board = await boardCollection.findOne({ _id: sprint.boardId }) as CustomBoard | null

  // Move incomplete cards (not in last column) to backlog or next sprint
  if (board && board.columns.length > 0) {
    const doneColumn = board.columns[board.columns.length - 1]
    const incompleteFilter: any = {
      boardId: sprint.boardId,
      sprintId: objectId,
      columnName: { $ne: doneColumn },
    }

    if (moveIncompleteToBacklog) {
      // Move to backlog (sprintId = null) and reset column to first column
      await cardsCollection.updateMany(incompleteFilter, {
        $set: {
          sprintId: moveToSprintId ? toObjectId(moveToSprintId) : null,
          columnName: board.columns[0],
          updatedAt: new Date(),
        },
      })
    }
  }

  const now = new Date()
  await collection.updateOne(
    { _id: objectId },
    { $set: { status: 'completed', completedAt: now, updatedAt: now } }
  )
  return collection.findOne({ _id: objectId }) as Promise<Sprint | null>
}

export async function updateSprint(
  sprintId: string,
  updates: Partial<Pick<Sprint, 'name' | 'goal' | 'startDate' | 'endDate'>>
): Promise<Sprint | null> {
  const collection = await getCollection(COLLECTIONS.SPRINTS)
  const objectId = toObjectId(sprintId)
  if (!objectId) return null

  await collection.updateOne(
    { _id: objectId },
    { $set: { ...updates, updatedAt: new Date() } }
  )
  return collection.findOne({ _id: objectId }) as Promise<Sprint | null>
}

export async function deleteSprint(sprintId: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.SPRINTS)
  const cardsCollection = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
  const objectId = toObjectId(sprintId)
  if (!objectId) throw new Error('Invalid sprint ID')

  // Move all cards in this sprint to backlog
  await cardsCollection.updateMany(
    { sprintId: objectId },
    { $set: { sprintId: null, updatedAt: new Date() } }
  )

  await collection.deleteOne({ _id: objectId })
}

// Get cards for a specific sprint (or backlog if sprintId is null)
export async function getCardsBySprint(boardId: string, sprintId: string | null): Promise<CustomBoardCard[]> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
  const boardObjectId = toObjectId(boardId)
  if (!boardObjectId) return []

  const filter: any = { boardId: boardObjectId }
  if (sprintId) {
    const sprintObjectId = toObjectId(sprintId)
    if (!sprintObjectId) return []
    filter.sprintId = sprintObjectId
  } else {
    filter.$or = [{ sprintId: null }, { sprintId: { $exists: false } }]
  }

  return collection
    .find(filter)
    .sort({ order: 1, createdAt: 1 })
    .toArray() as Promise<CustomBoardCard[]>
}

// Move cards to a sprint (bulk)
export async function moveCardsToSprint(
  cardIds: string[],
  sprintId: string | null,
  columnName?: string
): Promise<void> {
  const collection = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
  const objectIds = cardIds.map(id => toObjectId(id)).filter((id): id is ObjectId => id !== null)
  if (objectIds.length === 0) return

  const updateData: any = {
    sprintId: sprintId ? toObjectId(sprintId) : null,
    updatedAt: new Date(),
  }
  if (columnName) {
    updateData.columnName = columnName
  }

  await collection.updateMany(
    { _id: { $in: objectIds } },
    { $set: updateData }
  )
}

// =====================================================
// Card Activity / History Tracking
// =====================================================

export type CardActivityType =
  | 'created'
  | 'moved'
  | 'moved_backward'
  | 'assigned'
  | 'unassigned'
  | 'priority_changed'
  | 'title_changed'
  | 'description_changed'
  | 'due_date_changed'
  | 'story_points_changed'
  | 'labels_changed'
  | 'dependency_added'
  | 'dependency_removed'
  | 'sprint_changed'
  | 'deleted'

export interface CardActivity {
  _id: ObjectId
  cardId: ObjectId
  boardId: ObjectId
  type: CardActivityType
  userId: string
  userName: string
  fromValue?: string
  toValue?: string
  metadata?: Record<string, any>
  isBackwardMove?: boolean
  createdAt: Date
}

export async function createCardActivity(
  cardId: string,
  boardId: string,
  type: CardActivityType,
  userId: string,
  userName: string,
  fromValue?: string,
  toValue?: string,
  metadata?: Record<string, any>,
  isBackwardMove?: boolean
): Promise<CardActivity> {
  const collection = await getCollection(COLLECTIONS.CARD_ACTIVITIES)
  const cardObjectId = toObjectId(cardId)
  const boardObjectId = toObjectId(boardId)
  if (!cardObjectId || !boardObjectId) throw new Error('Invalid ID')

  const activity: CardActivity = {
    _id: new ObjectId(),
    cardId: cardObjectId,
    boardId: boardObjectId,
    type,
    userId,
    userName,
    fromValue,
    toValue,
    metadata,
    isBackwardMove: isBackwardMove || false,
    createdAt: new Date(),
  }

  await collection.insertOne(activity)
  return activity
}

export async function getCardActivities(
  cardId: string,
  limit: number = 50
): Promise<CardActivity[]> {
  const collection = await getCollection(COLLECTIONS.CARD_ACTIVITIES)
  const objectId = toObjectId(cardId)
  if (!objectId) return []

  return collection
    .find({ cardId: objectId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray() as Promise<CardActivity[]>
}

export async function getBoardActivities(
  boardId: string,
  limit: number = 100
): Promise<CardActivity[]> {
  const collection = await getCollection(COLLECTIONS.CARD_ACTIVITIES)
  const objectId = toObjectId(boardId)
  if (!objectId) return []

  return collection
    .find({ boardId: objectId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray() as Promise<CardActivity[]>
}

// =====================================================
// Sprint Performance Types & Functions
// =====================================================

export type IssueCompletionCategory =
  | 'very_early'
  | 'early'
  | 'on_time'
  | 'late'
  | 'not_completed'

export interface IssueEvaluation {
  cardId: string
  cardTitle: string
  assigneeId: string
  assigneeName: string
  dueDate?: Date
  completedAt?: Date
  sprintEndDate?: Date
  category: IssueCompletionCategory
  score: number
  daysDifference: number | null
}

export interface SprintPerformanceRecord {
  _id: ObjectId
  boardId: ObjectId
  sprintId: ObjectId
  sprintName: string
  userId: string
  userName: string
  userEmail: string
  totalIssues: number
  completedIssues: number
  veryEarlyCount: number
  earlyCount: number
  onTimeCount: number
  lateCount: number
  notCompletedCount: number
  rawScore: number
  normalizedPercentage: number
  issueEvaluations: IssueEvaluation[]
  calculatedAt: Date
  isFinal: boolean
}

export interface PerformanceConfig {
  _id: ObjectId
  boardId: ObjectId
  veryEarlyDaysThreshold: number
  earlyDaysThreshold: number
  lateToleranceDays: number
  scoreWeights: {
    very_early: number
    early: number
    on_time: number
    late: number
    not_completed: number
  }
  teamAggregation: 'average' | 'weighted_average'
  ownershipRule: 'completer' | 'longest_owner' | 'split'
  updatedAt: Date
}

export async function getPerformanceConfig(boardId: string): Promise<PerformanceConfig | null> {
  const collection = await getCollection(COLLECTIONS.PERFORMANCE_CONFIG)
  const objectId = toObjectId(boardId)
  if (!objectId) return null
  return collection.findOne({ boardId: objectId }) as Promise<PerformanceConfig | null>
}

export async function upsertPerformanceConfig(
  boardId: string,
  config: Partial<Omit<PerformanceConfig, '_id' | 'boardId'>>
): Promise<PerformanceConfig> {
  const collection = await getCollection(COLLECTIONS.PERFORMANCE_CONFIG)
  const objectId = toObjectId(boardId)
  if (!objectId) throw new Error('Invalid board ID')

  const defaults: Omit<PerformanceConfig, '_id'> = {
    boardId: objectId,
    veryEarlyDaysThreshold: 3,
    earlyDaysThreshold: 1,
    lateToleranceDays: 0,
    scoreWeights: {
      very_early: 100,
      early: 85,
      on_time: 70,
      late: 35,
      not_completed: 0,
    },
    teamAggregation: 'average',
    ownershipRule: 'completer',
    updatedAt: new Date(),
  }

  const result = await collection.findOneAndUpdate(
    { boardId: objectId },
    {
      $set: { ...defaults, ...config, boardId: objectId, updatedAt: new Date() },
      $setOnInsert: { _id: new ObjectId() },
    },
    { upsert: true, returnDocument: 'after' }
  )
  return result as unknown as PerformanceConfig
}

export async function saveSprintPerformance(
  record: Omit<SprintPerformanceRecord, '_id'>
): Promise<SprintPerformanceRecord> {
  const collection = await getCollection(COLLECTIONS.SPRINT_PERFORMANCE)

  const existing = await collection.findOne({
    boardId: record.boardId,
    sprintId: record.sprintId,
    userId: record.userId,
  })

  if (existing) {
    await collection.updateOne(
      { _id: existing._id },
      { $set: { ...record } }
    )
    return { ...record, _id: existing._id } as SprintPerformanceRecord
  }

  const doc: SprintPerformanceRecord = {
    _id: new ObjectId(),
    ...record,
  }
  await collection.insertOne(doc)
  return doc
}

export async function getSprintPerformance(
  boardId: string,
  sprintId: string,
  userId?: string
): Promise<SprintPerformanceRecord[]> {
  const collection = await getCollection(COLLECTIONS.SPRINT_PERFORMANCE)
  const boardOid = toObjectId(boardId)
  const sprintOid = toObjectId(sprintId)
  if (!boardOid || !sprintOid) return []

  const filter: any = { boardId: boardOid, sprintId: sprintOid }
  if (userId) filter.userId = userId

  return collection
    .find(filter)
    .sort({ normalizedPercentage: -1 })
    .toArray() as Promise<SprintPerformanceRecord[]>
}

export async function getUserPerformanceHistory(
  boardId: string,
  userId: string
): Promise<SprintPerformanceRecord[]> {
  const collection = await getCollection(COLLECTIONS.SPRINT_PERFORMANCE)
  const boardOid = toObjectId(boardId)
  if (!boardOid) return []

  return collection
    .find({ boardId: boardOid, userId })
    .sort({ calculatedAt: -1 })
    .toArray() as Promise<SprintPerformanceRecord[]>
}

export async function getAllPerformanceForBoard(
  boardId: string
): Promise<SprintPerformanceRecord[]> {
  const collection = await getCollection(COLLECTIONS.SPRINT_PERFORMANCE)
  const boardOid = toObjectId(boardId)
  if (!boardOid) return []

  return collection
    .find({ boardId: boardOid })
    .sort({ calculatedAt: -1 })
    .toArray() as Promise<SprintPerformanceRecord[]>
}

export async function getPerformanceForBoards(
  boardIds: string[]
): Promise<SprintPerformanceRecord[]> {
  if (!boardIds?.length) return []
  const collection = await getCollection(COLLECTIONS.SPRINT_PERFORMANCE)
  const objectIds = boardIds.map(id => toObjectId(id)).filter((id): id is ObjectId => id != null)
  if (objectIds.length === 0) return []

  return collection
    .find({ boardId: { $in: objectIds } })
    .sort({ calculatedAt: -1 })
    .toArray() as Promise<SprintPerformanceRecord[]>
}

// Export singleton instance
export const db = new DatabaseService() 