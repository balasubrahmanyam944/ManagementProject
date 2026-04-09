import { NextRequest, NextResponse } from 'next/server'
import { zapierWebhookService } from '@/lib/services/zapier-webhook'

/**
 * GET /api/auth/test-zapier
 * Test endpoint to verify Zapier webhook configuration
 */
export async function GET(request: NextRequest) {
  const webhookUrl = process.env.ZAPIER_WEBHOOK_URL || ''
  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
  // Extract the external origin from request headers (same approach as OAuth integrations)
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:9003'
  const forwardedProto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https') ? 'https' : 'http')
  const origin = `${forwardedProto}://${forwardedHost}`

  const testPayload = {
    email: 'test@example.com',
    verify_link: `${origin}${basePath}/api/auth/verify?token=test_token_123`,
    name: 'Test User',
  }

  const diagnostics = {
    webhookConfigured: !!webhookUrl,
    webhookUrl: webhookUrl ? `${webhookUrl.substring(0, 30)}...` : 'NOT SET',
    basePath,
    origin,
    testPayload,
  }

  // Try to send a test webhook
  if (webhookUrl) {
    try {
      const result = await zapierWebhookService.sendVerificationEmail(testPayload)
      return NextResponse.json({
        ...diagnostics,
        testResult: result ? 'SUCCESS' : 'FAILED',
        message: result
          ? 'Test webhook sent successfully! Check your Zapier dashboard and email.'
          : 'Test webhook failed. Check server logs for details.',
      })
    } catch (error) {
      return NextResponse.json({
        ...diagnostics,
        testResult: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Error sending test webhook. Check server logs.',
      })
    }
  }

  return NextResponse.json({
    ...diagnostics,
    testResult: 'NOT_CONFIGURED',
    message: 'ZAPIER_WEBHOOK_URL is not set. Add it to your .env.local file.',
  })
}

