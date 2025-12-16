# Nintex Partner Portal - Northpass Integration Instructions

## Production Deployment
- **Production URL**: `http://20.125.24.28:3000`
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
Invoke-WebRequest -Uri "http://20.125.24.28:3000/assets/index-*.js" -Method Head | Select-Object -ExpandProperty Headers
```

## Application Configuration

### URL Parameters (Required - No Defaults)
- **Company Parameter**: `?group=CompanyName` or `?company=CompanyName` (exact match required)
- **Tier Parameter**: `?tier=Premier|Select|Registered|Certified`
- **Example URLs**:
  - `http://20.125.24.28:3000/?group=Acme Corporation&tier=Premier`
  - `http://20.125.24.28:3000/?company=Nintex Partner Portal Americas&tier=Certified`
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

## Technical Architecture
- **Frontend**: React + Vite with Nintex design system
- **Backend**: Express.js with API proxy and static file serving
- **Deployment**: PM2 process management with SSH key authentication
- **Security**: CORS resolution, security headers, graceful error handling

## Development Workflow
1. **Local Development**: `npm run dev` (port 5173)
2. **Build**: `npm run build` → `dist/` folder
3. **Deploy**: Run `.\deploy.ps1` (or manual upload + PM2 restart)
4. **Monitor**: `ssh NTXPTRAdmin@20.125.24.28 "pm2 logs northpass-portal"`
5. **Verify**: Check cache headers with deployment script output

## Known Limitations
- Some course IDs return 403 on properties API calls (gracefully handled)
- Course properties access depends on permissions (fallback implemented)
- Group names must match exactly (case-sensitive)
- Expiry date calculation based on completion date + 24 months default