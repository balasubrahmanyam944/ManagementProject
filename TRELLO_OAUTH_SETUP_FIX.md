# Trello OAuth Setup Fix: Invalid return_url Error

## Problem
Error: "Invalid return_url. The return URL should match the application's allowed origins."

This occurs when Trello OAuth callback URL is not properly registered in the Trello app configuration.

## Root Cause
Trello OAuth 1.0a requires that callback URLs (origins) be explicitly allowed in the app settings. Unlike Jira which allows full callback URLs, Trello validates against **origin URLs** (protocol + domain + port).

## Solution

### Method 1: Configure Allowed Origins (For API Key Apps)

#### Step 1: Access Trello API Key Settings
1. Go to https://trello.com/app-key
2. Log in with your Trello account
3. You'll see your API Key displayed

#### Step 2: Configure Allowed Origins

**For IP-based Development:**
Add these origins to your Trello app:
```
https://172.16.34.21:9003
http://172.16.34.21:9003
```

**For Production with Domain:**
```
https://yourdomain.com
```

#### Step 3: Update API Key Information
If you don't see an "Allowed Origins" field on the app-key page, you may need to:

1. Create a new Trello Power-Up at: https://trello.com/power-ups/admin
2. Fill in the details:
   - **Name**: UPMY Integration
   - **Iframe Connector URL**: Can be any valid URL (not used for OAuth)
   - **Author**: Your name/company
   - **Support Contact**: Your email

3. Under "Capabilities" section:
   - Enable "authorization-status"
   - Enable "show-authorization"

4. Under "Allowed Origins", add:
   ```
   https://172.16.34.21:9003
   ```

5. Save the Power-Up

### Method 2: Use Different OAuth Flow (Fallback)

If Trello doesn't support IP addresses in allowed origins, you have two options:

#### Option A: Use Domain with DNS
1. Set up a domain that points to 172.16.34.21
2. Configure SSL certificate for the domain
3. Update allowed origins to use the domain
4. Update environment variables:
   ```env
   NEXT_PUBLIC_APP_URL=https://yourdomain.com:9003
   ```

#### Option B: Use localhost Tunneling (Development Only)
1. Use ngrok or similar tool:
   ```bash
   ngrok http 9003
   ```
2. Get the ngrok URL (e.g., `https://abc123.ngrok.io`)
3. Add this URL to Trello allowed origins
4. Update environment variable:
   ```env
   NEXT_PUBLIC_APP_URL=https://abc123.ngrok.io
   ```

### Method 3: Modify Code to Use Environment Variable

Update the code to be more flexible with the callback URL:

```typescript
// In src/lib/trello-auth.ts

export function getTrelloOAuthRequestTokenUrl() {
  // Use explicit redirect URI from environment if available
  const explicitRedirectUri = process.env.TRELLO_OAUTH_REDIRECT_URI;
  
  if (explicitRedirectUri) {
    console.log('🔍 TRELLO OAUTH URL: Using explicit redirect URI:', explicitRedirectUri);
    return `https://trello.com/1/OAuthGetRequestToken?oauth_callback=${encodeURIComponent(explicitRedirectUri)}`;
  }
  
  // Fallback to computed URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://172.16.34.21:9005/suntechnologies';
  const mainAppUrl = baseUrl.replace(/:\d+.*/, ':9003');
  const redirectUri = `${mainAppUrl}/api/oauth-router/trello/callback`;
  console.log('🔍 TRELLO OAUTH URL: Original URL:', baseUrl);
  console.log('🔍 TRELLO OAUTH URL: Main app URL:', mainAppUrl);
  console.log('🔍 TRELLO OAUTH URL: Redirect URI:', redirectUri);
  
  return `https://trello.com/1/OAuthGetRequestToken?oauth_callback=${encodeURIComponent(redirectUri)}`;
}
```

Then set in your environment:
```env
TRELLO_OAUTH_REDIRECT_URI=https://172.16.34.21:9003/api/oauth-router/trello/callback
```

## Verification Steps

After configuring allowed origins:

1. **Clear Browser Cache**: Trello may cache the error
2. **Restart Your Application**: Ensure new settings are loaded
3. **Test OAuth Flow**:
   - Navigate to: `https://172.16.34.21:9005/suntechnologies/integrations`
   - Click "Connect Trello"
   - You should be redirected to Trello authorization page
   - Check browser console for the actual redirect URI being used

4. **Check Logs**:
   Look for these log lines:
   ```
   🔍 TRELLO OAUTH URL: Redirect URI: https://172.16.34.21:9003/api/oauth-router/trello/callback
   ```
   
   This is the exact URL that needs to be in Trello's allowed origins.

## Common Issues

### Issue 1: IP Address Not Accepted
**Symptom**: Trello doesn't accept IP addresses in allowed origins
**Solution**: Use ngrok or set up a proper domain

### Issue 2: Port Not Matching
**Symptom**: Allowed origin has different port than callback URL
**Solution**: Ensure both use port 9003

### Issue 3: Protocol Mismatch
**Symptom**: Allowed origin uses http:// but callback uses https://
**Solution**: Add both protocols to allowed origins, or ensure consistency

### Issue 4: Trailing Slash
**Symptom**: Allowed origin has trailing slash, callback doesn't (or vice versa)
**Solution**: Remove trailing slashes from both

## Testing Checklist

- [ ] Trello API Key is correct
- [ ] Trello API Secret is correct
- [ ] Allowed origin includes: `https://172.16.34.21:9003`
- [ ] Main app is running on port 9003
- [ ] Environment variable `NEXT_PUBLIC_APP_URL` is set
- [ ] Browser cache cleared
- [ ] Application restarted

## Alternative: Manual Token Generation (Temporary)

For testing purposes, you can generate a manual token:

1. Go to https://trello.com/app-key
2. Click "Token" link under "Developer API Keys"
3. Authorize the token with read/write permissions
4. Copy the generated token
5. Manually insert into database:
   ```javascript
   db.integrations.insertOne({
     userId: ObjectId("your-user-id"),
     type: "TRELLO",
     status: "CONNECTED",
     accessToken: "your-manual-token",
     consumerKey: "your-api-key",
     serverUrl: "https://api.trello.com",
     metadata: {
       scopes: "read,write,account",
       tenant: "suntechnologies"
     },
     expiresAt: new Date("2099-12-31"),
     lastSyncAt: new Date()
   })
   ```

This bypasses OAuth but allows you to test the integration functionality.

## Need More Help?

If the issue persists:
1. Check Trello's developer documentation: https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/
2. Verify your Trello app is not suspended or restricted
3. Try creating a new Trello app from scratch
4. Contact Trello support with your app ID and API key

