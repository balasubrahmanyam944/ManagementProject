# How to Configure Integrations in Nango

## Quick Answer

For **self-hosted Nango**, integrations are configured via **environment variables** in `docker-compose.yml`.

## Step-by-Step Guide

### 1. Add Your OAuth Credentials to `.env`

First, make sure your OAuth credentials are in your main project `.env`:

```env
# Jira
JIRA_OAUTH_CLIENT_ID=your-jira-client-id
JIRA_OAUTH_CLIENT_SECRET=your-jira-client-secret

# Trello
TRELLO_API_KEY=your-trello-api-key
TRELLO_API_SECRET=your-trello-api-secret

# Slack
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
```

### 2. Update `nango/docker-compose.yml`

Add integration configuration to the `nango-server` service environment:

```yaml
services:
  nango-server:
    environment:
      # ... existing variables ...
      
      # Jira Integration
      - NANGO_INTEGRATION_JIRA_CLIENT_ID=${JIRA_OAUTH_CLIENT_ID}
      - NANGO_INTEGRATION_JIRA_CLIENT_SECRET=${JIRA_OAUTH_CLIENT_SECRET}
      - NANGO_INTEGRATION_JIRA_SCOPES=read:jira-work write:jira-work manage:jira-project read:jira-user offline_access
      
      # Trello Integration
      - NANGO_INTEGRATION_TRELLO_CLIENT_ID=${TRELLO_API_KEY}
      - NANGO_INTEGRATION_TRELLO_CLIENT_SECRET=${TRELLO_API_SECRET}
      - NANGO_INTEGRATION_TRELLO_SCOPES=read,write
      
      # Slack Integration
      - NANGO_INTEGRATION_SLACK_CLIENT_ID=${SLACK_CLIENT_ID}
      - NANGO_INTEGRATION_SLACK_CLIENT_SECRET=${SLACK_CLIENT_SECRET}
      - NANGO_INTEGRATION_SLACK_SCOPES=channels:read channels:history chat:write users:read team:read
```

### 3. Restart Nango

```bash
cd nango
docker compose down
docker compose up -d
```

### 4. Verify Configuration

Check logs to see if integrations are loaded:

```bash
docker compose logs nango-server | grep -i integration
```

---

## Alternative: Using Nango Admin API

If your Nango version supports it, you can configure via API:

```typescript
import { Nango } from '@nangohq/node';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });

// Configure Jira
await nango.admin.createIntegration({
  uniqueKey: 'jira',
  provider: 'jira',
  credentials: {
    oauth_client_id: process.env.JIRA_OAUTH_CLIENT_ID!,
    oauth_client_secret: process.env.JIRA_OAUTH_CLIENT_SECRET!,
  },
  scopes: 'read:jira-work write:jira-work manage:jira-project read:jira-user offline_access',
});
```

---

## Required Scopes Summary

| Integration | Scopes |
|-------------|--------|
| **Jira** | `read:jira-work write:jira-work manage:jira-project read:jira-user offline_access` |
| **Trello** | `read,write` |
| **Slack** | `channels:read channels:history chat:write users:read team:read` |

---

## Need Help?

Run the configuration script:
```bash
npx ts-node scripts/configure-nango-integrations.ts
```

