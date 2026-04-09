# Multi-Tenant Jira/Trello OAuth Integration Architecture

## Context
This document explains the implementation of OAuth integrations (Jira, Trello, etc.) within a **multi-tenant architecture** where each tenant runs in an isolated Docker container with its own port and database. The challenge solved here is implementing OAuth without requiring separate callback URLs for each tenant.

## Architecture Overview

### Main Application
- Runs on port `9003`
- URL: `https://172.16.34.21:9003`
- Hosts the centralized OAuth callback endpoints
- Acts as OAuth coordinator for all tenants

### Tenant Applications
- Each tenant runs in a separate Docker container
- Ports: `9005`, `9006`, `9007`, `9008`, etc.
- URLs: `https://172.16.34.21:PORT/TENANT_NAME`
- Each has isolated MongoDB database
- Built with `NEXT_PUBLIC_TENANT_BASEPATH=/{tenant}` environment variable
- Uses Next.js `basePath` configuration for routing

## Centralized OAuth Flow Design

### Problem Solved
Instead of registering a unique callback URL for each tenant in Jira/Trello (which is impractical), we use a **single centralized callback** on the main app that routes data back to the originating tenant.

### Implementation for Jira (Same pattern applies to Trello)

#### Step 1: Tenant Initiates OAuth
**File:** `src/app/api/auth/jira/start/route.ts`

- User clicks "Connect Jira" in tenant app (e.g., `https://172.16.34.21:9005/suntechnologies/integrations`)
- Tenant server generates OAuth state containing:
  ```typescript
  const state = {
    tenant: 'suntechnologies',
    port: '9005',
    userId: session.user.id
  };
  ```
- Redirects to Jira OAuth with:
  - `redirect_uri`: Main app's centralized callback (`https://172.16.34.21:9003/api/oauth-router/jira/callback`)
  - `state`: Base64-encoded tenant info

#### Step 2: Jira Redirects to Main App
**File:** `src/app/api/oauth-router/jira/callback/route.ts`

- Jira redirects to: `https://172.16.34.21:9003/api/oauth-router/jira/callback?code=XXX&state=YYY`
- Main app:
  1. Parses the `state` to extract tenant, port, userId
  2. Exchanges authorization code for access token (using main app's `redirect_uri`)
  3. Fetches Jira accessible resources to get `cloudId`
  4. Prepares integration data:
     ```typescript
     const integrationData = {
       tenant,
       port,
       userId,
       accessToken,
       refreshToken,
       expiresAt,
       serverUrl: 'https://api.atlassian.com',
       metadata: { cloudId, tenant }
     };
     ```

#### Step 3: Forward Data to Tenant
- Main app makes POST request to tenant-specific callback:
  ```typescript
  const tenantUrl = `https://172.16.34.21:${port}/${tenant}/api/oauth-callback/jira`;
  ```
- Uses `node-fetch` with custom HTTPS agent to bypass SSL verification:
  ```typescript
  const agent = new https.Agent({ rejectUnauthorized: false });
  await nodeFetch(tenantUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(integrationData),
    agent: agent
  });
  ```

#### Step 4: Tenant Stores Integration
**File:** `src/app/api/oauth-callback/jira/route.ts` (with basePath routing)

- Receives POST with integration data
- Stores in tenant's database using `db.createIntegration()`
- Returns success response

#### Step 5: User Redirection
- Main app redirects user to tenant's integrations page:
  ```typescript
  const redirectUrl = `https://172.16.34.21:${port}/integrations?jira_connected=true`;
  ```
- **Critical**: URL does NOT include `/tenant` prefix because Next.js basePath handles it automatically

## Key Files Modified

### 1. `src/lib/jira-oauth.ts`
- `generateJiraOAuthState()`: Encodes tenant info in state
- `parseJiraOAuthState()`: Decodes state
- `getJiraOAuthAuthorizeUrl()`: Uses main app callback URL
- `exchangeJiraOAuthCode()`: Uses main app callback URL
- `getJiraAccessibleResources()`: Fetches Jira cloudId

### 2. `src/app/api/oauth-router/jira/callback/route.ts`
- Centralized callback handler
- Comprehensive logging with emoji markers
- Handles token exchange and tenant forwarding

### 3. `src/lib/tenancy/tenantManager.ts`
- Sets `JIRA_OAUTH_REDIRECT_URI` environment variable for each tenant
- Configures tenant with local IP address

### 4. `src/lib/jira-auth.ts`
- `fetchWithJiraOAuth()`: Constructs proper Jira API URLs
- Handles cloudId injection: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...`

## Next.js Routing with basePath

### Critical Understanding
When `basePath: '/suntechnologies'` is set in `next.config.ts`:
- Next.js automatically strips it from `window.location.pathname`
- All `<Link>` components automatically prepend it
- API routes MUST use basePath-aware URLs

