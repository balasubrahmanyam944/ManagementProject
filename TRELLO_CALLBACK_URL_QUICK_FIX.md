# Quick Fix: Trello "Invalid return_url" Error

## 🚨 Error You're Seeing
```
Invalid return_url. The return URL should match the application's allowed origins.
```

## ✅ Quick Fix (3 Steps)

### Step 1: Find Your Callback URL
Check your application logs for this line:
```
🔍 TRELLO OAUTH URL: Computed redirect URI: https://172.16.34.21:9003/api/oauth-router/trello/callback
```

The URL shown is what needs to be registered in Trello.

### Step 2: Register in Trello Developer Portal

#### Option A: Using Trello App Key Page
1. Go to: **https://trello.com/app-key**
2. Scroll to find "Allowed Origins" or similar section
3. Add: `https://172.16.34.21:9003` (just the origin, without the path)
4. Save

#### Option B: Create/Update Trello Power-Up
If you don't see "Allowed Origins" on the app-key page:

1. Go to: **https://trello.com/power-ups/admin**
2. Click **"New"** or select your existing Power-Up
3. Fill required fields:
   - **Name**: UPMY Integration
   - **Iframe Connector URL**: `https://172.16.34.21:9003` (can be dummy)
   - **Support Email**: your-email@example.com
4. Under **"Allowed Origins"**, add:
   ```
   https://172.16.34.21:9003
   ```
5. Click **"Save"**

### Step 3: Add Environment Variable (Recommended)

In your **main application** (port 9003), add to `.env` or `.env.local`:

```env
TRELLO_OAUTH_REDIRECT_URI=https://172.16.34.21:9003/api/oauth-router/trello/callback
```

**For tenant applications**, also add:
```env
TRELLO_OAUTH_REDIRECT_URI=https://172.16.34.21:9003/api/oauth-router/trello/callback
```

Then **restart your application**.

## 🔧 Alternative Solutions

### If IP Addresses Don't Work

Trello may not accept IP addresses. Use one of these:

#### Solution 1: Use ngrok (Easiest for Development)
```bash
# Terminal 1: Start your app
npm run dev

# Terminal 2: Start ngrok
ngrok http 9003
```

You'll get a URL like: `https://abc123.ngrok.io`

1. Add this to Trello allowed origins: `https://abc123.ngrok.io`
2. Set environment variable:
   ```env
   TRELLO_OAUTH_REDIRECT_URI=https://abc123.ngrok.io/api/oauth-router/trello/callback
   NEXT_PUBLIC_APP_URL=https://abc123.ngrok.io
   ```
3. Restart your app
4. Try OAuth again

#### Solution 2: Use a Domain
If you have a domain pointing to 172.16.34.21:
1. Update Trello allowed origins to: `https://yourdomain.com`
2. Set environment:
   ```env
   TRELLO_OAUTH_REDIRECT_URI=https://yourdomain.com:9003/api/oauth-router/trello/callback
   ```

## ✅ Verification

After making changes:

1. **Clear browser cache** or use incognito mode
2. **Restart your application**
3. **Check logs** when clicking "Connect Trello":
   ```
   🔍 TRELLO OAUTH URL: Using explicit TRELLO_OAUTH_REDIRECT_URI: ...
   ```
4. **Try OAuth flow** again

## 📋 Checklist

- [ ] Callback URL identified from logs
- [ ] Origin added to Trello (without path)
- [ ] Environment variable `TRELLO_OAUTH_REDIRECT_URI` set
- [ ] Application restarted
- [ ] Browser cache cleared
- [ ] OAuth flow tested

## 🆘 Still Not Working?

### Debug Steps:

1. **Verify environment variable is loaded**:
   Check the startup logs for:
   ```
   🔍 TRELLO OAUTH URL: Using explicit TRELLO_OAUTH_REDIRECT_URI: ...
   ```

2. **Check Trello app is active**:
   - Go to https://trello.com/power-ups/admin
   - Make sure your app is not suspended

3. **Try with http:// (if https doesn't work)**:
   Add both to allowed origins:
   ```
   https://172.16.34.21:9003
   http://172.16.34.21:9003
   ```

4. **Generate manual token** (temporary workaround):
   - Go to https://trello.com/app-key
   - Click "Token" link
   - Authorize
   - Use this token to test integration functionality

## 📞 Environment Variables Summary

### Main App (.env)
```env
TRELLO_API_KEY=your-api-key-here
TRELLO_API_SECRET=your-api-secret-here
TRELLO_OAUTH_REDIRECT_URI=https://172.16.34.21:9003/api/oauth-router/trello/callback
NEXT_PUBLIC_APP_URL=https://172.16.34.21:9003
```

### Tenant App (.env or docker-compose.yml)
```env
TRELLO_API_KEY=your-api-key-here
TRELLO_API_SECRET=your-api-secret-here
TRELLO_OAUTH_REDIRECT_URI=https://172.16.34.21:9003/api/oauth-router/trello/callback
NEXT_PUBLIC_APP_URL=https://172.16.34.21:9005/suntechnologies
NEXT_PUBLIC_TENANT_BASEPATH=/suntechnologies
PORT=9005
```

---

**Time to fix**: ~5 minutes  
**Difficulty**: Easy  
**Priority**: High (blocks OAuth)

