const { createServer } = require('https');
const { parse } = require('url');
const fs = require('fs');
const path = require('path');
const http = require('http');

const port = process.env.PORT || 9003;
const hostname = process.env.HOSTNAME || '0.0.0.0';
const tenantBasePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';

// SSL certificate paths
const keyPath = path.join(__dirname, 'localhost+4-key.pem');
const certPath = path.join(__dirname, 'localhost+4.pem');

// Check if SSL certificates exist
if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error('❌ SSL certificates not found!');
  console.error(`Expected files:`);
  console.error(`   - ${keyPath}`);
  console.error(`   - ${certPath}`);
  console.error('');
  console.error('SSL certificates should be mounted as volumes in docker-compose.yml');
  process.exit(1);
}

// Read SSL certificates
const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

// Initialize Next.js standalone server
async function initializeServer() {
  try {
    console.log('🔧 Loading Next.js standalone server...');
    
    // Set up environment for standalone build
    process.env.NODE_ENV = 'production';
    const originalChdir = process.cwd();
    process.chdir(__dirname);
    
    // Create an internal HTTP server that will be used by Next.js
    // We'll proxy HTTPS requests to this HTTP server
    const internalPort = 0; // Let Node.js assign a random port
    let nextHandler = null;
    
    // Patch http.createServer to capture the Next.js handler
    const originalCreateServer = http.createServer;
    http.createServer = function(...args) {
      if (args.length > 0 && typeof args[0] === 'function') {
        nextHandler = args[0];
        console.log('✅ Captured Next.js request handler');
      }
      // Return the original server so Next.js can set it up
      return originalCreateServer.apply(this, args);
    };
    
    // Temporarily change PORT so Next.js doesn't try to listen on the real port
    const originalPort = process.env.PORT;
    process.env.PORT = '0'; // Use port 0 to let Next.js create server without binding
    
    try {
      // Load the standalone server - it will create an HTTP server
      const standaloneServerPath = path.join(__dirname, 'server.standalone.js');
      if (!fs.existsSync(standaloneServerPath)) {
        throw new Error(`Standalone server not found at ${standaloneServerPath}`);
      }
      
      // Require the standalone server - it will call startServer
      require(standaloneServerPath);
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      // Restore http.createServer
      http.createServer = originalCreateServer;
      // Restore PORT
      if (originalPort) process.env.PORT = originalPort;
      // Restore working directory
      process.chdir(originalChdir);
    }
    
    // If handler wasn't captured, try direct method
    if (!nextHandler) {
      console.warn('⚠️ Handler not captured, trying direct method...');
      try {
        const { getRequestHandlers } = require('next/dist/server/lib/start-server');
        const handlers = await getRequestHandlers({
          dir: __dirname,
          hostname: hostname,
          port: port,
          dev: false,
          isNodeDebugging: false,
          keepAliveTimeout: undefined
        });
        
        // The handler might be in different properties
        nextHandler = handlers?.handleRequest || handlers?.handle || handlers;
        
        if (nextHandler && typeof nextHandler === 'function') {
          console.log('✅ Got handler via getRequestHandlers');
        } else {
          throw new Error('getRequestHandlers returned invalid handler');
        }
      } catch (directError) {
        console.error('❌ Direct method failed:', directError.message);
        throw new Error(`Could not get request handler: ${directError.message}`);
      }
    }
    
    if (!nextHandler || typeof nextHandler !== 'function') {
      throw new Error('Could not get request handler from standalone server');
    }
    
    console.log('✅ Next.js standalone server loaded successfully');
    
    // Create HTTPS server wrapper
    const httpsServer = createServer(httpsOptions, async (req, res) => {
      try {
        console.log(`📥 Incoming request: ${req.method} ${req.url}`);
        
        // Redirect /shared/project/* to <basePath>/shared/project/* when basePath is set
        if (tenantBasePath && req.url && req.url.startsWith('/shared/project/') && !req.url.startsWith(`${tenantBasePath}/shared/project/`)) {
          const shareId = req.url.replace('/shared/project/', '');
          const redirectUrl = `${tenantBasePath}/shared/project/${shareId}`;
          console.log(`🔄 Server: Redirecting ${req.url} to ${redirectUrl}`);
          res.writeHead(307, { 'Location': redirectUrl });
          res.end();
          return;
        }
        
        // Rewrite /api/auth/* to <basePath>/api/auth/* when basePath is set
        if (tenantBasePath && req.url && req.url.startsWith('/api/auth')) {
          const rewritten = `${tenantBasePath}${req.url}`;
          req.url = rewritten;
          console.log(`🔄 Rewritten URL: ${req.url}`);
        }

        const parsedUrl = parse(req.url, true);
        
        // Call the Next.js handler
        console.log(`✅ Calling Next.js handler for: ${parsedUrl.pathname}`);
        await nextHandler(req, res, parsedUrl);
      } catch (err) {
        console.error('❌ Error occurred handling', req.url, err);
        console.error('Error stack:', err.stack);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end('internal server error');
        }
      }
    });

    httpsServer.once('error', (err) => {
      console.error('Server error:', err);
      process.exit(1);
    });

    httpsServer.listen(port, hostname, () => {
      console.log('🔒 HTTPS Server ready!');
      console.log(`   Local:    https://localhost:${port}`);
      console.log(`   Network:  https://${hostname}:${port}`);
      if (tenantBasePath) {
        console.log(`   BasePath: ${tenantBasePath}`);
      }
      console.log('');
      console.log('✅ SSL certificates loaded successfully');
      console.log('🚀 Your app is now running securely with HTTPS in PRODUCTION mode!');
    });
  } catch (error) {
    console.error('❌ Failed to initialize server:', error.message);
    console.error('Error details:', error.stack);
    console.error('');
    console.error('Make sure:');
    console.error('1. The Next.js build completed successfully');
    console.error('2. The standalone output was generated');
    console.error('3. server.standalone.js exists in the container');
    process.exit(1);
  }
}

// Start the server initialization
initializeServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
