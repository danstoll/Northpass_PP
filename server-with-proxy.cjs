const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

// Import database modules
let dbRoutes = null;
let dbInitialized = false;

// Socket.io instance (exported for use in sync services)
let io = null;

// Get the Socket.io instance
function getIO() {
  return io;
}

// Emit sync progress to all connected clients
function emitSyncProgress(syncType, data) {
  if (io) {
    io.emit('sync:progress', { syncType, ...data });
  }
}

// Emit sync completion
function emitSyncComplete(syncType, stats) {
  if (io) {
    io.emit('sync:complete', { syncType, stats, timestamp: new Date().toISOString() });
  }
}

// Emit sync error
function emitSyncError(syncType, error) {
  if (io) {
    io.emit('sync:error', { syncType, error: error.message || error, timestamp: new Date().toISOString() });
  }
}

// Export socket functions for use in other modules
module.exports = { getIO, emitSyncProgress, emitSyncComplete, emitSyncError };

// Try to initialize database (don't fail server if DB is unavailable)
async function initDb() {
  try {
    dbRoutes = require('./server/dbRoutes.cjs');
    await dbRoutes.initializeDatabase();
    dbInitialized = true;
    console.log('✅ MariaDB database connected and initialized');
  } catch (error) {
    console.warn('⚠️ MariaDB not available, running without database:', error.message);
    dbInitialized = false;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// JSON body parser for POST requests
app.use(express.json({ limit: '50mb' }));

// Disable Express default caching
app.set('etag', false);

// Hardcoded API key - the one we verified works
const NORTHPASS_API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk';

// Direct HTTPS request helper for Properties API (bypasses http-proxy-middleware issues)
function fetchFromNorthpass(apiPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.northpass.com',
      port: 443,
      path: apiPath,
      method: 'GET',
      headers: {
        'X-Api-Key': NORTHPASS_API_KEY,
        'Accept': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, data });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

// Proxy middleware for Northpass API
const northpassProxy = createProxyMiddleware({
  target: 'https://api.northpass.com',
  changeOrigin: true,
  secure: true,
  pathRewrite: {
    '^/api/northpass': '', // Remove /api/northpass prefix
  },
  onError: (err, req, res) => {
    console.error('❌ Proxy error:', err.message);
    res.status(500).json({ 
      error: 'Proxy error', 
      message: err.message,
      timestamp: new Date().toISOString()
    });
  },
  onProxyReq: (proxyReq, req, res) => {
    // ALWAYS set the API key from server-side - don't trust browser header
    proxyReq.setHeader('X-Api-Key', NORTHPASS_API_KEY);
    
    // Handle POST/PUT/PATCH body data
    if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
    
    // Log what we're sending
    console.log(`🔄 Proxying: ${req.method} ${req.url} -> ${proxyReq.path}`);
    console.log(`   Outgoing headers: X-Api-Key=${NORTHPASS_API_KEY.substring(0, 8)}...`);
    if (req.body) {
      console.log(`   Body: ${JSON.stringify(req.body)}`);
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    // Add CORS headers for browser requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'X-Api-Key, Content-Type, Accept');
    console.log(`✅ Response: ${proxyRes.statusCode} for ${req.url}`);
  }
});

// Handle CORS preflight requests for the API proxy
app.options('/api/northpass{/*path}', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Api-Key, Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
  res.status(204).end();
});

// Direct route for BULK Properties API - bypasses http-proxy-middleware
// This endpoint returns NPCU for ALL courses at once
app.get('/api/northpass/v2/properties/courses', async (req, res) => {
  const limit = req.query.limit || 100;
  const page = req.query.page || 1;
  const apiPath = `/v2/properties/courses?limit=${limit}&page=${page}`;
  
  try {
    console.log(`📡 Direct bulk fetch: ${apiPath}`);
    const result = await fetchFromNorthpass(apiPath);
    console.log(`✅ Direct bulk response: ${result.statusCode} for ${apiPath}`);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(result.statusCode);
    res.send(result.data);
  } catch (err) {
    console.error(`❌ Direct bulk fetch error: ${err.message} for ${apiPath}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: err.message });
  }
});

// Direct route for individual course Properties API - bypasses http-proxy-middleware
app.get('/api/northpass/v2/properties/courses/:courseId', async (req, res) => {
  const courseId = req.params.courseId;
  const apiPath = `/v2/properties/courses/${courseId}`;
  
  try {
    console.log(`📡 Direct fetch: ${apiPath}`);
    const result = await fetchFromNorthpass(apiPath);
    console.log(`✅ Direct response: ${result.statusCode} for ${apiPath}`);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(result.statusCode);
    res.send(result.data);
  } catch (err) {
    console.error(`❌ Direct fetch error: ${err.message} for ${apiPath}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: err.message });
  }
});

// Use the proxy for other /api/northpass routes
app.use('/api/northpass', northpassProxy);

// Load modular route modules
let modularRoutes = null;
try {
  modularRoutes = require('./server/routes/index.cjs');
  console.log('✅ Modular route modules loaded');
} catch (err) {
  console.warn('⚠️ Modular routes not loaded:', err.message);
}

// Mount modular routes BEFORE the catch-all dbRoutes (if database is available)
// These routes take precedence for their specific paths
if (modularRoutes) {
  const mountModularRoutes = (req, res, next) => {
    if (!dbInitialized) {
      return res.status(503).json({ error: 'Database not available' });
    }
    next();
  };
  
  app.use('/api/db/sync', mountModularRoutes, modularRoutes.syncRoutes);
  app.use('/api/db/reports', mountModularRoutes, modularRoutes.reportRoutes);
  app.use('/api/db/trends', mountModularRoutes, modularRoutes.trendRoutes);
  app.use('/api/db/analytics', mountModularRoutes, modularRoutes.analyticsRoutes);
  app.use('/api/db/group-analysis', mountModularRoutes, modularRoutes.groupRoutes);
  app.use('/api/db/maintenance', mountModularRoutes, modularRoutes.maintenanceRoutes);
  app.use('/api/db/families', mountModularRoutes, modularRoutes.partnerFamilyRoutes);
  app.use('/api/db/certifications', mountModularRoutes, modularRoutes.certificationRoutes);
  app.use('/api/db/pams', mountModularRoutes, modularRoutes.pamRoutes);
  app.use('/api/db/notifications', mountModularRoutes, modularRoutes.notificationRoutes);
  app.use('/api/db/leads', mountModularRoutes, modularRoutes.leadRoutes);

  // Tracking routes (page view analytics)
  try {
    const trackingRoutes = require('./server/routes/trackingRoutes.cjs');
    app.use('/api/track', trackingRoutes);
    console.log('✅ Tracking routes mounted at /api/track/*');
  } catch (err) {
    console.warn('⚠️ Tracking routes not loaded:', err.message);
  }

  console.log('✅ Modular routes mounted at /api/db/*');
}

// Database API routes - catch-all for remaining endpoints
app.use('/api/db', (req, res, next) => {
  if (dbRoutes && dbInitialized) {
    dbRoutes.router(req, res, next);
  } else {
    res.status(503).json({ error: 'Database not available' });
  }
});

// Impartner PRM API proxy (standalone integration)
let impartnerRoutes = null;
try {
  impartnerRoutes = require('./server/impartnerRoutes.cjs');
  app.use('/api/impartner', impartnerRoutes);
  console.log('✅ Impartner PRM API proxy loaded: /api/impartner/*');
} catch (err) {
  console.warn('⚠️ Impartner routes not loaded:', err.message);
}

// Serve documentation site at /docs/
app.use('/docs', express.static(path.join(__dirname, 'docs-site', 'build'), {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // HTML files should not be cached
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    // JS/CSS with hashes can be cached for 1 year
    else if (filePath.match(/\.(js|css)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Fallback for docs SPA routes
app.get('/docs/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs-site', 'build', 'index.html'));
});

// Serve static assets FIRST with proper caching (before security headers)
// Hashed JS/CSS files are cache-safe for 1 year
app.use('/assets', express.static(path.join(__dirname, 'dist', 'assets'), {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Security headers for all responses
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // JS/CSS files with hashes can be cached for 1 year (immutable)
    if (filePath.match(/\.(js|css)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } 
    // Images/fonts cache for 1 week
    else if (filePath.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
    // Other assets cache for 1 day
    else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// Serve root-level static files (signature images, favicon, etc.)
app.use(express.static(path.join(__dirname, 'dist'), {
  index: false, // Don't serve index.html for directory requests
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Images cache for 1 week
    if (filePath.match(/\.(png|jpg|jpeg|gif|svg|ico)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  }
}));

// Security headers for non-static routes
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// URL encoding helper (matches urlEncoder.js)
function encodeUrlParams(params) {
  const jsonString = JSON.stringify(params);
  return Buffer.from(jsonString)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Launch endpoint - redirects plain parameters to encoded URL
// Usage: /launch?company=CompanyName&tier=Premier
// Redirects to: /?data=eyJjb21wYW55Ijoi...
app.get('/launch', (req, res) => {
  const company = req.query.company || req.query.group;
  const tier = req.query.tier;
  
  if (!company) {
    return res.status(400).send('Missing required parameter: company or group');
  }
  
  const params = { company };
  if (tier) params.tier = tier;
  
  const encoded = encodeUrlParams(params);
  const redirectUrl = `/?data=${encoded}`;
  
  console.log(`🔗 Launch redirect: ${company} (${tier || 'no tier'}) -> ${redirectUrl}`);
  res.redirect(302, redirectUrl);
});

// Serve specific static files from dist root (favicon, etc)
app.get('/vite.svg', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'vite.svg'));
});
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'favicon.ico'));
});

// Serve index.html for root path
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(html);
});

// ALL other requests get index.html with no caching (SPA routing)
// Use middleware instead of route pattern for catch-all
app.use((req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(html);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Create HTTP server and attach Socket.io
const server = http.createServer(app);
io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173', 
      'http://localhost:3000',
      'http://20.125.24.28:3000',
      'https://ptrlrndb.prod.ntxgallery.com'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  // Send current sync status on connect
  socket.emit('connected', { 
    message: 'Connected to sync server',
    timestamp: new Date().toISOString()
  });
  
  // Handle client requesting sync status
  socket.on('sync:subscribe', (syncTypes) => {
    console.log(`📡 Client ${socket.id} subscribed to: ${syncTypes.join(', ')}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Northpass Partner Portal running on http://0.0.0.0:${PORT}`);
  console.log(`🌐 Production URL: https://ptrlrndb.prod.ntxgallery.com`);
  console.log(`📁 Serving from: ${__dirname}`);
  console.log(`🔗 API Proxy: /api/northpass -> https://api.northpass.com`);
  console.log(`🔌 WebSocket: Real-time sync updates enabled`);
  
  // Initialize database after server starts
  await initDb();
  if (dbInitialized) {
    console.log(`💾 Database API: /api/db/*`);
  }
});