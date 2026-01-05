# Nintex Partner Portal - Northpass Integration

A comprehensive React-based certification tracking and partner management application that interfaces with the Northpass LMS API. Features a full MariaDB backend, automated LMS synchronization with incremental sync, and extensive admin tools.

## 🚀 Production

- **Live URL**: `https://ptrlrndb.prod.ntxgallery.com`
- **Server**: Ubuntu 22.04.5 LTS with PM2 process management
- **Database**: MariaDB 11.6.2 at `20.29.25.238:31337`

## ✨ Features

### 👥 Partner Dashboard
- **🎨 Nintex Branding**: MUI-based design system with corporate colors (#FF6B35 orange, #6B4C9A purple)
- **📊 Real-time NPCU Tracking**: Live calculation excluding expired certifications  
- **🏆 Certification Monitoring**: Status tracking with expiry date management
- **📅 Expiry Management**: Expired certs don't count towards NPCU totals
- **📈 Partner Tier Qualification**: Automatic tier status (Premier/Select/Registered/Certified)
- **🔄 Collapsible Categories**: Product-based certification grouping

### 🎓 Customer Dashboard
- **👥 Staff Training Overview**: Individual employee training records
- **📚 Certification Tracking**: Course completion and expiry monitoring
- **⚠️ Training Alerts**: Expired and expiring certification notifications
- **📊 Training Statistics**: Staff participation rates and completion metrics

### 🔧 Admin Tools (`/admin`)
| Tool | Path | Description |
|------|------|-------------|
| **Data Management** | `/admin/data` | Import partner/contact Excel files |
| **LMS Sync Dashboard** | `/admin/sync` | Unified sync control with incremental sync |
| **Database Reports** | `/admin/dbreports` | 10 on-demand analytics reports |
| **Owner Report** | `/admin/owners` | Account owner certification tracking |
| **User Management** | `/admin/users` | 5-tab user/group management interface |
| **URL Generator** | `/admin` | Generate partner portal URLs |
| **Bulk URLs** | `/admin/bulk-urls` | Batch generate portal URLs |

### 💾 Database & Sync
- **MariaDB Integration**: Full partner, contact, and LMS data storage
- **🔄 Incremental Sync**: 96-99% reduction in API calls (see table below)
- **⏰ Scheduled Tasks**: 4 automated task types with database-backed scheduler
- **📊 Pagination**: 1000-record chunks for optimal performance

#### Incremental Sync Performance

| Sync Type | Full Sync | Incremental | Reduction |
|-----------|-----------|-------------|-----------|
| Users | ~32,844 | ~100-200 | **99%+** |
| Groups | ~1,400 | ~20-50 | **96%+** |
| Courses | ~450 | 0-10 | **98%+** |

## 🛠️ Tech Stack

- **Frontend**: React 18 + Vite + MUI (Material-UI) v5
- **Backend**: Node.js/Express with API proxy
- **Database**: MariaDB 11.6.2
- **Deployment**: PM2 on Ubuntu 22.04
- **API**: Northpass LMS with incremental sync support

## 📦 Quick Start

### Prerequisites
- Node.js 16+
- MariaDB 11.x (for database features)
- SSH access to production server

### Installation

```bash
# Clone repository
git clone <repository-url>
cd northpass-pp

# Install dependencies
npm install

# Start development (two terminals required)
# Terminal 1: Express backend
node server-with-proxy.cjs

# Terminal 2: Vite dev server
npm run dev

# Access at http://localhost:5173
```

### Deployment

```powershell
# Full deployment to production
.\deploy.ps1
```

The script builds, uploads, installs dependencies, and restarts PM2.

## 🔗 URL Parameters

### Partner Dashboard (Default Route)
```
# Regular format
https://ptrlrndb.prod.ntxgallery.com/?group=CompanyName&tier=Premier

# Encoded format (recommended)
https://ptrlrndb.prod.ntxgallery.com/?data=eyJjb21wYW55IjoiQ29tcGFueU5hbWUiLCJ0aWVyIjoiUHJlbWllciJ9
```

### Customer Dashboard
```
# Regular format
https://ptrlrndb.prod.ntxgallery.com/customer?company=CompanyName

# Encoded format
https://ptrlrndb.prod.ntxgallery.com/customer?data=eyJjb21wYW55IjoiQ29tcGFueU5hbWUifQ
```

### Business Logic
- **Partner Tiers**: Premier (20 NPCU), Select (10 NPCU), Registered (5 NPCU)
- **Expiry Rules**: Expired certifications DO NOT count towards NPCU totals
- **Product Mapping**: Nintex Workflow = Nintex Automation Cloud

## 📚 API Endpoints

### Northpass Proxy (`/api/northpass`)
- `GET /v2/groups` - Company groups
- `GET /v2/people` - Users and transcripts
- `GET /v2/courses` - Course catalog
- `GET /v2/properties/courses/{id}` - NPCU values

### Database API (`/api/db`)
```bash
# Sync operations (incremental by default)
POST /api/db/sync/users         # Sync users (incremental)
POST /api/db/sync/users?mode=full  # Force full sync
POST /api/db/sync/groups        # Sync groups
POST /api/db/sync/courses       # Sync courses

# Reports
GET /api/db/reports/overview
GET /api/db/reports/user-certifications
GET /api/db/reports/contacts-not-in-lms

# Partner operations
GET /api/db/partners
POST /api/db/partners/import
GET /api/db/contacts
POST /api/db/contacts/import
```

## 🗂️ Project Structure

```
├── server-with-proxy.cjs    # Express server with API proxy
├── server/
│   ├── dbRoutes.cjs         # Database API routes
│   └── db/
│       ├── connection.cjs       # MariaDB connection pool
│       ├── schema.cjs           # Table definitions
│       ├── lmsSyncService.cjs   # LMS sync with incremental support
│       ├── taskScheduler.cjs    # Scheduled task execution
│       └── partnerService.cjs   # Partner/contact operations
├── src/
│   ├── components/
│   │   ├── CompanyWidget.jsx    # Partner dashboard
│   │   ├── CustomerDashboard.jsx # Customer view
│   │   ├── AdminHub.jsx         # Admin login/hub
│   │   ├── DataManagement.jsx   # Data import UI
│   │   ├── SyncDashboard.jsx    # Sync control center
│   │   ├── DatabaseReports.jsx  # Analytics reports
│   │   └── UserManagement.jsx   # User/group tools
│   ├── services/
│   │   └── northpassApi.js      # API client
│   ├── theme/
│   │   └── nintexTheme.js       # MUI theme config
│   └── styles/
│       ├── nintex-variables.css # CSS variables
│       └── nintex-utilities.css # Utility classes
└── deploy.ps1               # Deployment script
```

## 🔧 Server Management

```bash
# View logs
ssh NTXPTRAdmin@20.125.24.28 "pm2 logs northpass-portal"

# Restart
ssh NTXPTRAdmin@20.125.24.28 "pm2 restart northpass-portal"

# Status
ssh NTXPTRAdmin@20.125.24.28 "pm2 status"
```

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| ECONNREFUSED on /api/db | Start Express: `node server-with-proxy.cjs` |
| Database connection failed | Check MariaDB at 20.29.25.238:31337 |
| Cache issues | Bump version in cacheService.js or Ctrl+Shift+R |
| Sync slow | Use incremental sync (default) instead of full |

## 📄 Documentation

- **Full Details**: See [copilot-instructions.md](.github/copilot-instructions.md)
- **Northpass API**: https://developers.northpass.com/

## 📝 License

MIT License

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request
