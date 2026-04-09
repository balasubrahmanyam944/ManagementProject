# OAuth Callback URL Configuration Fix

## 🔴 Current Issue
Jira and Trello OAuth are failing with:
- **Jira**: "We couldn't identify the app requesting access"
- **Trello**: "Invalid return_url. The return URL should match the application's allowed origins"

## ✅ Solution: Update OAuth App Callback URLs

Since you're using **Nango** for OAuth, you need to configure the **Nango proxy callback URL** in your OAuth apps.

### Your Nango Proxy URL
Based on your configuration:
```
https://irremovable-overexuberantly-jaxen.ngrok-free.dev
```

## 📋 Step-by-Step Fix

### 1. Fix Jira OAuth App

1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Select your Jira OAuth app
3. Navigate to **Authorization** → **OAuth 2.0 (3LO)**
4. In **Callback URL**, add:
   ```
   https://irremovable-overexuberantly-jaxen.ngrok-free.dev/oauth/callback
   ```
5. **Remove any old callback URLs** like:
   - `https://172.16.34.21:9003/api/oauth-router/jira/callback`
   - `https://172.16.34.47:9003/api/oauth-router/jira/callback`
6. Click **Save**

### 2. Fix Trello OAuth App

1. Go to [Trello Power-Up Admin Portal](https://trello.com/power-ups/admin)
2. Select your Power-Up app
3. Under **OAuth**, find **Allowed Origins** or **Redirect URLs**
4. Add:
   ```
   https://irremovable-overexuberantly-jaxen.ngrok-free.dev
   ```
   **Note:** For Trello, use the base domain (no `/oauth/callback` path)
5. **Remove any old URLs** like:
   - `https://172.16.34.21:9003`
   - `https://172.16.34.47:9003`
6. Click **Save**

### 3. Verify Nango Dashboard Configuration

1. Open Nango Dashboard: `http://localhost:3003` (or `http://172.16.34.39:3003`)
2. Go to **Integrations** → **Jira** → **View/Edit**
3. Verify:
   - **Client ID**: Your Jira OAuth Client ID
   - **Client Secret**: Your Jira OAuth Client Secret
   - **Scopes**: `read:jira-work write:jira-work manage:jira-project read:jira-user offline_access`
   - **Callback URL**: Should show `https://irremovable-overexuberantly-jaxen.ngrok-free.dev/oauth/callback`
4. Go to **Integrations** → **Trello** → **View/Edit**
5. Verify:
   - **Client ID**: Your Trello API Key
   - **Client Secret**: Your Trello API Secret
   - **Scopes**: `read write`
   - **Callback URL**: Should show `https://irremovable-overexuberantly-jaxen.ngrok-free.dev/oauth/callback`

## 🔍 How to Find Your Actual Proxy URL

If the URL above doesn't work, check Nango logs:

```bash
cd nango
docker-compose logs nango-server | grep -i "proxy\|callback"
```

Look for a URL like `https://xxxxx.nango.dev` or `https://xxxxx.ngrok-free.dev`

## ⚠️ Important Notes

1. **Only ONE callback URL** should be configured per OAuth app (the Nango proxy URL)
2. **Remove old callback URLs** - having multiple can cause conflicts
3. **Changes take effect immediately** - no need to restart containers
4. **Test after updating** - try connecting Jira/Trello again

## 🧪 Testing

After updating the callback URLs:

1. Go to your integrations page
2. Click **Connect** for Jira
3. You should be redirected to Atlassian login (not an error page)
4. After authorizing, you should be redirected back successfully
5. Repeat for Trello

## 📞 If Still Not Working

1. Check Nango dashboard logs: `docker-compose logs nango-server`
2. Check browser console for OAuth errors
3. Verify the proxy URL in Nango dashboard matches what you configured in OAuth apps
4. Ensure Nango server is running: `docker-compose ps` in `nango/` directory

