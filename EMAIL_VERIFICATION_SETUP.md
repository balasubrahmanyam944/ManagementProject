# Email Verification Setup Guide

This document provides complete instructions for setting up email verification using Zapier and Resend API.

## Architecture Overview

1. **Backend**: Generates verification token and sends data to Zapier webhook
2. **Zapier**: Receives webhook and triggers Resend API email
3. **Resend API**: Sends verification email to user
4. **User**: Clicks verification link to verify email
5. **Backend**: Verifies token and updates user status

## Environment Variables

Add these to your `.env.local` file:

```env
# Zapier Webhook URL (get this from your Zapier workflow)
ZAPIER_WEBHOOK_URL="https://hooks.zapier.com/hooks/catch/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_KEY"

# Application URL (used for verification links)
APP_URL="http://localhost:9003"
NEXT_PUBLIC_APP_URL="http://localhost:9003"

# Resend API Key (for Zapier to use)
# This is configured in Zapier, not in your .env file
RESEND_API_KEY="re_YOUR_RESEND_API_KEY"
```

## Database Schema Updates

The User model now includes:
- `isVerified: boolean` - Email verification status
- `verifyToken?: string` - Verification token
- `verifyTokenExpires?: Date` - Token expiration date

## Zapier Workflow Configuration

### Step 1: Create Zapier Workflow

1. Go to [Zapier](https://zapier.com) and create a new Zap
2. **Trigger**: Select "Webhooks by Zapier" → "Catch Hook"
3. Click "Continue" and copy the webhook URL
4. Add the webhook URL to your `.env.local` as `ZAPIER_WEBHOOK_URL`

### Step 2: Configure Resend API Action

1. **Action**: Select "Webhooks by Zapier" → "POST Request"
2. Configure the POST request:

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

**Data (JSON):**
```json
{
  "from": "My App <no-reply@mydomain.com>",
  "to": "{{email}}",
  "subject": "Verify your email",
  "html": "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'><title>Verify Your Email</title></head><body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;'><div style='background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;'><h1 style='color: white; margin: 0;'>Verify Your Email</h1></div><div style='background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;'><p style='font-size: 16px; margin-bottom: 20px;'>Thank you for signing up! Please verify your email address by clicking the button below.</p><div style='text-align: center; margin: 30px 0;'><a href='{{verify_link}}' style='background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;'>Verify Email</a></div><p style='font-size: 14px; color: #666; margin-top: 30px;'>If the button doesn't work, copy and paste this link into your browser:</p><p style='font-size: 12px; color: #999; word-break: break-all;'>{{verify_link}}</p><p style='font-size: 14px; color: #666; margin-top: 30px;'>This link will expire in 24 hours.</p><p style='font-size: 14px; color: #666; margin-top: 20px;'>If you didn't create an account, you can safely ignore this email.</p></div></body></html>"
}
```

**Important Notes:**
- Replace `re_YOUR_RESEND_API_KEY` with your actual Resend API key
- Replace `no-reply@mydomain.com` with your verified domain email
- The `{{email}}` and `{{verify_link}}` are Zapier placeholders that will be replaced with actual values from the webhook payload

### Step 3: Test the Zap

1. Click "Test" in Zapier
2. Send a test webhook with this payload:
```json
{
  "email": "test@example.com",
  "verify_link": "https://mywebsite.com/verify?token=test_token_123",
  "name": "Test User"
}
```

3. Verify that the email is sent successfully

### Step 4: Turn on the Zap

Once testing is successful, turn on the Zap to activate it.

## Resend API Setup

1. Go to [Resend](https://resend.com) and create an account
2. Verify your domain (or use their test domain for development)
3. Get your API key from the dashboard
4. Add the API key to your Zapier workflow (in the Authorization header)

## Email HTML Template

The email template includes:
- Professional styling with gradient header
- Clear call-to-action button
- Fallback text link
- Expiration notice
- Mobile-responsive design

You can customize the HTML in the Zapier workflow configuration.

## API Endpoints

### POST /api/auth/register
Creates a new user and sends verification email.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe",
  "role": "DEVELOPER"
}
```

**Response:**
```json
{
  "message": "User created successfully. Please check your email to verify your account.",
  "user": {
    "id": "...",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "DEVELOPER",
    "isVerified": false
  }
}
```

### GET /api/auth/verify?token=...
Verifies user email and redirects to dashboard.

**Query Parameters:**
- `token` (required): Verification token

**Response:**
- Redirects to `/dashboard?verified=true` on success
- Redirects to `/auth/verify-email?error=...` on failure

### POST /api/auth/verify
Resends verification email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "message": "Verification email sent successfully."
}
```

## Frontend Pages

### /auth/verify-email
Displays verification status and allows resending verification emails.

**Features:**
- Shows verification status
- Resend verification email button
- Error messages for invalid/expired tokens
- Success message after verification

## Middleware Protection

The middleware automatically:
- Blocks unverified users from accessing protected routes
- Redirects unverified users to `/auth/verify-email`
- Allows access to public routes and verification pages

## Token Generation

- Tokens are generated using `crypto.randomBytes(32).toString('base64url')`
- Tokens expire after 24 hours
- Tokens are cleared after successful verification

## Security Considerations

1. **Token Security**: Tokens are cryptographically secure random strings
2. **Token Expiration**: Tokens expire after 24 hours
3. **One-time Use**: Tokens are cleared after verification
4. **Rate Limiting**: Consider adding rate limiting to resend endpoint
5. **Email Validation**: Email format is validated on signup

## Testing

1. **Signup Flow:**
   - Register a new user
   - Check email inbox for verification link
   - Click verification link
   - Verify redirect to dashboard

2. **Resend Flow:**
   - Go to `/auth/verify-email`
   - Click "Resend Verification Email"
   - Check email for new verification link

3. **Expired Token:**
   - Try to verify with an expired token
   - Should redirect to verify-email page with error

4. **Already Verified:**
   - Try to verify an already verified account
   - Should redirect to dashboard

## Troubleshooting

### Email not received
1. Check spam folder
2. Verify Zapier webhook is active
3. Check Zapier logs for errors
4. Verify Resend API key is correct
5. Check Resend dashboard for email status

### Verification link not working
1. Check token expiration (24 hours)
2. Verify token format in database
3. Check application URL in environment variables
4. Verify middleware is not blocking the route

### Zapier webhook not triggering
1. Verify webhook URL is correct in `.env.local`
2. Check Zapier workflow is turned on
3. Test webhook manually using curl:
```bash
curl -X POST YOUR_ZAPIER_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","verify_link":"https://example.com/verify?token=test"}'
```

## Production Checklist

- [ ] Set `ZAPIER_WEBHOOK_URL` in production environment
- [ ] Set `APP_URL` and `NEXT_PUBLIC_APP_URL` to production domain
- [ ] Verify domain in Resend
- [ ] Update email "from" address in Zapier to production domain
- [ ] Test email delivery in production
- [ ] Monitor Zapier webhook logs
- [ ] Set up error alerts for failed verifications

