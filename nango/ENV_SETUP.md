# Nango Environment Setup

## Quick Setup

### Step 1: Generate Keys

**Option A: Use the provided script (easiest)**

**Linux/Mac:**
```bash
cd nango
chmod +x generate-keys.sh
./generate-keys.sh
```

**Windows (PowerShell):**
```powershell
cd nango
.\generate-keys.ps1
```

**Node.js (any platform):**
```bash
cd nango
node generate-keys.js
```

**Option B: Generate manually**

**Linux/Mac:**
```bash
# Secret Key (64 hex characters)
openssl rand -hex 32

# Public Key (64 hex characters)
openssl rand -hex 32

# Encryption Key (32 hex characters - MUST be exactly 32 chars!)
openssl rand -hex 16
```

**Windows (PowerShell):**
```powershell
# Secret Key
-join ((0..9) + ('a'..'f') | Get-Random -Count 64)

# Public Key
-join ((0..9) + ('a'..'f') | Get-Random -Count 64)

# Encryption Key (32 chars)
-join ((0..9) + ('a'..'f') | Get-Random -Count 32)
```

**Online (if you don't have openssl):**
- Visit: https://www.random.org/strings/
- Generate: 64 characters, hexadecimal
- For encryption key: Generate 32 characters, hexadecimal

### Step 2: Create .env File

Create a `.env` file in the `nango/` folder with your generated keys:

```env
NANGO_SECRET_KEY=your-generated-secret-key-64-chars
NANGO_PUBLIC_KEY=your-generated-public-key-64-chars
NANGO_ENCRYPTION_KEY=your-generated-encryption-key-32-chars
NANGO_SERVER_URL=http://localhost:3003
```

> **Important:** 
> - `NANGO_ENCRYPTION_KEY` must be **exactly 32 characters** (hex)
> - `NANGO_SECRET_KEY` and `NANGO_PUBLIC_KEY` should be **64 characters** (hex)

2. Start Nango:
```bash
cd nango
docker compose up -d
```

3. Check the logs for your **Proxy Callback URL**:
```bash
docker compose logs nango-server
```

You'll see something like:
```
Callback URL: https://irremovable-abc123.nango.dev/oauth/callback
```

## 🔴 Important: Proxy Callback URL

When Nango starts, it generates a **proxy callback URL** like:
```
https://irremovable-xxxxx.nango.dev/oauth/callback
```

This is **normal and expected**! Use this URL in your OAuth provider settings:

| Provider | Where to Set |
|----------|-------------|
| Jira | Atlassian Developer Console → Your App → OAuth 2.0 → Callback URL |
| Trello | Trello Power-Up Admin → Allowed Origins |
| Slack | Slack API Dashboard → OAuth & Permissions → Redirect URLs |

## Your App's .env

Add these to your **main project's `.env`** file:

```env
# Nango Configuration
NANGO_SECRET_KEY=same-key-as-above
NANGO_SERVER_URL=http://localhost:3003

# For frontend
NEXT_PUBLIC_NANGO_PUBLIC_KEY=same-public-key-as-above
NEXT_PUBLIC_NANGO_SERVER_URL=http://localhost:3003

# Your existing OAuth credentials (keep these)
JIRA_OAUTH_CLIENT_ID=your-jira-client-id
JIRA_OAUTH_CLIENT_SECRET=your-jira-client-secret
TRELLO_API_KEY=your-trello-api-key
TRELLO_API_SECRET=your-trello-api-secret
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
```

## How the Proxy Works

```
User clicks "Connect Jira"
       ↓
Jira OAuth redirects to:
  https://irremovable-xxx.nango.dev/oauth/callback
       ↓
Nango Cloud PROXY forwards to:
  http://localhost:3003/oauth/callback
       ↓
Your LOCAL Nango stores tokens in LOCAL PostgreSQL
       ↓
User is connected! ✅
```

**Your tokens are stored locally** - the proxy only forwards the OAuth callback.

