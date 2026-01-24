---
sidebar_position: 13
title: Server Config
---

# Server Configuration

## Express Server

**File**: `server-with-proxy.cjs`

### Features
- Static file serving from `dist/`
- API proxy to Northpass
- Database routes
- Cache headers
- Security headers

### Port
Default: `3000`

### Static Files

```javascript
app.use(express.static('dist', {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (path.match(/\.(js|css)$/) && path.includes('-')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));
```

### API Proxy

```javascript
const { createProxyMiddleware } = require('http-proxy-middleware');

app.use('/api/northpass', createProxyMiddleware({
  target: 'https://api.northpass.com',
  changeOrigin: true,
  pathRewrite: { '^/api/northpass': '' },
  onProxyReq: (proxyReq) => {
    proxyReq.setHeader('X-Api-Key', NORTHPASS_API_KEY);
  },
}));
```

### Route Loading Order

```javascript
// 1. Modular routes (specific paths)
app.use('/api/db/sync', syncRoutes);
app.use('/api/db/reports', reportRoutes);
app.use('/api/db/trends', trendRoutes);
app.use('/api/db/analytics', analyticsRoutes);

// 2. Core database routes (catch-all)
app.use('/api/db', dbRoutes);

// 3. Impartner routes
app.use('/api/impartner', impartnerRoutes);

// 4. SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
```

## PM2 Configuration

**Process name**: `northpass-portal`

### Start Command
```bash
pm2 start server-with-proxy.cjs --name northpass-portal
```

### PM2 Ecosystem File (optional)
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'northpass-portal',
    script: 'server-with-proxy.cjs',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
  }]
};
```

## Nginx (if used)

```nginx
server {
    listen 443 ssl;
    server_name ptrlrndb.prod.ntxgallery.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Security Headers

Applied by Express:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

## Database Connection

Configured in `server/db/connection.cjs` with connection pooling:
- Max connections: 10
- Acquire timeout: 30s
