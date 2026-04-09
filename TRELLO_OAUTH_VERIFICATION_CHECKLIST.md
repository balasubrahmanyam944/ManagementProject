# Trello Multi-Tenant OAuth Verification Checklist

This checklist helps verify that the Trello OAuth integration is working correctly in the multi-tenant architecture.

## Pre-Flight Checks

### Environment Configuration
- [ ] Main app has `TRELLO_API_KEY` set
- [ ] Main app has `TRELLO_API_SECRET` set
- [ ] Main app is running on port 9003
- [ ] Tenant has `NEXT_PUBLIC_TENANT_BASEPATH` set (e.g., `/suntechnologies`)
- [ ] Tenant has `PORT` environment variable set (e.g., `9005`)
- [ ] Tenant has MongoDB connection configured

### Trello Developer Portal
- [ ] Callback URL registered: `https://172.16.34.21:9003/api/oauth-router/trello/callback`
- [ ] API Key and Secret match environment variables
- [ ] Application is active and not suspended

## OAuth Flow Verification

### Step 1: Initiate OAuth (Tenant)
**URL**: `https://172.16.34.21:9005/suntechnologies/integrations`

**Expected Actions**:
- [ ] User is authenticated (has valid session)
- [ ] "Connect Trello" button is visible
- [ ] Clicking button makes request to `/api/auth/trello/start`

**Console Logs to Verify**:
```
🚀 TRELLO OAUTH START: ===== STARTING OAUTH FLOW =====
🔍 TRELLO OAUTH START: Authenticated user: [userId]
🔍 TRELLO OAUTH START: Tenant info: { tenant, port, userId }
🔄 TRELLO OAUTH START: Getting request token from Trello...
✅ TRELLO OAUTH START: Tenant information stored
🔄 TRELLO OAUTH START: Redirecting to Trello authorization URL
🚀 TRELLO OAUTH START: ===== OAUTH FLOW INITIATED =====
```

- [ ] All logs appear in correct order
- [ ] No error markers (❌)
- [ ] User is redirected to Trello

### Step 2: Trello Authorization
**URL**: `https://trello.com/1/OAuthAuthorizeToken?oauth_token=...`

**Expected Actions**:
- [ ] Trello authorization page loads
- [ ] Correct application name displayed ("UPMY")
- [ ] Permissions requested are appropriate
- [ ] User can click "Allow"

- [ ] Authorization completes successfully
- [ ] Redirect occurs (to main app, port 9003)

### Step 3: Centralized Callback (Main App)
**URL**: `https://172.16.34.21:9003/api/oauth-router/trello/callback?oauth_token=...&oauth_verifier=...`

**Console Logs to Verify**:
```
🚀 CENTRALIZED TRELLO OAUTH CALLBACK: ===== STARTING CALLBACK PROCESS =====
🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Received parameters: { oauth_token: 'present', oauth_verifier: 'present' }
🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Parsing state from stored request token...
🔍 CENTRALIZED TRELLO OAUTH CALLBACK: Extracted tenant info: { tenant, port, userId }
🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Exchanging OAuth token for access token...
✅ CENTRALIZED TRELLO OAUTH CALLBACK: Successfully exchanged token
🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Preparing integration data...
🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Forwarding to tenant at https://172.16.34.21:[port]/[tenant]/api/oauth-callback/trello
✅ CENTRALIZED TRELLO OAUTH CALLBACK: Successfully forwarded to tenant
🔄 CENTRALIZED TRELLO OAUTH CALLBACK: Redirecting to tenant integrations page
🚀 CENTRALIZED TRELLO OAUTH CALLBACK: ===== CALLBACK PROCESS COMPLETED =====
```

**Verification Steps**:
- [ ] All required parameters present
- [ ] Tenant info retrieved successfully
- [ ] Token exchange succeeds
- [ ] No 500 errors when forwarding to tenant
- [ ] Redirect happens at the end

### Step 4: Tenant Callback Handler
**URL**: `https://172.16.34.21:9005/suntechnologies/api/oauth-callback/trello`

