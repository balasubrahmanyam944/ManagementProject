# Nango Integration Setup Guide

This guide walks you through setting up Nango for OAuth management in the UPMY project.

## Overview

Nango replaces the custom OAuth implementation with a unified solution that provides:
- **Automatic token refresh** - No more expired token errors
- **Tenant-scoped connections** - Each tenant/user combination has isolated connections
- **Simplified OAuth flows** - One consistent pattern for all integrations
- **Secure token storage** - Tokens encrypted in Nango's database

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NANGO ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │   Frontend  │───▶│    Nango    │───▶│  OAuth Providers       │ │
│  │  Component  │    │   Server    │    │  (Jira, Trello, Slack) │ │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘ │
│         │                  │                                        │
│         │                  ▼                                        │
│         │          ┌─────────────┐                                  │
│         │          │  PostgreSQL │ (Token Storage)                  │
│         │          └─────────────┘                                  │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Your Application                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │   │
│  │  │ JiraNango    │  │ TrelloNango  │  │ SlackNango   │       │   │
│  │  │ Service      │  │ Service      │  │ Service      │       │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │   │
│  │         │                 │                 │                │   │
│  │         └─────────────────┼─────────────────┘                │   │
│  │                           ▼                                   │   │
│  │                  ┌──────────────┐                            │   │
│  │                  │ NangoService │ (Token retrieval)          │   │
│  │                  └──────────────┘                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Docker and Docker Compose
- Node.js 18+
- Your existing OAuth credentials for Jira, Trello, and Slack

## Step 1: Install Dependencies

```bash
npm install @nangohq/node @nangohq/frontend
```

## Step 2: Start Nango Server (Self-Hosted)

1. Navigate to the nango directory:
```bash
cd nango
```

2. Create the environment file:
```bash
cp .env.example .env
```

3. Generate secure keys:

**Easiest way - Use the provided script:**

**Linux/Mac:**
```bash
cd nango
chmod +x generate-keys.sh
./generate-keys.sh
```

**Windows (PowerShell):**
```powershell
cd nango
.\generate-keys.ps1
```

**Node.js (any platform):**
```bash
cd nango
node generate-keys.js
```

**Or generate manually:**

**Linux/Mac:**
```bash
# Secret Key (64 hex characters)
openssl rand -hex 32

# Public Key (64 hex characters)  
openssl rand -hex 32

# Encryption Key (32 hex characters - MUST be exactly 32!)
openssl rand -hex 16
```

**Windows (PowerShell):**
```powershell
# Secret Key
-join ((0..9) + ('a'..'f') | Get-Random -Count 64)

# Public Key
-join ((0..9) + ('a'..'f') | Get-Random -Count 64)

# Encryption Key (32 chars)
-join ((0..9) + ('a'..'f') | Get-Random -Count 32)
```

4. Copy the generated keys to `nango/.env` file.

5. Start Nango services:
```bash
docker compose up -d
```

6. Verify Nango is running:
```bash
curl http://localhost:3003/health
```

## Step 3: Configure Environment Variables

Add these to your project's `.env` file:

```env
# ============================================
# NANGO CONFIGURATION
# ============================================

# Server-side (used by API routes and services)
# Points to your LOCAL Nango server
NANGO_SECRET_KEY=your-generated-secret-key
NANGO_SERVER_URL=http://localhost:3003

# Client-side (used by frontend components)
# Also points to your LOCAL Nango server
# The proxy callback is handled automatically by Nango
NEXT_PUBLIC_NANGO_PUBLIC_KEY=your-generated-public-key
NEXT_PUBLIC_NANGO_SERVER_URL=http://localhost:3003

# Encryption key for token storage (must be 32 characters)
NANGO_ENCRYPTION_KEY=your-32-char-encryption-key

# ============================================
# KEEP YOUR EXISTING OAUTH CREDENTIALS
# ============================================
# These are still needed - you'll configure them in Nango

# Jira OAuth
JIRA_OAUTH_CLIENT_ID=your-jira-client-id
JIRA_OAUTH_CLIENT_SECRET=your-jira-client-secret

# Trello OAuth
TRELLO_API_KEY=your-trello-api-key
TRELLO_API_SECRET=your-trello-api-secret

# Slack OAuth
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
```

