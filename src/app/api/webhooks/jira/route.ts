/**
 * Jira Webhook API Endpoint
 * Receives and processes webhook events from Jira
 */

import { NextRequest, NextResponse } from 'next/server'
import { jiraWebhookService } from '@/lib/integrations/jira-webhook-service'
import type { JiraWebhookPayload } from '@/types/webhooks'

/**
 * POST /api/webhooks/jira
 * Receives webhook events from Jira
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    console.log('📥 JIRA WEBHOOK ENDPOINT: ========== WEBHOOK RECEIVED ==========')
    console.log('📥 JIRA WEBHOOK ENDPOINT: Timestamp:', new Date().toISOString())
    console.log('📥 JIRA WEBHOOK ENDPOINT: Headers:', Object.fromEntries(request.headers.entries()))

    // Get the raw body for signature verification
    const rawBody = await request.text()
    console.log('📥 JIRA WEBHOOK ENDPOINT: Raw body length:', rawBody.length)
    
    // Parse the payload
    let payload: JiraWebhookPayload
    try {
      payload = JSON.parse(rawBody)
    } catch (parseError) {
      console.error('❌ JIRA WEBHOOK ENDPOINT: Invalid JSON payload:', parseError)
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }

    // Get webhook signature from headers (if present)
    const signature = request.headers.get('x-atlassian-webhook-signature') ||
                     request.headers.get('x-hub-signature')

    // Log webhook event details
    console.log('📥 JIRA WEBHOOK ENDPOINT: Event type:', payload.webhookEvent)
    console.log('📥 JIRA WEBHOOK ENDPOINT: Timestamp:', payload.timestamp)
    
    const projectKey = payload.issue?.fields?.project?.key || payload.project?.key
    const issueKey = payload.issue?.key
    
    console.log('📥 JIRA WEBHOOK ENDPOINT: Project:', projectKey)
    console.log('📥 JIRA WEBHOOK ENDPOINT: Issue:', issueKey)
    
    if (payload.changelog) {
      console.log('📥 JIRA WEBHOOK ENDPOINT: Changelog items:', payload.changelog.items?.length || 0)
      payload.changelog.items?.forEach((item, idx) => {
        console.log(`📥 JIRA WEBHOOK ENDPOINT:   Change ${idx + 1}: ${item.field} from "${item.fromString}" to "${item.toString}"`)
      })
    }

    // Process the webhook
    console.log('📥 JIRA WEBHOOK ENDPOINT: Processing webhook...')
    const result = await jiraWebhookService.processWebhook(payload)
    const processingTime = Date.now() - startTime

    if (result.success) {
      console.log(`✅ JIRA WEBHOOK ENDPOINT: Processed successfully in ${processingTime}ms`)
      console.log('✅ JIRA WEBHOOK ENDPOINT: Result:', {
        eventType: result.eventType,
        projectId: result.projectId,
        userId: result.userId,
      })
      console.log('📥 JIRA WEBHOOK ENDPOINT: ========== WEBHOOK PROCESSED ==========')
      return NextResponse.json({
        success: true,
        eventType: result.eventType,
        projectId: result.projectId,
        processingTime,
      })
    } else {
      console.error('❌ JIRA WEBHOOK ENDPOINT: Processing failed:', result.error)
      console.log('📥 JIRA WEBHOOK ENDPOINT: ========== WEBHOOK FAILED ==========')
      // Still return 200 to prevent Jira from retrying
      return NextResponse.json({
        success: false,
        error: result.error,
        processingTime,
      })
    }
  } catch (error) {
    const processingTime = Date.now() - startTime
    console.error('❌ JIRA WEBHOOK ENDPOINT: Error:', error)
    console.log('📥 JIRA WEBHOOK ENDPOINT: ========== WEBHOOK ERROR ==========')
    // Return 200 to prevent excessive retries from Jira
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime,
    })
  }
}

/**
 * GET /api/webhooks/jira
 * Health check and webhook status endpoint
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    service: 'jira-webhook',
    timestamp: new Date().toISOString(),
  })
}

