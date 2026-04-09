# TestRail Integration Setup

This guide explains how to set up TestRail integration for the UPMY application using API key authentication.

## Prerequisites

- A TestRail account with API access
- Your TestRail instance URL
- Your TestRail email and API key

## Step 1: Get Your TestRail API Key

1. Log in to your TestRail instance
2. Go to **My Settings** (click on your profile picture)
3. Navigate to **API Keys** section
4. Generate a new API key or copy your existing one
5. Note down your TestRail email address

## Step 2: Configure TestRail Integration

1. Start your development server: `npm run dev`
2. Navigate to the Integrations page: `/integrations`
3. Click "Connect" next to TestRail
4. You'll be redirected to the TestRail connection form
5. Fill in the required information:
   - **TestRail Server URL**: Your TestRail instance URL (e.g., `https://yourcompany.testrail.io`)
   - **Email**: Your TestRail email address
   - **API Key**: Your TestRail API key
6. Click "Connect TestRail"

## Step 3: Verify Connection

After connecting, you should see:
- TestRail shows as "Connected" on the integrations page
- Your TestRail projects appear in the project overview
- You can sync test cases and create new ones

## Troubleshooting

### Common Issues

1. **"Invalid credentials" Error**
   - Verify your email and API key are correct
   - Ensure your API key has the necessary permissions
   - Check that your TestRail server URL is correct

2. **"Connection failed" Error**
   - Verify your TestRail instance is accessible
   - Check that your API key is valid and not expired
   - Ensure you have the required permissions in TestRail

3. **"No projects found" Error**
   - Verify you have access to projects in TestRail
   - Check that your API key has read permissions
   - Ensure your TestRail instance is properly configured

### Debug Steps

1. **Test API Key Manually**:
   ```bash
   curl -u "your-email:your-api-key" \
        -H "Content-Type: application/json" \
        "https://your-testrail-instance.testrail.io/index.php?/api/v2/get_projects"
   ```

2. **Check TestRail Permissions**:
   - Ensure your user account has access to projects
   - Verify your API key has read/write permissions
   - Check that your TestRail instance allows API access

## API Permissions

The TestRail integration requires the following permissions:
- **Read access**: To fetch projects, test cases, and user information
- **Write access**: To create and update test cases

## Security Notes

- Never share your API key publicly
- Use environment variables for sensitive configuration in production
- Regularly rotate your API keys
- Monitor API usage in your TestRail admin panel

## Support

If you encounter issues with the TestRail integration:
1. Check the browser console for error messages
2. Verify your TestRail credentials and permissions
3. Ensure your TestRail instance supports API access
4. Contact your TestRail administrator if you need help with API permissions 