> **Note:** The `NANGO_SERVER_URL` points to your LOCAL Nango server.
> The OAuth callback uses Nango's proxy URL (from Step 5), but that's configured
> separately in each OAuth provider's dashboard.

## Step 4: Configure Integrations in Nango

You need to add your OAuth credentials to Nango. This can be done via the Nango API:

```typescript
// scripts/setup-nango-integrations.ts
import { Nango } from '@nangohq/node';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });

async function setupIntegrations() {
  // Jira Configuration
  await nango.createIntegration({
    uniqueKey: 'jira',
    provider: 'jira',
    credentials: {
      oauth_client_id: process.env.JIRA_OAUTH_CLIENT_ID,
      oauth_client_secret: process.env.JIRA_OAUTH_CLIENT_SECRET,
    },
  });

  // Trello Configuration
  await nango.createIntegration({
    uniqueKey: 'trello',
    provider: 'trello',
    credentials: {
      oauth_client_id: process.env.TRELLO_API_KEY,
      oauth_client_secret: process.env.TRELLO_API_SECRET,
    },
  });

  // Slack Configuration
  await nango.createIntegration({
    uniqueKey: 'slack',
    provider: 'slack',
    credentials: {
      oauth_client_id: process.env.SLACK_CLIENT_ID,
      oauth_client_secret: process.env.SLACK_CLIENT_SECRET,
    },
  });

  console.log('✅ Nango integrations configured!');
}

setupIntegrations();
```

Run the setup script:
```bash
npx ts-node scripts/setup-nango-integrations.ts
```

## Step 5: Get Your Nango Proxy Callback URL

When you start Nango, it generates a **proxy callback URL**. Check the logs:

```bash
cd nango
docker compose logs nango-server | grep -i callback
```

You'll see something like:
```
Callback URL: https://irremovable-abc123.nango.dev/oauth/callback
```

**This proxy URL is what you use in OAuth provider settings!**

### Why a Proxy URL?

```
┌─────────────────────────────────────────────────────────────────────┐
│  OAuth providers (Jira, Slack, etc.) require HTTPS callback URLs    │
│  that are publicly accessible. Your local server isn't reachable.   │
│                                                                     │
│  Nango's proxy solves this:                                         │
│  1. OAuth provider → redirects to → Nango Cloud Proxy               │
│  2. Nango Cloud Proxy → forwards to → Your Local Nango Server       │
│  3. Your Local Nango → stores tokens in → Your Local PostgreSQL     │
│                                                                     │
│  ✅ Tokens stay LOCAL. Only the callback is proxied.                │
└─────────────────────────────────────────────────────────────────────┘
```

## Step 6: Update OAuth Callback URLs

Update your OAuth app settings with the **Nango proxy URL**:

### Jira (Atlassian Developer Console)
```
Old: https://172.16.34.21:9003/api/oauth-router/jira/callback
New: https://irremovable-xxxxx.nango.dev/oauth/callback  ← Your proxy URL
```

### Trello (Trello Power-Up Admin)
```
Old: https://172.16.34.21:9003/api/oauth-router/trello/callback
New: https://irremovable-xxxxx.nango.dev/oauth/callback  ← Your proxy URL
```

### Slack (Slack API Dashboard)
```
Old: https://172.16.34.21:9003/api/auth/slack/callback
New: https://irremovable-xxxxx.nango.dev/oauth/callback  ← Your proxy URL
```

> **Note:** Replace `irremovable-xxxxx` with YOUR actual proxy subdomain from the Nango logs.

## Step 7: Using the New Services

### Option A: Use Nango Services Directly (Recommended)

Replace your existing service imports:

```typescript
// Before
import { JiraService } from '@/lib/integrations/jira-service';
const jiraService = new JiraService();

// After
import { jiraNangoService } from '@/lib/integrations/jira-nango-service';

// Usage is almost identical!
const projects = await jiraNangoService.fetchProjects(userId, tenantId);
const connected = await jiraNangoService.isConnected(userId, tenantId);
```

### Option B: Gradual Migration

Keep both services and migrate gradually:

