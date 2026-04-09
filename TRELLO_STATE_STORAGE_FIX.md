# Critical Fix: Trello OAuth State Storage Across Containers

## Problem Identified

### Error Message
```
❌ TRELLO OAUTH STATE: State not found for oauth_token: ba773671c912a873c52364c0695624b9
Error: OAuth state not found or expired
```

### Root Cause

The OAuth state was being stored in the **tenant container's memory** (port 9006), but the OAuth callback was handled by the **main server container** (port 9003). These are **separate Node.js processes with independent memory spaces**.

**What Happened:**
1. User started OAuth from **Tenant (9006)**
2. Tenant stored state in its **own memory**: `oauth_token: 0202...`
3. Trello redirected to **Main Server (9003)** with a new token: `oauth_token: ba773...`
4. Main Server looked in its **own memory**: ❌ Not found!

**Visual Representation:**
```
┌─────────────────────────┐     ┌─────────────────────────┐
│  Tenant Container 9006  │     │ Main Server Container   │
│                         │     │       9003              │
├─────────────────────────┤     ├─────────────────────────┤
│ Memory Space A          │     │ Memory Space B          │
│                         │     │                         │
│ oauthStateStore Map:    │     │ oauthStateStore Map:    │
│   └─ token: 0202...  ✅ │     │   └─ (empty!)        ❌ │
│                         │     │                         │
│ Stores state here ↑     │     │ Looks for state here ↑  │
└─────────────────────────┘     └─────────────────────────┘
        ISOLATED                        ISOLATED
```

## Solution: Centralize OAuth Start in Main Server

Instead of storing state in the tenant, **all OAuth flows now start from the main server**.

### New Flow

```
Step 1: User clicks "Connect Trello" on Tenant (9006)
  ↓
Step 2: Tenant forwards to Main Server
  URL: https://172.16.34.21:9003/api/oauth-router/trello/start?tenant=google&port=9006
  ↓
Step 3: Main Server starts OAuth & stores state IN ITS OWN MEMORY ✅
  ↓
Step 4: User authorizes on Trello
  ↓
Step 5: Trello redirects to Main Server
  ↓
Step 6: Main Server finds state IN ITS OWN MEMORY ✅
  ↓
Step 7: Main Server forwards data to tenant & redirects user back
```

## Files Changed

### 1. NEW FILE: `src/app/api/oauth-router/trello/start/route.ts`

**Purpose**: Centralized OAuth start handler on main server

**Key Features:**
- Receives `tenant` and `port` as query parameters
- Gets request token from Trello
- **Stores state in main server memory** ✅
- Redirects user to Trello authorization

**Example Request:**
```
GET https://172.16.34.21:9003/api/oauth-router/trello/start?tenant=google&port=9006
```

**Logs to Look For:**
```
🚀 MAIN SERVER TRELLO OAUTH START: ===== STARTING OAUTH FLOW =====
🔍 MAIN SERVER TRELLO OAUTH START: Tenant info from params: { tenant: 'google', port: '9006', userId: '...' }
🔄 MAIN SERVER TRELLO OAUTH START: Storing tenant information in MAIN SERVER memory...
✅ MAIN SERVER TRELLO OAUTH START: Tenant information stored in main server
```

### 2. MODIFIED: `src/app/api/auth/trello/start/route.ts`

**Previous Behavior:**
- Tenant handled OAuth start locally
- Stored state in tenant's memory ❌

**New Behavior:**
- Tenant extracts tenant info (name, port)
- **Forwards user to main server** with tenant info
- Main server handles everything

**Example Redirect:**
```
FROM: https://172.16.34.21:9006/google/api/auth/trello/start
TO:   https://172.16.34.21:9003/api/oauth-router/trello/start?tenant=google&port=9006
```

**Logs to Look For:**
```
🚀 TENANT TRELLO OAUTH START: ===== FORWARDING TO MAIN SERVER =====
🔍 TENANT TRELLO OAUTH START: Tenant info: { tenant: 'google', port: '9006', userId: '...' }
🔄 TENANT TRELLO OAUTH START: Forwarding to main server: https://172.16.34.21:9003/api/oauth-router/trello/start?tenant=google&port=9006
```

## Complete OAuth Flow

### Step-by-Step with Ports

```
1. User Access
   URL: https://172.16.34.21:9006/google/integrations
   User clicks: "Connect Trello"

2. Tenant OAuth Start (Port 9006)
   URL: https://172.16.34.21:9006/google/api/auth/trello/start
   Action: Extracts { tenant: 'google', port: '9006' }
   Redirects to: https://172.16.34.21:9003/api/oauth-router/trello/start?tenant=google&port=9006

3. Main Server OAuth Start (Port 9003)
   URL: https://172.16.34.21:9003/api/oauth-router/trello/start?tenant=google&port=9006
   Action: 
     - Calls Trello API for request token
     - Receives: oauth_token, oauth_token_secret
     - STORES in main server memory: { tenant, port, userId, requestTokenSecret }
   Redirects to: https://trello.com/1/OAuthAuthorizeToken?oauth_token=...

4. Trello Authorization
   URL: https://trello.com/1/OAuthAuthorizeToken?oauth_token=...
   User clicks: "Allow"
   Trello redirects to: https://172.16.34.21:9003/api/oauth-router/trello/callback?oauth_token=...&oauth_verifier=...

5. Main Server OAuth Callback (Port 9003)
   URL: https://172.16.34.21:9003/api/oauth-router/trello/callback?oauth_token=...&oauth_verifier=...
   Action:
     - RETRIEVES state from main server memory ✅
     - Exchanges token with Trello
     - Forwards integration data to tenant
   Redirects to: https://172.16.34.21:9006/google/integrations ✅

6. User Returns to Tenant (Port 9006)
   URL: https://172.16.34.21:9006/google/integrations
   Status: Trello Connected ✅
```

