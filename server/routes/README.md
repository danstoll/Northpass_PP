# Route Modularization

This directory contains modular route files extracted from the monolithic `dbRoutes.cjs` file (8530 lines).

## Route Modules

| Module | Mount Path | Description | ~Lines |
|--------|------------|-------------|--------|
| `syncRoutes.cjs` | `/api/db/sync/*` | LMS synchronization endpoints | 350 |
| `reportRoutes.cjs` | `/api/db/reports/*` | Database reports | 400 |
| `trendRoutes.cjs` | `/api/db/trends/*` | Trend analytics | 150 |
| `analyticsRoutes.cjs` | `/api/db/analytics/*` | Deep analytics | 180 |
| `groupRoutes.cjs` | `/api/db/group-analysis/*` | Group management | 400 |
| `maintenanceRoutes.cjs` | `/api/db/maintenance/*` | Audit and maintenance | 200 |
| `partnerFamilyRoutes.cjs` | `/api/db/families/*` | Partner family management | 200 |
| `certificationRoutes.cjs` | `/api/db/certifications/*` | Certification categories | 250 |
| `pamRoutes.cjs` | `/api/db/pams/*` | PAM management | 200 |
| `notificationRoutes.cjs` | `/api/db/notifications/*` | Email templates | 150 |

## Usage

### Option 1: Mount Alongside Existing Routes (Recommended for Migration)

The modular routes can be mounted alongside the existing `dbRoutes.cjs` during migration:

```javascript
// In server-with-proxy.cjs
const routes = require('./server/routes/index.cjs');

// Mount modular routes (these override specific paths)
if (dbInitialized) {
  app.use('/api/db/sync', routes.syncRoutes);
  app.use('/api/db/reports', routes.reportRoutes);
  app.use('/api/db/trends', routes.trendRoutes);
  app.use('/api/db/analytics', routes.analyticsRoutes);
  app.use('/api/db/group-analysis', routes.groupRoutes);
  app.use('/api/db/maintenance', routes.maintenanceRoutes);
  app.use('/api/db/families', routes.partnerFamilyRoutes);
  app.use('/api/db/certifications', routes.certificationRoutes);
  app.use('/api/db/pams', routes.pamRoutes);
  app.use('/api/db/notifications', routes.notificationRoutes);
}

// Keep existing dbRoutes for unmigrated endpoints
app.use('/api/db', dbRoutes.router);
```

### Option 2: Full Migration

Once all routes are migrated and tested:

1. Remove corresponding routes from `dbRoutes.cjs`
2. Update server-with-proxy.cjs to only use modular routes
3. dbRoutes.cjs becomes a lightweight file with only core setup

## Benefits

- **Maintainability**: Each route file is focused on one domain
- **Testing**: Easier to test individual route modules
- **Code Review**: Changes are isolated to specific modules
- **Team Collaboration**: Multiple developers can work on different routes
- **Performance**: Smaller files load faster in IDE

## Migration Status

- [x] syncRoutes.cjs - Created
- [x] reportRoutes.cjs - Created
- [x] trendRoutes.cjs - Created
- [x] analyticsRoutes.cjs - Created
- [x] groupRoutes.cjs - Created
- [x] maintenanceRoutes.cjs - Created
- [x] partnerFamilyRoutes.cjs - Created
- [x] certificationRoutes.cjs - Created
- [x] pamRoutes.cjs - Created
- [x] notificationRoutes.cjs - Created

### Not Yet Extracted (Remaining in dbRoutes.cjs)

These sections are still in dbRoutes.cjs and can be migrated in future iterations:

- Partner CRUD endpoints (~300 lines)
- Contact management endpoints (~200 lines)
- LMS data query endpoints (~600 lines)
- Domain analysis endpoints (~700 lines)
- Excel import endpoints (~200 lines)
- Task scheduler endpoints (~200 lines)
- Authentication endpoints (~150 lines)
- User management endpoints (~200 lines)
- Profile management endpoints (~100 lines)
- Portal settings endpoints (~150 lines)
- Tier management endpoints (~200 lines)
- User analytics/orphan discovery (~600 lines)
- Company dashboard endpoint (~300 lines)

## File Structure

```
server/
├── dbRoutes.cjs          # Original monolithic file (8530 lines)
├── impartnerRoutes.cjs   # Impartner sync routes
├── routes/
│   ├── index.cjs         # Route module exports
│   ├── syncRoutes.cjs    # Sync endpoints
│   ├── reportRoutes.cjs  # Reports
│   ├── trendRoutes.cjs   # Trends
│   ├── analyticsRoutes.cjs   # Deep analytics
│   ├── groupRoutes.cjs   # Group analysis
│   ├── maintenanceRoutes.cjs # Maintenance
│   ├── partnerFamilyRoutes.cjs # Families
│   ├── certificationRoutes.cjs # Certifications
│   ├── pamRoutes.cjs     # PAM management
│   └── notificationRoutes.cjs  # Notifications
└── db/
    └── (service files)
```

## Notes

- Each route file uses `express.Router()` for clean isolation
- Routes use relative paths (e.g., `/` instead of `/api/db/sync/`)
- All routes require `./db/connection.cjs` for database access
- Error handling is consistent across all modules