```typescript
// Use feature flag to switch between old and new
const USE_NANGO = process.env.USE_NANGO === 'true';

const jiraService = USE_NANGO 
  ? jiraNangoService 
  : new JiraService();
```

## Step 8: Update Frontend Components

### Using the NangoConnect Component

```tsx
import { NangoIntegrationsList } from '@/components/integrations/NangoConnect';

export function IntegrationsPage() {
  const tenantId = 'gmail'; // From your tenant context
  const userId = 'user123'; // From your auth session
  
  return (
    <div>
      <h1>Connect Your Integrations</h1>
      <NangoIntegrationsList
        tenantId={tenantId}
        userId={userId}
        onConnect={(provider) => {
          console.log(`Connected to ${provider}`);
          // Refresh data, show notification, etc.
        }}
        onDisconnect={(provider) => {
          console.log(`Disconnected from ${provider}`);
        }}
      />
    </div>
  );
}
```

### Using the Hook

```tsx
import { useNangoConnection } from '@/components/integrations/NangoConnect';

export function JiraStatus() {
  const { isConnected, isLoading, connect, disconnect } = useNangoConnection(
    'jira',
    'gmail', // tenantId
    'user123' // userId
  );
  
  if (isLoading) return <div>Checking...</div>;
  
  return isConnected ? (
    <button onClick={disconnect}>Disconnect Jira</button>
  ) : (
    <button onClick={connect}>Connect Jira</button>
  );
}
```

## Connection ID Format

Nango uses tenant-scoped connection IDs:

```
Format: {tenantId}_{userId}

Examples:
- gmail_user123       → Gmail tenant, user123's connection
- outlook_user123     → Outlook tenant, user123's connection (different!)
- gmail_user456       → Gmail tenant, user456's connection
```

This ensures:
- Complete isolation between tenants
- Same user can have different OAuth accounts per tenant
- Cross-device login works (tokens stored server-side)

## File Structure

```
nango/
├── docker-compose.yml      # Nango server configuration
└── .env.example            # Environment template

src/lib/integrations/
├── nango-service.ts        # Core Nango service (token management)
├── jira-nango-service.ts   # Jira API with Nango auth
├── trello-nango-service.ts # Trello API with Nango auth
└── slack-nango-service.ts  # Slack API with Nango auth

src/components/integrations/
└── NangoConnect.tsx        # Frontend connection components

src/app/api/nango/
├── status/route.ts         # Check connection status
├── disconnect/route.ts     # Disconnect integration
├── callback/route.ts       # Post-OAuth processing
└── connections/route.ts    # List all connections
```

## Troubleshooting

### Connection Not Working
1. Check Nango server is running: `docker compose logs nango-server`
2. Verify environment variables are set correctly
3. Check OAuth callback URL is updated in provider settings

### Token Refresh Failing
1. Ensure `offline_access` scope is included for Jira
2. Check Nango encryption key is set correctly
3. Verify refresh token was stored (check Nango logs)

### Cross-Tenant Issues
1. Verify connection ID format: `{tenantId}_{userId}`
2. Check tenant context is being passed correctly
3. Review API route parameters

## API Reference

### Check Connection Status
```
GET /api/nango/status?provider=jira&tenantId=gmail&userId=user123
```

### Disconnect Integration
```
POST /api/nango/disconnect
Body: { "provider": "jira", "tenantId": "gmail", "userId": "user123" }
```

### List All Connections
```
GET /api/nango/connections?tenantId=gmail&userId=user123
```

## Migration Checklist

- [ ] Install Nango packages (`@nangohq/node`, `@nangohq/frontend`)
- [ ] Start Nango Docker containers
- [ ] Configure environment variables
- [ ] Set up integrations in Nango
- [ ] Update OAuth callback URLs
- [ ] Replace service imports in your code
- [ ] Update frontend connection components
- [ ] Test each integration
- [ ] Remove old OAuth code (optional, after verification)

## Support

For Nango-specific issues:
- [Nango Documentation](https://docs.nango.dev)
- [Nango GitHub](https://github.com/NangoHQ/nango)

For project-specific issues:
- Check the troubleshooting section above
- Review logs in `docker compose logs`

