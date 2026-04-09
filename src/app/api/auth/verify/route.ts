import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/database'
import { generateVerificationToken, generateTokenExpiration } from '@/lib/utils/token-generator'
import { emailService } from '@/lib/services/email-service'
import { zapierWebhookService } from '@/lib/services/zapier-webhook'

/**
 * GET /api/auth/verify?token=...
 * Verifies user email and redirects to dashboard
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const token = searchParams.get('token')

    if (!token) {
      const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
      const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:9003'
      const forwardedProto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https') ? 'https' : 'http')
      const origin = `${forwardedProto}://${forwardedHost}`
      return NextResponse.redirect(
        `${origin}${basePath}/auth/verify-email?error=invalid_token`
      )
    }

    // Find user by verification token
    const user = await db.findUserByVerifyToken(token)

    if (!user) {
      const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
      const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:9003'
      const forwardedProto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https') ? 'https' : 'http')
      const origin = `${forwardedProto}://${forwardedHost}`
      return NextResponse.redirect(
        `${origin}${basePath}/auth/verify-email?error=invalid_or_expired_token`
      )
    }

    // Verify the user
    await db.updateUser(user._id.toString(), {
      isVerified: true,
      verifyToken: undefined,
      verifyTokenExpires: undefined,
    })

    // Redirect to sign-in with verification success message
    // User needs to sign in after verification to establish session
    // Extract the external origin from request headers (same approach as OAuth integrations)
    const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:9003'
    const forwardedProto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https') ? 'https' : 'http')
    const origin = `${forwardedProto}://${forwardedHost}`
    const redirectUrl = `${origin}${basePath}/auth/signin?verified=true&email=${encodeURIComponent(user.email)}`
    
    console.log('🔍 Verification redirect origin extraction:', {
      forwardedHost,
      forwardedProto,
      origin,
      redirectUrl,
      requestUrl: request.url,
      hostHeader: request.headers.get('host'),
      xForwardedHost: request.headers.get('x-forwarded-host'),
      xForwardedProto: request.headers.get('x-forwarded-proto'),
    })
    
    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error('Verification error:', error)
    const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:9003'
    const forwardedProto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https') ? 'https' : 'http')
    const origin = `${forwardedProto}://${forwardedHost}`
    return NextResponse.redirect(
      `${origin}${basePath}/auth/verify-email?error=verification_failed`
    )
  }
}

/**
 * POST /api/auth/verify/resend
 * Resends verification email (only for tenants)
 */
export async function POST(request: NextRequest) {
  try {
    // Check if this is a tenant (verification only works for tenants)
    const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
    const isTenant = !!basePath

    if (!isTenant) {
      return NextResponse.json(
        { error: 'Email verification is only available for tenant accounts.' },
        { status: 403 }
      )
    }

    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Find user by email
    const user = await db.findUserByEmail(email)

    if (!user) {
      // Don't reveal if user exists or not for security
      return NextResponse.json({
        message: 'If an account exists with this email, a verification link has been sent.',
      })
    }

    // If already verified, return success without sending
    if (user.isVerified) {
      return NextResponse.json({
        message: 'Email is already verified.',
      })
    }

    // Generate new verification token
    const verifyToken = generateVerificationToken()
    const verifyTokenExpires = generateTokenExpiration()

    // Update user with new token
    await db.updateUser(user._id.toString(), {
      verifyToken,
      verifyTokenExpires,
    })

    // Send verification email
    // Extract the external origin from request headers (same approach as OAuth integrations)
    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:9003'
    const forwardedProto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https') ? 'https' : 'http')
    const origin = `${forwardedProto}://${forwardedHost}`
    const verifyLink = `${origin}${basePath}/api/auth/verify?token=${verifyToken}`

    // Send verification email - try SMTP first (most reliable), then Zapier
    let emailSent = false
    
    // Check if SMTP is configured
    const smtpConfigured = !!(
      process.env.EMAIL_SERVER_HOST &&
      process.env.EMAIL_SERVER_PORT &&
      process.env.EMAIL_SERVER_USER &&
      process.env.EMAIL_SERVER_PASSWORD
    )
    
    if (smtpConfigured) {
      console.log('📧 Attempting to send verification email via SMTP...')
      const smtpSuccess = await emailService.sendVerificationEmail({
        email: user.email,
        verify_link: verifyLink,
        name: user.name,
      })
      if (smtpSuccess) {
        console.log('✅ Verification email sent successfully via SMTP')
        emailSent = true
      } else {
        console.error('❌ Failed to send verification email via SMTP')
      }
    }
    
    // If SMTP not configured or failed, try Zapier
    if (!emailSent && process.env.ZAPIER_WEBHOOK_URL) {
      console.log('📧 Attempting to send verification email via Zapier webhook...')
      const zapierSuccess = await zapierWebhookService.sendVerificationEmail({
        email: user.email,
        verify_link: verifyLink,
        name: user.name,
      })
      if (zapierSuccess) {
        console.log('✅ Verification email sent successfully via Zapier')
        emailSent = true
      } else {
        console.error('❌ Zapier webhook also failed')
      }
    }
    
    if (!emailSent) {
      console.error('❌ Failed to send verification email via all methods!')
      console.error('📋 Email configuration status:')
      console.error('   SMTP configured:', smtpConfigured)
      console.error('   Zapier configured:', !!process.env.ZAPIER_WEBHOOK_URL)
    }

    return NextResponse.json({
      message: 'Verification email sent successfully.',
    })
  } catch (error) {
    console.error('Resend verification error:', error)
    return NextResponse.json(
      { error: 'Failed to resend verification email' },
      { status: 500 }
    )
  }
}

