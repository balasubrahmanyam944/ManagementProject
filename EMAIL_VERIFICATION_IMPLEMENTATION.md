# Email Verification - Complete Implementation

This document contains all the code and configuration needed for email verification using Zapier and Resend API.

## 📋 Implementation Summary

✅ **Database Schema** - Updated User model with `isVerified`, `verifyToken`, `verifyTokenExpires`  
✅ **Token Generation** - Secure random token generation utility  
✅ **Zapier Integration** - Webhook service to send verification data  
✅ **Signup Flow** - Generates token and triggers Zapier webhook  
✅ **Verification Endpoint** - GET endpoint to verify tokens  
✅ **Resend Endpoint** - POST endpoint to resend verification emails  
✅ **Middleware Protection** - Blocks unverified users from protected routes  
✅ **Frontend Page** - Verify email page with resend functionality  
✅ **Auth Config** - Updated to include `isVerified` in session  

## 🔧 Files Created/Modified

### New Files Created:
1. `src/lib/utils/token-generator.ts` - Token generation utilities
2. `src/lib/services/zapier-webhook.ts` - Zapier webhook service
3. `src/app/api/auth/verify/route.ts` - Verification endpoints
4. `src/app/auth/verify-email/page.tsx` - Frontend verification page
5. `EMAIL_VERIFICATION_SETUP.md` - Setup documentation

### Modified Files:
1. `src/lib/db/database.ts` - Added `isVerified`, `verifyToken`, `verifyTokenExpires` to User interface
2. `src/lib/auth/user-service.ts` - Updated to create unverified users
3. `src/app/api/auth/register/route.ts` - Added token generation and Zapier webhook call
4. `src/lib/auth/config.ts` - Added `isVerified` to JWT and session
5. `src/middleware.ts` - Added verification check to block unverified users
6. `src/types/next-auth.d.ts` - Added `isVerified` to TypeScript types
7. `src/hooks/use-auth.ts` - Added `isVerified` to AuthUser interface
8. `env.example` - Added `ZAPIER_WEBHOOK_URL`

## 📝 Code Snippets

### 1. Token Generation (`src/lib/utils/token-generator.ts`)

```typescript
import crypto from 'crypto'

export function generateVerificationToken(): string {
  const token = crypto.randomBytes(32).toString('base64url')
  return token
}

export function generateTokenExpiration(): Date {
  const expires = new Date()
  expires.setHours(expires.getHours() + 24) // Token valid for 24 hours
  return expires
}
```

### 2. Zapier Webhook Service (`src/lib/services/zapier-webhook.ts`)

```typescript
interface ZapierWebhookPayload {
  email: string
  verify_link: string
  name?: string
}

export class ZapierWebhookService {
  private webhookUrl: string

  constructor() {
    this.webhookUrl = process.env.ZAPIER_WEBHOOK_URL || ''
  }

  async sendVerificationEmail(payload: ZapierWebhookPayload): Promise<boolean> {
    if (!this.webhookUrl) {
      console.error('Zapier webhook URL is not configured')
      return false
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      return response.ok
    } catch (error) {
      console.error('Error sending Zapier webhook:', error)
      return false
    }
  }
}

export const zapierWebhookService = new ZapierWebhookService()
```

### 3. Signup Route (`src/app/api/auth/register/route.ts`)

Key changes:
- Generate verification token
- Save token to user
- Send to Zapier webhook

```typescript
// Generate verification token
const verifyToken = generateVerificationToken()
const verifyTokenExpires = generateTokenExpiration()

// Create new user (unverified)
const user = await userService.createUser({...})

// Update user with verification token
await db.updateUser(user._id.toString(), {
  verifyToken,
  verifyTokenExpires,
})

// Send verification email via Zapier webhook
const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:9003'
const verifyLink = `${appUrl}${basePath}/api/auth/verify?token=${verifyToken}`

zapierWebhookService.sendVerificationEmail({
  email: user.email,
  verify_link: verifyLink,
  name: user.name,
})
```

### 4. Verification Endpoint (`src/app/api/auth/verify/route.ts`)

**GET /api/auth/verify?token=...**
- Finds user by token
- Checks token expiration
- Sets `isVerified = true`
- Clears token
- Redirects to dashboard

**POST /api/auth/verify**
- Resends verification email
- Generates new token
- Sends to Zapier webhook

### 5. Middleware Protection (`src/middleware.ts`)

