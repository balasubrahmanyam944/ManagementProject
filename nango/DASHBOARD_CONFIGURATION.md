# Nango Dashboard Configuration Guide

## ✅ Correct Approach: Configure in Dashboard Only

**You should ONLY configure Client ID, Client Secret, and Scopes in the Nango Dashboard UI.**

**Do NOT add these to:**
- ❌ `docker-compose.yml`
- ❌ `.env` files
- ❌ Code files
- ❌ Environment variables

---

## 📋 Configuration Steps

### 1. Access Nango Dashboard

Open your Nango dashboard:
```
http://localhost:3003
```

Or if using a different URL:
```
https://your-nango-server-url
```

### 2. Configure Each Integration

For each integration (Jira, Trello, Slack), click **"View"** or **"Edit"** and fill in:

#### **Jira Configuration**

1. Click on **Jira** integration → **View** or **Edit**
2. Fill in:
   - **Client ID**: Your Jira OAuth Client ID
   - **Client Secret**: Your Jira OAuth Client Secret
   - **Scopes**: Add these scopes (one per line or comma-separated):
     ```
     read:jira-work
     write:jira-work
     manage:jira-project
     read:jira-user
     offline_access
     ```
3. **Callback URL**: Already set (your proxy URL)
4. Click **Save**

#### **Trello Configuration**

1. Click on **Trello** integration → **View** or **Edit**
2. Fill in:
   - **Client ID**: Your Trello API Key
   - **Client Secret**: Your Trello API Secret
   - **Scopes**: Add these scopes:
     ```
     read
     write
     ```
3. **Callback URL**: Already set (your proxy URL)
4. Click **Save**

#### **Slack Configuration**

1. Click on **Slack** integration → **View** or **Edit**
2. Fill in:
   - **Client ID**: Your Slack Client ID
   - **Client Secret**: Your Slack Client Secret
   - **Scopes**: Add these scopes:
     ```
     channels:read
     channels:history
     chat:write
     users:read
     team:read
     ```
3. **Callback URL**: Already set (your proxy URL)
4. Click **Save**

---

## 🔍 Where to Get OAuth Credentials

### Jira
- Go to: [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
- Your App → OAuth 2.0 (3LO) → Copy Client ID and Secret

### Trello
- Go to: [Trello Power-Up Admin](https://trello.com/power-ups/admin)
- Your App → Copy API Key (Client ID) and API Secret (Client Secret)

### Slack
- Go to: [Slack API Dashboard](https://api.slack.com/apps)
- Your App → Basic Information → Copy Client ID and Secret

---

## ✅ Verification

After configuring in the dashboard:

1. **Check integration status** - Should show configured
2. **Test connection** - Use the "Auth" button in the dashboard
3. **Verify scopes** - Make sure all required scopes are added

---

## 📝 Important Notes

- **Callback URL** is automatically set by Nango (your proxy URL)
- **Scopes** can be added one at a time using the "Add" button
- **Client Secret** is masked for security (use "show" button to view)
- Changes are saved immediately when you click "Save"

---

## 🚫 What NOT to Do

- ❌ Don't add credentials to `docker-compose.yml`
- ❌ Don't add credentials to `.env` files
- ❌ Don't hardcode credentials in code
- ❌ Don't commit credentials to git

**Everything is configured securely in the Nango Dashboard!**

