const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 9003;

// Set JWT secret if not already set
if (!process.env.NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = 'upmy-super-secret-jwt-key-for-development-only-change-in-production-2024';
}

console.log(`🚀 Starting server in ${dev ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);
console.log(`📦 NODE_ENV: ${process.env.NODE_ENV}`);

// Initialize the Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// SSL certificate paths
const keyPath = path.join(__dirname, 'localhost+4-key.pem');
const certPath = path.join(__dirname, 'localhost+4.pem');

app.prepare().then(() => {
  // Check if SSL certificates exist
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.log('❌ SSL certificates not found!');
    console.log('Please run the following commands to generate SSL certificates:');
    console.log('');
    console.log('1. Install mkcert:');
    console.log('   - Windows: choco install mkcert  OR  scoop install mkcert');
    console.log('   - macOS: brew install mkcert');
    console.log('   - Linux: Follow instructions at https://github.com/FiloSottile/mkcert');
    console.log('');
    console.log('2. Install local CA: mkcert -install');
    console.log('');
    console.log('3. Generate certificates: mkcert localhost 127.0.0.1 [your-ip] ::1');
    console.log('');
    console.log('Expected files:');
    console.log(`   - ${keyPath}`);
    console.log(`   - ${certPath}`);
    console.log('');
    console.log('Then run: npm run dev');
    process.exit(1);
  }

  // Read SSL certificates
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };

  const tenantBasePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';

  // Create HTTPS server
  createServer(httpsOptions, async (req, res) => {
    try {
      // Rewrite /api/auth/* to <basePath>/api/auth/* when basePath is set
      if (tenantBasePath && req.url && req.url.startsWith('/api/auth')) {
        const rewritten = `${tenantBasePath}${req.url}`;
        req.url = rewritten;
      }

      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  })
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log('🔒 HTTPS Server ready!');
      console.log(`   Local:    https://${hostname}:${port}`);
      console.log(`   Network:  https://[your-ip]:${port}`);
      console.log('');
      console.log('✅ SSL certificates loaded successfully');
      console.log(`🚀 Your app is now running securely with HTTPS in ${dev ? 'DEVELOPMENT' : 'PRODUCTION'} mode!`);
      
      if (!dev) {
        console.log('');
        console.log('🏭 Production optimizations enabled:');
        console.log('   - Code minification');
        console.log('   - Static optimization');
        console.log('   - Server-side rendering');
        console.log('   - Asset optimization');
      }
    });
}); 