**Console Logs to Verify**:
```
🚀 TENANT TRELLO OAUTH CALLBACK: ===== STARTING TENANT CALLBACK PROCESS =====
🔄 TENANT TRELLO OAUTH CALLBACK: Receiving data from main server
🔍 TENANT TRELLO OAUTH CALLBACK: Received integration data: { tenant, port, userId, ... }
🔄 TENANT TRELLO OAUTH CALLBACK: Storing integration in tenant database...
✅ TENANT TRELLO OAUTH CALLBACK: Integration saved to tenant database successfully
🔄 TENANT TRELLO OAUTH CALLBACK: Fetching Trello boards for tenant...
🔍 TENANT TRELLO OAUTH CALLBACK: Found Trello boards: [count]
✅ TENANT TRELLO OAUTH CALLBACK: Boards saved to tenant database successfully
✅ TENANT TRELLO OAUTH CALLBACK: OAuth flow completed successfully
🚀 TENANT TRELLO OAUTH CALLBACK: ===== TENANT CALLBACK PROCESS COMPLETED =====
```

**Verification Steps**:
- [ ] Integration data received
- [ ] Database storage succeeds
- [ ] Boards are fetched
- [ ] Board count > 0 (if user has boards)
- [ ] No database errors

### Step 5: User Redirect
**URL**: `https://172.16.34.21:9005/suntechnologies/integrations`

**Expected UI State**:
- [ ] Page loads successfully
- [ ] Trello shows as "Connected"
- [ ] Success message or indicator displayed
- [ ] No double basePath in URL (not `/suntechnologies/suntechnologies/...`)

## Database Verification

### Check Integration Storage
```javascript
// Connect to tenant database
use upmy-suntechnologies

// Find Trello integration
db.integrations.findOne({ type: 'TRELLO', userId: ObjectId('...') })
```

**Verify Fields**:
- [ ] `type: 'TRELLO'`
- [ ] `status: 'CONNECTED'`
- [ ] `accessToken` is present (not empty)
- [ ] `metadata.accessTokenSecret` is present
- [ ] `metadata.scopes: 'read,write,account'`
- [ ] `serverUrl: 'https://api.trello.com'`
- [ ] `consumerKey` matches TRELLO_API_KEY
- [ ] `expiresAt` is ~1 year in future
- [ ] `lastSyncAt` is recent

### Check Board Storage
```javascript
// Find Trello boards
db.projects.find({ integrationId: ObjectId('...'), isActive: true })
```

**Verify Fields**:
- [ ] Multiple boards found (if user has multiple)
- [ ] `externalId` matches Trello board ID
- [ ] `name` matches Trello board name
- [ ] `key` equals `externalId`
- [ ] `description` present (if board has description)
- [ ] `isActive: true`
- [ ] `lastSyncAt` is recent

## Error Scenarios

### Test: OAuth Cancelled by User
**Action**: Start OAuth flow, click "Deny" on Trello

**Expected**:
- [ ] User redirected to error page or integrations page
- [ ] Error message displayed
- [ ] No integration stored
- [ ] No crash or 500 error

### Test: Invalid API Key
**Action**: Set wrong `TRELLO_API_KEY` in environment

**Expected**:
- [ ] Request token request fails
- [ ] Error logged: ❌ TRELLO OAUTH START: Trello request token error
- [ ] User sees error message
- [ ] No state stored

### Test: Expired State
**Action**: Wait 11+ minutes between start and callback

**Expected**:
- [ ] State retrieval fails
- [ ] Error logged: ❌ CENTRALIZED TRELLO OAUTH CALLBACK: State not found
- [ ] User redirected to error page
- [ ] No integration stored

### Test: Tenant Database Down
**Action**: Stop tenant MongoDB container during callback

**Expected**:
- [ ] Error logged: ❌ TENANT TRELLO OAUTH CALLBACK: Error processing OAuth data
- [ ] Main app receives error response
- [ ] User sees error message
- [ ] Can retry by clicking "Connect" again

