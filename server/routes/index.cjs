/**
 * Route Module Index
 * Central export for all route modules
 * 
 * This modular structure splits the monolithic dbRoutes.cjs into logical sections.
 * Each route module is self-contained with its own router.
 * 
 * Mount paths in server-with-proxy.cjs:
 * - syncRoutes: /api/db/sync/*
 * - reportRoutes: /api/db/reports/*
 * - trendRoutes: /api/db/trends/*
 * - analyticsRoutes: /api/db/analytics/*
 * - groupRoutes: /api/db/group-analysis/*
 * - maintenanceRoutes: /api/db/maintenance/*
 * - partnerFamilyRoutes: /api/db/families/*
 * - certificationRoutes: /api/db/certifications/*
 * - pamRoutes: /api/db/pams/*
 * - notificationRoutes: /api/db/notifications/*
 * - leadRoutes: /api/db/leads/*
 */

module.exports = {
  syncRoutes: require('./syncRoutes.cjs'),
  reportRoutes: require('./reportRoutes.cjs'),
  trendRoutes: require('./trendRoutes.cjs'),
  analyticsRoutes: require('./analyticsRoutes.cjs'),
  groupRoutes: require('./groupRoutes.cjs'),
  maintenanceRoutes: require('./maintenanceRoutes.cjs'),
  partnerFamilyRoutes: require('./partnerFamilyRoutes.cjs'),
  certificationRoutes: require('./certificationRoutes.cjs'),
  pamRoutes: require('./pamRoutes.cjs'),
  notificationRoutes: require('./notificationRoutes.cjs'),
  leadRoutes: require('./leadRoutes.cjs')
};