```typescript
// Block unverified users from accessing protected routes
const isVerifyPage = pathname.startsWith(withBase('/auth/verify-email'))
const isVerifyApi = pathname.startsWith(withBase('/api/auth/verify'))

if (isAuth && token && !isVerifyPage && !isVerifyApi && !isAuthPage) {
  const isVerified = (token as any)?.isVerified
  
  if (!isPublicPage && pathname !== withBase('/') && !pathname.startsWith(withBase('/shared'))) {
    if (!isVerified) {
      return NextResponse.redirect(new URL(withBase('/auth/verify-email'), req.url))
    }
  }
}
```

## 🔗 Zapier Webhook Payload

The backend sends this JSON to Zapier:

```json
{
  "email": "user@example.com",
  "verify_link": "https://mywebsite.com/api/auth/verify?token=GENERATED_TOKEN",
  "name": "John Doe"
}
```

## 📧 Zapier → Resend API Configuration

**Zapier Workflow:**
1. **Trigger**: Webhooks by Zapier → Catch Hook
2. **Action**: Webhooks by Zapier → POST Request

**POST Request Configuration:**

**URL:**
```
https://api.resend.com/emails
```

**Method:**
```
POST
```

**Headers:**
```json
{
  "Authorization": "Bearer re_YOUR_RESEND_API_KEY",
  "Content-Type": "application/json"
}
```

**Body (JSON):**
```json
{
  "from": "My App <no-reply@mydomain.com>",
  "to": "{{email}}",
  "subject": "Verify your email",
  "html": "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'><title>Verify Your Email</title></head><body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;'><div style='background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;'><h1 style='color: white; margin: 0;'>Verify Your Email</h1></div><div style='background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;'><p style='font-size: 16px; margin-bottom: 20px;'>Thank you for signing up! Please verify your email address by clicking the button below.</p><div style='text-align: center; margin: 30px 0;'><a href='{{verify_link}}' style='background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;'>Verify Email</a></div><p style='font-size: 14px; color: #666; margin-top: 30px;'>If the button doesn't work, copy and paste this link into your browser:</p><p style='font-size: 12px; color: #999; word-break: break-all;'>{{verify_link}}</p><p style='font-size: 14px; color: #666; margin-top: 30px;'>This link will expire in 24 hours.</p><p style='font-size: 14px; color: #666; margin-top: 20px;'>If you didn't create an account, you can safely ignore this email.</p></div></body></html>"
}
```

## 🔐 Environment Variables

Add to `.env.local`:

```env
# Zapier Webhook URL
ZAPIER_WEBHOOK_URL="https://hooks.zapier.com/hooks/catch/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_KEY"

# Application URL (for verification links)
APP_URL="http://localhost:9003"
NEXT_PUBLIC_APP_URL="http://localhost:9003"
```

## 🧪 Testing

### Test Signup Flow:
```bash
curl -X POST http://localhost:9003/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123",
    "name": "Test User",
    "role": "DEVELOPER"
  }'
```

### Test Zapier Webhook:
```bash
curl -X POST YOUR_ZAPIER_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "verify_link": "https://mywebsite.com/verify?token=test_token",
    "name": "Test User"
  }'
```

### Test Verification:
```
GET http://localhost:9003/api/auth/verify?token=YOUR_TOKEN
```

## ✅ Verification Checklist

- [ ] Set `ZAPIER_WEBHOOK_URL` in environment
- [ ] Create Zapier workflow with webhook trigger
- [ ] Configure Resend API action in Zapier
- [ ] Add Resend API key to Zapier
- [ ] Verify domain in Resend
- [ ] Test webhook with sample data
- [ ] Test signup flow end-to-end
- [ ] Test verification link
- [ ] Test resend functionality
- [ ] Verify middleware blocks unverified users

## 🚀 Production Deployment

1. Update `APP_URL` and `NEXT_PUBLIC_APP_URL` to production domain
2. Update email "from" address in Zapier to production domain
3. Verify domain in Resend
4. Test email delivery in production
5. Monitor Zapier webhook logs
6. Set up error alerts

## 📚 Additional Resources

- [Zapier Documentation](https://zapier.com/apps/webhook/help)
- [Resend API Documentation](https://resend.com/docs/api-reference/emails/send-email)
- See `EMAIL_VERIFICATION_SETUP.md` for detailed setup instructions

