# TestRail Integration Troubleshooting Guide

## Common Issues and Solutions

### 1. Authentication Failed (401 Error)

**Symptoms:**
- Error: "Authentication failed: invalid or missing user/password or session cookie"
- API key length shows as 41 characters or less

**Solutions:**
1. **Verify API Key Length**: TestRail API keys can vary in length (20+ characters is acceptable)
2. **Generate New API Key**:
   - Log in to your TestRail instance
   - Go to My Settings → API Keys
   - Click "Generate API Key" or "Add API Key"
   - Copy the full key
3. **Check Email Address**: Use the exact email you use to log into TestRail
4. **Verify Server URL**: Ensure the URL is correct and doesn't have trailing slashes

### 2. API Key Too Short

**Symptoms:**
- API key length is less than 20 characters
- Connection fails immediately

**Solutions:**
1. **Get a Proper API Key**:
   - Log in to TestRail
   - Navigate to My Settings → API Keys
   - Generate a new API key
   - API keys should be at least 20 characters long

### 3. Server URL Issues

**Symptoms:**
- 404 errors
- Connection timeouts

**Solutions:**
1. **Correct URL Format**:
   - Use: `https://yourcompany.testrail.io`
   - Don't include trailing slashes
   - Don't include `/index.php` in the URL
2. **Verify Instance URL**:
   - Log in to TestRail
   - Check the URL in your browser
   - Use that exact domain

### 4. Permission Issues

**Symptoms:**
- 403 Forbidden errors
- "Access denied" messages

**Solutions:**
1. **Check API Key Permissions**:
   - Ensure your user account has API access enabled
   - Check if your TestRail instance allows API access
2. **Verify User Role**: Make sure your account has sufficient permissions

### 5. Network/Connection Issues

**Symptoms:**
- Connection timeouts
- Network errors

**Solutions:**
1. **Check Network**: Ensure your server can reach the TestRail instance
2. **Firewall**: Check if firewalls are blocking the connection
3. **Proxy**: If using a proxy, ensure it's configured correctly

## Step-by-Step Verification Process

### Step 1: Test Your Credentials
1. Go to `/test-testrail` page in your application
2. Enter your TestRail credentials:
   - **Server URL**: `https://yourcompany.testrail.io` (no trailing slash)
   - **Email**: Your exact TestRail login email
   - **API Key**: Your full API key (20+ characters)
3. Click "Test Connection"

### Step 2: Verify API Key
1. Log in to your TestRail instance
2. Go to My Settings → API Keys
3. If you don't see an API key or it's too short:
   - Click "Generate API Key" or "Add API Key"
   - Copy the full key (should be at least 20 characters)
4. Test the new key on the test page

### Step 3: Check Server URL
1. When logged into TestRail, check your browser's address bar
2. Use that exact domain (without `/index.php` or trailing slashes)
3. Example: `https://suntechbalu05.testrail.io`

### Step 4: Connect Integration
1. Once the test page shows "Connection successful"
2. Go to your Integrations page
3. Click "Connect TestRail"
4. Enter the same credentials that worked in the test

## Debug Information

### Log Analysis
The application logs show detailed information about connection attempts:

```
TestRail: Fetching projects from URL: https://suntechbalu05.testrail.io/index.php?/api/v2/get_projects
TestRail: Using credentials - email: balu.suntech@gmail.com apiKey length: 41
TestRail: Response status: 401
TestRail: API error response: {"error":"Authentication failed: invalid or missing user\/password or session cookie."}
```

**Key Issues in the Logs:**
- `apiKey length: 41` - This is actually acceptable for some TestRail instances
- `Response status: 401` - Authentication failure
- The error message indicates invalid credentials

### Expected Log Output for Success
```
TestRail: Fetching projects from URL: https://yourcompany.testrail.io/index.php?/api/v2/get_projects
TestRail: Using credentials - email: your-email@company.com apiKey length: 41
TestRail: Response status: 200
TestRail: Successfully fetched projects: 5
```

## API Key Generation Instructions

### For TestRail Cloud:
1. Log in to your TestRail instance
2. Click on your profile picture in the top right
3. Select "My Settings"
4. Navigate to the "API Keys" section
5. Click "Generate API Key" or "Add API Key"
6. Copy the generated key (can vary in length)

### For TestRail Server:
1. Log in to your TestRail instance
2. Go to Administration → Users & Roles
3. Find your user account
4. Click "Edit" or "API Keys"
5. Generate a new API key
6. Copy the full key

## Common TestRail URL Formats

### Cloud Instances:
- `https://yourcompany.testrail.io`
- `https://yourcompany.testrail.com`

### Server Instances:
- `https://testrail.yourcompany.com`
- `https://yourcompany.com/testrail`

## Still Having Issues?

If you're still experiencing problems after following this guide:

1. **Double-check all credentials** using the test page
2. **Try generating a new API key** in TestRail
3. **Verify your TestRail instance supports API access**
4. **Check with your TestRail administrator** if API access is restricted
5. **Contact support** with the specific error messages from the logs

## Environment Variables

Make sure these environment variables are set (if using OAuth, which TestRail doesn't support):

```env
# These are NOT needed for TestRail (API key auth only)
# TESTRAIL_CLIENT_ID=
# TESTRAIL_CLIENT_SECRET=
# TESTRAIL_REDIRECT_URI=
```

TestRail uses API key authentication, so no OAuth environment variables are required. 