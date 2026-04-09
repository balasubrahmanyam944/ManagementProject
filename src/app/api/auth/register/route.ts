import { NextRequest, NextResponse } from 'next/server'
import { userService } from '@/lib/auth/user-service'
import { generateVerificationToken, generateTokenExpiration } from '@/lib/utils/token-generator'
import { zapierWebhookService } from '@/lib/services/zapier-webhook'
import { emailService } from '@/lib/services/email-service'
import { db } from '@/lib/db/database'

const ALLOWED_ROLES = ['MANAGER', 'TESTER', 'DEVELOPER'] as const
type AllowedRole = typeof ALLOWED_ROLES[number]

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, role } = await request.json()

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      )
    }

    // Validate role
    if (!role || !ALLOWED_ROLES.includes(role as AllowedRole)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be one of: MANAGER, TESTER, DEVELOPER' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingUser = await userService.getUserByEmail(email)
    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      )
    }

    // Get client IP and user agent for audit logging
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    request.headers.get('x-real-ip') || 
                    'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Check if this is a tenant (has basePath) or parent app
    const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
    const isTenant = !!basePath

    // For tenants: require email verification
    // For parent app: no verification required
    let verifyToken: string | undefined
    let verifyTokenExpires: Date | undefined
    let isVerified = !isTenant // Parent app users are auto-verified, tenants are not

    if (isTenant) {
      // Generate verification token for tenants only
      verifyToken = generateVerificationToken()
      verifyTokenExpires = generateTokenExpiration()
    }

    // Create new user
    const user = await userService.createUser({
      email,
      password,
      name,
      role: role as AllowedRole
    }, clientIP, userAgent)

    // Update user with verification status and token (if tenant)
    const updateData: any = {
      isVerified,
    }
    
    if (isTenant && verifyToken && verifyTokenExpires) {
      updateData.verifyToken = verifyToken
      updateData.verifyTokenExpires = verifyTokenExpires
    }

    await db.updateUser(user._id.toString(), updateData)

    // Send verification email (only for tenants)
    if (isTenant && verifyToken) {
      // Extract the external origin from request headers (same approach as OAuth integrations)
      // This ensures we get the actual port the user sees, not the internal Docker port
      const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:9003'
      const forwardedProto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https') ? 'https' : 'http')
      const origin = `${forwardedProto}://${forwardedHost}`
      const verifyLink = `${origin}${basePath}/api/auth/verify?token=${verifyToken}`
      
      console.log('🔍 Registration origin extraction:', {
        forwardedHost,
        forwardedProto,
        origin,
        requestUrl: request.url,
        hostHeader: request.headers.get('host'),
        xForwardedHost: request.headers.get('x-forwarded-host'),
        xForwardedProto: request.headers.get('x-forwarded-proto'),
      })

      console.log('📧 Sending verification email:', {
        email: user.email,
        verifyLink,
        method: process.env.USE_DIRECT_EMAIL === 'true' ? 'SMTP (Direct)' : 'Zapier Webhook',
      })

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
        if (!smtpConfigured) {
          console.error('   Missing SMTP variables:', {
            EMAIL_SERVER_HOST: process.env.EMAIL_SERVER_HOST ? '✓' : '✗',
            EMAIL_SERVER_PORT: process.env.EMAIL_SERVER_PORT ? '✓' : '✗',
            EMAIL_SERVER_USER: process.env.EMAIL_SERVER_USER ? '✓' : '✗',
            EMAIL_SERVER_PASSWORD: process.env.EMAIL_SERVER_PASSWORD ? '✓ (hidden)' : '✗',
          })
        }
      }
    } else if (isTenant && !verifyToken) {
      console.error('⚠️ Tenant user created but no verification token generated!')
    }

    const message = isTenant
      ? 'User created successfully. Please check your email to verify your account.'
      : 'User created successfully.'

    return NextResponse.json({
      message,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        isVerified,
      }
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    )
  }
} 