## Why This Fix Works

### Before (Broken)
```
Tenant stores state → Trello callback → Main server looks for state → ❌ Not found
```

### After (Fixed)
```
Main server stores state → Trello callback → Main server looks for state → ✅ Found!
```

**Key Principle:** The container that stores the state must be the same container that retrieves it.

## Testing the Fix

### Test Steps

1. **Restart All Applications**
   ```bash
   # Stop all containers
   docker-compose down
   
   # Start again
   docker-compose up -d
   
   # Or restart main server
   cd /path/to/main-server
   npm run dev
   ```

2. **Clear Browser Cache** (important!)
   - Ctrl+Shift+Delete
   - Or use Incognito/Private window

3. **Test OAuth Flow from Tenant 9006**
   - Navigate to: `https://172.16.34.21:9006/google/integrations`
   - Click "Connect Trello"
   - Should redirect through: 9006 → 9003 → Trello → 9003 → 9006
   - Complete authorization
   - Should return to: `https://172.16.34.21:9006/google/integrations`

4. **Check Logs**

   **Tenant (9006) logs:**
   ```
   🚀 TENANT TRELLO OAUTH START: ===== FORWARDING TO MAIN SERVER =====
   🔄 TENANT TRELLO OAUTH START: Forwarding to main server: https://172.16.34.21:9003/api/oauth-router/trello/start?tenant=google&port=9006
   ```

   **Main Server (9003) logs:**
   ```
   🚀 MAIN SERVER TRELLO OAUTH START: ===== STARTING OAUTH FLOW =====
   🔍 MAIN SERVER TRELLO OAUTH START: Tenant info from params: { tenant: 'google', port: '9006', ... }
   ✅ MAIN SERVER TRELLO OAUTH START: Tenant information stored in main server
   ```

   Later:
   ```
   🚀 CENTRALIZED TRELLO OAUTH CALLBACK: ===== STARTING CALLBACK PROCESS =====
   🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Parsing state from stored request token...
   🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Successfully parsed tenant info: { tenant: 'google', port: '9006', ... }
   ✅ CENTRALIZED TRELLO OAUTH CALLBACK: Successfully exchanged token
   🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Redirecting to tenant integrations page: https://172.16.34.21:9006/google/integrations
   ```

### Verification Checklist

- [ ] User starts OAuth from tenant port (e.g., 9006)
- [ ] Tenant logs show "FORWARDING TO MAIN SERVER"
- [ ] Main server logs show "STARTING OAUTH FLOW"
- [ ] Main server logs show "Tenant info from params" with correct port
- [ ] User authorizes on Trello
- [ ] Main server logs show "Successfully parsed tenant info"
- [ ] No "State not found" errors
- [ ] User redirects back to correct tenant port
- [ ] Integration shows as "Connected"
- [ ] Boards are synced

## Comparison with Jira

### Jira OAuth (Already Correct)
Jira uses OAuth 2.0 which allows passing `state` parameter in the URL. The state is automatically passed back by Jira, so no server-side storage is needed.

### Trello OAuth (Now Fixed)
Trello uses OAuth 1.0a which doesn't support state parameters. We need server-side storage, which **must be in the main server** for multi-tenant architecture.

## Production Recommendations

For production deployments, replace the in-memory Map with **Redis**:

```typescript
// src/lib/cache/redis.ts
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL
});

export async function storeTrelloOAuthState(
  oauth_token: string,
  tenant: string,
  port: string,
  userId: string,
  requestTokenSecret: string
) {
  const state = { tenant, port, userId, requestTokenSecret, timestamp: Date.now() };
  
  // Store in Redis with 10-minute expiration
  await redis.setEx(
    `trello_oauth:${oauth_token}`,
    600,
    JSON.stringify(state)
  );
}

export async function parseTrelloOAuthState(oauth_token: string) {
  const data = await redis.get(`trello_oauth:${oauth_token}`);
  if (!data) throw new Error('OAuth state not found or expired');
  
  // Delete after retrieval (one-time use)
  await redis.del(`trello_oauth:${oauth_token}`);
  
  return JSON.parse(data);
}
```

**Benefits of Redis:**
- ✅ Shared across all containers
- ✅ Persists across restarts
- ✅ Built-in expiration
- ✅ Scales horizontally

## Summary

**Problem:** OAuth state stored in tenant memory, but callback handled by main server
**Solution:** OAuth start moved to main server, state stored in main server memory
**Result:** Same container stores and retrieves state = OAuth works! ✅

**Status:** ✅ Fixed and ready for testing
**Impact:** Critical (blocks all Trello OAuth)
**Risk:** Low (follows same pattern as other OAuth flows)

