# Email Verification Troubleshooting Guide

## Issue: Not Receiving Verification Email

### 1. Check Environment Variables

Make sure `ZAPIER_WEBHOOK_URL` is set in your `.env.local` file:

```env
ZAPIER_WEBHOOK_URL="https://hooks.zapier.com/hooks/catch/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_KEY"
```

**To verify:**
- Check server logs for: `ZAPIER_WEBHOOK_URL is not configured`
- If you see this warning, the environment variable is not set

### 2. Check Server Logs

After signup, check your server console for these log messages:

**Success:**
```
📧 Sending verification email: { email: '...', verifyLink: '...', webhookUrl: 'configured' }
📤 Sending webhook to Zapier: { url: '...', payload: {...} }
📥 Zapier webhook response: { status: 200, ... }
✅ Verification email sent via Zapier webhook successfully
```

**Failure:**
```
❌ Zapier webhook URL is not configured
❌ Zapier webhook failed: 400 Bad Request
❌ Error sending Zapier webhook: ...
```

### 3. Verify Zapier Webhook is Active

1. Go to [Zapier Dashboard](https://zapier.com/app/zaps)
2. Find your verification email Zap
3. Make sure it's **turned ON** (green toggle)
4. Check the Zap history for recent webhook triggers

### 4. Test Zapier Webhook Manually

Test your webhook directly using curl:

```bash
curl -X POST YOUR_ZAPIER_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "verify_link": "https://mywebsite.com/verify?token=test123",
    "name": "Test User"
  }'
```

**Expected response:** Should return 200 OK

### 5. Check Resend API Configuration in Zapier

1. Open your Zap in Zapier
2. Check the Resend API action step
3. Verify:
   - API key is set correctly
   - "from" email address is valid
   - Email template includes `{{email}}` and `{{verify_link}}` placeholders

### 6. Check Spam Folder

- Verification emails might be in spam/junk folder
- Check all email folders including "Promotions" in Gmail

## Issue: Not Redirecting to Verify-Email Page

### 1. Check if You're on a Tenant

The verify-email page only shows for tenants. Verify:

```bash
# Check environment variable
echo $NEXT_PUBLIC_TENANT_BASEPATH

# Should output something like: /suntechnologies
# If empty, you're on the parent app (no verification required)
```

### 2. Check Registration Response

After signup, the response should include:

```json
{
  "message": "User created successfully. Please check your email to verify your account.",
  "user": {
    "isVerified": false
  }
}
```

If `isVerified: false` and you're on a tenant, you should be redirected to verify-email page.

### 3. Check Browser Console

Open browser DevTools (F12) and check:
- Network tab: Look for `/api/auth/register` request
- Console tab: Check for any JavaScript errors
- Application tab: Check if redirect is happening

## Issue: Verification Link Not Working

### 1. Check Token in Database

Query your MongoDB database:

```javascript
db.users.findOne({ email: "user@example.com" }, { verifyToken: 1, verifyTokenExpires: 1, isVerified: 1 })
```

**Check:**
- `verifyToken` exists and matches the token in the link
- `verifyTokenExpires` is in the future
- `isVerified` is `false`

### 2. Check Verification Link Format

The link should be:
```
https://yourdomain.com/api/auth/verify?token=VERIFICATION_TOKEN
```

**Common issues:**
- Missing `?token=` parameter
- Token is URL-encoded incorrectly
- Base path missing in link

### 3. Check Server Logs

When clicking verification link, check logs for:
```
Verification error: ...
```

## Quick Debug Checklist

- [ ] `ZAPIER_WEBHOOK_URL` is set in `.env.local`
- [ ] Zapier Zap is turned ON
- [ ] Resend API key is configured in Zapier
- [ ] Email domain is verified in Resend
- [ ] Server logs show webhook being sent
- [ ] Zapier shows webhook received in history
- [ ] Resend shows email sent in dashboard
- [ ] Checked spam folder
- [ ] Verification token exists in database
- [ ] Token hasn't expired (24 hours)

## Common Error Messages

### "Zapier webhook URL is not configured"
**Solution:** Set `ZAPIER_WEBHOOK_URL` in `.env.local` and restart server

### "Zapier webhook failed: 400 Bad Request"
**Solution:** Check Zapier webhook URL is correct and Zap is active

### "Zapier webhook failed: 404 Not Found"
**Solution:** Webhook URL is incorrect or Zap has been deleted

### "Error sending Zapier webhook: Network error"
**Solution:** Check internet connection and Zapier service status

## Testing Steps

1. **Test Signup:**
   ```bash
   curl -X POST http://localhost:9003/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@tenant.com",
       "password": "Test1234",
       "name": "Test User",
       "role": "DEVELOPER"
     }'
   ```

2. **Check Logs:** Look for verification email logs

3. **Check Database:** Verify user has `verifyToken` and `isVerified: false`

4. **Check Zapier:** Verify webhook was received

5. **Check Email:** Look for verification email

6. **Test Verification:** Click link and verify redirect works

## Still Not Working?

1. Check all server logs for errors
2. Verify Zapier Zap is configured correctly
3. Test webhook manually with curl
4. Check Resend API dashboard for email status
5. Verify environment variables are loaded correctly

