# Nango Integrations Configuration Guide

This guide shows you how to configure OAuth credentials (Client ID, Client Secret, and Scopes) for Jira, Trello, and Slack in Nango.

## ✅ Correct Approach: Configure in Nango Dashboard

**Configure integrations ONLY in the Nango Dashboard UI** - not in code or docker-compose.yml!

Access your dashboard at: `http://localhost:3003` (or your Nango server URL)

---

## 📋 Required Information

For each integration, you need:
- **Client ID** (from your OAuth app)
- **Client Secret** (from your OAuth app)
- **Scopes** (permissions your app needs)

---

## 🔧 Configuration Method: Nango Dashboard (Recommended)

### Step-by-Step Dashboard Configuration

1. **Start Nango** (if not running):
   ```bash
   cd nango
   docker compose up -d
   ```

2. **Access Nango Dashboard**:
   ```
   http://localhost:3003
   ```

3. **Navigate to Integrations** - You'll see your integrations listed (Jira, Trello, Slack)

4. **Configure Each Integration**:
   - Click **"View"** or **"Edit"** on each integration
   - Fill in **Client ID** and **Client Secret**
   - Add **Scopes** using the "Add" button
   - **Callback URL** is already set (your proxy URL)
   - Click **"Save"**

See `nango/DASHBOARD_CONFIGURATION.md` for detailed instructions.

---

## 📝 Integration Details

### 1. Jira Configuration

**Provider:** `jira`

**Required Scopes:**
```
read:jira-work write:jira-work manage:jira-project read:jira-user offline_access
```

**Scope Explanations:**
- `read:jira-work` - Read issues, projects, boards, sprints
- `write:jira-work` - Create and update issues, comments
- `manage:jira-project` - Manage project settings and configurations
- `read:jira-user` - Read user information and profiles
- `offline_access` - **Required** for refresh tokens (automatic token refresh)

**Environment Variables:**
```env
JIRA_OAUTH_CLIENT_ID=your-jira-client-id
JIRA_OAUTH_CLIENT_SECRET=your-jira-client-secret
```

**OAuth URLs:**
- Authorization: `https://auth.atlassian.com/authorize`
- Token: `https://auth.atlassian.com/oauth/token`

**Where to Get Credentials:**
1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Create or select your app
3. Go to **OAuth 2.0 (3LO)** section
4. Copy **Client ID** and **Client Secret**

---

### 2. Trello Configuration

**Provider:** `trello`

**Required Scopes:**
```
read,write
```

**Scope Explanations:**
- `read` - Read boards, cards, lists, members
- `write` - Create and update cards, lists, boards

**Environment Variables:**
```env
TRELLO_API_KEY=your-trello-api-key
TRELLO_API_SECRET=your-trello-api-secret
```

**OAuth URLs:**
- Authorization: `https://trello.com/1/OAuthAuthorizeToken`
- Token: `https://trello.com/1/OAuthGetAccessToken`

**Where to Get Credentials:**
1. Go to [Trello Power-Up Admin](https://trello.com/power-ups/admin)
2. Create or select your Power-Up
3. Copy **API Key** and **API Secret**

**Note:** Trello uses OAuth 1.0a, so the "API Key" is the Client ID and "API Secret" is the Client Secret.

---

### 3. Slack Configuration

**Provider:** `slack`

**Required Scopes:**
```
channels:read channels:history chat:write users:read team:read
```

**Scope Explanations:**
- `channels:read` - Read channel information and list channels
- `channels:history` - Read message history in channels
- `chat:write` - Send messages to channels
- `users:read` - Read user information and profiles
- `team:read` - Read workspace/team information

**Environment Variables:**
```env
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
```

**OAuth URLs:**
- Authorization: `https://slack.com/oauth/v2/authorize`
- Token: `https://slack.com/api/oauth.v2.access`

**Where to Get Credentials:**
1. Go to [Slack API Dashboard](https://api.slack.com/apps)
2. Create or select your app
3. Go to **Basic Information** → **App Credentials**
4. Copy **Client ID** and **Client Secret**
5. Go to **OAuth & Permissions** → **Scopes** → Add the required scopes

---

## ✅ Verification Checklist

After configuring integrations:

- [ ] All environment variables are set in `.env`
- [ ] Nango server is running (`docker compose ps`)
- [ ] Integration credentials are configured in Nango
- [ ] OAuth callback URLs are updated in provider dashboards
- [ ] Test connection works for each integration

---

## 🧪 Testing Connections

After configuration, test each integration:

```typescript
import { nangoService } from '@/lib/integrations/nango-service';

// Test Jira
const jiraConnected = await nangoService.isConnected('jira', 'tenantId', 'userId');

// Test Trello
const trelloConnected = await nangoService.isConnected('trello', 'tenantId', 'userId');

// Test Slack
const slackConnected = await nangoService.isConnected('slack', 'tenantId', 'userId');
```

Or use the frontend component:

```tsx
import { NangoIntegrationsList } from '@/components/integrations/NangoConnect';

<NangoIntegrationsList
  tenantId="your-tenant"
  userId="your-user-id"
/>
```

---

## 🔍 Troubleshooting

### "Integration not found" error
- Check that integration is configured in Nango
- Verify provider key matches exactly: `jira`, `trello`, `slack`

### "Invalid client credentials" error
- Verify Client ID and Client Secret are correct
- Check they're set in environment variables
- Ensure they're configured in Nango

### "Insufficient scopes" error
- Verify all required scopes are configured
- Check scopes match exactly (case-sensitive)
- Re-authorize the connection with correct scopes

### OAuth callback fails
- Verify callback URL is set correctly in provider dashboard
- Check Nango proxy URL is correct
- Ensure Nango server is accessible

---

## 📚 Reference Files

- `scripts/configure-nango-integrations.ts` - Configuration script
- `nango/integrations-config.yml` - Configuration reference
- `NANGO_INTEGRATION_SETUP.md` - Main setup guide

