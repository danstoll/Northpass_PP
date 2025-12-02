# Nintex Partner Portal - Northpass Integration Instructions

## Production Deployment
- **Production URL**: `http://20.125.24.28:3000`
- **Server**: Ubuntu 22.04.5 LTS with PM2 process management
- **Process Name**: `northpass-portal`
- **SSH Access**: `ssh NTXPTRAdmin@20.125.24.28` (SSH key authentication configured)

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
3. **Deploy**: Upload to server and restart PM2 process
4. **Monitor**: `pm2 logs northpass-portal` for debugging

## Known Limitations
- Some course IDs return 403 on properties API calls (gracefully handled)
- Course properties access depends on permissions (fallback implemented)
- Group names must match exactly (case-sensitive)
- Expiry date calculation based on completion date + 24 months default