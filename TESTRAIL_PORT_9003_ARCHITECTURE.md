# TestRail Integration Architecture on Port 9003

## Overview

TestRail integration works differently from Jira, Trello, and Slack. **It does NOT use OAuth**. Instead, it uses **API Key authentication** with a direct form-based connection flow.

## Key Differences from Other Integrations

| Feature | Jira/Trello/Slack | TestRail |
|---------|------------------|----------|
| **Authentication** | OAuth 2.0 / OAuth 1.0a | API Key (Basic Auth) |
| **Redirect Flow** | Yes (external provider) | No |
| **Callback URL** | Required | Not needed |
| **User Input** | Minimal (just click) | Manual credentials entry |
| **Token Storage** | OAuth tokens | API Key + Email |

## How TestRail Works on Port 9003

### Flow Diagram

```
User clicks "Connect TestRail"
    ↓
Navigate to: /integrations/testrail-oauth-simulated
    ↓
User fills form:
  - TestRail Server URL (e.g., https://yourcompany.testrail.io)
  - Email (TestRail account email)
  - API Key (from TestRail settings)
    ↓
Form submits to: POST /api/integrations/testrail/connect
    ↓
Backend:
  1. Validates credentials
  2. Tests connection to TestRail API
  3. Stores credentials in database
  4. Fetches and stores projects
    ↓
Success → Redirect to /integrations
```

### Architecture Components

#### 1. **Frontend Form Page**
- **Location**: `src/app/integrations/testrail-oauth-simulated/page.tsx`
- **Location (Tenant)**: `src/app/[tenant]/integrations/testrail-oauth-simulated/page.tsx`
- **Purpose**: Collect TestRail credentials from user
- **Fields**:
  - TestRail Server URL
  - Email (stored as `consumerKey`)
  - API Key (stored as `accessToken`)

#### 2. **API Endpoint**
- **Location**: `src/app/api/integrations/testrail/connect/route.ts`
- **Method**: `POST`
- **Purpose**: 
  - Validate credentials
  - Test connection to TestRail
  - Store integration in database
  - Fetch and store projects

#### 3. **TestRail Service**
- **Location**: `src/lib/integrations/testrail-service.ts`
- **Purpose**: Handle all TestRail API interactions
- **Key Methods**:
  - `storeIntegration()` - Store credentials
  - `testConnection()` - Validate API key
  - `fetchAndStoreProjects()` - Sync projects
  - `fetchAndStoreTestCases()` - Sync test cases

### Authentication Method

TestRail uses **HTTP Basic Authentication**:

```typescript
// Format: Basic base64(email:apiKey)
const auth = `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`

// API Request
fetch(`${serverUrl}/index.php?/api/v2/get_user_by_email&email=${email}`, {
  headers: {
    'Authorization': auth,
    'Content-Type': 'application/json',
  }
})
```

### Database Storage

TestRail integration is stored with:
```typescript
{
  type: 'TESTRAIL',
  status: 'CONNECTED',
  accessToken: '<api-key>',      // The API key
  consumerKey: '<email>',         // The email address
  serverUrl: '<testrail-url>',   // TestRail instance URL
  metadata: {},
  lastSyncAt: new Date()
}
```

### Why It Works on Port 9003

Unlike OAuth integrations, TestRail doesn't require:
- ❌ OAuth redirect callbacks
- ❌ External provider authorization
- ❌ Token exchange flows
- ❌ Centralized callback routing

Instead, it:
- ✅ Uses direct API calls with credentials
- ✅ Works from any server (main or tenant)
- ✅ No special routing needed
- ✅ Simple form → API → database flow

### Current Implementation Status

#### ✅ Working on Main Server (9003)
- Form page: `/integrations/testrail-oauth-simulated`
- API endpoint: `/api/integrations/testrail/connect`
- Full integration working

#### ⚠️ Potential Issue on Tenants
The tenant form page (`src/app/[tenant]/integrations/testrail-oauth-simulated/page.tsx`) calls:
```typescript
fetch('/api/integrations/testrail/connect', ...)
```

This might need basePath for tenant routing:
```typescript
const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
fetch(`${basePath}/api/integrations/testrail/connect`, ...)
```

However, if the API route at `/api/integrations/testrail/connect` is accessible from tenant routes (which it should be in Next.js), it will work without basePath.

### TestRail API Endpoints Used

1. **Test Connection**:
   - `GET /api/v2/get_case/1` (or `/index.php?/api/v2/get_case/1`)

2. **Fetch Projects**:
   - `GET /api/v2/get_projects`

3. **Fetch Test Cases**:
   - `GET /api/v2/get_cases/{projectId}`

4. **Get User Info**:
   - `GET /api/v2/get_user_by_email&email={email}`

### Connection Testing Strategy

The service tries multiple authentication formats:
- TestRail Cloud format (Bearer token)
- Traditional TestRail format (Basic Auth)
- API v1 and v2 endpoints
- Different URL patterns

This ensures compatibility with various TestRail deployments.

### Multi-Tenant Considerations

Since TestRail doesn't use OAuth:
- ✅ No need for centralized callback routing
- ✅ No need for state management across servers
- ✅ Each tenant can connect independently
- ✅ Credentials stored per-user in their tenant's database

### Security Notes

1. **API Keys are stored in plaintext** (as required by TestRail API)
2. **Credentials are transmitted over HTTPS** (ensure SSL is configured)
3. **Each user's credentials are isolated** by tenant database
4. **No token refresh** - API keys don't expire (but can be revoked in TestRail)

### Comparison with OAuth Integrations

| Aspect | TestRail | Jira/Trello/Slack |
|--------|----------|-------------------|
| **Setup Complexity** | Simple form | OAuth flow |
| **User Experience** | Manual entry | Click to authorize |
| **Token Management** | API key (no expiry) | Access/refresh tokens |
| **Callback Routing** | Not needed | Centralized on 9003 |
| **Multi-tenant** | Works anywhere | Needs centralized routing |

## Conclusion

TestRail integration is simpler than OAuth-based integrations because:
1. No external redirects needed
2. Direct API authentication
3. Works from any server port
4. No callback URL configuration required

The integration works seamlessly on port 9003 (main server) and should also work on tenant ports without any special routing configuration.