## Integration Health Check

### API Call Verification
After successful connection, test Trello API calls:

```bash
# In tenant integrations page
# Try to sync boards or view projects
```

**Verify**:
- [ ] API calls succeed
- [ ] Data is fetched correctly
- [ ] Token is used properly
- [ ] No authentication errors

### Token Validation
```javascript
// In trelloService.isConnected(userId)
```

**Expected**:
- [ ] Returns `true` for connected users
- [ ] Makes test API call to Trello
- [ ] Handles expired/invalid tokens gracefully

## Multi-Tenant Verification

### Test Multiple Tenants
**Setup**: Add second tenant (e.g., "google" on port 9006)

**Steps**:
1. [ ] Configure second tenant with same Trello credentials
2. [ ] Start OAuth flow for Tenant 1 (suntechnologies)
3. [ ] Complete authorization
4. [ ] Verify integration in Tenant 1 database
5. [ ] Start OAuth flow for Tenant 2 (google)
6. [ ] Complete authorization
7. [ ] Verify integration in Tenant 2 database
8. [ ] Confirm both tenants have separate integrations
9. [ ] Confirm both can fetch boards independently

**Cross-Tenant Isolation Check**:
- [ ] Tenant 1 cannot see Tenant 2's boards
- [ ] Tenant 1 tokens not accessible from Tenant 2
- [ ] Each tenant has own MongoDB database

## Performance Check

### Response Times
- [ ] OAuth start < 2 seconds
- [ ] Trello authorization page loads < 3 seconds
- [ ] Callback processing < 5 seconds
- [ ] Tenant redirect < 1 second
- [ ] Total flow < 15 seconds

### Log Volume
- [ ] Logs are comprehensive but not excessive
- [ ] No duplicate logging
- [ ] Emoji markers help readability
- [ ] Error logs include stack traces

## Security Verification

### Token Storage
- [ ] Access token not logged in plain text
- [ ] Token secret stored securely in database
- [ ] No tokens in URL parameters
- [ ] No tokens in client-side code

### State Management
- [ ] State expires after 10 minutes
- [ ] State is single-use (deleted after retrieval)
- [ ] State includes nonce/timestamp for validation
- [ ] State cleanup runs regularly

### HTTPS
- [ ] All OAuth URLs use HTTPS
- [ ] No mixed content warnings
- [ ] SSL certificates valid (or properly bypassed for dev)

## Documentation Verification

- [ ] `MULTI_TENANT_OAUTH_ARCHITECTURE.md` includes Trello section
- [ ] `OAUTH_INTEGRATION_SETUP.md` references multi-tenant setup
- [ ] `TRELLO_OAUTH_IMPLEMENTATION_SUMMARY.md` exists
- [ ] All callback URLs documented
- [ ] Environment variables documented

## Final Sign-Off

- [ ] All OAuth flow steps complete successfully
- [ ] Integration stored correctly in database
- [ ] Boards sync automatically
- [ ] Error handling works properly
- [ ] Multiple tenants work independently
- [ ] Performance is acceptable
- [ ] Security measures in place
- [ ] Documentation is complete

## Rollback Plan

If issues are found:

1. **Revert to Cookie-Based Auth**:
   - Use original `/api/auth/trello/callback` route
   - Store tokens in cookies temporarily
   - Remove centralized router

2. **Files to Revert**:
   - `src/lib/trello-auth.ts`
   - `src/app/api/auth/trello/start/route.ts`
   - Delete: `src/app/api/oauth-router/trello/callback/route.ts`
   - Delete: `src/app/[tenant]/api/oauth-callback/trello/route.ts`

3. **Update Trello Callback URL**:
   - Change to tenant-specific URLs
   - Register one URL per tenant

---

**Verification Date**: _________________

**Verified By**: _________________

**Status**: ⬜ Passed  ⬜ Failed  ⬜ Partial

**Notes**: ___________________________________________

