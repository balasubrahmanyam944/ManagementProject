# Slack OAuth Migration to Centralized Pattern

## Overview

Slack OAuth has been successfully migrated to use the same centralized OAuth router pattern as Jira and Trello. This enables unlimited tenants to connect to Slack using a single callback URL registered on the main server (port 9003).

## Migration Date
November 2025

## Problem Solved

### Before Migration (Old Pattern)
```
Tenant 1 (9005) → Slack → Tenant 1 (9005)
  Callback: https://172.16.34.21:9005/suntechnologies/api/auth/slack/callback

Tenant 2 (9006) → Slack → Tenant 2 (9006)
  Callback: https://172.16.34.21:9006/google/api/auth/slack/callback
```

**Issues:**
- ❌ Each tenant required separate callback URL in Slack app
- ❌ Not scalable (manual configuration for each new tenant)
- ❌ State stored in cookies (cross-domain issues)

### After Migration (Centralized Pattern)
```
Tenant 1 (9005) → Main (9003) → Slack → Main (9003) → Tenant 1 (9005)
Tenant 2 (9006) → Main (9003) → Slack → Main (9003) → Tenant 2 (9006)
                    ↓                      ↓
        Single Callback URL: https://172.16.34.21:9003/api/oauth-router/slack/callback
```

**Benefits:**
- ✅ Single callback URL for ALL tenants
- ✅ Add unlimited tenants without Slack app changes
- ✅ State passed in URL (OAuth 2.0 standard)
- ✅ Consistent with Jira/Trello architecture

## Files Created

### 1. `src/app/api/oauth-router/slack/start/route.ts`
**Purpose**: Centralized OAuth start handler on main server

**Key Features:**
- Receives tenant, port, and userId as query parameters from tenant
- Generates OAuth state containing tenant information
- Uses Slack OAuth 2.0 (supports state parameter in URL)
- Redirects user to Slack authorization
- Returns 307 redirect that tenant intercepts

**State Structure:**
```typescript
{
  tenant: 'google',
  port: '9006',
  userId: '690491fd...',
  nonce: 'random-hex',
  timestamp: 1234567890
}
```

### 2. `src/app/api/oauth-router/slack/callback/route.ts`
**Purpose**: Centralized OAuth callback handler on main server

**Key Features:**
- Receives callback from Slack with code and state
- Parses state to extract tenant information
- Exchanges authorization code for access token
- Forwards integration data to tenant via POST request
- Redirects user back to tenant integrations page

**Integration Data Forwarded:**
```typescript
{
  tenant,
  port,
  userId,
  accessToken,
  refreshToken,
  expiresAt,
  teamId,
  teamName,
  webhookUrl,
  metadata: { scope, authed_user, tenant }
}
```

### 3. `src/app/[tenant]/api/oauth-callback/slack/route.ts`
**Purpose**: Tenant receives and stores forwarded integration data

**Key Features:**
- Receives POST request from main server
- Stores integration in tenant's database
- Fetches and stores Slack channels as projects
- Returns success response to main server

## Files Modified

### 1. `src/app/api/auth/slack/start/route.ts`
**Before** (Old Pattern):
```typescript
// Tenant handled OAuth locally
const state = randomBytes(32).toString('hex');
cookieStore.set('slack_oauth_state', state);  // Cookie-based state

const redirectUri = `${NEXTAUTH_URL}/api/auth/slack/callback`;  // Tenant callback
return NextResponse.redirect(slackUrl);  // Direct redirect
```

**After** (Centralized Pattern):
```typescript
// Tenant makes server-to-server call to main server
const mainServerUrl = `https://172.16.34.21:9003/api/oauth-router/slack/start?tenant=${tenant}&port=${port}&userId=${userId}`;

const response = await fetch(mainServerUrl, { redirect: 'manual' });
const slackUrl = response.headers.get('location');

return NextResponse.redirect(slackUrl);  // Redirect to Slack (user never sees port 9003)
```

**Key Changes:**
- Removed cookie-based state storage
- Added server-to-server API call to main server
- Extracts Slack URL from main server response
- User's browser never visits port 9003

### 2. `src/app/api/auth/slack/callback/route.ts`
**Status**: Old callback route still exists but is no longer used for multi-tenant OAuth

**Note**: Could be removed or kept for backward compatibility with non-tenant setups

## OAuth Flow Comparison

### Jira (OAuth 2.0 - Similar to Slack)
```
Tenant → Main (state in URL) → Jira → Main → Tenant
```
- Uses OAuth 2.0 with state parameter
- State passed in URL (no server-side storage needed)

### Trello (OAuth 1.0a - Different)
```
Tenant → Main (state in file) → Trello → Main → Tenant
```
- Uses OAuth 1.0a (no state parameter support)
- State stored in temporary files on main server

### Slack (OAuth 2.0 - Now Centralized)
```
Tenant → Main (state in URL) → Slack → Main → Tenant
```
- Uses OAuth 2.0 with state parameter
- State passed in URL (same as Jira)
- No server-side storage needed

## Complete OAuth Flow

### Step 1: User Initiates OAuth (Tenant Port 9006)
```
User's Browser: https://172.16.34.21:9006/google/integrations
User clicks: "Connect Slack"
  ↓
