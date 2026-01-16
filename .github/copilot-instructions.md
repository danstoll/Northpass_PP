# Nintex Partner Portal - Northpass Integration Instructions

## Production Deployment
- **Production URL**: `https://ptrlrndb.prod.ntxgallery.com`
- **Server**: Ubuntu 22.04.5 LTS with PM2 process management
- **Process Name**: `northpass-portal`
- **SSH Access**: `ssh NTXPTRAdmin@20.125.24.28`
- **Remote Path**: `/home/NTXPTRAdmin/northpass-portal`

### Deployment Script
Run `.\deploy.ps1` in PowerShell to build and deploy. The script:
1. Builds the application
2. Uploads dist folder and server files
3. Installs dependencies
4. Restarts PM2 process
5. Verifies deployment with cache header checks

### Cache Configuration
- **index.html**: `no-cache, no-store, must-revalidate` (always fresh)
- **JS/CSS bundles** (hashed): `public, max-age=31536000, immutable` (1 year)
- **Images/fonts**: `public, max-age=604800` (1 week)

### Quick Commands
```powershell
# Full deployment
.\deploy.ps1

# Manual restart
ssh NTXPTRAdmin@20.125.24.28 "pm2 restart northpass-portal"

# View logs
ssh NTXPTRAdmin@20.125.24.28 "pm2 logs northpass-portal"

# Check cache headers
Invoke-WebRequest -Uri "https://ptrlrndb.prod.ntxgallery.com/assets/index-*.js" -Method Head | Select-Object -ExpandProperty Headers
```

## Application Configuration

### URL Parameters (Required - No Defaults)
- **Company Parameter**: `?group=CompanyName` or `?company=CompanyName` (exact match required)
- **Tier Parameter**: `?tier=Premier|Select|Registered|Certified`
- **Example URLs**:
  - `https://ptrlrndb.prod.ntxgallery.com/?group=Acme Corporation&tier=Premier`
  - `https://ptrlrndb.prod.ntxgallery.com/?company=Nintex Partner Portal Americas&tier=Certified`
- **No Parameters**: Shows welcome screen with usage instructions

### API Configuration
- **Production API**: Uses proxy server (`/api/northpass` → `https://api.northpass.com`)
- **API Key**: `wcU0QRpN9jnPvXEc5KXMiuVWk` (X-Api-Key header)
- **Authentication**: Client-side X-Api-Key header (not Authorization Bearer)
- **CORS**: Resolved via server-side proxy using `http-proxy-middleware`

## API Endpoints Reference

### Core Endpoints
- **Groups API**: `/v2/groups` - Find company groups by name
- **People API**: `/v2/people` - User search and transcript data
- **Courses API**: `/v2/courses` - Course information and completions
- **Properties API**: `/v2/properties/courses/{courseId}` - NPCU values

### Business Logic
- **NPCU Values**: 0 (no certification), 1 (basic), 2 (advanced)
- **Certifications**: Only courses with NPCU > 0 count as certifications
- **Expiry Logic**: Expired certifications DO NOT count towards NPCU totals
- **Partner Tiers**: Premier (20 NPCU), Select (10 NPCU), Registered (5 NPCU), Certified (varies)

### Product Categories
- **Nintex Workflow** = **Nintex Automation Cloud** (equivalent products)
- **Collapsible UI**: Product breakdown with expandable certification details
- **Expiry Display**: Visual indicators for certification expiry status