### Navigation Links
```typescript
// DON'T manually prepend basePath
<Link href="/dashboard">Dashboard</Link> // ✅ Correct

// Next.js automatically converts to /suntechnologies/dashboard
```

### API Calls
```typescript
// Use environment variable for basePath
const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
fetch(`${basePath}/api/integrations/status`); // ✅ Correct
```

## File Structure

```
src/app/
├── api/
│   ├── oauth-router/
│   │   └── jira/
│   │       └── callback/
│   │           └── route.ts          # Centralized OAuth callback
│   ├── auth/
│   │   └── jira/
│   │       └── start/
│   │           └── route.ts          # Tenant-specific OAuth initiation
│   └── oauth-callback/
│       └── jira/
│           └── route.ts              # Tenant receives forwarded data
├── testcases/
│   ├── page.tsx                      # Root-level testcases page (for basePath)
│   └── actions.ts                    # Server actions
└── integrations/
    └── page.tsx                      # Integration management UI
```

## Logging Strategy

All OAuth flow steps use distinctive emoji markers for easy debugging:
- 🔄 - Process flow
- 🔍 - Data inspection
- ✅ - Success
- ❌ - Error
- 🎯 - Tenant-specific operations
- 🚀 - API calls

Example:
```typescript
console.log('🔄 CENTRALIZED OAUTH CALLBACK: Received Jira OAuth callback');
console.log('🔍 CENTRALIZED OAUTH CALLBACK: Parsed state:', parsedState);
```

## Environment Variables

### Tenant Docker Compose
```yaml
environment:
  - NEXT_PUBLIC_TENANT_BASEPATH=/suntechnologies
  - NEXT_PUBLIC_HOST_IP=172.16.34.21
  - JIRA_OAUTH_REDIRECT_URI=https://172.16.34.21:9003/api/oauth-router/jira/callback
  - MONGO_URI=mongodb://mongo-suntechnologies:27017/upmy-suntechnologies
```

## Common Pitfalls & Solutions

### 1. Double basePath in URLs
- ❌ `https://172.16.34.21:9005/suntechnologies/suntechnologies/integrations`
- ✅ `https://172.16.34.21:9005/suntechnologies/integrations`
- **Solution**: Don't manually prepend basePath; Next.js handles it

### 2. Missing cloudId in Jira API calls
- ❌ `https://api.atlassian.com/rest/api/3/project`
- ✅ `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/project`
- **Solution**: Always use `fetchWithJiraOAuth()` which injects cloudId

### 3. SSL verification errors between main and tenant
- **Solution**: Use custom HTTPS agent with `rejectUnauthorized: false`

### 4. Wrong database method calls
- ❌ `db.findTestcasesByUserId()`
- ✅ `db.findTestcasesByUserGroupedByDocument()`

## Trello Integration Implementation

The same pattern has been implemented for Trello with some OAuth 1.0a-specific adjustments:

### Key Differences from Jira

1. **OAuth Version**: Trello uses OAuth 1.0a (not OAuth 2.0 like Jira)
2. **State Storage**: Since OAuth 1.0a doesn't support state parameter in the redirect, we store tenant info in-memory using the `oauth_token` as key
3. **Token Secret**: OAuth 1.0a requires storing both `oauth_token` and `oauth_token_secret`

### Implementation Files

#### 1. `src/lib/trello-auth.ts`
- `storeTrelloOAuthState()`: Stores tenant info with oauth_token as key
- `parseTrelloOAuthState()`: Retrieves tenant info using oauth_token
- `getTrelloOAuthRequestTokenUrl()`: Uses centralized callback URL
- `exchangeTrelloOAuthToken()`: Accepts requestTokenSecret as parameter

**State Storage Mechanism:**
```typescript
// Temporary in-memory storage (use Redis in production)
const oauthStateStore = new Map<string, {
  tenant: string;
  port: string;
  userId: string;
  requestTokenSecret: string;
  timestamp: number;
}>();
```

#### 2. `src/app/api/oauth-router/trello/callback/route.ts`
- Centralized callback handler for all tenants
- Retrieves tenant info from stored oauth_token
- Exchanges OAuth tokens with Trello
- Forwards integration data to tenant

#### 3. `src/app/api/auth/trello/start/route.ts`
- Initiates OAuth flow
- Stores tenant info using `storeTrelloOAuthState()`
- Uses centralized callback URL

#### 4. `src/app/[tenant]/api/oauth-callback/trello/route.ts`
- Receives forwarded integration data
- Stores integration in tenant database
- Fetches and stores Trello boards

#### 5. `src/lib/integrations/trello-service.ts`
- Updated `storeIntegration()` to support `accessTokenSecret`
- Stores token secret in metadata for OAuth 1.0a

### Trello OAuth Flow

