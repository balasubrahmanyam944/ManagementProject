# Slack OAuth Quick Setup Guide

## 🎉 Migration Complete!

Slack OAuth has been migrated to the centralized pattern. Here's how to set it up:

## 📋 Quick Setup (3 Steps)

### Step 1: Update Slack App Callback URL

1. Go to: https://api.slack.com/apps/YOUR_APP_ID
2. Click: **OAuth & Permissions**
3. Under **Redirect URLs**, **REPLACE** all old URLs with:
   ```
   https://172.16.34.21:9003/api/oauth-router/slack/callback
   ```
4. Click **Save URLs**

**Remove these old URLs** (if present):
- ~~`https://172.16.34.21:9005/suntechnologies/api/auth/slack/callback`~~
- ~~`https://172.16.34.21:9006/google/api/auth/slack/callback`~~

### Step 2: Restart Applications

```bash
# Restart main server (port 9003)
cd /path/to/main-server
npm run dev

# Restart tenant containers
docker-compose restart
```

### Step 3: Test OAuth Flow

1. **Navigate to tenant**: `https://172.16.34.21:9006/google/integrations`
2. **Click "Connect Slack"**
3. **Authorize on Slack**
4. **Return to tenant** - should show "Slack Connected" ✅

## 📊 What Changed

### Before (Old Pattern) ❌
```
Each tenant needs separate Slack callback URL
  - Tenant 1: https://172.16.34.21:9005/.../callback
  - Tenant 2: https://172.16.34.21:9006/.../callback
  - Not scalable!
```

### After (Centralized Pattern) ✅
```
One callback URL for ALL tenants
  - Main: https://172.16.34.21:9003/api/oauth-router/slack/callback
  - Add unlimited tenants without Slack changes!
```

## 🔍 Testing Checklist

### From Tenant (Port 9006)
- [ ] Navigate to: `https://172.16.34.21:9006/google/integrations`
- [ ] Click "Connect Slack"
- [ ] URL changes to: `slack.com` (NOT port 9003!) ✅
- [ ] No login page shown
- [ ] Authorize on Slack
- [ ] Return to: `https://172.16.34.21:9006/google/integrations`
- [ ] Slack shows as "Connected"
- [ ] Channels are synced

### What You Should See

**Your Browser URL Bar:**
```
✅ Start: 172.16.34.21:9006/google/integrations
✅ Then: slack.com/oauth/v2/authorize...
✅ End: 172.16.34.21:9006/google/integrations?slack=connected

❌ Never: 172.16.34.21:9003/... (user never sees main server)
```

### Expected Logs

**Tenant Server (9006):**
```
🚀 TENANT SLACK OAUTH START: ===== STARTING OAUTH FLOW =====
🔄 TENANT SLACK OAUTH START: Calling main server API
✅ TENANT SLACK OAUTH START: Redirecting user to Slack (user never sees port 9003)
```

**Main Server (9003):**
```
🚀 MAIN SERVER SLACK OAUTH START: ===== STARTING OAUTH FLOW =====
🔍 MAIN SERVER SLACK OAUTH START: Tenant info: { tenant: 'google', port: '9006', ... }
🔄 MAIN SERVER SLACK OAUTH START: Redirecting to Slack authorization URL
```

Later:
```
🚀 CENTRALIZED SLACK OAUTH CALLBACK: ===== STARTING CALLBACK PROCESS =====
✅ CENTRALIZED SLACK OAUTH CALLBACK: Successfully exchanged code for token
✅ CENTRALIZED SLACK OAUTH CALLBACK: Successfully forwarded to tenant
```

## 🚨 Troubleshooting

### Issue: "redirect_uri_mismatch" Error

**Cause**: Slack callback URL not updated in app settings

**Fix**:
1. Go to Slack app settings
2. Verify callback URL is: `https://172.16.34.21:9003/api/oauth-router/slack/callback`
3. Remove any old tenant-specific URLs
4. Save and try again

### Issue: User Sees Port 9003 Login Page

**Cause**: User's browser is being redirected to main server

**Fix**: Already fixed in code! Tenant makes server-to-server call now.

**Verify**:
- Check logs for: `🔄 TENANT SLACK OAUTH START: Calling main server API`
- Should NOT see browser redirect to 9003

### Issue: "Invalid State" Error

**Cause**: State parameter mismatch or expired

**Fix**:
- Clear browser cache
- Restart applications
- Try OAuth flow again

## 📚 Architecture

### Flow Diagram
```
User (Browser)        Tenant Server       Main Server       Slack
     |                     |                   |              |
     |--1. Connect-------->|                   |              |
     |                     |--2. API Call----->|              |
     |                     |<-3. Slack URL-----|              |
     |<-4. Redirect--------|                   |              |
     |--5. Authorize-------------------------------->|
     |<-6. Callback-------------------|<------7-----|
     |                     |<-8. POST--|              |
     |<-9. Redirect--------|           |              |
     |                     |           |              |
```

**Key Points:**
- Step 2: Server-to-server (user never sees it)
- Step 4: User goes directly to Slack
- Step 6: Slack redirects to main server (9003)
- Step 9: User returns to tenant (9006)

## ✅ Benefits

1. **Scalability**: Add tenants on ports 9007, 9008, 9009... without Slack changes
2. **Consistency**: Same pattern as Jira and Trello
3. **User Experience**: Seamless OAuth flow
4. **Maintainability**: Single point of OAuth management

## 📁 Files Created

- ✅ `src/app/api/oauth-router/slack/start/route.ts` - Centralized start
- ✅ `src/app/api/oauth-router/slack/callback/route.ts` - Centralized callback
- ✅ `src/app/[tenant]/api/oauth-callback/slack/route.ts` - Tenant receives data

## 📁 Files Modified

- ✅ `src/app/api/auth/slack/start/route.ts` - Now calls main server

## 🎯 Success Criteria

- [ ] Slack app has single callback URL (port 9003)
- [ ] OAuth works from any tenant
- [ ] User never sees port 9003 in browser
- [ ] Integration stored in tenant database
- [ ] Channels synced successfully

---

**Ready to test!** Just update the Slack app callback URL and restart your apps. 🚀

