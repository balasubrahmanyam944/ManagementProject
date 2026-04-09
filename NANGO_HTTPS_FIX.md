# Nango HTTPS/Mixed Content Fix

## Problem

Your app is accessed via **HTTPS** (`https://172.16.34.21:9005`), but Nango is trying to connect via **HTTP** (`http://172.16.34.39:3003`).

**Error:** `Mixed Content: The page at 'https://...' was loaded over HTTPS, but attempted to connect to the insecure WebSocket endpoint 'ws://...'`

Browsers **block** insecure WebSocket connections (`ws://`) from HTTPS pages for security.

---

## ✅ Solutions

### Option 1: Use HTTPS for Nango Server (Recommended)

Configure Nango to use HTTPS:

1. **Update `nango/docker-compose.yml`:**
   ```yaml
   nango-server:
     ports:
       - "0.0.0.0:3003:3003"
     environment:
       # Add HTTPS support
       - NANGO_SERVER_URL=https://172.16.34.39:3003
   ```

2. **Add SSL certificates** to Nango (similar to your main app)

3. **Update `.env`:**
   ```env
   NEXT_PUBLIC_NANGO_SERVER_URL=https://172.16.34.39:3003
   ```

### Option 2: Use ngrok Proxy URL (Easiest)

Since you already have the ngrok proxy URL, use that:

1. **Add to `.env`:**
   ```env
   # Use ngrok proxy URL for frontend (HTTPS compatible)
   NEXT_PUBLIC_NANGO_SERVER_URL=https://irremovable-overexuberantly-jaxen.ngrok-free.dev
   NEXT_PUBLIC_NANGO_PROXY_URL=https://irremovable-overexuberantly-jaxen.ngrok-free.dev
   ```

2. **Restart Next.js server**

The code will automatically use the proxy URL when the page is HTTPS.

### Option 3: Access App via HTTP (Quick Test)

For testing only, access your app via HTTP:
```
http://172.16.34.21:9005/gmail/integrations
```

This allows HTTP WebSocket connections.

---

## 🔧 Quick Fix (Recommended)

Add to your `.env` file:

```env
# Use ngrok proxy URL (HTTPS compatible)
NEXT_PUBLIC_NANGO_SERVER_URL=https://irremovable-overexuberantly-jaxen.ngrok-free.dev
NEXT_PUBLIC_NANGO_PROXY_URL=https://irremovable-overexuberantly-jaxen.ngrok-free.dev
```

Then **restart your Next.js server**.

---

## 📋 Why This Happens

```
Your App:     https://172.16.34.21:9005  (HTTPS)
                ↓
Nango SDK:    ws://172.16.34.39:3003    (HTTP WebSocket)
                ↓
Browser:      ❌ BLOCKED! Mixed Content Error
```

**Solution:** Both must use same protocol:
- HTTPS page → HTTPS/WSS Nango
- HTTP page → HTTP/WS Nango

---

## ✅ After Fix

You should see in console:
```
🔧 Nango Config: Using ngrok proxy URL for HTTPS compatibility
🔧 Nango: Initializing with:
  Server URL: https://irremovable-overexuberantly-jaxen.ngrok-free.dev
```

No more Mixed Content errors! ✅

