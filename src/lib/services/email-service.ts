/**
 * Direct email sending service using nodemailer
 * This is a quick fix for testing without domain verification
 * Can send to multiple email addresses
 */

import nodemailer from 'nodemailer'

interface EmailPayload {
  email: string
  verify_link: string
  name?: string
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null
  private initialized = false

  constructor() {
    // Initialize asynchronously - don't block constructor
    this.initialize().catch((error) => {
      console.error('❌ Failed to initialize email service:', error)
    })
  }

  private async initialize() {
    if (this.initialized) return
    
    // Check if email is configured
    const emailHost = process.env.EMAIL_SERVER_HOST
    const emailPort = process.env.EMAIL_SERVER_PORT || '587'
    const emailUser = process.env.EMAIL_SERVER_USER
    const emailPassword = process.env.EMAIL_SERVER_PASSWORD

    if (emailHost && emailPort && emailUser && emailPassword) {
      try {
        const port = parseInt(emailPort)
        
        // Use Gmail service configuration (matches your working setup)
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          host: emailHost,
          port: port,
          secure: false, // Always false for port 587 (STARTTLS), matches your working config
          auth: {
            user: emailUser,
            pass: emailPassword
          },
          tls: {
            rejectUnauthorized: false, // Allow self-signed certificates
          },
          logger: false,  // Set to false to reduce verbose SMTP logs
          debug: false    // Set to false to disable debug output
        })
        
        console.log('✅ Email service configured with SMTP')
        console.log('📧 SMTP Config:', {
          service: 'gmail',
          host: emailHost,
          port: emailPort,
          user: emailUser,
          secure: false,
        })
        this.initialized = true
      } catch (error) {
        console.error('❌ Failed to initialize email transporter:', error)
        this.transporter = null
      }
    } else {
      console.warn('⚠️ Email service not configured. Set EMAIL_SERVER_* environment variables.')
      console.warn('📋 Missing variables:', {
        EMAIL_SERVER_HOST: emailHost ? '✓' : '✗',
        EMAIL_SERVER_PORT: emailPort ? '✓' : '✗',
        EMAIL_SERVER_USER: emailUser ? '✓' : '✗',
        EMAIL_SERVER_PASSWORD: emailPassword ? '✓' : '✗',
      })
      this.initialized = true // Mark as initialized even if not configured
    }
  }

  /**
   * Send verification email directly via SMTP
   * This bypasses Zapier and works for testing without domain verification
   */
  async sendVerificationEmail(payload: EmailPayload): Promise<boolean> {
    if (!this.transporter) {
      console.error('❌ Email service not configured')
      console.error('📋 Required environment variables:')
      console.error('   - EMAIL_SERVER_HOST:', process.env.EMAIL_SERVER_HOST ? '✓ Set' : '✗ Missing')
      console.error('   - EMAIL_SERVER_PORT:', process.env.EMAIL_SERVER_PORT ? '✓ Set' : '✗ Missing')
      console.error('   - EMAIL_SERVER_USER:', process.env.EMAIL_SERVER_USER ? '✓ Set' : '✗ Missing')
      console.error('   - EMAIL_SERVER_PASSWORD:', process.env.EMAIL_SERVER_PASSWORD ? '✓ Set (hidden)' : '✗ Missing')
      console.error('   - USE_DIRECT_EMAIL:', process.env.USE_DIRECT_EMAIL || 'false (not set)')
      return false
    }

    try {
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0;">Verify Your Email</h1>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hello${payload.name ? ` ${payload.name}` : ''},</p>
    <p style="font-size: 16px; margin-bottom: 20px;">Thank you for signing up! Please verify your email address by clicking the button below.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${payload.verify_link}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Verify Email</a>
    </div>
    <p style="font-size: 14px; color: #666; margin-top: 30px;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="font-size: 12px; color: #999; word-break: break-all; background: #fff; padding: 10px; border-radius: 5px;">${payload.verify_link}</p>
    <p style="font-size: 14px; color: #666; margin-top: 30px;">This link will expire in 24 hours.</p>
    <p style="font-size: 14px; color: #666; margin-top: 20px;">If you didn't create an account, you can safely ignore this email.</p>
  </div>
</body>
</html>
      `.trim()

      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_SERVER_USER || 'noreply@example.com',
        to: payload.email,
        subject: 'Verify your email',
        html: emailHtml,
      }

      console.log('📧 Sending verification email via SMTP:', {
        to: payload.email,
        from: mailOptions.from,
        verifyLink: payload.verify_link,
      })

      const info = await this.transporter.sendMail(mailOptions)
      console.log('✅ Verification email sent successfully via SMTP:', info.messageId)
      console.log('📧 Email details:', {
        to: payload.email,
        from: mailOptions.from,
        messageId: info.messageId,
        response: info.response,
      })
      return true
    } catch (error) {
      console.error('❌ Error sending verification email via SMTP:', error)
      if (error instanceof Error) {
        console.error('Error message:', error.message)
        console.error('Error code:', (error as any).code)
        
        // Provide helpful error messages for common issues
        if (error.message.includes('Invalid login') || error.message.includes('authentication failed')) {
          console.error('💡 Tip: Check your EMAIL_SERVER_USER and EMAIL_SERVER_PASSWORD.')
          console.error('   For Gmail, you need to use an App Password, not your regular password.')
          console.error('   Generate one at: https://myaccount.google.com/apppasswords')
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('connection')) {
          console.error('💡 Tip: Check your EMAIL_SERVER_HOST and EMAIL_SERVER_PORT.')
          console.error('   For Gmail SMTP: host=smtp.gmail.com, port=587 (or 465 for SSL)')
        } else if (error.message.includes('self signed certificate')) {
          console.error('💡 Tip: SSL certificate issue. Try using port 587 with secure: false')
        }
      }
      return false
    }
  }
}

export const emailService = new EmailService()

