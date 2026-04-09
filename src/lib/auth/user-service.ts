import bcrypt from 'bcryptjs'
import { db } from '../db/database'
import type { UserRole, SubscriptionType, SubscriptionStatus, IntegrationType, AuditAction } from '../db/database'

const AuditActionEnum = {
  REGISTER: 'REGISTER' as AuditAction,
  UPDATE_PROFILE: 'UPDATE_PROFILE' as AuditAction,
  CHANGE_SUBSCRIPTION: 'CHANGE_SUBSCRIPTION' as AuditAction,
  CONNECT_INTEGRATION: 'CONNECT_INTEGRATION' as AuditAction,
  DISCONNECT_INTEGRATION: 'DISCONNECT_INTEGRATION' as AuditAction,
  ADMIN_ACTION: 'ADMIN_ACTION' as AuditAction
} as const

type AuditActionType = typeof AuditActionEnum[keyof typeof AuditActionEnum]

interface CreateUserData {
  email: string
  name?: string
  password?: string
  role?: UserRole
  image?: string
}

interface UpdateUserData {
  name?: string
  email?: string
  image?: string
  role?: UserRole
  isActive?: boolean
}

interface CreateIntegrationData {
  type: IntegrationType
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  serverUrl?: string
  consumerKey?: string
  metadata?: Record<string, any>
}

interface UpdateSubscriptionData {
  type?: SubscriptionType
  status?: SubscriptionStatus
  currentPeriodStart?: Date
  currentPeriodEnd?: Date
  cancelAtPeriodEnd?: boolean
}

// Default allowedPages for each role
const getDefaultAllowedPages = (role: UserRole): string[] => {
  switch (role) {
    case 'ADMIN':
      return ['dashboard', 'project-overview', 'velocity', 'sentiment-analysis', 'integrations', 'testcases', 'performance', 'settings', 'admin']
    case 'MANAGER':
      return ['dashboard', 'project-overview', 'velocity', 'sentiment-analysis', 'integrations', 'testcases', 'performance', 'settings']
    case 'DEVELOPER':
      return ['dashboard', 'velocity', 'sentiment-analysis', 'integrations', 'performance', 'settings']
    case 'TESTER':
      return ['dashboard', 'velocity', 'sentiment-analysis', 'integrations', 'testcases', 'performance', 'settings']
    case 'PREMIUM':
      return ['dashboard', 'project-overview', 'velocity', 'sentiment-analysis', 'integrations', 'testcases', 'performance', 'settings']
    case 'USER':
    default:
      return ['dashboard', 'velocity', 'sentiment-analysis', 'integrations', 'performance', 'settings']
  }
}

export class UserService {
  /**
   * Create a new user with optional subscription
   */
  async createUser(userData: CreateUserData, ipAddress?: string, userAgent?: string) {
    try {
      // Hash password if provided
      let hashedPassword: string | undefined
      if (userData.password) {
        hashedPassword = await bcrypt.hash(userData.password, 12)
      }

      // Get default allowedPages for the role
      const defaultAllowedPages = getDefaultAllowedPages(userData.role || 'USER')

      // Create user (unverified by default)
      const user = await db.createUser({
        email: userData.email,
        name: userData.name,
        password: hashedPassword,
        role: userData.role || 'USER',
        image: userData.image,
        isActive: true,
        isVerified: false,
        allowedPages: defaultAllowedPages,
      })

      // Create subscription
      const subscription = await db.createSubscription({
        userId: user._id,
        type: 'FREE',
        status: 'ACTIVE',
      })

      // Log user registration
      await this.logAuditEvent(user._id.toString(), AuditActionEnum.REGISTER, 'user:created', {
        email: userData.email,
        role: userData.role || 'USER',
        hasPassword: !!userData.password,
        allowedPages: defaultAllowedPages,
      }, ipAddress, userAgent)

      return { ...user, subscription }
    } catch (error) {
      console.error('Error creating user:', error)
      throw new Error('Failed to create user')
    }
  }

