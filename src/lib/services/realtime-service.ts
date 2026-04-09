/**
 * Real-time Service
 * Handles broadcasting updates to connected clients using Server-Sent Events (SSE)
 * and provides a simple in-memory event queue for webhook updates
 */

import type { WebhookBroadcastMessage } from '@/types/webhooks'

// In-memory store for pending updates per user
// In production, use Redis or similar for multi-instance support
const pendingUpdates: Map<string, WebhookBroadcastMessage[]> = new Map()
const subscribers: Map<string, Set<(message: WebhookBroadcastMessage) => void>> = new Map()

// Maximum number of pending updates to keep per user
const MAX_PENDING_UPDATES = 100

// How long to keep updates before they expire (5 minutes)
const UPDATE_EXPIRY_MS = 5 * 60 * 1000

export class RealtimeService {
  /**
   * Broadcast an update to all subscribers for a user
   */
  broadcastUpdate(message: WebhookBroadcastMessage): void {
    const { userId, integrationType, eventType, projectId, data } = message
    
    console.log('📡 REALTIME: ========== BROADCASTING UPDATE ==========')
    console.log(`   Type: ${message.type}`)
    console.log(`   Integration: ${integrationType}`)
    console.log(`   Event: ${eventType}`)
    console.log(`   Project: ${projectId || 'N/A'}`)
    if (data?.issueKey) {
      console.log(`   Issue: ${data.issueKey}`)
    }
    if (data?.issueSummary) {
      console.log(`   Summary: ${data.issueSummary}`)
    }
    if (data?.status) {
      console.log(`   Status: ${data.status}`)
    }
    console.log(`   User ID: ${userId}`)
    console.log(`   Timestamp: ${message.timestamp.toISOString()}`)

    // Add to pending updates
    this.addPendingUpdate(userId, message)

    // Notify subscribers
    const userSubscribers = subscribers.get(userId)
    const totalSubscribers = this.getSubscriberCount(userId)
    const totalUsers = subscribers.size
    
    console.log(`📡 REALTIME: Subscriber status - User: ${userId}, User subscribers: ${userSubscribers?.size || 0}, Total users: ${totalUsers}`)
    
    // Log all users with subscribers for debugging
    if (userSubscribers?.size === 0 || !userSubscribers) {
      console.log(`📡 REALTIME: 🔍 Debugging - All users with subscribers:`)
      subscribers.forEach((subs, uid) => {
        console.log(`📡 REALTIME:    User ${uid}: ${subs.size} subscriber(s)`)
      })
    }
    
    if (userSubscribers && userSubscribers.size > 0) {
      console.log(`📡 REALTIME: ✅ Notifying ${userSubscribers.size} active subscriber(s)`)
      userSubscribers.forEach((callback, index) => {
        try {
          console.log(`📡 REALTIME: Calling subscriber ${index + 1}/${userSubscribers.size}`)
          callback(message)
          console.log(`📡 REALTIME: ✅ Subscriber ${index + 1} notified successfully`)
        } catch (error) {
          console.error(`📡 REALTIME: ❌ Error notifying subscriber ${index + 1}:`, error)
        }
      })
      console.log(`✅ REALTIME: Update delivered to ${userSubscribers.size} subscriber(s)`)
    } else {
      console.log(`⚠️ REALTIME: No active subscribers for user ${userId}`)
      console.log(`   Total users with subscribers: ${totalUsers}`)
      console.log(`   Update queued for later delivery`)
    }
    console.log('📡 REALTIME: =========================================')
  }

  /**
   * Add a pending update for a user
   */
  private addPendingUpdate(userId: string, message: WebhookBroadcastMessage): void {
    let updates = pendingUpdates.get(userId)
    
    if (!updates) {
      updates = []
      pendingUpdates.set(userId, updates)
    }

    // Add the new update
    updates.push({
      ...message,
      timestamp: new Date(),
    })

    // Trim old updates
    if (updates.length > MAX_PENDING_UPDATES) {
      updates.splice(0, updates.length - MAX_PENDING_UPDATES)
    }

    // Clean up expired updates
    const expiryTime = Date.now() - UPDATE_EXPIRY_MS
    pendingUpdates.set(
      userId,
      updates.filter(u => u.timestamp.getTime() > expiryTime)
    )
  }

