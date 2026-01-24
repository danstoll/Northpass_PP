# Northpass Partner Portal - Project Guide

## Overview
Internal admin portal for managing Nintex partner certifications, LMS data sync, and CRM integration. Used by Partner Account Managers (PAMs) to track partner training progress.

## Architecture

### Stack
- **Frontend**: React + Vite + Material UI
- **Backend**: Node.js Express server (`server-with-proxy.cjs`)
- **Database**: MariaDB (remote at 20.29.25.238:31337)
- **Hosting**: Linux VM at 20.125.24.28, managed via PM2

### Key Integrations
- **Northpass LMS API** - Learning management system (courses, enrollments, users, groups)
- **Impartner PRM API** - Partner relationship management (CRM contacts, partners)
- **Salesforce** - Partner data source (via Impartner)

## Directory Structure
```
/src/components/     # React components
/src/services/       # API clients, cache service
/server/             # Express server code
/server/db/          # Database services (sync, schema, queries)
/server/routes/      # Modular API routes
```

## Database
- Schema version tracked in `schema_info` table
- Migrations in `server/db/schema.cjs` (increment SCHEMA_VERSION)
- Connection config in `server/db/connection.cjs`

### Key Tables
- `partners` - Partner companies from CRM
- `contacts` - CRM contacts linked to partners
- `lms_users` - Northpass LMS users
- `lms_groups` - LMS groups (linked to partners via `partner_id`)
- `lms_enrollments` - Course enrollments with completion status
- `lms_courses` - Courses with NPCU values and certification categories
- `page_views` - Widget analytics tracking

## Deployment
```powershell
# Deploy to production
powershell -File deploy.ps1

# SSH to server
ssh NTXPTRAdmin@20.125.24.28
# Password in deploy.ps1
```

### PM2 Commands (on server)
```bash
pm2 logs northpass-portal
pm2 restart northpass-portal
pm2 status
```

## Sync System
Orchestrated sync chain runs daily at 2 AM:
1. Courses (Tier 1)
2. Impartner CRM (Tier 1)
3. NPCU Properties (Tier 1)
4. Users (Tier 2 - depends on Impartner)
5. Groups (Tier 3 - depends on Users)
6. Enrollments (Tier 4 - depends on Groups)
7. Push to CRM (Tier 5 - depends on Enrollments)

Task configs in `scheduled_tasks` table. Trigger via `/api/db/tasks/{task_type}/trigger`.

## Widget Access
Partners access their certification dashboard via encoded URLs:
- `/` with encoded params for `groupName` and `tier`
- Tracked in `page_views` table when loaded

## Admin Routes
- `/admin` - Dashboard home
- `/admin/analytics` - Partner engagement metrics
- `/admin/widget-analytics` - Widget view tracking
- `/admin/users` - User management (domain matching, orphans)
- `/admin/groups` - Group/family management
- `/admin/sync-dashboard` - Sync operations
- `/admin/settings` - System configuration

## Conventions

### API Endpoints
- `/api/northpass/*` - Proxied to Northpass API
- `/api/impartner/*` - Proxied to Impartner API
- `/api/db/*` - Database operations
- `/api/track/*` - Analytics tracking

### Code Style
- CommonJS (`.cjs`) for server code
- ESM for frontend
- Async/await for all database operations
- Console logging with emoji prefixes for visibility

### Error Handling
- Database queries wrapped in try/catch
- API errors return `{ error: message }`
- Sync operations track `stats.failed` and `stats.details.errors`

## Common Tasks

### Add new admin page
1. Create component in `/src/components/`
2. Add route check in `App.jsx` (e.g., `isNewPageRoute`)
3. Add to `NAV_SECTIONS` in `AdminNav.jsx`
4. Handle route in `App.jsx` with `AdminHub` wrapper

### Add database migration
1. Increment `SCHEMA_VERSION` in `schema.cjs`
2. Add migration block: `if (currentVersion < N) { ... }`
3. Deploy - runs automatically on startup

### Add new sync task
1. Create function in appropriate service (`lmsSyncService.cjs`, etc.)
2. Add task type to `scheduled_tasks` table
3. Add trigger endpoint in `taskScheduler.cjs`
4. Add to UI in `SyncDashboard.jsx` TASK_METADATA

## Troubleshooting

### Sync failures
- Check `sync_logs` table for error details
- API errors usually rate limiting (429) or auth issues
- DB errors often constraint violations (missing foreign keys)

### Users "not found" in enrollment sync
- Users deleted from Northpass but still in our DB
- Full sync marks them as `status = 'deleted'`
- Incremental sync skips `status != 'active'`

### Widget not loading
- Check group name matches partner in DB
- Verify `lms_groups.partner_id` is set
- Check browser console for API errors
