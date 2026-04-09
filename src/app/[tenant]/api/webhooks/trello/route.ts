/**
 * Trello Webhook API Endpoint (Tenant-specific)
 * Receives and processes webhook events from Trello for tenant apps
 */

import { NextRequest, NextResponse } from 'next/server'
import { trelloWebhookService } from '@/lib/integrations/trello-webhook-service'
import type { TrelloWebhookPayload } from '@/types/webhooks'

/**
 * HEAD /[tenant]/api/webhooks/trello
 * Trello sends a HEAD request to verify the callback URL
 */
export async function HEAD() {
  console.log('📥 TRELLO WEBHOOK ENDPOINT (TENANT): Received HEAD verification request')
  return new NextResponse(null, { status: 200 })
}

/**
 * POST /[tenant]/api/webhooks/trello
 * Receives webhook events from Trello
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📥 TRELLO WEBHOOK ENDPOINT (TENANT): Received webhook request')

    // Get the raw body
    const rawBody = await request.text()
    
    // Handle empty body (Trello might send empty POST for verification)
    if (!rawBody || rawBody.trim() === '') {
      console.log('📥 TRELLO WEBHOOK ENDPOINT (TENANT): Empty body - verification request')
      return NextResponse.json({ status: 'ok' })
    }

    // Parse the payload
    let payload: TrelloWebhookPayload
    try {
      payload = JSON.parse(rawBody)
    } catch (parseError) {
      console.error('❌ TRELLO WEBHOOK ENDPOINT (TENANT): Invalid JSON payload')
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }

    // Get webhook signature from headers
    const signature = request.headers.get('x-trello-webhook')

    // Log webhook event details
    console.log('📥 TRELLO WEBHOOK ENDPOINT (TENANT): Action type:', payload.action?.type)
    console.log('📥 TRELLO WEBHOOK ENDPOINT (TENANT): Model:', payload.model?.name)
    
    if (payload.action?.data?.card) {
      console.log('📥 TRELLO WEBHOOK ENDPOINT (TENANT): Card:', payload.action.data.card.name)
    }
    if (payload.action?.data?.board) {
      console.log('📥 TRELLO WEBHOOK ENDPOINT (TENANT): Board:', payload.action.data.board.name)
    }

    // Process the webhook
    const result = await trelloWebhookService.processWebhook(payload)

    if (result.success) {
      console.log('✅ TRELLO WEBHOOK ENDPOINT (TENANT): Processed successfully')
      return NextResponse.json({
        success: true,
        eventType: result.eventType,
        projectId: result.projectId,
      })
    } else {
      console.error('❌ TRELLO WEBHOOK ENDPOINT (TENANT): Processing failed:', result.error)
      // Still return 200 to prevent Trello from retrying
      return NextResponse.json({
        success: false,
        error: result.error,
      })
    }
  } catch (error) {
    console.error('❌ TRELLO WEBHOOK ENDPOINT (TENANT): Error:', error)
    // Return 200 to prevent excessive retries from Trello
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * GET /[tenant]/api/webhooks/trello
 * Health check and webhook status endpoint
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    service: 'trello-webhook',
    tenant: true,
    timestamp: new Date().toISOString(),
  })
}

