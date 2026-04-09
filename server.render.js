const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = false; // Always production for Render
const port = process.env.PORT || 10000; // Render uses 10000 by default

// Set JWT secret if not already set
if (!process.env.NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = 'upmy-portfolio-secret-key-change-this-in-env-vars';
}

console.log(`🚀 Starting server in RENDER.COM production mode`);
console.log(`📦 Port: ${port}`);

// Initialize the Next.js app
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const tenantBasePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';

  // Create HTTP server (Render handles SSL)
  createServer(async (req, res) => {
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
      console.log(`🚀 Your app is now running on Render.com!`);
      console.log(`🔗 URL: http://localhost:${port}`);
    });
});
