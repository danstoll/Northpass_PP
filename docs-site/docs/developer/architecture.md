---
sidebar_position: 2
title: Architecture
---

# System Architecture

## High-Level Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Impartner     │     │   Northpass     │     │    MariaDB      │
│   CRM API       │     │   LMS API       │     │    Database     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────┬───────────┴───────────┬───────────┘
                     │                       │
              ┌──────┴──────┐         ┌──────┴──────┐
              │   Express   │         │    React    │
              │   Backend   │◄────────│   Frontend  │
              └─────────────┘         └─────────────┘
```

## Data Flow

1. **Impartner Sync** - Partners and contacts pulled from CRM every 6 hours
2. **Northpass Sync** - LMS users, groups, courses, enrollments synced every 2-4 hours
3. **NPCU Calculation** - Certifications counted, expiry tracked
4. **Push to Impartner** - Cert counts pushed back to CRM

## Key Directories

```
northpass-portal/
├── src/                    # React frontend
│   ├── components/         # React components
│   │   └── ui/             # Shared UI components (NintexUI.jsx)
│   ├── pages/              # Page components
│   ├── services/           # API service functions
│   └── theme/              # MUI theme (nintexTheme.js)
├── server/                 # Express backend
│   ├── db/                 # Database services
│   │   ├── connection.cjs  # MariaDB connection pool
│   │   ├── schema.cjs      # Table definitions
│   │   ├── lmsSyncService.cjs    # Northpass sync
│   │   ├── impartnerSyncService.cjs  # CRM sync
│   │   └── taskScheduler.cjs     # Scheduled tasks
│   └── routes/             # API route modules
├── dist/                   # Production build
└── docs-site/              # This documentation
```

## Frontend Architecture

### Component Library
All admin components use shared MUI components from `src/components/ui/NintexUI.jsx`:
- `PageHeader`, `PageContent` - Layout
- `StatCard`, `StatsRow` - Metrics display
- `SearchInput`, `FilterSelect` - Inputs
- `ActionButton`, `RefreshButton` - Actions
- `DataTable`, `StatusChip`, `TierBadge` - Data display

### Theme
Nintex brand colors in `src/theme/nintexTheme.js`:
- Primary Orange: `#FF6B35`
- Primary Purple: `#6B4C9A`

## Backend Architecture

### API Proxy
The Express server proxies requests to Northpass to avoid CORS issues:

```
Frontend calls:  /api/northpass/v2/...
Server proxies:  https://api.northpass.com/v2/...
API key injected server-side
```

### Route Modules
Routes are split into modular files in `server/routes/`:

| File | Mount Path | Purpose |
|------|------------|---------|
| `syncRoutes.cjs` | `/api/db/sync/*` | LMS sync endpoints |
| `reportRoutes.cjs` | `/api/db/reports/*` | Database reports |
| `trendRoutes.cjs` | `/api/db/trends/*` | Trend analytics |
| `analyticsRoutes.cjs` | `/api/db/analytics/*` | Deep analytics |
| `groupRoutes.cjs` | `/api/db/group-analysis/*` | Group management |

## Database

- **Host**: `20.29.25.238:31337`
- **Database**: `northpass`
- **Schema Version**: 19

See [Database Schema](./database-schema) for table details.
