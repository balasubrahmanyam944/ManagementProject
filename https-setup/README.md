# UPMY HTTPS Setup Package

This package contains everything needed to run UPMY with HTTPS support on any system, including all SSL certificates, scripts, and configuration files.

## 📦 Package Contents

```
https-setup/
├── mkcert.exe                    # Windows mkcert executable
├── localhost+4.pem               # SSL certificate (valid until Nov 2027)
├── localhost+4-key.pem           # SSL private key
├── server.js                     # Custom HTTPS server
├── setup-https-windows.bat       # Windows automatic setup script
├── setup-https-linux.sh          # Linux/macOS automatic setup script
├── Dockerfile                    # Docker container setup
├── docker-compose.yml            # Docker Compose with MongoDB
└── README.md                     # This documentation
```

## 🚀 Quick Start

### Option 1: Automatic Setup (Recommended)

**Windows:**
```cmd
cd https-setup
setup-https-windows.bat
```

**Linux/macOS:**
```bash
cd https-setup
chmod +x setup-https-linux.sh
./setup-https-linux.sh
```

### Option 2: Manual Setup

1. **Copy files to project root:**
   ```bash
   cp https-setup/localhost+*.pem .
   cp https-setup/server.js .
   ```

2. **Install mkcert CA:**
   ```bash
   # Windows
   https-setup/mkcert.exe -install
   
   # Linux/macOS (download appropriate version first)
   ./mkcert -install
   ```

3. **Update environment variables:**
   - Copy your current `.env` to `.env.local`
   - Replace all HTTP URLs with HTTPS URLs
   - Update IP address to your current network IP

4. **Start the application:**
   ```bash
   npm run dev
   ```

### Option 3: Docker Deployment

```bash
cd https-setup
docker-compose up --build
```

## 🌐 Network Access

The certificates are generated for:
- `localhost` (127.0.0.1)
- Your current network IP (e.g., 172.16.34.21)
- IPv6 localhost (::1)

**Access URLs:**
- Local: `https://localhost:9003`
- Network: `https://[YOUR_IP]:9003`

## 🔧 Configuration

### Environment Variables

The setup automatically configures these HTTPS URLs:

```env
NEXTAUTH_URL=https://[YOUR_IP]:9003
APP_URL=https://[YOUR_IP]:9003
NEXT_PUBLIC_APP_URL=https://[YOUR_IP]:9003
JIRA_OAUTH_REDIRECT_URI=https://[YOUR_IP]:9003/api/auth/jira/callback
```

### OAuth App Updates Required

After setup, update your OAuth app configurations:

**Jira (Atlassian Developer Console):**
- Callback URL: `https://[YOUR_IP]:9003/api/auth/jira/callback`
- Allowed origins: `https://[YOUR_IP]:9003`

**Trello (Trello Developer Console):**
- Callback URL: `https://[YOUR_IP]:9003/api/auth/trello/callback`
- Allowed origins: `https://[YOUR_IP]:9003`

## 📋 Package.json Scripts

Ensure your `package.json` has these scripts:

```json
{
  "scripts": {
    "dev": "node server.js",
    "dev:http": "next dev --turbopack -p 9003",
    "build": "next build",
    "start": "next start"
  }
}
```

## 🐳 Docker Deployment

The package includes complete Docker support:

**Build and run:**
```bash
cd https-setup
docker-compose up --build
```

**Features:**
- ✅ HTTPS enabled
- ✅ MongoDB included
- ✅ All certificates pre-configured
- ✅ Environment variables set
- ✅ Production ready

## 🔒 Security Features

- **Valid SSL Certificates:** Generated with mkcert, trusted by system
- **Multi-domain Support:** Works on localhost and network IP
- **Long Validity:** Certificates valid until November 2027
- **Secure Secrets:** Includes generated NEXTAUTH_SECRET
- **Production Ready:** Docker setup for deployment

## 🛠️ Troubleshooting

### Certificate Issues
```bash
# Reinstall CA
./mkcert -install

# Regenerate certificates with your IP
./mkcert localhost 127.0.0.1 [YOUR_IP] ::1
```

### Browser Security Warnings
- Chrome: Click "Advanced" → "Proceed to localhost (unsafe)"
- Firefox: Click "Advanced" → "Accept the Risk and Continue"
- Edge: Click "Advanced" → "Continue to localhost (unsafe)"

### Network Access Issues
1. Check firewall settings (allow port 9003)
2. Verify IP address in certificates matches your network IP
3. Update OAuth app callback URLs

### Docker Issues
```bash
# Rebuild containers
docker-compose down
docker-compose up --build

# Check logs
docker-compose logs upmy-app
```

## 📂 File Structure After Setup

```
your-project/
├── https-setup/              # This package (keep for future use)
├── localhost+4.pem           # SSL certificate (copied)
├── localhost+4-key.pem       # SSL private key (copied)
├── server.js                 # HTTPS server (copied)
├── .env.local                # Updated with HTTPS URLs
├── package.json              # Updated scripts
└── ... (rest of your project)
```

## 🔄 Migration to New Systems

To deploy on a new system:

1. **Clone your repository** (includes `https-setup/` directory)
2. **Run setup script** for your platform
3. **Update OAuth apps** with new IP address
4. **Start application:** `npm run dev`

The certificates will work on any system with the same IP range, or you can regenerate them with the new IP.

## ✅ Verification

After setup, verify HTTPS is working:

1. **Check server startup:**
   ```
   🔒 HTTPS Server ready!
      Local:    https://localhost:9003
      Network:  https://[your-ip]:9003
   ```

2. **Test in browser:**
   - Should show secure lock icon
   - No certificate warnings
   - All integrations working

3. **Test network access:**
   - Access from another device on same network
   - Should work without certificate errors

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Verify your firewall allows port 9003
3. Ensure OAuth apps are updated with HTTPS URLs
4. Check that certificates include your current IP address

## 🎉 Benefits

- ✅ **Portable:** Works on any system
- ✅ **Secure:** Real SSL certificates
- ✅ **Network Ready:** Access from other devices
- ✅ **Docker Ready:** Container deployment
- ✅ **Long-lasting:** Certificates valid until 2027
- ✅ **Automated:** One-click setup scripts
- ✅ **Production Ready:** Complete deployment solution 