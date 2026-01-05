# =============================================================================
# Nintex Partner Portal - Production Deployment Script
# =============================================================================
# This script deploys the application to the production server at 20.125.24.28
# It builds the app, uploads files, and verifies the deployment with cache checks
#
# Usage: .\deploy.ps1
# Optional: .\deploy.ps1 -SkipBuild  (to deploy existing build)
# =============================================================================

param(
    [switch]$SkipBuild,
    [switch]$Verbose
)

# Configuration
$Config = @{
    SSHHost = "20.125.24.28"
    SSHUser = "NTXPTRAdmin"
    SSHPass = 'w4Qq$LD&vZKod6v7oED7Gt&A'
    SSHPort = 22
    RemotePath = "/home/NTXPTRAdmin/northpass-portal"
    ProcessName = "northpass-portal"
    Port = 3000
    BuildDir = "dist"
}

# Helper functions for SSH/SCP with password using PuTTY tools (plink/pscp)
function Invoke-SSH {
    param([string]$Command)
    # Use plink from PuTTY for password-based SSH on Windows
    $plinkPath = Get-Command plink -ErrorAction SilentlyContinue
    if ($plinkPath) {
        # plink supports -pw for password
        & plink -batch -pw $Config.SSHPass "$($Config.SSHUser)@$($Config.SSHHost)" $Command
    } else {
        # Fallback to regular ssh (will prompt for password)
        ssh -o StrictHostKeyChecking=no "$($Config.SSHUser)@$($Config.SSHHost)" $Command
    }
}

function Invoke-SCP {
    param([string]$Source, [string]$Dest)
    # Use pscp from PuTTY for password-based SCP on Windows
    $pscpPath = Get-Command pscp -ErrorAction SilentlyContinue
    if ($pscpPath) {
        # pscp supports -pw for password, -r for recursive
        & pscp -batch -pw $Config.SSHPass -r $Source "$($Config.SSHUser)@$($Config.SSHHost):$Dest"
    } else {
        # Fallback to regular scp (will prompt for password)
        scp -o StrictHostKeyChecking=no -r $Source "$($Config.SSHUser)@$($Config.SSHHost):$Dest"
    }
}