  /**
   * Get user by ID with related data
   */
  async getUserById(userId: string, includeRelations = false) {
    try {
      const user = await db.findUserWithSubscription(userId)
      
      if (!user) return null

      if (includeRelations) {
        const [integrations, projects, auditLogs] = await Promise.all([
          db.findIntegrationsByUserId(userId),
          db.findProjectsByUserId(userId),
          db.findRecentAuditLogsByUserId(userId, 10)
        ])
        
        return { ...user, integrations, projects, auditLogs }
      }

      return user
    } catch (error) {
      console.error('Error fetching user:', error)
      throw new Error('Failed to fetch user')
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string) {
    try {
      const user = await db.findUserByEmail(email)
      
      if (!user) return null

      const subscription = await db.findSubscriptionByUserId(user._id.toString())
      return { ...user, subscription }
    } catch (error) {
      console.error('Error fetching user by email:', error)
      throw new Error('Failed to fetch user')
    }
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, updateData: UpdateUserData, adminUserId?: string, ipAddress?: string, userAgent?: string) {
    try {
      const user = await db.updateUser(userId, updateData)
      
      if (!user) throw new Error('User not found')

      const subscription = await db.findSubscriptionByUserId(userId)
      const result = { ...user, subscription }

      // Log profile update
      await this.logAuditEvent(adminUserId || userId, AuditActionEnum.UPDATE_PROFILE, `user:${userId}`, {
        updatedFields: Object.keys(updateData),
        isAdminUpdate: !!adminUserId,
      }, ipAddress, userAgent)

      return result
    } catch (error) {
      console.error('Error updating user:', error)
      throw new Error('Failed to update user')
    }
  }

  /**
   * Update user subscription
   */
  async updateSubscription(userId: string, subscriptionData: UpdateSubscriptionData, adminUserId?: string, ipAddress?: string, userAgent?: string) {
    try {
      const subscription = await db.upsertSubscription(userId, subscriptionData)

      // Log subscription change
      await this.logAuditEvent(adminUserId || userId, AuditActionEnum.CHANGE_SUBSCRIPTION, `subscription:${subscription._id.toString()}`, {
        newType: subscriptionData.type,
        newStatus: subscriptionData.status,
        isAdminUpdate: !!adminUserId,
      }, ipAddress, userAgent)

      return subscription
    } catch (error) {
      console.error('Error updating subscription:', error)
      throw new Error('Failed to update subscription')
    }
  }

  /**
   * Create or update user integration
   */
  async createIntegration(userId: string, integrationData: CreateIntegrationData, ipAddress?: string, userAgent?: string) {
    try {
      const integration = await db.upsertIntegration(userId, integrationData.type, {
        status: 'CONNECTED',
        accessToken: integrationData.accessToken,
        refreshToken: integrationData.refreshToken,
        expiresAt: integrationData.expiresAt,
        serverUrl: integrationData.serverUrl,
        consumerKey: integrationData.consumerKey,
        metadata: integrationData.metadata,
      })

      // Log integration connection
      await this.logAuditEvent(userId, AuditActionEnum.CONNECT_INTEGRATION, `integration:${integration._id.toString()}`, {
        type: integrationData.type,
        serverUrl: integrationData.serverUrl,
      }, ipAddress, userAgent)

      return integration
    } catch (error) {
      console.error('Error creating integration:', error)
      throw new Error('Failed to create integration')
    }
  }

  /**
   * Get user integrations
   */
  async getUserIntegrations(userId: string) {
    try {
      const integrations = await db.findIntegrationsByUserId(userId)
      return integrations
    } catch (error) {
      console.error('Error fetching user integrations:', error)
      throw new Error('Failed to fetch integrations')
    }
  }

  /**
   * Log audit event
   */
  private async logAuditEvent(
    userId: string,
    action: AuditActionType,
    resource?: string,
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ) {
    try {
      await db.createAuditLog({
        userId: userId ? new (await import('mongodb')).ObjectId(userId) : undefined,
        action,
        resource,
        details,
        ipAddress,
        userAgent,
      })
    } catch (error) {
      console.error('Error logging audit event:', error)
      // Don't throw error for audit logging failures
    }
  }
}

export const userService = new UserService() 