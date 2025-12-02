# Archive Directory

This directory contains files that are no longer actively used in the production Northpass Partner Portal but are kept for reference or potential future use.

## Archive Date
November 28, 2025

## Archived Files Organization

### 📁 demo-scripts/
**Purpose**: Demo and test scripts used during development

**Files**:
- `demo-customer-dashboard.js` - Customer dashboard demo script
- `demo-url-encoding.js` - URL encoding demo
- `test-premier-tech.js` - Premier Tech customer test script
- `test-url-encoding.js` - URL encoding test script
- `fix_npcu_logging.js` - NPCU logging fix script

**Reason**: These were development/testing scripts that are no longer needed in production. The functionality they demonstrate is now integrated into the application.

---

### 📁 deployment-scripts/
**Purpose**: Various deployment scripts and configurations for different platforms

**Files**:
- `deploy.ps1` - Original PowerShell deployment script
- `deploy.sh` - Original Bash deployment script
- `deploy-simple.ps1` - Simplified PowerShell deployment
- `deploy-simple.sh` - Simplified Bash deployment
- `deploy-robust.ps1` - Robust PowerShell deployment with error handling
- `quick-upload.ps1` - Quick file upload script
- `setup-ssh-keys.ps1` - SSH key setup script
- `netlify.toml` - Netlify deployment configuration
- `vercel.json` - Vercel deployment configuration
- `Dockerfile` - Docker containerization config

**Reason**: The application is now deployed on Ubuntu 22.04 with PM2 process management using `deploy-server.sh` and `server-with-proxy.js`. These alternative deployment methods are no longer used.

**Current Deployment**: 
- Server: Ubuntu 22.04.5 LTS at `http://20.125.24.28:3000`
- Process Manager: PM2 with `northpass-portal` process
- Active Script: `deploy-server.sh`
- Server File: `server-with-proxy.js`

---

### 📁 deployment-packages/
**Purpose**: Packaged deployment archives

**Files**:
- `northpass-deployment.zip` - Original deployment package
- `northpass-deployment-with-proxy.zip` - Deployment package with proxy configuration

**Reason**: These were manual deployment packages. Deployment is now done via SSH with automated scripts.

---

### 📁 unused-components/
**Purpose**: React components that are no longer imported or used

**Files**:
- `UserWidget.jsx` - Individual user certification widget component
- `UserWidget.css` - User widget styles

**Reason**: This component was used for individual user views but is not currently imported in `App.jsx`. The application now uses:
- `CompanyWidget.jsx` - For partner certification dashboards
- `CustomerDashboard.jsx` - For customer training management
- `AdminPanel.jsx` - For admin URL generation

**Note**: If individual user views are needed in the future, this component can be restored.

---

### 📄 Documentation Files (in archive root)
**Files**:
- `SSH_DEPLOYMENT.md` - SSH deployment guide
- `SSH_KEY_SETUP.md` - SSH key setup instructions
- `API_OPTIMIZATIONS.md` - API optimization notes

**Reason**: These documents were useful during initial setup but are now reference material. The main `README.md` in the project root contains current deployment and setup instructions.

---

## Currently Active Files (NOT Archived)

### Essential Application Files
- `src/` - All source code
- `public/` - Public assets
- `index.html` - Main HTML file
- `package.json` - Dependencies and scripts
- `vite.config.js` - Vite build configuration
- `eslint.config.js` - ESLint configuration

### Active Deployment & Configuration
- `server-with-proxy.js` - Express server with Northpass API proxy
- `server-package.json` - Server dependencies
- `deploy-server.sh` - Active deployment script
- `deploy-config.env` - Deployment environment variables
- `README.md` - Main project documentation

### Active Components
- `CompanyWidget.jsx` - Partner dashboard
- `CustomerDashboard.jsx` - Customer training dashboard
- `AdminPanel.jsx` - Admin URL generator
- `UrlGenerator.jsx` - Partner URL generator
- `CustomerUrlGenerator.jsx` - Customer URL generator
- `NintexButton/` - Reusable button component
- `ProgressCharts.jsx` - Progress visualization components

### Active Services
- `northpassApi.js` - Main API client (1302 lines, fully featured)
- `cacheService.js` - Browser-based caching system
- `failedCourseTracker.js` - Course validation and error tracking
- `invalidCourseReference.js` - Invalid course ID reference data

---

## Restoration Instructions

If you need to restore any archived files:

1. Navigate to the appropriate archive subdirectory
2. Copy the file back to its original location:
   ```bash
   cp archive/demo-scripts/test-premier-tech.js ./
   ```
3. For components, ensure you also restore associated CSS files and update imports in `App.jsx`

---

## Notes

- The attached `northpassApi.js` in the user's editor appears to be an old version (simple API with no caching, rate limiting, or comprehensive features)
- The actual production `northpassApi.js` in `src/services/` is 1302 lines with full caching, rate limiting, and learning management features
- Do NOT replace the production `northpassApi.js` with the simplified version in the attachment
