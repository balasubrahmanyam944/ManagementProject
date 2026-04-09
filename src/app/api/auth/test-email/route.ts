import { NextRequest, NextResponse } from 'next/server'
import { emailService } from '@/lib/services/email-service'
import { zapierWebhookService } from '@/lib/services/zapier-webhook'

/**
 * POST /api/auth/test-email
 * Test email configuration and send a test email
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:9003'
    const forwardedProto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https') ? 'https' : 'http')
    const origin = `${forwardedProto}://${forwardedHost}`
    const testLink = `${origin}${basePath}/api/auth/verify?token=test-token-123`

    const results: {
      method: string
      configured: boolean
      success: boolean
      error?: string
    }[] = []

    // Test Direct SMTP
    const useDirectEmail = process.env.USE_DIRECT_EMAIL === 'true'
    const smtpConfigured = !!(
      process.env.EMAIL_SERVER_HOST &&
      process.env.EMAIL_SERVER_PORT &&
      process.env.EMAIL_SERVER_USER &&
      process.env.EMAIL_SERVER_PASSWORD
    )

    results.push({
      method: 'Direct SMTP',
      configured: smtpConfigured && useDirectEmail,
      success: false,
    })

    if (useDirectEmail && smtpConfigured) {
      try {
        const success = await emailService.sendVerificationEmail({
          email,
          verify_link: testLink,
          name: 'Test User',
        })
        results[0].success = success
        if (!success) {
          results[0].error = 'Failed to send email via SMTP'
        }
      } catch (error) {
        results[0].error = error instanceof Error ? error.message : 'Unknown error'
      }
    } else if (useDirectEmail && !smtpConfigured) {
      results[0].error = 'SMTP not configured. Set EMAIL_SERVER_* environment variables.'
    } else {
      results[0].error = 'Direct email disabled. Set USE_DIRECT_EMAIL=true to enable.'
    }

    // Test Zapier Webhook
    const zapierConfigured = !!process.env.ZAPIER_WEBHOOK_URL
    results.push({
      method: 'Zapier Webhook',
      configured: zapierConfigured && !useDirectEmail,
      success: false,
    })

    if (!useDirectEmail) {
      if (zapierConfigured) {
        try {
          const success = await zapierWebhookService.sendVerificationEmail({
            email,
            verify_link: testLink,
            name: 'Test User',
          })
          results[1].success = success
          if (!success) {
            results[1].error = 'Failed to send email via Zapier webhook'
          }
        } catch (error) {
          results[1].error = error instanceof Error ? error.message : 'Unknown error'
        }
      } else {
        results[1].error = 'Zapier webhook not configured. Set ZAPIER_WEBHOOK_URL environment variable.'
      }
    } else {
      results[1].error = 'Zapier disabled. Direct email is enabled.'
    }

    return NextResponse.json({
      message: 'Email test completed',
      results,
      configuration: {
        useDirectEmail,
        smtpConfigured,
        zapierConfigured,
        emailFrom: process.env.EMAIL_FROM || process.env.EMAIL_SERVER_USER || 'not set',
      },
    })
  } catch (error) {
    console.error('Test email error:', error)
    return NextResponse.json(
      { error: 'Failed to test email configuration' },
      { status: 500 }
    )
  }
}