Tenant Server:
  - Validates user session ✅
  - Extracts: tenant='google', port='9006', userId='...'
  - Makes API call to main server
```

### Step 2: Tenant Calls Main Server (Server-to-Server)
```
Tenant Server → Main Server:
  URL: https://172.16.34.21:9003/api/oauth-router/slack/start?tenant=google&port=9006&userId=...
  Method: GET
  Type: Internal API call (not user's browser)
```

### Step 3: Main Server Generates OAuth URL
```
Main Server:
  - Receives: tenant='google', port='9006', userId='...'
  - Creates state: { tenant, port, userId, nonce, timestamp }
  - Builds Slack auth URL with state
  - Returns 307 redirect to Slack
```

### Step 4: Tenant Gets Slack URL
```
Tenant Server:
  - Receives 307 from main server
  - Extracts Location header: https://slack.com/oauth/v2/authorize?...
  - Redirects user's browser to Slack
```

### Step 5: User Authorizes on Slack
```
User's Browser: https://slack.com/oauth/v2/authorize?...
  - User NEVER saw port 9003! ✅
  - User clicks "Allow"
  - Slack redirects to main server callback
```

### Step 6: Slack Redirects to Main Server
```
Slack → User's Browser: https://172.16.34.21:9003/api/oauth-router/slack/callback?code=...&state=...
Main Server:
  - Parses state to get tenant info
  - Exchanges code for access token
  - Forwards data to tenant
```

### Step 7: Main Server Forwards to Tenant
```
Main Server → Tenant Server:
  URL: https://172.16.34.21:9006/google/api/oauth-callback/slack
  Method: POST
  Body: { tenant, port, userId, accessToken, ... }
```

### Step 8: Tenant Stores Integration
```
Tenant Server:
  - Stores integration in tenant's database
  - Fetches Slack channels
  - Returns success to main server
```

### Step 9: User Returns to Tenant
```
User's Browser: https://172.16.34.21:9006/google/integrations?slack=connected
  - Back where they started! ✅
  - Slack now connected ✅
```

## Slack App Configuration

### Single Callback URL for All Tenants

**In Slack App Settings:**
1. Go to: https://api.slack.com/apps/YOUR_APP_ID
2. Navigate to: **OAuth & Permissions**
3. Under **Redirect URLs**, add:
   ```
   https://172.16.34.21:9003/api/oauth-router/slack/callback
   ```
4. **Remove** old tenant-specific URLs:
   - ~~https://172.16.34.21:9005/suntechnologies/api/auth/slack/callback~~
   - ~~https://172.16.34.21:9006/google/api/auth/slack/callback~~

**Result**: One URL serves all tenants! 🎉

### Required Scopes (Unchanged)

**Bot Token Scopes:**
- `app_mentions:read`
- `channels:read`
- `channels:join`
- `chat:write`
- `chat:write.public`
- `incoming-webhook`
- `team:read`
- `channels:history`
- `groups:history`

**User Token Scopes:**
- `channels:history`
- `groups:history`
- `channels:read`
- `groups:read`
- `users:read`

## Environment Variables

### Main Server (Port 9003)
```env
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
NEXT_PUBLIC_APP_URL=https://172.16.34.21:9003
```

### Tenant Servers (Ports 9005, 9006, etc.)
```env
SLACK_CLIENT_ID=your-slack-client-id  # Same as main server
SLACK_CLIENT_SECRET=your-slack-client-secret  # Same as main server
NEXT_PUBLIC_APP_URL=https://172.16.34.21:9006/google
NEXT_PUBLIC_TENANT_BASEPATH=/google
PORT=9006
MONGO_URI=mongodb://mongo-google:27017/upmy-google
```

## Testing the Migration

### Test Checklist

- [ ] Update Slack app callback URL to main server (9003)
- [ ] Restart main server (port 9003)
- [ ] Restart tenant servers (ports 9006, etc.)
- [ ] Clear browser cache

### Test from Tenant 1 (Port 9006)
1. Navigate to: `https://172.16.34.21:9006/google/integrations`
2. Click "Connect Slack"
3. Observe URL changes: `9006 → slack.com → 9006` (NOT 9003!)
4. Authorize on Slack
5. Should return to: `https://172.16.34.21:9006/google/integrations?slack=connected`
6. Verify Slack shows as "Connected"
7. Check channels are synced

### Test from Tenant 2 (Port 9007)
1. Navigate to: `https://172.16.34.21:9007/facebook/integrations`
2. Repeat same steps
3. Should work independently from Tenant 1

### Expected Logs

**Tenant Server:**
```
🚀 TENANT SLACK OAUTH START: ===== STARTING OAUTH FLOW =====
🔍 TENANT SLACK OAUTH START: Tenant info: { tenant: 'google', port: '9006', userId: '...' }
🔄 TENANT SLACK OAUTH START: Calling main server API: https://172.16.34.21:9003/...
🔍 TENANT SLACK OAUTH START: Main server response status: 307
🔄 TENANT SLACK OAUTH START: Got Slack auth URL from main server: https://slack.com/...
✅ TENANT SLACK OAUTH START: Redirecting user to Slack (user never sees port 9003)
```

**Main Server:**
```
🚀 MAIN SERVER SLACK OAUTH START: ===== STARTING OAUTH FLOW =====
🔍 MAIN SERVER SLACK OAUTH START: Tenant info from params: { tenant: 'google', port: '9006', userId: '...' }
🔄 MAIN SERVER SLACK OAUTH START: Redirecting to Slack authorization URL: https://slack.com/...
```

Later, after authorization:
```
🚀 CENTRALIZED SLACK OAUTH CALLBACK: ===== STARTING CALLBACK PROCESS =====
🔍 CENTRALIZED SLACK OAUTH CALLBACK: Extracted tenant info: { tenant: 'google', port: '9006', userId: '...' }
✅ CENTRALIZED SLACK OAUTH CALLBACK: Successfully exchanged code for token
🔄 CENTRALIZED SLACK OAUTH CALLBACK: Forwarding to tenant at https://172.16.34.21:9006/google/api/oauth-callback/slack
✅ CENTRALIZED SLACK OAUTH CALLBACK: Successfully forwarded to tenant
```

## Benefits of Migration

### 1. Scalability
- ✅ Add unlimited tenants without Slack app changes
- ✅ No manual configuration per tenant
- ✅ Centralized OAuth management

### 2. Consistency
- ✅ Same pattern as Jira and Trello
- ✅ Unified architecture across all integrations
- ✅ Easier maintenance

### 3. User Experience
- ✅ User never sees main server (port 9003)
- ✅ Seamless OAuth flow
- ✅ Returns to correct tenant port

### 4. Security
- ✅ State validation in OAuth 2.0
- ✅ Server-to-server communication for sensitive data
- ✅ No cookie-based state storage

## Rollback Plan

If issues arise, you can temporarily revert:

1. **Update Slack App**: Add tenant-specific callback URLs
   ```
   https://172.16.34.21:9006/google/api/auth/slack/callback
   ```

2. **Revert Code**: Use old implementation in `src/app/api/auth/slack/callback/route.ts`

3. **Remove Centralized Routes**: Delete `/api/oauth-router/slack/` routes

## Future Enhancements

### 1. Support for Slack Bot Events
Implement centralized webhook handler:
```
https://172.16.34.21:9003/api/webhooks/slack
  ↓
Routes events to correct tenant
```

### 2. Slack App Directory Distribution
Use centralized pattern for multi-workspace Slack app distribution

### 3. Analytics
Track OAuth success rates per tenant from centralized handler

## Comparison with Other Integrations

| Integration | OAuth Version | State Storage | Centralized | Callback URL |
|-------------|--------------|---------------|-------------|--------------|
| Jira | OAuth 2.0 | URL parameter | ✅ Yes | `9003/api/oauth-router/jira/callback` |
| Trello | OAuth 1.0a | File storage | ✅ Yes | `9003/api/oauth-router/trello/callback` |
| Slack | OAuth 2.0 | URL parameter | ✅ Yes | `9003/api/oauth-router/slack/callback` |
| TestRail | Token-based | N/A | ❌ No | N/A (direct token) |

## Summary

**Status**: ✅ Migration Complete
**Integrations Centralized**: 3/4 (Jira, Trello, Slack)
**Single Callback URLs**: 3 (one per integration)
**Tenants Supported**: Unlimited ∞
**Manual Configuration Required**: None for new tenants

**Key Achievement**: All OAuth-based integrations now use the unified centralized router pattern, enabling infinite scalability without provider app reconfiguration! 🚀

