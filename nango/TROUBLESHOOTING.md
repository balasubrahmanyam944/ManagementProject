# Nango Troubleshooting Guide

## Common Errors and Solutions

### Error: "Slack OAuth not configured"
### Error: "OAuth consumer did not supply its key" (Trello)

These errors mean Nango can't find the OAuth credentials you configured in the dashboard.

---

## ✅ Solution Steps

### Step 1: Verify Dashboard Configuration

1. **Check each integration in the dashboard:**
   - Go to `http://localhost:3003` → Integrations
   - Click **"View"** on each integration (Jira, Trello, Slack)
   - Verify:
     - ✅ Client ID is filled in
     - ✅ Client Secret is filled in (click "show" to verify)
     - ✅ Scopes are added
     - ✅ Callback URL is set

### Step 2: Restart Nango After Configuration

**Important:** After configuring in the dashboard, restart Nango:

```bash
cd nango
docker compose restart nango-server
```

Or fully restart:
```bash
docker compose down
docker compose up -d
```

### Step 3: Check Nango Logs

Check if Nango is reading the configuration:

```bash
docker compose logs nango-server | grep -i "integration\|oauth\|trello\|slack\|jira"
```

Look for:
- ✅ "Integration configured" messages
- ❌ Error messages about missing credentials

### Step 4: Verify Integration Status

In the dashboard, check:
- Integration shows as **"Active"** or **"Configured"**
- User count shows correctly
- No error messages

---

## 🔍 Detailed Troubleshooting

### For Trello: "OAuth consumer did not supply its key"

**Possible causes:**
1. Client ID (Trello API Key) is missing or incorrect
2. Client Secret (Trello API Secret) is missing or incorrect
3. Nango hasn't reloaded the configuration

**Fix:**
1. In dashboard → Trello → Edit
2. Verify **Client ID** = Your Trello API Key (not secret!)
3. Verify **Client Secret** = Your Trello API Secret
4. Click **Save**
5. Restart Nango: `docker compose restart nango-server`

### For Slack: "Slack OAuth not configured"

**Possible causes:**
1. Client ID or Secret not saved properly
2. Scopes not configured
3. Configuration not loaded by Nango

**Fix:**
1. In dashboard → Slack → Edit
2. Verify all fields are filled:
   - Client ID ✅
   - Client Secret ✅
   - Scopes added ✅
3. Click **Save**
4. Restart Nango: `docker compose restart nango-server`

---

## 🧪 Test Configuration

After fixing, test each integration:

1. **In Dashboard:**
   - Click **"Auth"** button on each integration
   - Should open OAuth flow

2. **In Your App:**
   - Use `NangoConnect` component
   - Try connecting each integration

---

## 📋 Configuration Checklist

Before testing, verify:

- [ ] Nango server is running (`docker compose ps`)
- [ ] Dashboard is accessible (`http://localhost:3003`)
- [ ] All integrations show in dashboard
- [ ] Client ID and Secret are saved for each integration
- [ ] Scopes are added for each integration
- [ ] Callback URL is set (proxy URL)
- [ ] Nango was restarted after configuration
- [ ] No errors in logs

---

## 🔄 If Still Not Working

### Option 1: Reconfigure Integration

1. Delete the integration in dashboard
2. Create new integration
3. Fill in all fields again
4. Save and restart

### Option 2: Check Nango Version

Some Nango versions handle configuration differently:

```bash
docker compose logs nango-server | grep -i version
```

### Option 3: Verify Database

Check if configuration is saved in database:

```bash
docker compose exec nango-postgres psql -U nango -d nango -c "SELECT * FROM _nango_config;"
```

---

## 📞 Still Having Issues?

1. Check full Nango logs:
   ```bash
   docker compose logs nango-server --tail=100
   ```

2. Verify your OAuth credentials are correct:
   - Test them directly with the OAuth provider
   - Make sure they're not expired

3. Check Nango documentation for your version:
   - Configuration might differ by version

