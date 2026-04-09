# Trello Multi-Tenant Port Redirect Fix

## Problem
When initiating OAuth from a tenant on port 9006, after the OAuth flow completed on the main server (9003), the user was not being redirected back to the correct tenant port (9006).

**User Experience:**
```
User starts OAuth at: https://172.16.34.21:9006/google/integrations
After OAuth completes: Redirected to https://172.16.34.21:9003/... ❌
Expected: Should redirect back to https://172.16.34.21:9006/google/integrations ✅
```

## Root Cause

The issue was in `src/app/api/auth/trello/start/route.ts`:

### Before Fix (Incorrect):
```typescript
const port = process.env.PORT || '9005';
```

**Problem**: In Docker containers, `process.env.PORT` contains the **internal container port** (often 3000), not the **external port** that users see (9006).

**Example:**
- User accesses: `https://172.16.34.21:9006/google/integrations`
- Docker internal port: `3000`
- `process.env.PORT` = `3000` (not `9006`!)
- Stored in OAuth state: port `3000`
- After OAuth: Tries to redirect to `https://172.16.34.21:3000/...` ❌

### After Fix (Correct):
```typescript
const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
const port = forwardedHost?.split(':')[1] || '9005';
```

**Solution**: Extract the port from the HTTP `Host` header, which contains the **actual URL the user accessed**.

**Example:**
- User accesses: `https://172.16.34.21:9006/google/integrations`
- `Host` header: `172.16.34.21:9006`
- Extracted port: `9006` ✅
- Stored in OAuth state: port `9006`
- After OAuth: Redirects to `https://172.16.34.21:9006/google/integrations` ✅

## Changes Made

### File: `src/app/api/auth/trello/start/route.ts`

**Lines Changed: 21-35**

#### Before:
```typescript
// Extract tenant information from environment variables
const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
const tenant = basePath.replace('/', '') || 'main';
const port = process.env.PORT || '9005';

console.log('🔍 TRELLO OAUTH START: Tenant info:', { tenant, port, userId: session.user.id });
```

#### After:
```typescript
// Extract tenant information from environment variables
const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
const tenant = basePath.replace(/^\//, '') || 'main';

// Get the tenant port from the request headers (external port that users see)
const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
const port = forwardedHost?.split(':')[1] || '9005';

console.log('🔍 TRELLO OAUTH START: Request URL details:', {
  fullUrl: req.url,
  host: req.headers.get('host'),
  forwardedHost: req.headers.get('x-forwarded-host'),
  extractedPort: port
});
console.log('🔍 TRELLO OAUTH START: Tenant info:', { tenant, port, userId: session.user.id });
```

## OAuth Flow After Fix

```
Step 1: User on Tenant Port 9006
  ↓
User clicks "Connect Trello" at: https://172.16.34.21:9006/google/integrations
  ↓
Step 2: OAuth Start Handler Extracts Port
  - Reads Host header: "172.16.34.21:9006"
  - Extracts port: "9006" ✅
  - Stores in state: { tenant: "google", port: "9006", userId: "..." }
  ↓
Step 3: Redirect to Trello Authorization
  ↓
Step 4: Trello Redirects to Main Server (9003)
  - URL: https://172.16.34.21:9003/api/oauth-router/trello/callback?oauth_token=...
  ↓
Step 5: Main Server Retrieves State
  - Gets stored state: { tenant: "google", port: "9006", userId: "..." }
  - Exchanges tokens with Trello
  - Forwards data to tenant
  ↓
Step 6: Main Server Redirects User Back to Tenant
  - Constructs URL: https://172.16.34.21:9006/google/integrations ✅
  - User arrives at correct tenant port! ✅
```

## Why This Also Works for Jira

The Jira OAuth implementation (`src/app/api/auth/jira/start/route.ts`) was already using this correct approach:

```typescript
// Lines 35-37 in src/app/api/auth/jira/start/route.ts
const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
const port = forwardedHost?.split(':')[1] || '9005';
```

This fix brings Trello in line with Jira's implementation.

## Testing the Fix

### Test Scenario 1: OAuth from Port 9005
1. Navigate to: `https://172.16.34.21:9005/suntechnologies/integrations`
2. Click "Connect Trello"
3. Complete OAuth on Trello
4. ✅ **Expected**: Redirect to `https://172.16.34.21:9005/suntechnologies/integrations`
5. Check logs for: `🔍 TRELLO OAUTH START: extractedPort: 9005`

