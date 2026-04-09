/**
 * Webhook Status API (Tenant-specific)
 * Check webhook registration and connection status
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { jiraWebhookService } from '@/lib/integrations/jira-webhook-service'
import { trelloWebhookService } from '@/lib/integrations/trello-webhook-service'
import { realtimeService } from '@/lib/services/realtime-service'
import { db } from '@/lib/db/database'

/**
 * GET /[tenant]/api/webhooks/status
 * Get webhook registration and connection status for current user
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authConfig)
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    // Get webhook registrations
    const jiraWebhooks = await db.findWebhooksByIntegration(userId, 'JIRA')
    const trelloWebhooks = await db.findWebhooksByIntegration(userId, 'TRELLO')

    // Get webhook status
    const jiraStatus = jiraWebhooks.length > 0 
      ? await jiraWebhookService.getWebhookStatus(userId)
      : { registered: false, status: 'NOT_REGISTERED', errorCount: 0 }
    
    const trelloStatus = trelloWebhooks.length > 0
      ? await trelloWebhookService.getWebhookStatus(userId)
      : { registered: false, boardCount: 0, activeCount: 0, pendingCount: 0, webhooks: [] }

    // Get SSE connection status
    const hasSubscribers = realtimeService.hasSubscribers(userId)
    const subscriberCount = realtimeService.getSubscriberCount(userId)
    const pendingUpdates = realtimeService.getPendingUpdates(userId)

    // Get recent webhook events
    const recentEvents = await db.findRecentWebhookEvents(userId, 10)

    return NextResponse.json({
      tenant: true,
      userId,
      sse: {
        connected: hasSubscribers,
        subscriberCount,
        pendingUpdatesCount: pendingUpdates.length,
      },
      jira: {
        registered: jiraStatus.registered,
        status: jiraStatus.status,
        lastTriggered: jiraStatus.lastTriggered,
        errorCount: jiraStatus.errorCount,
        webhookCount: jiraWebhooks.length,
        webhooks: jiraWebhooks.map(w => ({
          id: w.webhookId,
          callbackUrl: w.callbackUrl,
          status: w.status,
          lastTriggered: w.lastTriggeredAt,
        })),
      },
      trello: {
        registered: trelloStatus.registered || false,
        boardCount: trelloStatus.boardCount || 0,
        activeCount: trelloStatus.activeCount || 0,
        pendingCount: trelloStatus.pendingCount || 0,
        webhooks: trelloStatus.webhooks || [],
        trelloRegisteredWebhooks: trelloStatus.trelloRegisteredWebhooks || [],
      },
      recentEvents: recentEvents.map(e => ({
        id: e._id?.toString(),
        integrationType: e.integrationType,
        eventType: e.eventType,
        projectId: e.projectId,
        processed: e.processed,
        createdAt: e.createdAt,
        error: e.error,
      })),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('❌ WEBHOOK STATUS (TENANT): Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

