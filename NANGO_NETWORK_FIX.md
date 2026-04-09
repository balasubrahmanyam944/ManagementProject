# Nango Network Connection Fix

## Problem

When accessing your app from a remote machine (e.g., `172.16.34.21:9005`), the browser tries to connect to Nango at `localhost:3003`, which fails because `localhost` refers to the browser's machine, not your server.

**Error:** `WebSocket connection to 'ws://localhost:3003/' failed`

## ✅ Solution

### Option 1: Set Environment Variable (Recommended)

Add to your `.env` file:

```env
# Use your actual server IP address
NEXT_PUBLIC_NANGO_SERVER_URL=http://172.16.34.21:3003
```

**Or if using HTTPS:**
```env
NEXT_PUBLIC_NANGO_SERVER_URL=https://172.16.34.21:3003
```

### Option 2: Auto-Detection (Already Implemented)

The code now auto-detects the host from your current URL. If you're accessing:
- `http://172.16.34.21:9005` → Nango will use `http://172.16.34.21:3003`

**This should work automatically now!**

---

## 🔧 Additional Steps

### 1. Ensure Nango is Accessible

Make sure Nango port 3003 is accessible from your network:

```bash
# Check if Nango is listening on all interfaces
netstat -an | findstr :3003
# Should show: 0.0.0.0:3003 (not 127.0.0.1:3003)
```

### 2. Firewall Check

If Nango still can't be reached:

**Windows Firewall:**
- Allow port 3003 through Windows Firewall
- Or temporarily disable firewall for testing

**Docker:**
- Ensure Docker is allowing connections on port 3003

### 3. Test Nango Accessibility

From your browser machine, test if Nango is reachable:

```bash
# Should return Nango health check
curl http://172.16.34.21:3003/health
```

---

## 📋 Quick Fix Checklist

- [ ] Updated `.env` with `NEXT_PUBLIC_NANGO_SERVER_URL=http://172.16.34.21:3003`
- [ ] Restarted your Next.js app (to load new env vars)
- [ ] Verified Nango is running: `docker compose -f nango/docker-compose.yml ps`
- [ ] Tested Nango accessibility: `curl http://172.16.34.21:3003/health`
- [ ] Try connecting again from browser

---

## 🎯 Expected Behavior After Fix

1. Click "Connect Slack" (or Jira/Trello)
2. Nango popup opens (not blank!)
3. OAuth flow completes
4. Connection successful ✅

---

## 🔍 Debugging

If still not working, check browser console for:

```javascript
// Should see:
🔧 Nango: Auto-detected server URL: http://172.16.34.21:3003
🔄 Nango: Connecting slack for gmail_user123
```

If you see `localhost:3003` in the logs, the auto-detection didn't work - set the environment variable manually.

