/**
 * Impartner PRM API Proxy Routes
 * 
 * This module provides proxy access to the Impartner PRM API
 * Host: https://prod.impartner.live
 * 
 * AUTHENTICATION:
 * - Header: prm-key <api-key>
 * - Header: X-PRM-TenantId: 1
 * 
 * Main Objects:
 * - Account: Partner company accounts  
 * - User: Partner users/contacts (requires Admin/Member permissions)
 * 
 * API Pattern: GET /api/objects/v1/{ObjectName}?fields=&filter=&orderby=&skip=&take=
 * Response: { data: { count, entity, results: [] }, success: true }
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const router = express.Router();

// Impartner API Configuration
// Authentication: prm-key header + X-PRM-TenantId header
const IMPARTNER_CONFIG = {
  host: 'https://prod.impartner.live',
  // prm-key value (note: contains ! not I)
  apiKey: 'H4nFg5b!TGS5FpkN6koWTKWxN7wjZBwFN@w&CW*LT8@ed26CJfE$nfqemN$%X2RK2n9VGqB&8htCf@gyZ@7#J9WR$2B8go6Y1z@fVECzrkGj8XinsWD!4C%E^o2DKypw',
  // Tenant ID for Nintex
  tenantId: '1'
};

// Known object types from PRM
const KNOWN_OBJECTS = [
  'Account',      // Partner accounts
  'User',         // Partner users/contacts
  'Applicant',    // Partner applicants
  'Activity',     // Activities
  'Contact',      // Contacts
  'Lead',         // Leads
  'Opportunity',  // Opportunities
  'Deal'          // Deals
];

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Impartner PRM API Proxy',
    host: IMPARTNER_CONFIG.host,
    tenantId: IMPARTNER_CONFIG.tenantId,
    apiKeySet: !!IMPARTNER_CONFIG.apiKey,
    knownObjects: KNOWN_OBJECTS,
    authMethod: 'prm-key header + X-PRM-TenantId header'
  });
});

/**
 * Configuration endpoint - shows API usage
 */
router.get('/config', (req, res) => {
  res.json({
    host: IMPARTNER_CONFIG.host,
    tenantId: IMPARTNER_CONFIG.tenantId,
    apiKeySet: !!IMPARTNER_CONFIG.apiKey,
    authentication: {
      header1: 'prm-key: <api-key>',
      header2: 'X-PRM-TenantId: 1'
    },
    queryParams: {
      fields: 'Comma-separated list of fields to return (e.g., Id,Name,Email)',
      filter: 'Filter expression (e.g., Name eq \'Test\')',
      orderby: 'Field name to sort by',
      skip: 'Number of records to skip (pagination)',
      take: 'Number of records to return (pagination, default varies)'
    },
    notes: {
      account: 'Account object returns 0 results - may need specific fields or permissions',
      user: 'User object requires Admin/Member user type permissions'
    }
  });
});

/**
 * List known objects
 */
router.get('/objects', (req, res) => {
  res.json({
    objects: KNOWN_OBJECTS,
    apiPattern: 'GET /api/impartner/v1/{ObjectName}',
    examples: [
      '/api/impartner/v1/Account',
      '/api/impartner/v1/User',
      '/api/impartner/v1/Account?$top=10',
      "/api/impartner/v1/User?$filter=Email eq 'test@example.com'"
    ]
  });
});

/**
 * Proxy middleware for Impartner API
 * Routes: /api/impartner/* -> https://prod.impartner.live/api/objects/*
 */
const impartnerProxy = createProxyMiddleware({
  target: IMPARTNER_CONFIG.host,
  changeOrigin: true,
  secure: true,
  pathRewrite: {
    '^/api/impartner': '/api/objects'  // /api/impartner/v1/Account -> /api/objects/v1/Account
  },
  onProxyReq: (proxyReq, req, res) => {
    // Set authentication headers
    // prm-key as its own header (not in Authorization)
    proxyReq.setHeader('prm-key', IMPARTNER_CONFIG.apiKey);
    // Tenant ID required for multi-tenant Impartner
    proxyReq.setHeader('X-PRM-TenantId', IMPARTNER_CONFIG.tenantId);
    proxyReq.setHeader('Accept', 'application/json');
    
    // Log request for debugging
    console.log(`[Impartner Proxy] ${req.method} ${req.originalUrl} -> ${IMPARTNER_CONFIG.host}${proxyReq.path}`);
    
    // Handle POST/PUT/PATCH body
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`[Impartner Proxy] Response: ${proxyRes.statusCode}`);
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
  },
  onError: (err, req, res) => {
    console.error('[Impartner Proxy] Error:', err.message);
    res.status(502).json({
      error: 'Proxy Error',
      message: err.message,
      target: IMPARTNER_CONFIG.host
    });
  }
});

// Mount proxy for all /v1/* routes
router.use('/v1', impartnerProxy);

module.exports = router;
