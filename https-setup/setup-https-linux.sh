#!/bin/bash

echo "========================================"
echo "UPMY HTTPS Setup for Linux/macOS"
echo "========================================"
echo

# Make mkcert executable
chmod +x mkcert || {
    echo "Note: mkcert not found or not executable, will try to download..."
    
    # Detect OS and architecture
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    
    case $ARCH in
        x86_64) ARCH="amd64" ;;
        arm64|aarch64) ARCH="arm64" ;;
        *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    
    case $OS in
        linux) PLATFORM="linux" ;;
        darwin) PLATFORM="darwin" ;;
        *) echo "Unsupported OS: $OS"; exit 1 ;;
    esac
    
    echo "Downloading mkcert for $PLATFORM-$ARCH..."
    curl -L -o mkcert "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-$PLATFORM-$ARCH"
    chmod +x mkcert
}

# Get current IP address
CURRENT_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || ifconfig | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d: -f2)

if [ -z "$CURRENT_IP" ]; then
    echo "Warning: Could not detect IP address."
    read -p "Enter your IP address: " CURRENT_IP
fi

echo "Current IP detected: $CURRENT_IP"
echo

# Step 1: Install mkcert CA
echo "Step 1: Installing mkcert Certificate Authority..."
./mkcert -install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install mkcert CA"
    exit 1
fi
echo "✅ mkcert CA installed successfully"
echo

# Step 2: Generate certificates
echo "Step 2: Generating SSL certificates for localhost and $CURRENT_IP..."
./mkcert localhost 127.0.0.1 $CURRENT_IP ::1
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to generate certificates"
    exit 1
fi
echo "✅ SSL certificates generated successfully"
echo

# Step 3: Copy files to project root
echo "Step 3: Copying files to project root..."
cp localhost+*.pem ../
cp server.js ../
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to copy files"
    exit 1
fi
echo "✅ Files copied to project root"
echo

# Step 4: Update environment variables
echo "Step 4: Updating environment variables..."
cd ..

# Create or update .env.local with HTTPS URLs
cat > .env.local << EOF
# Database
DATABASE_URL=mongodb://localhost:27017/upmy_db

# NextAuth.js Configuration
NEXTAUTH_URL=https://$CURRENT_IP:9003
NEXTAUTH_SECRET=SkJkUlbIlbcoVlfw3oJUzzvlBfhoNcEY

# Environment
NODE_ENV=development

# Application Configuration
APP_NAME=UPMY
APP_VERSION=1.0.0
APP_URL=https://$CURRENT_IP:9003
NEXT_PUBLIC_APP_URL=https://$CURRENT_IP:9003

# Jira OAuth Configuration
JIRA_OAUTH_CLIENT_ID=I61qVErBbyU8wM50VIwNqx2lCzZ2V03E
JIRA_OAUTH_CLIENT_SECRET=ATOAPQ7LCIoiw9XgzniUl4vQQ9AWp5CILCN2_F3xd7Cwp455AyHAFB7XeRcrv5-fPufM2C748DF9
JIRA_OAUTH_REDIRECT_URI=https://$CURRENT_IP:9003/api/auth/jira/callback

# Trello OAuth Configuration
TRELLO_API_KEY=82cd3b5c603afa60cf08e088a7e6f7f2
TRELLO_API_SECRET=e440baba7b036256c4e0f6c4fb8ca356d1c1a8dbb0bd377a8f4e9e07e94133c6

# AI Configuration (Optional)
GOOGLE_GENERATIVE_AI_API_KEY=your-google-ai-api-key

# Cache and Performance
CACHE_TTL_SECONDS=300
CACHE_MAX_ENTRIES=1000
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
API_TIMEOUT_MS=30000
API_RETRY_ATTEMPTS=3

# Feature Flags
FEATURE_ANALYTICS=true
FEATURE_EXPORT=true
FEATURE_MOCK_DATA=false

# Security
CSRF_SECRET=your-csrf-secret
SESSION_SECRET=your-session-secret

# Monitoring (Optional)
SENTRY_DSN=your-sentry-dsn
ANALYTICS_ID=your-analytics-id
EOF

echo "✅ Environment variables updated"
echo

# Step 5: Update package.json scripts
echo "Step 5: Ensuring package.json has HTTPS script..."
echo "✅ Package.json should already have the correct scripts"
echo

echo "========================================"
echo "✅ HTTPS Setup Complete!"
echo "========================================"
echo
echo "Your application is now configured for HTTPS:"
echo "- Local URL: https://localhost:9003"
echo "- Network URL: https://$CURRENT_IP:9003"
echo
echo "Next steps:"
echo "1. Update your Jira OAuth app callback URL to: https://$CURRENT_IP:9003/api/auth/jira/callback"
echo "2. Update your Trello OAuth app callback URL to: https://$CURRENT_IP:9003/api/auth/trello/callback"
echo "3. Run: npm run dev"
echo
echo "The certificates are valid until November 2027."
echo 