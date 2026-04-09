/**
 * Trello Webhook API Endpoint
 * Receives and processes webhook events from Trello
 */

import { NextRequest, NextResponse } from 'next/server'
import { trelloWebhookService } from '@/lib/integrations/trello-webhook-service'
import type { TrelloWebhookPayload } from '@/types/webhooks'

/**
 * HEAD /api/webhooks/trello
 * Trello sends a HEAD request to verify the callback URL
 */
export async function HEAD(request: NextRequest) {
  console.log('📥 TRELLO WEBHOOK ENDPOINT: ========== HEAD VERIFICATION REQUEST ==========')
  console.log('📥 TRELLO WEBHOOK ENDPOINT: URL:', request.url)
  console.log('📥 TRELLO WEBHOOK ENDPOINT: Method: HEAD')
  console.log('📥 TRELLO WEBHOOK ENDPOINT: Headers:', Object.fromEntries(request.headers.entries()))
  console.log('📥 TRELLO WEBHOOK ENDPOINT: ===============================================')
  return new NextResponse(null, { status: 200 })
}

/**
 * POST /api/webhooks/trello
 * Receives webhook events from Trello
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📥 TRELLO WEBHOOK ENDPOINT: ========== WEBHOOK REQUEST RECEIVED ==========')
    console.log('📥 TRELLO WEBHOOK ENDPOINT: URL:', request.url)
    console.log('📥 TRELLO WEBHOOK ENDPOINT: Method: POST')
    console.log('📥 TRELLO WEBHOOK ENDPOINT: Headers:', Object.fromEntries(request.headers.entries()))

    // Get the raw body
    const rawBody = await request.text()
    
    // Handle empty body (Trello might send empty POST for verification)
    if (!rawBody || rawBody.trim() === '') {
      console.log('📥 TRELLO WEBHOOK ENDPOINT: Empty body - verification request')
      console.log('📥 TRELLO WEBHOOK ENDPOINT: ===============================================')
      return NextResponse.json({ status: 'ok' })
    }
    
    console.log('📥 TRELLO WEBHOOK ENDPOINT: Body length:', rawBody.length)
    console.log('📥 TRELLO WEBHOOK ENDPOINT: Body preview:', rawBody.substring(0, 200))

    // Parse the payload
    let payload: TrelloWebhookPayload
    try {
      payload = JSON.parse(rawBody)
      
      // Validate payload structure
      if (!payload || !payload.action) {
        console.error('❌ TRELLO WEBHOOK ENDPOINT: Invalid payload structure - missing action')
        console.error('❌ TRELLO WEBHOOK ENDPOINT: Payload:', rawBody.substring(0, 500))
        return NextResponse.json(
          { error: 'Invalid payload structure - missing action' },
          { status: 400 }
        )
      }
    } catch (parseError) {
      console.error('❌ TRELLO WEBHOOK ENDPOINT: Invalid JSON payload')
      console.error('❌ TRELLO WEBHOOK ENDPOINT: Parse error:', parseError)
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }

    // Get webhook signature from headers
    const signature = request.headers.get('x-trello-webhook')

    // Log webhook event details
    console.log('📥 TRELLO WEBHOOK ENDPOINT: Action type:', payload.action?.type)
    console.log('📥 TRELLO WEBHOOK ENDPOINT: Model:', payload.model?.name)
    
    if (payload.action?.data?.card) {
      console.log('📥 TRELLO WEBHOOK ENDPOINT: Card:', payload.action.data.card.name)
    }
    if (payload.action?.data?.board) {
      console.log('📥 TRELLO WEBHOOK ENDPOINT: Board:', payload.action.data.board.name)
    }

    // Process the webhook
    const result = await trelloWebhookService.processWebhook(payload)

    if (result.success) {
      console.log('✅ TRELLO WEBHOOK ENDPOINT: Processed successfully')
      return NextResponse.json({
        success: true,
        eventType: result.eventType,
        projectId: result.projectId,
      })
    } else {
      console.error('❌ TRELLO WEBHOOK ENDPOINT: Processing failed:', result.error)
      // Still return 200 to prevent Trello from retrying
      return NextResponse.json({
        success: false,
        error: result.error,
      })
    }
  } catch (error) {
    console.error('❌ TRELLO WEBHOOK ENDPOINT: Error:', error)
    // Return 200 to prevent excessive retries from Trello
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * GET /api/webhooks/trello
 * Health check and webhook status endpoint
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    service: 'trello-webhook',
    timestamp: new Date().toISOString(),
  })
}