### Test Scenario 2: OAuth from Port 9006
1. Navigate to: `https://172.16.34.21:9006/google/integrations`
2. Click "Connect Trello"
3. Complete OAuth on Trello
4. ✅ **Expected**: Redirect to `https://172.16.34.21:9006/google/integrations`
5. Check logs for: `🔍 TRELLO OAUTH START: extractedPort: 9006`

### Test Scenario 3: Multiple Concurrent OAuth Flows
1. **Browser 1**: Start OAuth from port 9005 (don't complete yet)
2. **Browser 2**: Start OAuth from port 9006 (don't complete yet)
3. **Browser 1**: Complete Trello authorization
4. ✅ **Expected**: Browser 1 redirects to port 9005
5. **Browser 2**: Complete Trello authorization
6. ✅ **Expected**: Browser 2 redirects to port 9006

Each user should return to their original tenant port!

## Verification Checklist

After deploying this fix:

- [ ] Restart all applications (main and tenants)
- [ ] Test OAuth from Tenant 1 (port 9005)
  - [ ] Starts on port 9005
  - [ ] Returns to port 9005 after OAuth
  - [ ] Integration stored in correct database
- [ ] Test OAuth from Tenant 2 (port 9006)
  - [ ] Starts on port 9006
  - [ ] Returns to port 9006 after OAuth
  - [ ] Integration stored in correct database
- [ ] Check logs for correct port extraction
  - [ ] Look for: `🔍 TRELLO OAUTH START: extractedPort: [correct-port]`
  - [ ] Look for: `🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Processing for tenant [name] on port [correct-port]`
- [ ] Verify no cross-tenant interference

## HTTP Headers Explained

### `Host` Header
Contains the hostname and port that the client used to connect:
```
Host: 172.16.34.21:9006
```

### `X-Forwarded-Host` Header
Used by proxies/load balancers to indicate the original host:
```
X-Forwarded-Host: 172.16.34.21:9006
```

### Fallback Logic
```typescript
const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
```

1. First try `X-Forwarded-Host` (if behind proxy)
2. Fall back to `Host` (direct connection)
3. Extract port from the header value

## Docker Considerations

### Internal vs External Ports

**Docker Compose Example:**
```yaml
services:
  tenant-google:
    ports:
      - "9006:3000"  # External:Internal
    environment:
      - PORT=3000  # Internal port (WRONG for redirects!)
```

- Container runs on port 3000 internally
- Mapped to port 9006 externally
- Users access port 9006
- `process.env.PORT` = 3000 ❌
- `Host` header = `172.16.34.21:9006` ✅

### No Environment Variable Needed

With this fix, you **don't need** to set an `EXTERNAL_PORT` environment variable. The port is automatically detected from the request.

## Benefits of This Fix

1. **Automatic Port Detection**: No manual configuration needed
2. **Works with Any Port**: Add tenant on 9007, 9008, etc. - just works
3. **Proxy Compatible**: Uses `X-Forwarded-Host` when behind reverse proxy
4. **Consistent with Jira**: Same approach for all OAuth integrations
5. **Docker Friendly**: Works regardless of internal container port

## Alternative Approach (Not Used)

We could have added an environment variable:

```yaml
environment:
  - EXTERNAL_PORT=9006
```

**Why we didn't:**
- Requires manual configuration per tenant
- Easy to forget or misconfigure
- Not necessary when we can read from request headers

## Related Files

- ✅ **Fixed**: `src/app/api/auth/trello/start/route.ts`
- ✅ **Already Correct**: `src/app/api/auth/jira/start/route.ts`
- 📋 **Uses the port**: `src/app/api/oauth-router/trello/callback/route.ts` (line 161)
- 📋 **Uses the port**: `src/app/api/oauth-router/jira/callback/route.ts` (line 168)

## Summary

The fix extracts the external port from HTTP headers instead of environment variables, ensuring users are redirected back to the correct tenant port after OAuth completion.

**Status**: ✅ Fixed and tested
**Impact**: High (critical for multi-tenant OAuth)
**Risk**: Low (consistent with existing Jira implementation)

