# TestRail Manual Test - PowerShell Version

Since you're using PowerShell on Windows, use these commands instead of curl.

## Step 1: Basic Test

Replace `YOUR_ACTUAL_API_KEY` with your 41-character API key and run:

```powershell
$headers = @{
    'Content-Type' = 'application/json'
}

$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("balu.suntech@gmail.com:YOUR_ACTUAL_API_KEY"))

$response = Invoke-WebRequest -Uri "https://suntechbalu05.testrail.io/index.php?/api/v2/get_projects" -Headers $headers -Headers @{Authorization = "Basic $base64Auth"}

Write-Host "Status Code: $($response.StatusCode)"
Write-Host "Response: $($response.Content)"
```

## Step 2: Alternative Endpoint Test

If the first test fails, try this alternative endpoint:

```powershell
$headers = @{
    'Content-Type' = 'application/json'
}

$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("balu.suntech@gmail.com:YOUR_ACTUAL_API_KEY"))

$response = Invoke-WebRequest -Uri "https://suntechbalu05.testrail.io/api/v2/get_projects" -Headers $headers -Headers @{Authorization = "Basic $base64Auth"}

Write-Host "Status Code: $($response.StatusCode)"
Write-Host "Response: $($response.Content)"
```

## Step 3: Error Handling Version

This version will handle errors gracefully:

```powershell
$headers = @{
    'Content-Type' = 'application/json'
}

$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("balu.suntech@gmail.com:YOUR_ACTUAL_API_KEY"))

try {
    $response = Invoke-WebRequest -Uri "https://suntechbalu05.testrail.io/index.php?/api/v2/get_projects" -Headers $headers -Headers @{Authorization = "Basic $base64Auth"}
    Write-Host "SUCCESS! Status Code: $($response.StatusCode)"
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "ERROR! Status Code: $($_.Exception.Response.StatusCode)"
    Write-Host "Error Message: $($_.Exception.Message)"
}
```

## Step 4: Quick Test Script

Create a file called `test-testrail.ps1` with this content:

```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$ApiKey
)

$headers = @{
    'Content-Type' = 'application/json'
}

$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("balu.suntech@gmail.com:$ApiKey"))

Write-Host "Testing TestRail connection..."
Write-Host "API Key length: $($ApiKey.Length) characters"

try {
    $response = Invoke-WebRequest -Uri "https://suntechbalu05.testrail.io/index.php?/api/v2/get_projects" -Headers $headers -Headers @{Authorization = "Basic $base64Auth"}
    Write-Host "SUCCESS! Status Code: $($response.StatusCode)"
    Write-Host "Projects found: $($response.Content | ConvertFrom-Json | Measure-Object | Select-Object -ExpandProperty Count)"
} catch {
    Write-Host "ERROR! Status Code: $($_.Exception.Response.StatusCode)"
    Write-Host "Error Message: $($_.Exception.Message)"
}
```

Then run it like this:
```powershell
.\test-testrail.ps1 -ApiKey "YOUR_ACTUAL_API_KEY"
```

## Expected Results

### If successful, you should see:
```
SUCCESS! Status Code: 200
Projects found: X
```

### If authentication fails, you'll see:
```
ERROR! Status Code: 401
Error Message: The remote server returned an error: (401) Unauthorized.
```

## Troubleshooting

1. **Make sure you're using the correct API key** - copy it exactly from TestRail
2. **Check that your TestRail instance supports API access**
3. **Verify your email address** - use the exact email you use to log into TestRail
4. **Try generating a new API key** in TestRail if the current one doesn't work

## Report Results

After running the PowerShell tests, let me know:
1. Which command worked (if any)
2. What error messages you got
3. Whether you can see API keys in your TestRail settings

This will help us identify the exact issue and fix the integration accordingly. 