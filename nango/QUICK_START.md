# Nango Quick Start Guide

## Step 1: Start Nango

```bash
cd nango
docker compose up -d
```

## Step 2: Get Your Proxy Callback URL

```bash
docker compose logs nango-server | grep -i callback
```

You'll see something like:
```
Callback URL: https://irremovable-abc123.nango.dev/oauth/callback
```

**Copy this URL!** You'll need it for Step 3.

## Step 3: Configure OAuth Providers

Use the proxy URL from Step 2 in each provider's dashboard:

### Jira
- Go to: [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
- Select your app → OAuth 2.0 (3LO)
- Set **Callback URL** to: `https://irremovable-xxxxx.nango.dev/oauth/callback`

### Trello
- Go to: [Trello Power-Up Admin](https://trello.com/power-ups/admin)
- Select your app → Allowed Origins
- Add: `https://irremovable-xxxxx.nango.dev`

### Slack
- Go to: [Slack API Dashboard](https://api.slack.com/apps)
- Select your app → OAuth & Permissions
- Add **Redirect URL**: `https://irremovable-xxxxx.nango.dev/oauth/callback`

## Step 4: Configure Your App

Add to your main project `.env`:

```env
# Nango Configuration
NANGO_SECRET_KEY=your-secret-key
NANGO_SERVER_URL=http://localhost:3003
NEXT_PUBLIC_NANGO_PUBLIC_KEY=your-public-key
NEXT_PUBLIC_NANGO_SERVER_URL=http://localhost:3003
NANGO_ENCRYPTION_KEY=your-32-char-key
```

## Step 5: Test Connection

Use the `NangoConnect` component in your app to test connections.

## ✅ That's It!

The proxy URL is **only** configured in OAuth provider dashboards - not in your code!

