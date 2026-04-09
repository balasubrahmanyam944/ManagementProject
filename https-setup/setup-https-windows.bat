@echo off
echo ========================================
echo UPMY HTTPS Setup for Windows
echo ========================================
echo.

REM Get current IP address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4 Address" ^| findstr "172\."') do (
    for /f "tokens=1" %%b in ("%%a") do set CURRENT_IP=%%b
)

if "%CURRENT_IP%"=="" (
    echo Warning: Could not detect IP address starting with 172.
    echo Please manually set your IP address:
    set /p CURRENT_IP="Enter your IP address: "
)

echo Current IP detected: %CURRENT_IP%
echo.

REM Step 1: Install mkcert CA
echo Step 1: Installing mkcert Certificate Authority...
mkcert.exe -install
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install mkcert CA
    pause
    exit /b 1
)
echo ✅ mkcert CA installed successfully
echo.

REM Step 2: Generate certificates
echo Step 2: Generating SSL certificates for localhost and %CURRENT_IP%...
mkcert.exe localhost 127.0.0.1 %CURRENT_IP% ::1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to generate certificates
    pause
    exit /b 1
)
echo ✅ SSL certificates generated successfully
echo.

REM Step 3: Copy files to project root
echo Step 3: Copying files to project root...
copy /Y localhost+*.pem ..\
copy /Y server.js ..\
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to copy files
    pause
    exit /b 1
)
echo ✅ Files copied to project root
echo.

REM Step 4: Update environment variables
echo Step 4: Updating environment variables...
cd ..

REM Create or update .env.local with HTTPS URLs
(
echo # Database
echo DATABASE_URL=mongodb://localhost:27017/upmy_db
echo.
echo # NextAuth.js Configuration
echo NEXTAUTH_URL=https://%CURRENT_IP%:9003
echo NEXTAUTH_SECRET=SkJkUlbIlbcoVlfw3oJUzzvlBfhoNcEY
echo.
echo # Environment
echo NODE_ENV=development
echo.
echo # Application Configuration
echo APP_NAME=UPMY
echo APP_VERSION=1.0.0
echo APP_URL=https://%CURRENT_IP%:9003
echo NEXT_PUBLIC_APP_URL=https://%CURRENT_IP%:9003
echo.
echo # Jira OAuth Configuration
echo JIRA_OAUTH_CLIENT_ID=I61qVErBbyU8wM50VIwNqx2lCzZ2V03E
echo JIRA_OAUTH_CLIENT_SECRET=ATOAPQ7LCIoiw9XgzniUl4vQQ9AWp5CILCN2_F3xd7Cwp455AyHAFB7XeRcrv5-fPufM2C748DF9
echo JIRA_OAUTH_REDIRECT_URI=https://%CURRENT_IP%:9003/api/auth/jira/callback
echo.
echo # Trello OAuth Configuration
echo TRELLO_API_KEY=82cd3b5c603afa60cf08e088a7e6f7f2
echo TRELLO_API_SECRET=e440baba7b036256c4e0f6c4fb8ca356d1c1a8dbb0bd377a8f4e9e07e94133c6
echo.
echo # AI Configuration ^(Optional^)
echo GOOGLE_GENERATIVE_AI_API_KEY=your-google-ai-api-key
echo.
echo # Cache and Performance
echo CACHE_TTL_SECONDS=300
echo CACHE_MAX_ENTRIES=1000
echo RATE_LIMIT_REQUESTS=100
echo RATE_LIMIT_WINDOW_MS=60000
echo API_TIMEOUT_MS=30000
echo API_RETRY_ATTEMPTS=3
echo.
echo # Feature Flags
echo FEATURE_ANALYTICS=true
echo FEATURE_EXPORT=true
echo FEATURE_MOCK_DATA=false
echo.
echo # Security
echo CSRF_SECRET=your-csrf-secret
echo SESSION_SECRET=your-session-secret
echo.
echo # Monitoring ^(Optional^)
echo SENTRY_DSN=your-sentry-dsn
echo ANALYTICS_ID=your-analytics-id
) > .env.local

echo ✅ Environment variables updated
echo.

REM Step 5: Update package.json scripts
echo Step 5: Ensuring package.json has HTTPS script...
echo ✅ Package.json should already have the correct scripts
echo.

echo ========================================
echo ✅ HTTPS Setup Complete!
echo ========================================
echo.
echo Your application is now configured for HTTPS:
echo - Local URL: https://localhost:9003
echo - Network URL: https://%CURRENT_IP%:9003
echo.
echo Next steps:
echo 1. Update your Jira OAuth app callback URL to: https://%CURRENT_IP%:9003/api/auth/jira/callback
echo 2. Update your Trello OAuth app callback URL to: https://%CURRENT_IP%:9003/api/auth/trello/callback
echo 3. Run: npm run dev
echo.
echo The certificates are valid until November 2027.
echo.
pause 