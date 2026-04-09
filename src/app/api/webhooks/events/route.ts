/**
 * Webhook Events Stream API
 * Server-Sent Events (SSE) endpoint for real-time updates
 */

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { realtimeService } from '@/lib/services/realtime-service'
import { db } from '@/lib/db/database'

/**
 * GET /api/webhooks/events
 * SSE endpoint for real-time webhook updates
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authConfig)
  
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const userId = session.user.id
  console.log('📡 SSE: New connection from user:', userId)

  // Get user creation date first (before creating stream)
  const user = await db.findUserById(userId)
  const userCreatedAt = user?.createdAt || new Date()

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      
      // Send initial connection message
      const connectionMessage = `data: ${JSON.stringify({
        type: 'connected',
        userId,
        timestamp: new Date().toISOString(),
      })}\n\n`
      controller.enqueue(encoder.encode(connectionMessage))

      // Send any pending updates that occurred AFTER user account creation
      // This ensures new users don't see old notifications from before they signed up
      // Only get updates that occurred after account creation
      const pendingUpdates = realtimeService.getPendingUpdates(userId, userCreatedAt)
      
      if (pendingUpdates.length > 0) {
        console.log(`📡 SSE: ========== SENDING PENDING UPDATES ==========`)
        console.log(`📡 SSE: User: ${userId}`)
        console.log(`📡 SSE: User created at: ${userCreatedAt.toISOString()}`)
        console.log(`📡 SSE: Pending updates (after account creation): ${pendingUpdates.length}`)
        pendingUpdates.forEach((update, index) => {
          console.log(`📡 SSE: Sending pending update ${index + 1}/${pendingUpdates.length}:`, update.eventType, update.projectId)
          const message = `data: ${JSON.stringify(update)}\n\n`
          controller.enqueue(encoder.encode(message))
        })
        console.log(`📡 SSE: ✅ All pending updates sent`)
        console.log(`📡 SSE: =============================================`)
      } else {
        console.log(`📡 SSE: No pending updates for user ${userId} (after account creation)`)
      }
      
      // Clear any old pending updates that occurred before account creation
      // This prevents accumulation of stale notifications
      realtimeService.clearOldPendingUpdates(userId, userCreatedAt)

      // Subscribe to new updates
      console.log(`📡 SSE: ========== SUBSCRIBING USER ==========`)
      console.log(`📡 SSE: User ID: ${userId}`)
      console.log(`📡 SSE: Subscribing user ${userId} to realtime updates`)
      
      const unsubscribe = realtimeService.subscribe(userId, (message) => {
        try {
          console.log(`📡 SSE: ========== SENDING UPDATE TO CLIENT ==========`)
          console.log(`📡 SSE: User: ${userId}`)
          console.log(`📡 SSE: Event Type: ${message.eventType}`)
          console.log(`📡 SSE: Project ID: ${message.projectId}`)
          console.log(`📡 SSE: Integration: ${message.integrationType}`)
          const sseMessage = `data: ${JSON.stringify(message)}\n\n`
          controller.enqueue(encoder.encode(sseMessage))
          console.log(`📡 SSE: ✅ Update sent successfully to user ${userId}`)
          console.log(`📡 SSE: =============================================`)
        } catch (error) {
          console.error('📡 SSE: ❌ Error sending message:', error)
        }
      })
      
      // Log subscriber count after subscription
      const subscriberCount = realtimeService.getSubscriberCount(userId)
      console.log(`📡 SSE: ✅ User ${userId} subscribed. Total subscribers: ${subscriberCount}`)
      console.log(`📡 SSE: =========================================`)

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          const heartbeat = `data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`
          controller.enqueue(encoder.encode(heartbeat))
        } catch (error) {
          // Connection might be closed
          clearInterval(heartbeatInterval)
        }
      }, 30000)

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        console.log('📡 SSE: ========== CONNECTION CLOSED ==========')
        console.log(`📡 SSE: User: ${userId}`)
        const subscriberCountBefore = realtimeService.getSubscriberCount(userId)
        console.log(`📡 SSE: Subscribers before cleanup: ${subscriberCountBefore}`)
        clearInterval(heartbeatInterval)
        unsubscribe()
        const subscriberCountAfter = realtimeService.getSubscriberCount(userId)
        console.log(`📡 SSE: Subscribers after cleanup: ${subscriberCountAfter}`)
        console.log('📡 SSE: =========================================')
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering for nginx
    },
  })
}