  /**
   * Get pending updates for a user
   */
  getPendingUpdates(userId: string, since?: Date): WebhookBroadcastMessage[] {
    const updates = pendingUpdates.get(userId) || []
    
    if (since) {
      return updates.filter(u => u.timestamp > since)
    }
    
    return [...updates]
  }

  /**
   * Clear pending updates for a user
   */
  clearPendingUpdates(userId: string): void {
    pendingUpdates.delete(userId)
  }

  /**
   * Clear old pending updates that occurred before a certain date
   * This prevents new users from seeing notifications from before their account was created
   */
  clearOldPendingUpdates(userId: string, beforeDate: Date): void {
    const updates = pendingUpdates.get(userId)
    if (!updates) return
    
    // Filter out updates that occurred before the specified date
    const filteredUpdates = updates.filter(u => u.timestamp >= beforeDate)
    
    if (filteredUpdates.length === 0) {
      // If no updates remain, remove the user's entry entirely
      pendingUpdates.delete(userId)
    } else {
      // Otherwise, update with filtered list
      pendingUpdates.set(userId, filteredUpdates)
    }
    
    console.log(`📡 REALTIME: Cleared old pending updates for user ${userId} (before ${beforeDate.toISOString()})`)
  }

  /**
   * Subscribe to updates for a user
   */
  subscribe(userId: string, callback: (message: WebhookBroadcastMessage) => void): () => void {
    let userSubscribers = subscribers.get(userId)
    
    if (!userSubscribers) {
      userSubscribers = new Set()
      subscribers.set(userId, userSubscribers)
    }

    userSubscribers.add(callback)
    console.log(`📡 REALTIME: User ${userId} subscribed, total subscribers: ${userSubscribers.size}`)

    // Return unsubscribe function
    return () => {
      userSubscribers?.delete(callback)
      console.log(`📡 REALTIME: User ${userId} unsubscribed, remaining: ${userSubscribers?.size || 0}`)
      
      if (userSubscribers?.size === 0) {
        subscribers.delete(userId)
      }
    }
  }

  /**
   * Check if a user has any subscribers
   */
  hasSubscribers(userId: string): boolean {
    const userSubscribers = subscribers.get(userId)
    return userSubscribers ? userSubscribers.size > 0 : false
  }

  /**
   * Get subscriber count for a user
   */
  getSubscriberCount(userId: string): number {
    return subscribers.get(userId)?.size || 0
  }

  /**
   * Get total statistics
   */
  getStats(): {
    totalUsers: number
    totalSubscribers: number
    totalPendingUpdates: number
  } {
    let totalSubscribers = 0
    let totalPendingUpdates = 0

    subscribers.forEach(subs => {
      totalSubscribers += subs.size
    })

    pendingUpdates.forEach(updates => {
      totalPendingUpdates += updates.length
    })

    return {
      totalUsers: subscribers.size,
      totalSubscribers,
      totalPendingUpdates,
    }
  }
}

// Export singleton instance
export const realtimeService = new RealtimeService()

/**
 * Helper function to broadcast webhook updates
 * Called from webhook processing services
 */
export async function broadcastWebhookUpdate(
  userId: string,
  integrationType: 'JIRA' | 'TRELLO',
  eventType: string,
  projectId?: string,
  data?: any
): Promise<void> {
  const message: WebhookBroadcastMessage = {
    type: 'project_update',
    userId,
    integrationType,
    eventType,
    projectId,
    data,
    timestamp: new Date(),
  }

  realtimeService.broadcastUpdate(message)
}