# Output functions
function Write-Step { param($msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Err { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "   $msg" -ForegroundColor Gray }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Magenta
Write-Host "   Nintex Partner Portal - Production Deployment" -ForegroundColor White
Write-Host "   Target: https://ptrlrndb.prod.ntxgallery.com" -ForegroundColor Gray
Write-Host "=================================================================" -ForegroundColor Magenta

# Step 1: Bump cache version (forces client browsers to clear cache)
Write-Step "Step 1: Bumping Client Cache Version"
try {
    $cacheServicePath = "src/services/cacheService.js"
    $cacheContent = Get-Content $cacheServicePath -Raw
    
    if ($cacheContent -match 'const CACHE_VERSION = (\d+);') {
        $currentVersion = [int]$matches[1]
        $newVersion = $currentVersion + 1
        $cacheContent = $cacheContent -replace "const CACHE_VERSION = $currentVersion;", "const CACHE_VERSION = $newVersion;"
        Set-Content $cacheServicePath $cacheContent -NoNewline
        Write-Success "Cache version bumped: $currentVersion -> $newVersion"
        Write-Info "Client browsers will clear their cache on next load"
    } else {
        Write-Warn "Could not find CACHE_VERSION in cacheService.js"
    }
} catch {
    Write-Warn "Could not bump cache version: $_"
}

# Step 2: Build the application
Write-Step "Step 2: Building Application"
if ($SkipBuild) {
    Write-Warn "Skipping build (using existing dist folder)"
} else {
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Build command failed" }
        if (-not (Test-Path $Config.BuildDir)) { throw "Build directory not found" }
        
        $jsFile = Get-ChildItem -Path "$($Config.BuildDir)/assets" -Filter "*.js" | Select-Object -First 1
        $cssFile = Get-ChildItem -Path "$($Config.BuildDir)/assets" -Filter "*.css" | Select-Object -First 1
        Write-Success "Build completed"
        $jsSize = [math]::Round($jsFile.Length/1024, 1)
        $cssSize = [math]::Round($cssFile.Length/1024, 1)
        Write-Info "JS Bundle: $($jsFile.Name) ($jsSize KB)"
        Write-Info "CSS Bundle: $($cssFile.Name) ($cssSize KB)"
    } catch {
        Write-Err "Build failed: $_"
        exit 1
    }
}

# Step 3: Upload dist folder
Write-Step "Step 3: Uploading Build Files"
try {
    # Create remote dist directory
    Invoke-SSH "mkdir -p $($Config.RemotePath)/dist/assets"
    
    # Upload dist files
    Invoke-SCP "$($Config.BuildDir)/*" "$($Config.RemotePath)/dist/"
    
    if ($LASTEXITCODE -ne 0) { throw "File upload failed" }
    Write-Success "Build files uploaded to $($Config.RemotePath)/dist/"
} catch {
    Write-Err "Upload failed: $_"
    exit 1
}

# Step 4: Upload server files
Write-Step "Step 4: Uploading Server Configuration"
try {
    Invoke-SCP "server-with-proxy.cjs" "$($Config.RemotePath)/"
    Invoke-SCP "server" "$($Config.RemotePath)/"
    Invoke-SCP "server-package.json" "$($Config.RemotePath)/package.json"
    
    if ($LASTEXITCODE -ne 0) { throw "Server file upload failed" }
    Write-Success "Server files uploaded"
} catch {
    Write-Err "Server upload failed: $_"
    exit 1
}

# Step 5: Install dependencies and restart
Write-Step "Step 5: Installing Dependencies and Restarting Server"
try {
    # Upload ecosystem config
    Invoke-SCP "ecosystem.config.cjs" "$($Config.RemotePath)/"
    
    # Create logs directory and restart using ecosystem file
    Invoke-SSH "cd $($Config.RemotePath) && npm install --production && mkdir -p logs && pm2 delete $($Config.ProcessName) 2>/dev/null; pm2 start ecosystem.config.cjs --env production && pm2 save"
    Write-Success "Server restarted with production environment"
} catch {
    Write-Err "Restart failed: $_"
    exit 1
}

# Step 6: Wait for server to be ready
Write-Step "Step 6: Waiting for Server to Start"
Start-Sleep -Seconds 3

# Step 7: Verify deployment
Write-Step "Step 7: Verifying Deployment"

# Check index.html (should have no-cache)
Write-Info "Checking index.html headers..."
try {
    $indexResponse = Invoke-WebRequest -Uri "http://$($Config.SSHHost):$($Config.Port)/" -Method Head -ErrorAction Stop
    $indexCache = $indexResponse.Headers["Cache-Control"]
    
    if ($indexCache -match "no-cache") {
        Write-Success "index.html: $indexCache (correct - no caching)"
    } else {
        Write-Warn "index.html: $indexCache (expected no-cache)"
    }
} catch {
    Write-Err "Failed to reach server: $_"
    exit 1
}

# Check JS asset (should have long cache)
Write-Info "Checking JS asset headers..."
try {
    $htmlContent = (Invoke-WebRequest -Uri "http://$($Config.SSHHost):$($Config.Port)/").Content
    if ($htmlContent -match '/assets/(index-[^"]+\.js)') {
        $jsFile = $matches[1]
        $jsResponse = Invoke-WebRequest -Uri "http://$($Config.SSHHost):$($Config.Port)/assets/$jsFile" -Method Head
        $jsCache = $jsResponse.Headers["Cache-Control"]
        
        if ($jsCache -match "immutable|max-age=31536000") {
            Write-Success "JS ($jsFile): $jsCache (correct - 1 year cache)"
        } else {
            Write-Warn "JS ($jsFile): $jsCache (expected immutable)"
        }
    }
} catch {
    Write-Warn "Could not verify JS caching: $_"
}

# Check CSS asset (should have long cache)
Write-Info "Checking CSS asset headers..."
try {
    if ($htmlContent -match '/assets/(index-[^"]+\.css)') {
        $cssFile = $matches[1]
        $cssResponse = Invoke-WebRequest -Uri "http://$($Config.SSHHost):$($Config.Port)/assets/$cssFile" -Method Head
        $cssCache = $cssResponse.Headers["Cache-Control"]
        
        if ($cssCache -match "immutable|max-age=31536000") {
            Write-Success "CSS ($cssFile): $cssCache (correct - 1 year cache)"
        } else {
            Write-Warn "CSS ($cssFile): $cssCache (expected immutable)"
        }
    }
} catch {
    Write-Warn "Could not verify CSS caching: $_"
}

# Check PM2 status
Write-Step "Step 8: Checking Server Status"
$pm2Output = Invoke-SSH "pm2 jlist"
$pm2Status = $pm2Output | ConvertFrom-Json
$portal = $pm2Status | Where-Object { $_.name -eq $Config.ProcessName }

if ($portal -and $portal.pm2_env.status -eq "online") {
    Write-Success "PM2 Process: $($Config.ProcessName) is online"
    Write-Info "PID: $($portal.pid), Uptime: $([math]::Round($portal.pm2_env.pm_uptime / 1000))s, Restarts: $($portal.pm2_env.restart_time)"
} else {
    Write-Warn "Could not verify PM2 status"
}

# Summary
Write-Host ""
Write-Host "=================================================================" -ForegroundColor Magenta
Write-Host "   Deployment Complete!" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "   Production URL: " -NoNewline; Write-Host "https://ptrlrndb.prod.ntxgallery.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Management Commands:" -ForegroundColor Gray
Write-Host "      ssh $($Config.SSHUser)@$($Config.SSHHost) `"pm2 logs $($Config.ProcessName)`"" -ForegroundColor DarkGray
Write-Host "      ssh $($Config.SSHUser)@$($Config.SSHHost) `"pm2 restart $($Config.ProcessName)`"" -ForegroundColor DarkGray
Write-Host ""
