/**
 * Centralized Configuration Module
 * 
 * All secrets and environment-specific config loaded from environment variables.
 * In development: loaded from .env file via dotenv
 * In production: set via PM2 ecosystem.config.cjs or system environment
 * 
 * Usage in server files:
 *   const config = require('./config.cjs');  // or adjust path
 *   config.northpass.apiKey
 *   config.impartner.apiKey
 *   config.db.password
 */

// Load .env file (no-op if file doesn't exist, e.g. in production)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const config = {
  // Northpass LMS API
  northpass: {
    apiKey: process.env.NORTHPASS_API_KEY || '',
    apiUrl: 'https://api.northpass.com',
    hostname: 'api.northpass.com',
  },

  // Impartner PRM API
  impartner: {
    apiKey: process.env.IMPARTNER_API_KEY || '',
    tenantId: process.env.IMPARTNER_TENANT_ID || '1',
    host: 'prod.impartner.live',
    hostUrl: 'https://prod.impartner.live',
    basePath: '/api/objects/v1',
    pageSize: 100,
  },

  // MariaDB Database
  db: {
    host: process.env.DB_HOST || '',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'northpass_portal',
  },

  // Admin defaults
  admin: {
    defaultPassword: process.env.ADMIN_DEFAULT_PASSWORD || '',
  },

  // Nintex Workflow Cloud (Notifications)
  nwc: {
    workflowUrl: process.env.NWC_WORKFLOW_URL || '',
    workflowToken: process.env.NWC_WORKFLOW_TOKEN || '',
  },

  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
};

module.exports = config;