## Features Implemented
- 🎨 **Nintex Branding**: Complete design system with orange (#FF6B35) and purple (#6B4C9A)
- 📊 **Real-time NPCU Tracking**: Live calculation excluding expired certifications
- 🏆 **Certification Monitoring**: Status tracking with expiry date management
- 📅 **Expiry Management**: Business rule compliance - expired certs don't count
- 📈 **Partner Tier Qualification**: Automatic tier status calculation
- 🔄 **Collapsible Categories**: Product-based certification grouping
- ✨ **Welcome Screen**: Professional onboarding when no parameters provided
- 💾 **MariaDB Integration**: Full partner and contact database with sync capabilities
- 👤 **Admin Tools Suite**: Comprehensive administration interface with 11+ tools
- 📥 **Excel Import**: Partner and contact data import from Excel files (legacy, replaced by Impartner sync)
- 🔄 **LMS Synchronization**: Automated 2-hour sync with Northpass API
- 📊 **Database Reports**: Paginated analytics with 1000-record chunks
- 👥 **User Management**: Find CRM contacts missing from LMS and bulk add
- 🔗 **Group Matching**: Automatic partner-to-group linking with ptr_ prefix handling
- 🎯 **Manager Assignment**: Track partner account managers
- 🔍 **Group Analysis**: Advanced LMS group management and partner matching
- 🔄 **Impartner CRM Sync**: Automated partner/contact sync from Impartner PRM API (replaces manual Excel import)

## Technical Architecture
- **Frontend**: React 18 + Vite with MUI (Material-UI) v5 + Nintex design system
- **UI Components**: @mui/material, @mui/icons-material with custom Nintex theme
- **Backend**: Express.js with API proxy and static file serving
- **Database**: MariaDB 11.6.2 at `20.29.25.238:31337` (username: `northpass`, password: `Nintex2025!`)
- **Deployment**: PM2 process management with SSH key authentication
- **Security**: CORS resolution, security headers, graceful error handling

## MUI Component Library

### Nintex Theme (`src/theme/nintexTheme.js`)
Custom Material-UI theme with Nintex brand colors (LIGHT MODE):
- **Primary Orange**: `#FF6B35` - Main buttons, highlights
- **Primary Purple**: `#6B4C9A` - Navigation sidebar, accent
- **Success Green**: `#28a745` (Bootstrap-style) - Completion states
- **Warning Yellow**: `#856404` (Bootstrap-style) - Warnings
- **Error Red**: `#dc3545` (Bootstrap-style) - Errors, expiry states
- **Light Mode**: White backgrounds (`#ffffff` cards, `#f5f5f5` page), dark text (`#333` primary, `#666` secondary)

### Reusable Components (`src/components/ui/NintexUI.jsx`)
**Layout Components:**
- `PageHeader` - Consistent page headers with icon, title, subtitle, back button
- `PageContent` - Content wrapper with proper padding
- `StatsRow` - Grid layout for stat cards (responsive columns)
- `SectionCard` - Card wrapper with title, icon, collapsible option
- `TabPanel` - MUI Tabs content wrapper

**Stat Display Components:**
- `StatCard` - Metric display cards with variants (success/warning/error/primary)
- `StatusChip` - Status indicators with appropriate icons
- `TierBadge` - Partner tier badges with gradient backgrounds
- `LabeledProgress` - Progress bars with labels and percentage

**Input Components:**
- `SearchInput` - Search field with clear button
- `FilterSelect` - Dropdown select with "All" option

**Button Components:**
- `ActionButton` - Buttons with loading spinner state
- `RefreshButton` - Icon button with spinner

**Feedback Components:**
- `ResultAlert` - Operation result notifications
- `EmptyState` - Empty state placeholder
- `LoadingState` - Loading spinner with message

**Table Components:**
- `DataTable` - MUI table wrapper with sorting, click handlers

### Code Splitting (vite.config.js)
MUI is split into separate chunks for optimal loading:
- `vendor-mui`: @mui/material, @mui/icons-material (~230KB)
- `vendor-emotion`: @emotion/react, @emotion/styled (~13KB)

## MariaDB Database Architecture

### Database Connection
- **Host**: `20.29.25.238`
- **Port**: `31337`
- **Database**: `northpass`
- **User**: `northpass`
- **Password**: `Nintex2025!`
- **Connection Module**: `server/db/connection.cjs`

### Database Tables
1. **partners** - Partner companies with tier, region, owner info
2. **contacts** - Contact information linked to partners
3. **lms_users** - Northpass LMS user data synced from API
4. **enrollments** - Course enrollment and completion data
5. **certifications** - Active certifications with expiry dates
6. **sync_log** - Tracks database sync operations

### Key Database Files
- **Schema**: `server/db/schema.cjs` - Table definitions and indexes
- **Connection**: `server/db/connection.cjs` - MariaDB connection pool
- **Routes**: `server/dbRoutes.cjs` - Core API endpoints (partners, contacts, users, enrollments, courses, dashboard)
- **Services**:
  - `server/db/partnerService.cjs` - Partner and contact management
  - `server/db/lmsSyncService.cjs` - Sync LMS data from Northpass API
  - `server/db/partnerImportService.cjs` - Excel import processing
  - `server/db/scheduledSync.cjs` - Automatic sync scheduler (every 2 hours)
  - `server/db/offboardingService.cjs` - LMS offboarding when partners/contacts deactivated

### Modular Route Architecture (January 2025)
Routes are split into modular files in `server/routes/` for maintainability:

| File | Mount Path | Purpose |
|------|------------|---------|
| `syncRoutes.cjs` | `/api/db/sync/*` | LMS sync endpoints (users, groups, courses, NPCU, enrollments) |
| `reportRoutes.cjs` | `/api/db/reports/*` | Database reports (partner-npcu, overview, leaderboard, etc.) |
| `trendRoutes.cjs` | `/api/db/trends/*` | Trend analytics (KPI summary, YTD, monthly, activity) |
| `analyticsRoutes.cjs` | `/api/db/analytics/*` | Deep analytics (engagement, cohort, segments, velocity) |
| `groupRoutes.cjs` | `/api/db/group-analysis/*` | Group analysis & management |
| `maintenanceRoutes.cjs` | `/api/db/maintenance/*` | Audit & maintenance endpoints |
| `partnerFamilyRoutes.cjs` | `/api/db/families/*` | Partner family management |
| `certificationRoutes.cjs` | `/api/db/certifications/*` | Certification categories & sync to Impartner |
| `pamRoutes.cjs` | `/api/db/pams/*` | Partner Account Manager management |
| `notificationRoutes.cjs` | `/api/db/notifications/*` | Email templates & notifications |
| `index.cjs` | - | Module exports for all routes |

**Route Loading**: Modular routes are loaded in `server-with-proxy.cjs` and mounted BEFORE the catch-all `dbRoutes.cjs`

### Database API Endpoints
- **POST /api/db/partners/import** - Import partners from Excel
- **POST /api/db/contacts/import** - Import contacts from Excel
- **GET /api/db/contacts** - Get all contacts with optional filters
- **GET /api/db/partners** - Get all partners
- **POST /api/db/sync/lms-users** - Sync users from Northpass
- **POST /api/db/sync/enrollments** - Sync enrollments from Northpass
- **GET /api/db/reports/overview** - Overview statistics
- **GET /api/db/reports/user-certifications** - User certification report (paginated, default 1000)
- **GET /api/db/reports/contacts-not-in-lms** - Contacts missing from LMS (paginated, default 1000)
- **GET /api/db/reports/partners-without-groups** - Partners without LMS groups
- **GET /api/db/reports/compliance-gaps** - Partner tier compliance gaps

### Performance Optimizations
- **Pagination**: Database reports default to 1000 records with LIMIT/OFFSET
- **Filtered Joins**: Only completed enrollments included in certification queries
- **Indexed Columns**: Email, account_name, lms_user_id for fast lookups
- **Connection Pooling**: Managed by MariaDB connection pool (10 connections)

## Admin Tools

### Admin Hub (`/admin`)
- **Password**: `Nintex2025!`
- **Session-based authentication** stored in sessionStorage

### Admin Pages (6 tools - streamlined January 2025)
1. **Data Management** (`/admin/data`) - Browse partner data, data cleaning, LMS matching (Impartner sync moved to Sync Dashboard)
2. **LMS Sync** (`/admin/sync-dashboard` or `/admin/sync`) - **Unified sync dashboard** with:
   - **Task Cards**: All 10 sync tasks shown in unified card grid (Users, Groups, Courses, NPCU, Enrollments, Impartner CRM, LMS Bundle, Group Analysis, Member Sync, Cleanup)
   - **Manual Run**: Each task has a ▶ Run Now button for on-demand execution
   - **Scheduling**: Each task has enable/disable toggle and editable interval
   - **Categories**: Tasks organized by Data Sync, Analysis, Maintenance
   - **History Tab**: View sync logs and task execution history
3. **Reports** (`/admin/dbreports`) - 10 on-demand reports across 3 categories:
   - **Partner Analytics**: Overview Dashboard, Partner Leaderboard, Certification Gaps, Partners Without Groups
   - **User Reports**: User Certifications, Contacts Not in LMS, Inactive Users
   - **Course & Activity**: Popular Courses, Recent Activity, Expiring Certifications
4. **Owner Report** (`/admin/owners`) - Account owner certification tracking with partner URLs
5. **User Management** (`/admin/users`) - Comprehensive user and group management with 6 tabs:
   - **Missing CRM Users**: Find CRM contacts not in LMS and add them
   - **Domain Analysis**: Match LMS users to partners by email domain
   - **Partners Without Groups**: Find partners without LMS groups
   - **Contact Group Audit**: Audit contacts for proper LMS group memberships (merged from Maintenance)
   - **All Partners Sync**: Ensure partner users are in "All Partners" group (merged from Maintenance)
   - **Orphan Discovery**: Find LMS users who registered directly (bypassing CRM) and link them to partners

### Archived Tools (in archive/unused-components/)
- PartnerImport - Replaced by Data Management
- PartnerReporting/LMS Reporting - Replaced by DB Reports
- GroupAnalysis (Live) - Replaced by GroupAnalysisDB
- DataSync - Replaced by LMS Sync Dashboard (consolidated January 2025)
- Maintenance - Merged into User Management (January 2025)
- AdminPanel (URL Generator) - Removed January 2025, URLs now in Owner Report

### Database Sync Architecture
**Schema Version**: 19 (January 2026)

**scheduled_tasks table**: Full task scheduler with 11 task types:
- **Data Sync Tasks**:
  - `sync_users` - Sync LMS users (2h interval)
  - `sync_groups` - Sync LMS groups (2h interval)
  - `sync_courses` - Sync course catalog (4h interval)
  - `sync_npcu` - Sync NPCU values (6h interval)
  - `sync_enrollments` - Sync user enrollments (4h interval, partner users only)
  - `lms_sync` - LMS Bundle: All syncs combined (legacy composite task)
  - `impartner_sync` - Sync partners/contacts FROM Impartner PRM (6h interval)
  - `sync_to_impartner` - Push cert counts/NPCU TO Impartner (incremental, 6h interval)
- **Analysis Tasks**:
  - `group_analysis` - Find potential users by domain (6h interval)
  - `group_members_sync` - Confirm pending group members (6h interval)
- **Maintenance Tasks**:
  - `cleanup` - Remove old logs and data (daily)

### Push to Impartner (sync_to_impartner)
**Pushes certification counts and NPCU data back to Impartner CRM**

**Features:**
- **Incremental Mode** (default): Only syncs partners whose `cert_counts_updated_at` > last sync time
- **Full Mode**: Forces sync of all partners with valid tiers
- **Tier Filter**: Only syncs partners with tiers: Premier, Premier Plus, Certified, Registered, Aggregator
- **Excludes**: Pending tier, blank tier, inactive partners

**API Endpoints:**
```powershell
# Preview what would be synced (dry run, incremental)
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/certifications/sync-to-impartner?dryRun=true" -Method Post

# Preview full sync
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/certifications/sync-to-impartner?dryRun=true&mode=full" -Method Post

# Run incremental sync (default)
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/certifications/sync-to-impartner" -Method Post

# Run full sync
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/certifications/sync-to-impartner?mode=full" -Method Post
```

### Impartner CRM Sync (January 2025)
**Replaces manual CRM Excel import** with automated API sync from Impartner PRM.

**Service**: `server/db/impartnerSyncService.cjs`
**Routes**: `server/impartnerRoutes.cjs` (sync endpoints under `/api/impartner/sync/*`)

**API Endpoints:**
```powershell
# Preview what would be synced (dry run)
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/impartner/sync/preview" -Method Get

# Get sync status and last sync timestamps
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/impartner/sync/status" -Method Get

# Get current filter configuration
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/impartner/sync/filters" -Method Get

# Sync partners only (incremental by default)
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/impartner/sync/partners" -Method Post

# Sync contacts only (incremental by default)
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/impartner/sync/contacts" -Method Post

# Full sync (partners + contacts)
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/impartner/sync/all" -Method Post

# Force full sync (fetch all records, not just changed)
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/impartner/sync/all?mode=full" -Method Post
```

**Impartner API Configuration:**
- **Host**: `https://prod.impartner.live`
- **Auth**: `Authorization: prm-key <api-key>` + `X-PRM-TenantId: 1`
- **Objects**: `Account` (partners), `User` (contacts)
- **Page Size**: 100 records per request

**Filter Configuration (matches CRM export filters):**
- **Partner Tiers**: Premier, Premier Plus, Certified, Registered, Aggregator (excludes Pending)
- **Account Status**: Excludes Inactive
- **Contact Status**: Active only
- **Account Names**: Excludes names containing "nintex"
- **Email Domains**: Excludes bill.com, nintex.com, safalo.com, crestan.com
- **Email Patterns**: Excludes demo, sales, support, accounts, test, renewals, finance, payable

**Field Mapping (Impartner → MariaDB):**

Partners:
| Impartner Field | MariaDB Field |
|-----------------|---------------|
| Name | account_name |
| Partner_Tier__cf | partner_tier |
| Account_Owner__cf | account_owner |
| Account_Owner_Email__cf | owner_email |
| Partner_Type__cf | partner_type |
| CrmId | salesforce_id |
| Website | website |
| Region | account_region | (APAC, EMEA, AMER, MENA, etc.)
| MailingCountry | country | (United States, Australia, etc.)

Contacts:
| Impartner Field | MariaDB Field |
|-----------------|---------------|
| Email | email |
| FirstName | first_name |
| LastName | last_name |
| Title | title |
| Phone | phone |
| AccountName | partner_id (lookup) |

**Sync Statistics (Full Sync Jan 2025):**
- Impartner Accounts: 2,137 → 1,421 after filters (716 filtered)
- Impartner Users: 34,808 → 31,048 after filters (3,760 filtered)
- Duration: ~26 minutes for full sync
- LMS links preserved: 2,730 contacts

**Soft-Delete Detection (January 2025):**
- Partners/contacts have `impartner_id` column to track their Impartner ID
- Full sync detects partners in DB whose Impartner account was deleted or filtered (inactive/invalid tier)
- Soft-delete: Sets `is_active = FALSE`, `deleted_at = NOW()`, `account_status = 'Inactive'`
- Salesforce ID matching: Handles both 15-char and 18-char SF IDs (prefix matching)
- Filtered accounts are linked to existing partners before deletion detection

**LMS Offboarding (January 2025):**
When partners/contacts are deactivated from Impartner, the system automatically offboards them from the LMS:

- **Contact Offboarding**: Removes user from their partner group AND the "All Partners" group
- **Partner Offboarding**: Removes ALL users from "All Partners" group AND deletes the partner's LMS group
- **Service**: `server/db/offboardingService.cjs`
- **Automatic**: Triggered during Impartner sync when soft-deleting records
- **Manual API**: Available for on-demand offboarding

**Offboarding API Endpoints:**
```powershell
# Offboard a single partner (removes users from All Partners, deletes partner group)
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/impartner/offboard/partner/123" -Method Post

# Offboard a single contact (removes from partner group and All Partners)
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/impartner/offboard/contact/456" -Method Post

# Batch offboard partners
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/impartner/offboard/partners" -Method Post -Body '{"partnerIds":[1,2,3]}' -ContentType "application/json"

# Batch offboard contacts
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/impartner/offboard/contacts" -Method Post -Body '{"contactIds":[1,2,3]}' -ContentType "application/json"

# Remove specific user from specific group
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/impartner/offboard/remove-from-group" -Method Post -Body '{"userId":"lms_id","groupId":"group_id"}' -ContentType "application/json"
```

**Sync Features:**
- **Task Scheduler** (`server/db/taskScheduler.cjs`): Database-backed with mutex locks, retry logic, execution history
- **Quick Sync**: On-demand sync for users, groups, courses, NPCU from Northpass API
- **Incremental User Sync**: Uses API filter `filter[updated_at][gteq]` to only fetch changed users (99%+ reduction in API calls)
- **Sync Logging**: All operations logged to `sync_log` and `scheduled_tasks` tables

### Incremental Sync (January 2025)
All major syncs now use **incremental mode by default**, dramatically reducing API calls:

| Sync Type | Before (Full) | After (Incremental) | Typical Reduction |
|-----------|---------------|---------------------|-------------------|
| Users | ~32,844 records | ~100-200 changed | **99%+** |
| Groups | ~1,400 records | ~20-50 changed | **96%+** |
| Courses | ~450 records | 0-10 changed | **98%+** |

**How it works**: Uses Northpass API filter `filter[updated_at][gteq]=<timestamp>` to only fetch records modified since last sync.

**Sync Modes:**
```powershell
# Incremental sync (default) - only changed records since last sync
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/sync/users" -Method Post
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/sync/groups" -Method Post
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/sync/courses" -Method Post

# Full sync - force fetch ALL records (use sparingly)
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/sync/users?mode=full" -Method Post
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/sync/groups?mode=full" -Method Post
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/sync/courses?mode=full" -Method Post
```

**Task Scheduler Sync Types:**
- `users` - Incremental user sync (default)
- `users_full` - Full user sync (fetches all ~32K users)
- `groups` - Incremental group sync (default)
- `groups_full` - Full group sync (fetches all ~1.4K groups)
- `courses` - Incremental course sync (default)
- `courses_full` - Full course sync (fetches all ~450 courses)

## Proxy Configuration

### Northpass API Proxy
The Express server includes a proxy that handles all Northpass API requests to resolve CORS issues and inject the API key server-side.

**Proxy Features**:
- **Target**: `https://api.northpass.com`
- **Path Rewrite**: `/api/northpass` → `` (removes prefix)
- **API Key Injection**: Server adds `X-Api-Key` header automatically
- **POST Body Handling**: Properly forwards JSON bodies with Content-Type and Content-Length headers
- **Error Handling**: Graceful ECONNRESET and timeout handling

**Example**:
```javascript
// Client makes request to:
POST /api/northpass/v2/groups
Body: { "group": { "name": "New Partner" } }

// Proxy forwards to:
POST https://api.northpass.com/v2/groups
Headers: X-Api-Key: wcU0QRpN9jnPvXEc5KXMiuVWk
Body: { "group": { "name": "New Partner" } }
```

## Development Workflow

### Local Development (Two Servers Required)
For local development, you need **both** servers running:

1. **Start Express Backend** (Terminal 1):
   ```powershell
   node server-with-proxy.cjs
   ```
   - Runs on port 3000
   - Provides `/api/db/*` database endpoints
   - Provides `/api/northpass/*` API proxy
   - Connects to MariaDB

2. **Start Vite Dev Server** (Terminal 2):
   ```powershell
   npm run dev
   ```
   - Runs on port 5173
   - Hot module replacement for React
   - Proxies API requests to Express (port 3000)

3. **Access**: Open `http://localhost:5173` in browser

### Build & Deploy
1. **Build**: `npm run build` → `dist/` folder
2. **Deploy**: Run `.\deploy.ps1` (or manual upload + PM2 restart)
3. **Monitor**: `ssh NTXPTRAdmin@20.125.24.28 "pm2 logs northpass-portal"`
4. **Verify**: Check cache headers with deployment script output

### Common Issues
- **ECONNREFUSED on /api/db/**: Express server not running - start with `node server-with-proxy.cjs`
- **Database connection failed**: Check MariaDB is accessible at `20.29.25.238:31337`
- **Cache issues**: Bump cache version in `src/services/cacheService.js` or hard refresh (Ctrl+Shift+R)

## Known Limitations
- Some course IDs return 403 on properties API calls (gracefully handled)
- Course properties access depends on permissions (fallback implemented)
- Group names must match exactly (case-sensitive)
- Expiry date calculation based on completion date + 24 months default
- Database reports paginated at 1000 records by default for performance
- Excel imports require specific column names (see Data Management page)
- LMS sync operations can take several minutes for large partner datasets
- Cache version changes require hard refresh (Ctrl+Shift+R) to load new assets

## CSS Architecture

### Centralized Theme System (CSS Variables)
All styles use CSS variables from `src/styles/nintex-variables.css` for light/dark theme support:

**How to switch themes:**
```jsx
// Light theme (default) - no class needed
<div className="admin-hub">

// Dark theme - add .dark-theme class
<div className="admin-hub dark-theme">

// Auto (follows system preference) - add .auto-theme class
<div className="admin-hub auto-theme">
```

### Light Theme Variables (Default)
```css
--admin-bg-page: #f5f5f5;           /* Page background */
--admin-bg-card: #ffffff;            /* Card/panel background */
--admin-bg-elevated: #f8f9fa;        /* Subtle elevated sections */
--admin-bg-hover: rgba(0,0,0,0.04);  /* Hover state */
--admin-bg-input: #ffffff;           /* Form inputs */

--admin-text-primary: #333333;       /* Main headings */
--admin-text-secondary: #666666;     /* Body text */
--admin-text-muted: #999999;         /* Helper text */

--admin-border-default: #dddddd;     /* Default borders */
--admin-border-light: #eeeeee;       /* Light borders */
```

### Status Colors (Bootstrap-style)
```css
--admin-success-bg: #d4edda;  --admin-success-text: #155724;
--admin-warning-bg: #fff3cd;  --admin-warning-text: #856404;
--admin-error-bg: #f8d7da;    --admin-error-text: #721c24;
--admin-info-bg: #cce5ff;     --admin-info-text: #004085;
```

### Brand Colors
```css
--nintex-orange: #FF6B35;            /* Primary brand, buttons */
--nintex-purple: #6B4C9A;            /* Secondary, nav sidebar */
--nintex-gradient-orange: linear-gradient(135deg, #FF6B35 0%, #E55A2B 100%);
--nintex-gradient-purple: linear-gradient(135deg, #6B4C9A 0%, #4A3570 100%);
--nintex-gradient-brand: linear-gradient(135deg, #6B4C9A 0%, #FF6B35 100%);
```

### Key CSS Files
- `src/styles/nintex-variables.css` - **Master theme variables** (light/dark support)
- `src/styles/nintex-utilities.css` - Bootstrap-like utility classes
- `src/components/ui/NintexUI.jsx` - Shared MUI components using CSS variables
- `src/components/*.css` - Component styles using CSS variables

### CSS Variable Usage
All component CSS files now use CSS variables:
```css
/* DO use CSS variables */
background: var(--admin-bg-card);
color: var(--admin-text-primary);
border: 1px solid var(--admin-border-default);

/* DON'T use hardcoded colors */
background: white;
color: #333;
border: 1px solid #ddd;
```

## Recent Fixes (December 2025)

### Login History Tracking (January 2026)
- ✅ **New `login_history` table** (Schema v19) tracks all login attempts (success and failure)
- ✅ Captures: user_id, email, success, failure_reason, ip_address, user_agent, login_method, session_id
- ✅ Login methods tracked: `password`, `magic_link`, `sso`
- ✅ Failure reasons: `invalid_email`, `wrong_password`, `account_disabled`, `invalid_magic_link`
- ✅ **Service functions** in `authService.cjs`:
  - `logLoginAttempt()` - Records login attempt
  - `getLoginHistory()` - Paginated history with filters
  - `getLoginStats()` - Success rate stats
  - `getRecentFailedAttempts()` - Security monitoring
  - `getLoginActivityByDay()` - Chart data
  - `cleanupLoginHistory()` - Retention policy
- ✅ **API Endpoints** (require `users.view` permission):
  - `GET /api/db/auth/login-history` - Get login history (filters: userId, email, success, startDate, endDate)
  - `GET /api/db/auth/login-stats` - Get login statistics (params: userId, days)
  - `GET /api/db/auth/failed-attempts` - Security monitoring (params: hours, minAttempts)
  - `GET /api/db/auth/login-activity` - Daily chart data (params: days, userId)
  - `POST /api/db/auth/login-history/cleanup` - Delete old records (body: retentionDays)

### Push to Impartner Sync Table Name Fix (January 2026)
- ✅ Fixed 500 error in Push to Impartner sync task (`POST /api/db/certifications/sync-to-impartner`)
- ✅ Corrected table name from `sync_log` (singular) to `sync_logs` (plural) throughout codebase
- ✅ Updated references in: [dbRoutes.cjs](server/dbRoutes.cjs), [taskScheduler.cjs](server/db/taskScheduler.cjs), [syncRoutes.cjs](server/routes/syncRoutes.cjs)
- ✅ Production database uses `northpass_portal` schema with `sync_logs` table (note: local dev uses `northpass` schema)
- ✅ Error was: `Table 'northpass_portal.sync_log' doesn't exist` - now resolved
- ✅ **Changed default mode from "full" to "incremental"** in schema (v13 migration)
- ✅ **Added sync_logs logging** to both scheduled task and manual endpoint
- ✅ Sync history now properly tracked in sync_logs table with status, records, and timestamps
- ✅ **Fixed Salesforce ID matching** to handle both 15-char and 18-char formats with prefix matching
- ✅ Database has 81 partners with 15-char IDs and 1,409 with 18-char IDs - now all matched correctly
- ✅ **Added mode toggle UI** on all sync tasks to switch between full/incremental via expandable config section
- ✅ Mode toggle endpoint: `PUT /api/db/tasks/:taskType/config` with `{"mode": "full"|"incremental"}`
- ✅ **Fixed "Run Now" button** to read task config and pass mode as query parameter to API endpoint
- ✅ All sync endpoints now properly log to sync_logs table (users, groups, courses, enrollments, impartner)
- ✅ Verified comprehensive sync history tracking across all 9 sync task types

### Analytics - Partner Users Only (January 2025)
- ✅ Analytics now only track **partner users** (users in partner groups OR linked via contacts)
- ✅ Non-partner users (customers, internal users) excluded from all trend/KPI metrics
- ✅ All LMS users KEPT in database for orphan discovery (domain matching)
- ✅ Partner user definition: Users in groups with `partner_id` set OR users in contacts table with `partner_id`
- ✅ Analytics user count: ~4,491 partner users (vs 22,385 total LMS users)

### Enrollment Sync - Partner Users Only (January 2025)
- ✅ Enrollment sync now ONLY syncs for **partner users**
- ✅ Non-partner users (customers, internal) are skipped during enrollment sync
- ✅ This dramatically reduces API calls (~4,491 users vs 22,385)
- ✅ `server/db/lmsSyncService.cjs` - `syncEnrollments()` updated with partner filter
- ✅ Partner user query uses same JOIN logic as analytics (contacts + group members)

### Orphan Discovery Endpoints (January 2025)
- ✅ `GET /api/db/users/breakdown` - Stats on linked vs unlinked users
- ✅ `GET /api/db/users/orphans` - Find users whose email domain matches a partner but aren't linked
- ✅ `GET /api/db/users/orphans/summary` - Quick count by partner
- ✅ `GET /api/db/users/orphans/partner/:id` - Get orphans for a specific partner
- ✅ Purpose: Find users who registered directly in Northpass, bypassing CRM automation

### Analytics Stacked Filters (January 2025)
- ✅ All analytics/trends support stacked filters (region, owner, tier) with AND logic
- ✅ `buildFilterClauses()` helper in trendService.cjs for consistent SQL generation
- ✅ Filter UI added to AnalyticsDashboard with dropdowns and active filter chips
- ✅ Export includes filter information

### Deep Analytics (January 2025)
New advanced analytics endpoints for deeper business insights:

**Partner Analytics:**
- `GET /api/db/analytics/engagement-scores` - Composite engagement score (activation, completion, certification, activity)
- `GET /api/db/analytics/tier-progression` - Partners close to upgrade, at-risk below tier threshold
- `GET /api/db/analytics/regional-comparison` - Performance metrics across regions

**User Analytics:**
- `GET /api/db/analytics/cohort` - Cohort analysis by registration month (30d/90d activation, retention)
- `GET /api/db/analytics/user-segments` - Activity segmentation (active/recent/lapsed/dormant/never)

**Learning Analytics:**
- `GET /api/db/analytics/learning-paths` - Common course sequences and certification paths
- `GET /api/db/analytics/course-effectiveness` - Completion rates, time to complete, engagement
- `GET /api/db/analytics/certification-velocity` - Monthly certification velocity with growth metrics

**Performance Analytics:**
- `GET /api/db/analytics/owner-performance` - Account owner portfolio metrics and LMS adoption

All endpoints support `?region=&owner=&tier=` filter parameters.

### Unified Sync Dashboard (January 2025)
- ✅ Complete SyncDashboard redesign with unified task cards
- ✅ All 9 sync tasks displayed in consistent card grid UI
- ✅ Tasks organized by category: Data Sync (6), Analysis (2), Maintenance (1)
- ✅ Each task card shows: icon, name, description, record count, interval, last run, status
- ✅ **Run Now** button on every task for manual execution
- ✅ **Schedule toggle** to enable/disable automatic runs
- ✅ **Editable intervals** (click to edit minutes between runs)
- ✅ Schema v8 migration added 5 individual sync tasks to scheduled_tasks table
- ✅ LMS Bundle task shows all syncs combined for backwards compatibility

### Top Navigation & Theme Toggle (December 28, 2025)
- ✅ Added `TopNavbar` component with JustDo-style dashboard design
- ✅ Theme toggle (light/dark mode) with localStorage persistence
- ✅ Search box, quick stats display, notifications, and user profile menu
- ✅ Mobile-responsive hamburger menu integration
- ✅ Sidebar now positioned below top navbar (64px offset)
- ✅ Current cache version: **254**

### Sync Task Logging Improvements (January 2026)
- ✅ **All sync tasks now log to `sync_logs` table** (not just Impartner)
- ✅ Task scheduler modified to create sync_logs entries for all tasks except impartner_sync/sync_to_impartner (which handle their own)
- ✅ Full record counts: records_processed, records_created, records_updated, records_deleted, records_failed
- ✅ Error handling: Failed tasks also log to sync_logs with error_message
- ✅ **New endpoint**: `POST /api/db/sync/cleanup-stuck` - Cleans up stuck sync logs (older than 30 min)
- ✅ Self-logging tasks (handle their own sync_logs): `impartner_sync`, `sync_to_impartner`
- ✅ Verified: sync_courses now visible in History tab with full details

### Offboarding Schema Fix (January 2026)
- ✅ Fixed `Unknown column 'g.northpass_id'` error in offboardingService.cjs
- ✅ `lms_groups` table uses `id` directly as the Northpass ID (no separate `northpass_id` column)
- ✅ Fixed 6 locations in offboardingService.cjs: getAllPartnersGroupId(), deleteLmsGroup(), offboardContact(), offboardPartner()
- ✅ Offboarding now works: Successfully deleted LMS groups for Exent, Diggics, S.A. Investment Holdings, etc.
- ✅ Soft-deleted partners are automatically offboarded during full Impartner syncs

### CSS Variable Theming System
- ✅ All 14 CSS files converted to use CSS variables
- ✅ Theme switching via `.light-theme` / `.dark-theme` classes
- ✅ `nintex-variables.css` contains complete light/dark theme definitions
- ✅ NintexUI.jsx components updated for theme support

### Proxy & API Fixes
- ✅ Fixed ECONNRESET on POST /v2/groups by adding body forwarding
- ✅ Added Content-Type and Content-Length headers for POST requests
- ✅ Proxy now properly handles POST/PUT/PATCH with JSON bodies

### Routing Fixes
- ✅ Changed Express catch-all from `app.get('*')` to `app.use()` middleware
- ✅ Fixed PathError with wildcard routes and path-to-regexp compatibility

### Database Performance
- ✅ Added LIMIT/OFFSET pagination (default 1000 records)
- ✅ Optimized JOIN queries to filter completed enrollments only
- ✅ Indexed key columns for faster lookups

### CSS & UI Fixes
- ✅ UserManagement summary cards: Added visible borders and gradient backgrounds
- ✅ DatabaseReports tables: Fixed blue backgrounds with `!important` flags
- ✅ Added hidden username field to password forms for accessibility
- ✅ Changed search inputs to type="search" with autoComplete="off"
- ✅ All password inputs have `autoComplete="current-password"`

### MUI Migration (December 2025)
- ✅ Installed MUI v5 packages (@mui/material, @mui/icons-material, @emotion/react, @emotion/styled)
- ✅ Created Nintex theme with brand colors in `src/theme/nintexTheme.js`
- ✅ Built comprehensive NintexUI component library (`src/components/ui/NintexUI.jsx`)
- ✅ AdminNav converted to MUI Drawer with responsive behavior
- ✅ AdminHub login page using MUI Card, TextField, Button components
- ✅ DatabaseReports landing page using MUI PageHeader, StatsRow, SectionCard
- ✅ DataManagement header, upload, tabs, overview using MUI components
- ✅ UserManagement fully converted to MUI (PageHeader, StatsRow, StatCard, SearchInput, FilterSelect, TierBadge, StatusChip)
- ✅ GroupAnalysisDB fully converted to MUI (PageHeader, StatsRow, StatCard, SectionCard, ActionButton, ToggleButtonGroup, TierBadge)
- ✅ Vite code splitting configured for MUI chunks (~320KB vendor-mui)
- ✅ IndexedDB for course data caching with 24-hour TTL

### CSS Refactoring (December 2025)
- ✅ Created `nintex-utilities.css` with Bootstrap-like utility classes
- ✅ All admin components now use full-width layout (removed max-width constraints)
- ✅ Utility classes: `d-flex`, `gap-*`, `mb-*`, `text-center`, `opacity-*`, `ntx-spinner`, etc.
- ✅ Reduced CSS bundle from 170KB to 148KB