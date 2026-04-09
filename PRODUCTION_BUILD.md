# Production Build Guide

This document explains how to build and run the application in production mode for optimal performance.

## Key Production Optimizations

### 1. Next.js Optimizations
- **SWC Minification**: Faster than Terser, enabled automatically
- **Standalone Output**: Creates optimized standalone build for Docker
- **Image Optimization**: AVIF and WebP formats with caching
- **Source Maps**: Disabled in production for security
- **Compression**: Enabled for all responses
- **React Strict Mode**: Enabled for better error detection

### 2. Docker Optimizations
- **Multi-stage Build**: Reduces final image size
- **Layer Caching**: Optimized for faster rebuilds
- **Non-root User**: Runs as `nextjs` user for security
- **Production Dependencies Only**: Only installs production packages in final image

### 3. Environment Variables
All containers now use `NODE_ENV=production` which enables:
- Code minification
- Tree shaking
- Dead code elimination
- Optimized React rendering
- Reduced bundle sizes

## Building for Production

### Main Application

```bash
# Build production image
docker-compose build

# Start production containers
docker-compose up -d
```

### Tenant Applications

Tenant applications are automatically configured for production when created via the tenant manager.

## Performance Improvements

### Before (Development)
- Large bundle sizes (unminified)
- No code splitting optimizations
- Development dependencies included
- Source maps enabled
- Verbose logging

### After (Production)
- **~60-70% smaller bundle sizes**
- **Optimized code splitting**
- **Production dependencies only**
- **No source maps** (security + size)
- **Minimal logging**
- **Faster page loads**
- **Better caching**

## Build Commands

### Local Production Build (for testing)

```bash
# Build the application
npm run build

# Start production server
npm run start
```

### Docker Production Build

```bash
# Build with production Dockerfile
docker build -f https-setup/Dockerfile.prod -t upmy-prod:latest .

# Or use docker-compose
docker-compose build
docker-compose up -d
```

## Monitoring Production

### Check Build Size
```bash
# After building, check .next folder size
du -sh .next
```

### Check Container Resources
```bash
# Monitor container resource usage
docker stats
```

### Check Logs
```bash
# View production logs
docker-compose logs -f
```

## Important Notes

1. **SSL Certificates**: Production build still requires SSL certificates for HTTPS. Ensure certificates are available in `https-setup/` directory.

2. **Environment Variables**: Make sure all required environment variables are set in `.env` file before building.

3. **Database**: MongoDB containers are unchanged - they don't need production-specific configuration.

4. **Nango Server**: Nango server configuration remains the same - it's already optimized.

## Troubleshooting

### Build Fails with "Cannot find module"
- Ensure all dependencies are listed in `package.json`
- Run `npm install` before building

### Container Won't Start
- Check logs: `docker-compose logs`
- Verify environment variables are set
- Ensure SSL certificates exist

### Performance Issues
- Check container resources: `docker stats`
- Verify `NODE_ENV=production` is set
- Check network connectivity to database

## Rollback to Development

If you need to switch back to development mode:

1. Update `docker-compose.yml`:
   ```yaml
   dockerfile: https-setup/Dockerfile
   environment:
     - NODE_ENV=development
   ```

2. Rebuild containers:
   ```bash
   docker-compose down
   docker-compose build
   docker-compose up -d
   ```

