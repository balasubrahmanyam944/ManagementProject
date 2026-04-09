# Nango Docker Networking Fix

## Problem

Your Next.js app runs in Docker (`upmy-gmail` container), but Nango runs on the host machine at `172.16.34.39:3003`.

**Error:** `connect ECONNREFUSED 127.0.0.1:3003`

From inside Docker, `localhost` refers to the container, not the host machine.

## ✅ Solution

### Option 1: Use Host IP (Recommended)

Add `NANGO_SERVER_URL` to your Docker Compose file pointing to the host IP where Nango is running:

```yaml
environment:
  - NANGO_SERVER_URL=http://172.16.34.39:3003  # Nango server IP
```

### Option 2: Use host.docker.internal (Windows/Mac Docker Desktop)

If using Docker Desktop on Windows/Mac:

```yaml
environment:
  - NANGO_SERVER_URL=http://host.docker.internal:3003
```

### Option 3: Connect Containers via Docker Network

If Nango is also in Docker, connect them to the same network:

```yaml
networks:
  - upmy-gmail-network
  - nango-network  # Add Nango network
```

## 🔧 Current Configuration

I've updated `tenants/gmail/docker-compose.yml` to use:
```yaml
- NANGO_SERVER_URL=http://172.16.34.39:3003
```

## 🔄 After Updating

**Restart your Docker container:**

```bash
cd tenants/gmail
docker compose restart upmy-gmail
```

## ✅ Verification

After restarting, check logs. You should see:
```
✅ Nango service initialized (server-side) host: http://172.16.34.39:3003
🔍 Nango: Connection retrieved for jira: { connection_id: "...", credentials: {...} }
```

No more `ECONNREFUSED` errors!

## 📋 Quick Checklist

- [ ] Updated `tenants/gmail/docker-compose.yml` with `NANGO_SERVER_URL`
- [ ] Restarted Docker container
- [ ] Verified Nango is accessible from container
- [ ] Check logs for successful connection

