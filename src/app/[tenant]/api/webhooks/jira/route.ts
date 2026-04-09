/**
 * Jira Webhook API Endpoint (Tenant-specific)
 * Receives and processes webhook events from Jira for tenant apps
 */

import { NextRequest, NextResponse } from 'next/server'
import { jiraWebhookService } from '@/lib/integrations/jira-webhook-service'
import type { JiraWebhookPayload } from '@/types/webhooks'

/**
 * POST /[tenant]/api/webhooks/jira
 * Receives webhook events from Jira
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📥 JIRA WEBHOOK ENDPOINT (TENANT): Received webhook request')

    // Get the raw body for signature verification
    const rawBody = await request.text()
    
    // Parse the payload
    let payload: JiraWebhookPayload
    try {
      payload = JSON.parse(rawBody)
    } catch (parseError) {
      console.error('❌ JIRA WEBHOOK ENDPOINT (TENANT): Invalid JSON payload')
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }

    // Get webhook signature from headers (if present)
    const signature = request.headers.get('x-atlassian-webhook-signature') ||
                     request.headers.get('x-hub-signature')

    // Log webhook event details
    console.log('📥 JIRA WEBHOOK ENDPOINT (TENANT): Event type:', payload.webhookEvent)
    console.log('📥 JIRA WEBHOOK ENDPOINT (TENANT): Timestamp:', payload.timestamp)
    
    if (payload.issue) {
      console.log('📥 JIRA WEBHOOK ENDPOINT (TENANT): Issue:', payload.issue.key)
    }
    if (payload.project) {
      console.log('📥 JIRA WEBHOOK ENDPOINT (TENANT): Project:', payload.project.key)
    }

    // Process the webhook
    const result = await jiraWebhookService.processWebhook(payload)

    if (result.success) {
      console.log('✅ JIRA WEBHOOK ENDPOINT (TENANT): Processed successfully')
      return NextResponse.json({
        success: true,
        eventType: result.eventType,
        projectId: result.projectId,
      })
    } else {
      console.error('❌ JIRA WEBHOOK ENDPOINT (TENANT): Processing failed:', result.error)
      // Still return 200 to prevent Jira from retrying
      return NextResponse.json({
        success: false,
        error: result.error,
      })
    }
  } catch (error) {
    console.error('❌ JIRA WEBHOOK ENDPOINT (TENANT): Error:', error)
    // Return 200 to prevent excessive retries from Jira
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * GET /[tenant]/api/webhooks/jira
 * Health check and webhook status endpoint
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    service: 'jira-webhook',
    tenant: true,
    timestamp: new Date().toISOString(),
  })
}

