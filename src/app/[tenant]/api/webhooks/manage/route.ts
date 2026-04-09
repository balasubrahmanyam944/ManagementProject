/**
 * Webhook Management API (Tenant-specific)
 * Register, unregister, and check status of webhooks
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { jiraWebhookService } from '@/lib/integrations/jira-webhook-service'
import { trelloWebhookService } from '@/lib/integrations/trello-webhook-service'

/**
 * GET /[tenant]/api/webhooks/manage
 * Get webhook status for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Get status for both integrations
    const [jiraStatus, trelloStatus] = await Promise.all([
      jiraWebhookService.getWebhookStatus(userId),
      trelloWebhookService.getWebhookStatus(userId),
    ])

    return NextResponse.json({
      success: true,
      webhooks: {
        jira: jiraStatus,
        trello: trelloStatus,
      },
    })
  } catch (error) {
    console.error('❌ WEBHOOK MANAGE (TENANT): Error getting status:', error)
    return NextResponse.json(
      { error: 'Failed to get webhook status' },
      { status: 500 }
    )
  }
}

/**
 * POST /[tenant]/api/webhooks/manage
 * Register webhooks for integrations
 * Body: { integration: 'jira' | 'trello' | 'all', boardId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { integration, boardId } = body

    // Get the base URL from request headers
    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:9003'
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
    const baseUrl = `${forwardedProto}://${forwardedHost}`
    const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''

    console.log('🔗 WEBHOOK MANAGE (TENANT): Registering webhooks for:', integration)
    console.log('🔗 WEBHOOK MANAGE (TENANT): Base URL:', baseUrl)
    console.log('🔗 WEBHOOK MANAGE (TENANT): Base Path:', basePath)

    const results: any = {}

    if (integration === 'jira' || integration === 'all') {
      results.jira = await jiraWebhookService.registerWebhook(userId, baseUrl, basePath)
    }

    if (integration === 'trello' || integration === 'all') {
      if (boardId) {
        // Register for a specific board
        results.trello = await trelloWebhookService.registerWebhookForBoard(
          userId, boardId, baseUrl, basePath
        )
      } else {
        // Register for all boards
        results.trello = await trelloWebhookService.registerWebhooksForAllBoards(
          userId, baseUrl, basePath
        )
      }
    }

    const success = Object.values(results).every((r: any) => r.success)

    return NextResponse.json({
      success,
      results,
    })
  } catch (error) {
    console.error('❌ WEBHOOK MANAGE (TENANT): Error registering:', error)
    return NextResponse.json(
      { error: 'Failed to register webhooks' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /[tenant]/api/webhooks/manage
 * Unregister webhooks
 * Body: { integration: 'jira' | 'trello' | 'all', boardId?: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { integration, boardId } = body

    console.log('🔗 WEBHOOK MANAGE (TENANT): Unregistering webhooks for:', integration)

    const results: any = {}

    if (integration === 'jira' || integration === 'all') {
      results.jira = await jiraWebhookService.unregisterWebhook(userId)
    }

    if (integration === 'trello' || integration === 'all') {
      results.trello = await trelloWebhookService.unregisterWebhook(userId, boardId)
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error) {
    console.error('❌ WEBHOOK MANAGE (TENANT): Error unregistering:', error)
    return NextResponse.json(
      { error: 'Failed to unregister webhooks' },
      { status: 500 }
    )
  }
}

