# 🔧 Nango Server URL Configuration Fix

## Problem

The server-side Nango SDK was using the ngrok proxy URL, which returns HTML (the Nango dashboard) instead of JSON API responses.

**Error:** `getConnection` returns HTML: `"<!doctype html>..."` instead of connection data.

## ✅ Solution

The **server-side** Nango SDK must use the **local Nango server**, not the ngrok proxy.

### Environment Variables

Add to your `.env` file:

```env
# Server-side: Use LOCAL Nango server (for API calls)
NANGO_SERVER_URL=http://localhost:3003
# OR if accessing from different machine:
NANGO_SERVER_URL=http://172.16.34.39:3003

# Frontend: Can use ngrok proxy (for OAuth)
NEXT_PUBLIC_NANGO_SERVER_URL=https://irremovable-overexuberantly-jaxen.ngrok-free.dev
```

### Why Two Different URLs?

1. **Server-side (`NANGO_SERVER_URL`):**
   - Used by Node.js SDK for API calls (`getConnection`, `deleteConnection`, etc.)
   - Must point to **local Nango server** (`http://localhost:3003`)
   - Returns JSON API responses

2. **Frontend (`NEXT_PUBLIC_NANGO_SERVER_URL`):**
   - Used by browser SDK for OAuth flows
   - Can use **ngrok proxy** (`https://xxx.ngrok-free.dev`)
   - Handles OAuth callbacks automatically

### The Code Now:

- **Server-side SDK** automatically detects ngrok URLs and uses `localhost:3003` instead
- **Frontend SDK** uses the ngrok proxy URL (set in `NEXT_PUBLIC_NANGO_SERVER_URL`)

## 🔄 After Fix

1. **Set `NANGO_SERVER_URL` in `.env`:**
   ```env
   NANGO_SERVER_URL=http://localhost:3003
   ```

2. **Restart your Next.js server**

3. **Test connection** - should now return JSON instead of HTML!

## 📋 Verification

After restarting, check server logs. You should see:
```
✅ Nango service initialized (server-side) host: http://localhost:3003
🔍 Nango: Connection retrieved for jira: { connection_id: "...", credentials: {...} }
```

Instead of HTML!