```
User → Tenant App: Click "Connect Trello"
Tenant App → Trello: Request oauth_token + oauth_token_secret
Tenant App → Storage: Store tenant info with oauth_token
Tenant App → Trello: Redirect user with oauth_token
Trello → Main App: Redirect with oauth_token + oauth_verifier
Main App → Storage: Retrieve tenant info using oauth_token
Main App → Trello: Exchange for access token
Main App → Tenant App: POST integration data
Tenant App → Database: Store integration
Main App → User: Redirect to tenant integrations page
```

### Environment Variables for Trello

**Main Application (Port 9003):**
```yaml
TRELLO_API_KEY=your-api-key
TRELLO_API_SECRET=your-api-secret
```

**Tenant Docker Compose:**
```yaml
environment:
  - NEXT_PUBLIC_TENANT_BASEPATH=/suntechnologies
  - NEXT_PUBLIC_HOST_IP=172.16.34.21
  - TRELLO_API_KEY=your-api-key
  - TRELLO_API_SECRET=your-api-secret
  - MONGO_URI=mongodb://mongo-suntechnologies:27017/upmy-suntechnologies
```

### OAuth 1.0a vs OAuth 2.0 Comparison

| Feature | Jira (OAuth 2.0) | Trello (OAuth 1.0a) |
|---------|------------------|---------------------|
| State Parameter | Passed in URL | Stored server-side |
| Token Type | Bearer token | Consumer + Token |
| Token Secret | No | Yes (token secret) |
| Refresh Token | Yes | No (tokens don't expire) |
| Authorization Header | `Authorization: Bearer {token}` | OAuth 1.0a signature |

### Production Considerations

For production deployments, replace the in-memory `oauthStateStore` with:
- **Redis**: For distributed systems
- **Database**: For persistent storage
- **Encrypted cookies**: For single-server deployments

Example Redis implementation:
```typescript
// src/lib/cache/redis.ts
import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL
});

export async function storeTrelloOAuthState(
  oauth_token: string,
  state: any
) {
  await redisClient.setEx(
    `trello_oauth:${oauth_token}`,
    600, // 10 minutes
    JSON.stringify(state)
  );
}

export async function getTrelloOAuthState(oauth_token: string) {
  const data = await redisClient.get(`trello_oauth:${oauth_token}`);
  return data ? JSON.parse(data) : null;
}
```

## Testing Checklist

- [ ] User can initiate OAuth from tenant integrations page
- [ ] State correctly encodes tenant, port, userId
- [ ] Main app receives callback and logs all steps
- [ ] Token exchange succeeds
- [ ] CloudId is fetched and stored
- [ ] Data forwarded to correct tenant
- [ ] Tenant stores integration successfully
- [ ] User redirected back to tenant integrations page (without double path)
- [ ] Integration status shows as connected
- [ ] Projects sync from Jira/Trello
- [ ] API calls use correct cloudId prefix

## Callback URLs to Register in OAuth Apps

### Jira OAuth 2.0 App Configuration
Register this callback URL in your Jira OAuth app (Atlassian Developer Console):
```
https://172.16.34.21:9003/api/oauth-router/jira/callback
```

### Trello OAuth 1.0a App Configuration
Register this callback URL in your Trello OAuth app (Trello Developer Portal):
```
https://172.16.34.21:9003/api/oauth-router/trello/callback
```

**This architecture allows unlimited tenants without OAuth app reconfiguration!**

### How to Register Callback URLs

#### For Jira:
1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Select your app or create a new one
3. Navigate to "Authorization" → "OAuth 2.0 (3LO)"
4. Add the callback URL: `https://172.16.34.21:9003/api/oauth-router/jira/callback`
5. Save changes

#### For Trello:
1. Go to [Trello Power-Ups Admin Portal](https://trello.com/power-ups/admin)
2. Select your Power-Up or create a new one
3. Under "OAuth", add the redirect URL: `https://172.16.34.21:9003/api/oauth-router/trello/callback`
4. Save changes

**Note**: For production, replace `172.16.34.21:9003` with your actual domain and port.

## Benefits of This Architecture

1. **Scalability**: Add new tenants without modifying OAuth app configuration
2. **Maintainability**: Single point of OAuth management
3. **Security**: Centralized token handling and validation
4. **Flexibility**: Easy to add new OAuth providers following the same pattern
5. **Isolation**: Each tenant maintains its own database while sharing OAuth flow

## Sequence Diagram

```
User → Tenant App: Click "Connect Jira"
Tenant App → Jira: Redirect with state (tenant, port, userId)
Jira → Main App: Redirect with code + state
Main App → Jira: Exchange code for tokens
Main App → Jira: Fetch cloudId
Main App → Tenant App: POST integration data
Tenant App → Database: Store integration
Main App → User: Redirect to tenant integrations page
```

## Additional Notes

- The architecture follows **SOLID principles** with clear separation of concerns
- Each component is **modular** and can be extended independently
- The centralized router pattern can be extended to support additional OAuth providers (Google, Microsoft, etc.)
- Logging is comprehensive for debugging OAuth flows in production

