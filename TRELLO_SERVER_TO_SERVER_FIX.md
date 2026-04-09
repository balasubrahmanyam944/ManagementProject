# Trello OAuth Server-to-Server Fix

## Problem: User Sees Main Server Login Page

When the user clicked "Connect Trello" on tenant port 9006, their browser was being redirected to the main server (port 9003), and they saw a login page asking for main server credentials.

### What Was Happening (Broken)

```
User's Browser Journey:
1. User at: https://172.16.34.21:9006/google/integrations (logged in to tenant)
2. Clicks "Connect Trello"
3. Browser redirected to: https://172.16.34.21:9003/api/oauth-router/trello/start
   ↑ User sees port 9003 in address bar! ❌
4. Main server shows login page (user not logged in to main server)
5. User confused - why do I need to login again? ❌
```

### Why This Happened

The tenant was using `NextResponse.redirect()` which tells the **user's browser** to navigate to the main server URL. When the browser visits port 9003, the user has no session there (they're only logged into port 9006), so auth middleware shows the login page.

## Solution: Server-to-Server API Call

Instead of redirecting the user's browser to the main server, the **tenant server** makes an internal API call to the main server, gets the Trello authorization URL, then redirects the user directly to Trello.

### How It Works Now (Fixed)

```
User's Browser Journey:
1. User at: https://172.16.34.21:9006/google/integrations (logged in)
2. Clicks "Connect Trello"
3. Tenant server calls main server (behind the scenes) ⚡
4. Main server returns Trello URL (behind the scenes) ⚡
5. User redirected to: https://trello.com/...
   ↑ User NEVER sees port 9003! ✅
6. User authorizes on Trello
7. Trello redirects to: https://172.16.34.21:9003/api/oauth-router/trello/callback
8. Main server processes callback and redirects to: https://172.16.34.21:9006/google/integrations
   ↑ User back at their tenant! ✅
```

**Key Point:** User's browser goes from **9006 → Trello → 9003 (just callback) → 9006**. They never "visit" port 9003 as a page.

## Code Changes

### File: `src/app/api/auth/trello/start/route.ts`

#### Before (Broken)
```typescript
// This redirected the USER'S BROWSER to port 9003
const mainServerUrl = `https://172.16.34.21:9003/api/oauth-router/trello/start?...`;
return NextResponse.redirect(mainServerUrl);  // ❌ Browser visits 9003
```

#### After (Fixed)
```typescript
// This makes a SERVER-TO-SERVER API call
const mainServerUrl = `https://172.16.34.21:9003/api/oauth-router/trello/start?...`;

const response = await fetch(mainServerUrl, {
  method: 'GET',
  redirect: 'manual'  // Don't follow redirects
});

// Main server returns redirect to Trello
const trelloAuthUrl = response.headers.get('location');

// Redirect user DIRECTLY to Trello (skip port 9003)
return NextResponse.redirect(trelloAuthUrl);  // ✅ Browser goes to Trello
```

## Detailed Flow

### Step 1: User Initiates OAuth (Port 9006)
```
User's Browser: https://172.16.34.21:9006/google/api/auth/trello/start
Tenant Server:
  - Validates user session ✅
  - Extracts: tenant='google', port='9006', userId='...'
