# 🔒 UPMY HTTPS Deployment Guide

This guide explains how to deploy UPMY with HTTPS support on any system using the included `https-setup/` package.

## 📦 What's Included

Your repository now contains a complete HTTPS deployment package:

```
https-setup/
├── 📄 README.md                     # Comprehensive documentation
├── 🔧 setup-https-windows.bat       # Windows one-click setup
├── 🔧 setup-https-linux.sh          # Linux/macOS one-click setup
├── 🛡️ mkcert.exe                    # Certificate authority tool
├── 📜 localhost+4.pem               # SSL certificate (valid until Nov 2027)
├── 🔑 localhost+4-key.pem           # SSL private key
├── 🚀 server.js                     # Custom HTTPS server
├── 🐳 Dockerfile                    # Docker container setup
├── 🐳 docker-compose.yml            # Complete Docker deployment
├── ✅ verify-setup.js               # Setup verification tool
└── 📋 .gitignore                    # Git ignore rules
```

## 🚀 Quick Deployment Options

### Option 1: One-Click Setup (Recommended)

**For Windows:**
```cmd
git clone [your-repo]
cd [your-repo]/https-setup
setup-https-windows.bat
```

**For Linux/macOS:**
```bash
git clone [your-repo]
cd [your-repo]/https-setup
chmod +x setup-https-linux.sh
./setup-https-linux.sh
```

### Option 2: Docker Deployment
```bash
git clone [your-repo]
cd [your-repo]/https-setup
docker-compose up --build
```

### Option 3: Manual Setup
See `https-setup/README.md` for detailed manual instructions.

## 🌐 Network Configuration

### Automatic IP Detection
The setup scripts automatically detect your network IP and configure:
- SSL certificates for your specific IP
- Environment variables with correct URLs
- OAuth callback URLs

### Manual IP Configuration
If automatic detection fails:
1. Find your IP: `ipconfig` (Windows) or `ifconfig` (Linux/macOS)
2. Update certificates: `./mkcert localhost 127.0.0.1 [YOUR_IP] ::1`
3. Update `.env.local` with your IP address

## 🔧 OAuth App Configuration

After deployment, update your OAuth applications:

### Jira (Atlassian Developer Console)
1. Go to: https://developer.atlassian.com/console/myapps/
2. Select your app → Authorization → OAuth 2.0 (3LO)
3. Update Callback URL: `https://[YOUR_IP]:9003/api/auth/jira/callback`
4. Add Authorized Origins: `https://[YOUR_IP]:9003`

### Trello (Trello Developer Console)  
1. Go to: https://trello.com/app-key
2. Click on your app token
3. Update Callback URL: `https://[YOUR_IP]:9003/api/auth/trello/callback`
4. Add Allowed Origins: `https://[YOUR_IP]:9003`

## 🔍 Verification

Run the verification tool to ensure everything is working:

```bash
cd https-setup
node verify-setup.js
```

This checks:
- ✅ SSL certificates are present
- ✅ HTTPS server file exists
- ✅ Environment variables configured
- ✅ Package.json scripts updated
- ✅ HTTPS connection working

## 🌍 Multi-System Deployment

### Same Network
The certificates work on any system with the same IP range. Simply:
1. Clone the repository (includes `https-setup/`)
2. Run setup script for your platform
3. Start application: `npm run dev`

### Different Network
For deployment on a different network:
1. Clone the repository
2. Run setup script (will detect new IP)
3. Update OAuth app callback URLs
4. Start application

### Production Deployment
For production environments:
1. Use Docker deployment option
2. Configure reverse proxy (nginx/Apache) if needed
3. Update DNS records for domain-based access
4. Consider using Let's Encrypt for production certificates

## 🐳 Docker Deployment Details

The Docker setup includes:
- **HTTPS enabled** with pre-configured certificates
- **MongoDB database** with persistent storage
- **All environment variables** properly set
- **Network access** configured for containers
- **Production optimized** build

**Commands:**
```bash
# Start services
docker-compose up --build

# Run in background
docker-compose up -d --build

# View logs
docker-compose logs -f upmy-app

# Stop services
docker-compose down

# Rebuild and restart
docker-compose down && docker-compose up --build
```

## 🔒 Security Considerations

### Certificate Validity
- Certificates valid until **November 2027**
- Trusted by all major browsers
- Works for localhost and network access

### Environment Variables
- Secure `NEXTAUTH_SECRET` included
- All HTTPS URLs configured
- Production-ready configuration

### Network Security
- HTTPS encrypts all traffic
- OAuth flows secured with HTTPS
- Database connections secured

## 🛠️ Troubleshooting

### Common Issues

**1. Certificate Errors**
```bash
# Reinstall CA
cd https-setup
./mkcert -install  # or mkcert.exe -install on Windows
```

**2. Port 9003 Already in Use**
```bash
# Kill existing processes
taskkill /f /im node.exe  # Windows
pkill -f node             # Linux/macOS
```

**3. Network Access Issues**
- Check firewall settings (allow port 9003)
- Verify IP address in certificates
- Update OAuth app URLs

**4. Docker Issues**
```bash
# Reset Docker environment
docker-compose down -v
docker system prune -f
docker-compose up --build
```

### Getting Help
1. Check `https-setup/README.md` for detailed troubleshooting
2. Run `node https-setup/verify-setup.js` for diagnostics
3. Check server logs for specific error messages

## 📋 Deployment Checklist

Before going live:

- [ ] Clone repository with `https-setup/` directory
- [ ] Run setup script for your platform
- [ ] Verify HTTPS is working (`https://localhost:9003`)
- [ ] Test network access from another device
- [ ] Update Jira OAuth callback URL
- [ ] Update Trello OAuth callback URL
- [ ] Test all integrations (Jira, Trello, TestRail)
- [ ] Verify test case generation and sending
- [ ] Check database connectivity
- [ ] Test user authentication flow

## 🎉 Benefits of This Setup

- ✅ **Zero Configuration**: One command deployment
- ✅ **Cross-Platform**: Works on Windows, Linux, macOS
- ✅ **Network Ready**: Access from any device on network
- ✅ **Docker Ready**: Container deployment included
- ✅ **Long-Lasting**: Certificates valid for 3+ years
- ✅ **Portable**: Complete package in repository
- ✅ **Secure**: Real SSL certificates, encrypted traffic
- ✅ **Production Ready**: Docker deployment for production

## 🔄 Updates and Maintenance

### Updating Certificates (if needed)
```bash
cd https-setup
./mkcert localhost 127.0.0.1 [NEW_IP] ::1
cp localhost+*.pem ../
```

### Updating IP Address
```bash
cd https-setup
# Run setup script again - it will detect new IP
./setup-https-windows.bat  # or setup-https-linux.sh
```

### Regenerating Secrets
```bash
# Generate new NEXTAUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Update .env.local with new secret
```

---

## 🚀 Ready to Deploy!

Your UPMY application is now ready for secure HTTPS deployment on any system. The `https-setup/` package contains everything needed for a complete, secure, and portable deployment.

**Start now:**
```bash
cd https-setup
# Windows: setup-https-windows.bat
# Linux/macOS: ./setup-https-linux.sh
# Docker: docker-compose up --build
```

**Access your secure application at:**
- Local: `https://localhost:9003`
- Network: `https://[your-ip]:9003`

🎉 **Enjoy your secure UPMY deployment!** 