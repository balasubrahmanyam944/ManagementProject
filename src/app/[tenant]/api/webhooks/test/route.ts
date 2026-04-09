/**
 * Test Webhook API (Tenant-specific)
 * For debugging SSE connection and webhook broadcasts
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { broadcastWebhookUpdate, realtimeService } from '@/lib/services/realtime-service'

/**
 * GET /[tenant]/api/webhooks/test
 * Get SSE connection status
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authConfig)
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const stats = realtimeService.getStats()
  const hasSubscribers = realtimeService.hasSubscribers(userId)
  const subscriberCount = realtimeService.getSubscriberCount(userId)
  const pendingUpdates = realtimeService.getPendingUpdates(userId)

  return NextResponse.json({
    status: 'ok',
    tenant: true,
    userId,
    hasSubscribers,
    subscriberCount,
    pendingUpdatesCount: pendingUpdates.length,
    globalStats: stats,
    message: hasSubscribers 
      ? `User has ${subscriberCount} active SSE connection(s)` 
      : 'No active SSE connections for this user'
  })
}

/**
 * POST /[tenant]/api/webhooks/test
 * Manually trigger a test webhook event for debugging
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authConfig)
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  
  try {
    const body = await request.json().catch(() => ({}))
    const { integrationType = 'JIRA', projectId = 'TEST-PROJECT' } = body
    
    console.log('🧪 TEST WEBHOOK (TENANT): Broadcasting test event for user:', userId)
    
    // Broadcast a test update
    await broadcastWebhookUpdate(
      userId,
      integrationType as 'JIRA' | 'TRELLO',
      'test:manual_trigger',
      projectId,
      {
        issueKey: 'TEST-123',
        issueSummary: 'Test Issue - Manual Trigger',
        status: 'In Progress',
        timestamp: new Date().toISOString(),
      }
    )

    const hasSubscribers = realtimeService.hasSubscribers(userId)
    const subscriberCount = realtimeService.getSubscriberCount(userId)

    return NextResponse.json({
      success: true,
      message: hasSubscribers 
        ? `Test event broadcast to ${subscriberCount} subscriber(s)`
        : 'Test event queued (no active subscribers)',
      userId,
      hasSubscribers,
      subscriberCount,
    })
  } catch (error) {
    console.error('🧪 TEST WEBHOOK (TENANT): Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