```

### Step 2: Tenant Calls Main Server (Internal)
```
Tenant Server → Main Server API Call:
  URL: https://172.16.34.21:9003/api/oauth-router/trello/start?tenant=google&port=9006&userId=...
  Method: GET
  Type: Server-to-server (not user's browser)
```

### Step 3: Main Server Processes (Port 9003)
```
Main Server:
  - Receives: tenant='google', port='9006', userId='...'
  - Calls Trello API for request token
  - Stores state in memory
  - Returns redirect to Trello: 307 Location: https://trello.com/...
```

### Step 4: Tenant Gets Trello URL
```
Tenant Server:
  - Receives 307 response from main server
  - Extracts Location header: https://trello.com/...
  - Returns redirect to user's browser
```

### Step 5: User Goes to Trello
```
User's Browser: https://trello.com/1/OAuthAuthorizeToken?oauth_token=...
  - User NEVER saw port 9003! ✅
  - User clicks "Allow"
```

### Step 6: Trello Redirects to Main Server
```
Trello → User's Browser: https://172.16.34.21:9003/api/oauth-router/trello/callback?...
  - This is just a callback endpoint (no UI)
  - Main server processes and redirects to tenant
```

### Step 7: User Returns to Tenant
```
User's Browser: https://172.16.34.21:9006/google/integrations
  - Back where they started! ✅
  - Trello now connected ✅
```

## Key Technical Details

### Using `redirect: 'manual'`
```typescript
const response = await fetch(mainServerUrl, {
  redirect: 'manual'  // Important!
});
```

This tells fetch **not to follow redirects** automatically. Instead, we get the redirect response (307) and can extract the `Location` header ourselves. This lets us redirect the user to Trello without the browser ever visiting the main server.

### Why Server-to-Server Works
```
Browser Redirect (Old):
  User sees every URL in the chain
  User → 9006 → 9003 (login required!) → Trello

Server-to-Server (New):
  User only sees start and end
  User → 9006 → [internal call to 9003] → Trello
```

### SSL Certificate Handling
```typescript
const agent = new https.Agent({
  rejectUnauthorized: false
});
```

Since we're using self-signed certificates for development, we need to disable SSL verification for internal server-to-server calls.

## Testing the Fix

### Expected Behavior

1. **Navigate to tenant**: `https://172.16.34.21:9006/google/integrations`
2. **Click "Connect Trello"**
3. **Browser URL changes to**: `https://trello.com/...` (NOT port 9003!)
4. **No login page shown** ✅
5. **Authorize on Trello**
6. **Return to**: `https://172.16.34.21:9006/google/integrations`

### Expected Logs

**Tenant (9006):**
```
🚀 TENANT TRELLO OAUTH START: ===== STARTING OAUTH FLOW =====
🔍 TENANT TRELLO OAUTH START: Authenticated user: 690491fd...
🔄 TENANT TRELLO OAUTH START: Calling main server API: https://172.16.34.21:9003/api/oauth-router/trello/start?...
🔍 TENANT TRELLO OAUTH START: Main server response status: 307
🔄 TENANT TRELLO OAUTH START: Got Trello auth URL from main server: https://trello.com/...
✅ TENANT TRELLO OAUTH START: Redirecting user to Trello (user never sees port 9003)
```

**Main Server (9003):**
```
🚀 MAIN SERVER TRELLO OAUTH START: ===== STARTING OAUTH FLOW =====
🔍 MAIN SERVER TRELLO OAUTH START: Tenant info from params: { tenant: 'google', port: '9006', userId: '...' }
✅ MAIN SERVER TRELLO OAUTH START: Tenant information stored in main server
🔄 MAIN SERVER TRELLO OAUTH START: Redirecting to Trello authorization URL: https://trello.com/...
```

### What User Sees in Browser Address Bar

```
✅ Step 1: https://172.16.34.21:9006/google/integrations
✅ Step 2: https://trello.com/1/OAuthAuthorizeToken?oauth_token=...
✅ Step 3: https://172.16.34.21:9006/google/integrations

❌ User NEVER sees: https://172.16.34.21:9003/...
❌ User NEVER sees: Login page
```

## Comparison with Previous Approaches

### Approach 1: Direct Browser Redirect (Original - Broken)
```
Tenant → Browser visits 9003 → Shows login ❌
```

### Approach 2: Shared Session (Considered - Not Used)
```
Share NEXTAUTH_SECRET → All containers coupled together ❌
```

### Approach 3: Server-to-Server (Current - Working)
```
Tenant → Internal API call → Get URL → Redirect to Trello ✅
```

## Benefits

1. ✅ **User never sees main server** - stays on tenant port
2. ✅ **No login page confusion** - user only logged in to tenant
3. ✅ **Clean user experience** - seamless OAuth flow
4. ✅ **Secure** - internal API calls only
5. ✅ **Scalable** - works for unlimited tenants

## Same Pattern for Jira?

**No need!** Jira uses OAuth 2.0 which supports the `state` parameter. We can directly redirect users to Jira from tenants without needing the main server to store anything first. The main server only handles the callback.

Trello uses OAuth 1.0a which requires server-side state storage, hence this more complex flow.

## Summary

**Problem:** User's browser was visiting main server (9003) and seeing login page
**Solution:** Server-to-server API call - user's browser never visits main server
**Result:** Seamless OAuth flow - user goes from tenant → Trello → tenant ✅

**Files Changed:** 1 (`src/app/api/auth/trello/start/route.ts`)
**Lines Changed:** ~45
**User Impact:** Critical - enables OAuth without confusion
**Risk:** Low - internal communication only

