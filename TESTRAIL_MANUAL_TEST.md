# TestRail Manual Credential Test

If you're still having issues with the TestRail connection, let's verify your credentials manually using curl.

## Step 1: Manual Test with Curl

Open a terminal/command prompt and run this command (replace with your actual credentials):

```bash
curl -u "balu.suntech@gmail.com:YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     "https://suntechbalu05.testrail.io/index.php?/api/v2/get_projects"
```

Replace `YOUR_API_KEY` with your actual 41-character API key.

## Step 2: Expected Results

### If successful, you should see:
```json
[
  {
    "id": 1,
    "name": "Project Name",
    "announcement": "Project description",
    "show_announcement": false,
    "is_completed": false,
    "completed_on": null,
    "suite_mode": 1,
    "url": "https://suntechbalu05.testrail.io/index.php?/projects/overview/1"
  }
]
```

### If authentication fails, you'll see:
```json
{"error":"Authentication failed: invalid or missing user/password or session cookie."}
```

## Step 3: Alternative Test

If the first test fails, try this alternative endpoint:

```bash
curl -u "balu.suntech@gmail.com:YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     "https://suntechbalu05.testrail.io/api/v2/get_projects"
```

## Step 4: Check API Key Format

Some TestRail instances might require the API key to be used differently. Try these variations:

### Option 1: Use API key as password
```bash
curl -u "balu.suntech@gmail.com:YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     "https://suntechbalu05.testrail.io/index.php?/api/v2/get_projects"
```

### Option 2: Use email as username and API key as password
```bash
curl -u "YOUR_EMAIL:YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     "https://suntechbalu05.testrail.io/index.php?/api/v2/get_projects"
```

### Option 3: Try with different headers
```bash
curl -u "balu.suntech@gmail.com:YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json" \
     "https://suntechbalu05.testrail.io/index.php?/api/v2/get_projects"
```

## Step 5: Verify API Key in TestRail

1. Log in to your TestRail instance: https://suntechbalu05.testrail.io
2. Go to your profile settings
3. Check the API Keys section
4. Make sure you're copying the full API key (including any special characters)

## Step 6: Check TestRail Instance Settings

Some TestRail instances might have:
- API access disabled
- Different authentication methods
- Custom API endpoints

Contact your TestRail administrator if:
- The curl tests fail
- You can't find API keys in your settings
- You get permission errors

## Step 7: Report Results

After running the manual tests, let me know:
1. Which curl command worked (if any)
2. What error messages you got
3. Whether you can see API keys in your TestRail settings

This will help us identify the exact issue and fix the integration accordingly. 