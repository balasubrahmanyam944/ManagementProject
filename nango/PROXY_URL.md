# Nango Proxy Callback URL

## 🔴 Important: This URL is NOT set in code!

The proxy callback URL is **only configured in OAuth provider dashboards** (Jira, Trello, Slack).

## Your Proxy URL

**Replace the example below with YOUR actual proxy URL from Nango logs:**

```
https://irremovable-xxxxx.nango.dev/oauth/callback
```

To find your proxy URL, run:
```bash
cd nango
docker compose logs nango-server | grep -i callback
```

## Where to Use This URL

### ✅ Configure in OAuth Provider Dashboards:

| Provider | Dashboard Location | Set This URL |
|----------|-------------------|--------------|
| **Jira** | Atlassian Developer Console → Your App → OAuth 2.0 → Callback URL | `https://irremovable-xxxxx.nango.dev/oauth/callback` |
| **Trello** | Trello Power-Up Admin → Your App → Allowed Origins | `https://irremovable-xxxxx.nango.dev` |
| **Slack** | Slack API Dashboard → Your App → OAuth & Permissions → Redirect URLs | `https://irremovable-xxxxx.nango.dev/oauth/callback` |

### ❌ Do NOT set in code:

- ❌ Not in `.env` files
- ❌ Not in `docker-compose.yml`
- ❌ Not in any TypeScript/JavaScript files
- ❌ Not in API routes

## Why?

The proxy URL is handled automatically by Nango:
1. Your app connects to `http://localhost:3003` (local Nango)
2. Nango uses the proxy URL for OAuth callbacks automatically
3. The proxy forwards callbacks to your local Nango
4. Tokens are stored in your local database

You only need to configure it in OAuth provider dashboards so they know where to redirect after authorization.

