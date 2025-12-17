const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const https = require('https');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

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
    
    // Log what we're sending
    console.log(`🔄 Proxying: ${req.method} ${req.url} -> ${proxyReq.path}`);
    console.log(`   Outgoing headers: X-Api-Key=${NORTHPASS_API_KEY.substring(0, 8)}...`);
  },
  onProxyRes: (proxyRes, req, res) => {
    // Add CORS headers for browser requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'X-Api-Key, Content-Type, Accept');
    console.log(`✅ Response: ${proxyRes.statusCode} for ${req.url}`);
  }
});

// Handle CORS preflight requests for the API proxy
app.options('/api/northpass/*', (req, res) => {
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

// ALL other requests get index.html with no caching (SPA routing)
app.get('*', (req, res) => {
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Northpass Partner Portal with Proxy running on http://0.0.0.0:${PORT}`);
  console.log(`🌐 External access: http://20.125.24.28:${PORT}`);
  console.log(`📁 Serving from: ${__dirname}`);
  console.log(`🔗 API Proxy: /api/northpass -> https://api.northpass.com`);
});