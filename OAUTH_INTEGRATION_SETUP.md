# OAuth Integration Setup Guide

This guide will help you set up Jira and Trello OAuth integrations for the UPMY application.

> **For Multi-Tenant Architecture**: If you're working with the multi-tenant setup, please refer to [MULTI_TENANT_OAUTH_ARCHITECTURE.md](./MULTI_TENANT_OAUTH_ARCHITECTURE.md) for detailed implementation information about the centralized OAuth router pattern.

## Prerequisites

1. A running UPMY application instance
2. Access to Jira Cloud or Jira Server
3. A Trello account
4. Environment variables configured

## Environment Setup

1. Copy `env.example` to `.env.local`:
```bash
cp env.example .env.local
```

2. Update the `.env.local` file with your configuration values.

## Jira OAuth Setup

### Step 1: Create a Jira OAuth App

1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Click "Create" → "New app"
3. Choose "OAuth 2.0 (3LO)" integration
4. Fill in the app details:
   - **App name**: UPMY Integration
   - **App description**: Integration for UPMY project management
   - **App logo**: Upload a logo (optional)

### Step 2: Configure OAuth Settings

1. In your app, go to "Auth" → "OAuth 2.0 (3LO)"
2. Add the following redirect URLs:
   - **For Multi-Tenant Setup**: `https://172.16.34.21:9003/api/oauth-router/jira/callback` (centralized callback)
   - **For Single Instance**: `http://localhost:9003/api/auth/jira/callback` (for development)
   - **For Production**: `https://yourdomain.com/api/auth/jira/callback`
3. Add the following scopes:
   - `read:jira-work`
   - `write:jira-work`
   - `manage:jira-project`
   - `read:jira-user`
   - `offline_access`

### Step 3: Get OAuth Credentials

1. Go to "Auth" → "OAuth 2.0 (3LO)"
2. Copy the **Client ID** and **Client Secret**
3. Update your `.env.local` file:
```env
JIRA_OAUTH_CLIENT_ID="your-client-id"
JIRA_OAUTH_CLIENT_SECRET="your-client-secret"
JIRA_OAUTH_REDIRECT_URI="http://localhost:9003/api/auth/jira/callback"
```

### Step 4: Test Jira Integration

1. Start your application: `npm run dev`
2. Navigate to `/integrations`
3. Click "Connect" on the Jira integration
4. Complete the OAuth flow
5. Verify that Jira shows as "Connected"

## Trello OAuth Setup

### Step 1: Create a Trello App

1. Go to [Trello Developer Portal](https://trello.com/app-key)
2. Copy your **API Key** (this is your app key)
3. Click "Generate a Secret" to create your **OAuth Secret**

### Step 2: Configure OAuth Settings

1. In the same page, scroll down to "OAuth 2.0" or "Allowed Origins"
2. Add the following redirect URLs:
   - **For Multi-Tenant Setup**: `https://172.16.34.21:9003/api/oauth-router/trello/callback` (centralized callback)
   - **For Single Instance**: `http://localhost:9003/api/auth/trello/callback` (for development)
   - **For Production**: `https://yourdomain.com/api/auth/trello/callback`
3. Add the following scopes:
   - `read`
   - `write`
   - `account`

### Step 3: Update Environment Variables

Update your `.env.local` file:
```env
TRELLO_API_KEY="your-api-key"
TRELLO_OAUTH_SECRET="your-oauth-secret"
```

### Step 4: Test Trello Integration

1. Start your application: `npm run dev`
2. Navigate to `/integrations`
3. Click "Connect" on the Trello integration
4. Complete the OAuth flow
5. Verify that Trello shows as "Connected"

## Troubleshooting

### Common Issues

#### 1. "Missing JIRA_OAUTH_CLIENT_ID" Error
- Ensure `JIRA_OAUTH_CLIENT_ID` is set in your `.env.local` file
- Restart your development server after updating environment variables

#### 2. "Invalid redirect URI" Error
- Verify that the redirect URI in your OAuth app matches exactly
- Check for trailing slashes or protocol mismatches
- Ensure the port number matches your development server

#### 3. "Invalid ObjectId" Errors
- This is a database issue that has been fixed in the latest code
- Ensure you're using the latest version of the application

#### 4. Integration Status Not Persisting
- The application now uses database storage instead of cookies
- Integration status should persist across browsers for the same user
- Check that the database connection is working properly

### Debug Steps

1. **Check Environment Variables**:
```bash
# Verify your .env.local file exists and has the correct values
cat .env.local
```

2. **Check Application Logs**:
```bash
# Look for OAuth-related errors in the console
npm run dev
```

3. **Test Database Connection**:
```bash
# Ensure MongoDB is running and accessible
# Check the DATABASE_URL in your .env.local file
```

4. **Verify OAuth App Configuration**:
- Double-check redirect URIs in your OAuth apps
- Ensure scopes are correctly configured
- Verify API keys and secrets are correct

## Production Deployment

When deploying to production:

1. **Update Redirect URIs**: Change all redirect URIs to use your production domain
2. **Environment Variables**: Set production environment variables
3. **Database**: Ensure production database is properly configured
4. **HTTPS**: OAuth requires HTTPS in production

### Production Environment Variables

```env
# Update these for production
NEXTAUTH_URL="https://yourdomain.com"
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
JIRA_OAUTH_REDIRECT_URI="https://yourdomain.com/api/auth/jira/callback"
# Add production redirect URIs to your OAuth apps
```

## Security Considerations

1. **Environment Variables**: Never commit `.env.local` to version control
2. **OAuth Secrets**: Keep your OAuth secrets secure and rotate them regularly
3. **Redirect URIs**: Only use trusted redirect URIs
4. **Scopes**: Request only the minimum required scopes
5. **HTTPS**: Always use HTTPS in production

## Support

If you encounter issues:

1. Check the application logs for detailed error messages
2. Verify your OAuth app configuration matches this guide
3. Ensure all environment variables are correctly set
4. Test with a fresh database if needed

## Next Steps

After setting up OAuth integrations:

1. **Test Integration**: Connect both Jira and Trello
2. **Verify Data Sync**: Check that projects and data are syncing correctly
3. **Test Cross-Browser**: Verify integration status persists across browsers
4. **Monitor Usage**: Check the dashboard for integration statistics 