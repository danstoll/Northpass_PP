---
sidebar_position: 12
title: Deployment
---

# Production Deployment

## Server Details

| Property | Value |
|----------|-------|
| URL | https://ptrlrndb.prod.ntxgallery.com |
| Server | Ubuntu 22.04.5 LTS |
| SSH | `ssh NTXPTRAdmin@20.125.24.28` |
| Path | `/home/NTXPTRAdmin/northpass-portal` |
| Process | PM2 (`northpass-portal`) |

## Deployment Script

Run from PowerShell:

```powershell
.\deploy.ps1
```

**What it does:**
1. Builds the application (`npm run build`)
2. Uploads `dist/` folder via SCP
3. Uploads server files
4. Runs `npm install` on server
5. Restarts PM2 process
6. Verifies deployment with cache header checks

## Manual Deployment

### 1. Build Locally
```powershell
npm run build
```

### 2. Upload Files
```powershell
scp -r dist/* NTXPTRAdmin@20.125.24.28:/home/NTXPTRAdmin/northpass-portal/dist/
scp server-with-proxy.cjs NTXPTRAdmin@20.125.24.28:/home/NTXPTRAdmin/northpass-portal/
scp -r server/* NTXPTRAdmin@20.125.24.28:/home/NTXPTRAdmin/northpass-portal/server/
```

### 3. Install Dependencies (if package.json changed)
```bash
ssh NTXPTRAdmin@20.125.24.28
cd /home/NTXPTRAdmin/northpass-portal
npm install --production
```

### 4. Restart PM2
```bash
pm2 restart northpass-portal
```

## PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs northpass-portal

# Restart
pm2 restart northpass-portal

# Stop
pm2 stop northpass-portal

# Start
pm2 start northpass-portal
```

## Cache Configuration

The server applies cache headers:

| Content | Cache-Control |
|---------|---------------|
| index.html | `no-cache, no-store, must-revalidate` |
| JS/CSS (hashed) | `public, max-age=31536000, immutable` |
| Images/fonts | `public, max-age=604800` |

## Verify Deployment

```powershell
# Check cache headers
Invoke-WebRequest -Uri "https://ptrlrndb.prod.ntxgallery.com/" -Method Head | Select-Object -ExpandProperty Headers

# Check app is responding
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/health"
```

## Rollback

If deployment fails:

```bash
ssh NTXPTRAdmin@20.125.24.28
cd /home/NTXPTRAdmin/northpass-portal

# Restore from backup (if available)
cp -r dist.backup/* dist/

pm2 restart northpass-portal
```

## Environment

No `.env` file - all config is in code:
- Database: `server/db/connection.cjs`
- API keys: `server-with-proxy.cjs`
