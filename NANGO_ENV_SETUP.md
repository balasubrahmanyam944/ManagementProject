# Nango Environment Variables Setup

## ⚠️ Critical: Set This Environment Variable

Add this to your **`.env`** file (in the project root):

```env
# Nango Server URL - Use your actual server IP
NEXT_PUBLIC_NANGO_SERVER_URL=http://172.16.34.21:3003

# Nango Public Key (from nango/.env)
NEXT_PUBLIC_NANGO_PUBLIC_KEY=your-public-key-from-nango-env

# Nango Secret Key (server-side only, NOT public)
NANGO_SECRET_KEY=your-secret-key-from-nango-env
NANGO_SERVER_URL=http://172.16.34.21:3003
```

## 🔄 After Adding Environment Variables

**Restart your Next.js development server:**

```bash
# Stop the server (Ctrl+C)
# Then restart:
npm run dev
```

**Why restart?** Next.js reads `NEXT_PUBLIC_*` variables at build/start time.

## ✅ Verification

After restarting, check browser console when connecting:

```
🔧 Nango Config: Auto-detected server URL: http://172.16.34.21:3003
🔧 Nango: Initializing with:
  Server URL: http://172.16.34.21:3003
  Public Key: abc12345...
✅ Nango: Instance created successfully
```

If you see `localhost:3003` in the logs, the environment variable isn't being read - restart the server!

## 🐛 Troubleshooting

### Still seeing `localhost:3003`?

1. **Check `.env` file exists** in project root (not in `nango/` folder)
2. **Verify variable name** is exactly `NEXT_PUBLIC_NANGO_SERVER_URL`
3. **Restart Next.js server** (environment variables load at startup)
4. **Check for typos** in the IP address

### WebSocket still failing?

1. **Verify Nango is accessible:**
   ```bash
   curl http://172.16.34.21:3003/health
   ```

2. **Check firewall** allows port 3003

3. **Verify Docker port binding:**
   ```bash
   docker compose -f nango/docker-compose.yml ps
   ```

## 📝 Quick Reference

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_NANGO_SERVER_URL` | Main `.env` | Frontend connects to Nango |
| `NEXT_PUBLIC_NANGO_PUBLIC_KEY` | Main `.env` | Frontend authentication |
| `NANGO_SECRET_KEY` | Main `.env` | Server-side API calls |
| `NANGO_SERVER_URL` | Main `.env` | Server-side Nango connection |

**Note:** The ngrok proxy URL (`https://irremovable-xxx.ngrok-free.dev`) is only used for OAuth callbacks - it's configured in the Nango dashboard, not in your code!

