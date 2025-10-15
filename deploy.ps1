# PowerShell Deployment Script for Windows
# Usage: .\deploy.ps1 -Environment production

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("production", "staging")]
    [string]$Environment = "production"
)

# Configuration
$BuildDir = "dist"
$TempDir = "$env:TEMP\northpass-pp-deploy"

# Environment-specific configuration
if ($Environment -eq "production") {
    Write-Host "🚀 Deploying to PRODUCTION environment" -ForegroundColor Green
    $SSHHost = "your-server.com"
    $SSHUser = "your-username"
    $SSHPort = 22
    $RemotePath = "/var/www/northpass-pp"
    $BackupPath = "/var/backups/northpass-pp"
} elseif ($Environment -eq "staging") {
    Write-Host "🧪 Deploying to STAGING environment" -ForegroundColor Yellow
    $SSHHost = "staging-server.com"
    $SSHUser = "your-username"
    $SSHPort = 22
    $RemotePath = "/var/www/staging-northpass-pp"
    $BackupPath = "/var/backups/staging-northpass-pp"
}

Write-Host "📋 Deployment Configuration:" -ForegroundColor Cyan
Write-Host "   Environment: $Environment"
Write-Host "   SSH Host: $SSHHost"
Write-Host "   Remote Path: $RemotePath"
Write-Host ""

# Check if SSH client is available
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    Write-Host "❌ SSH client not found. Please install OpenSSH or use WSL." -ForegroundColor Red
    Write-Host "   Install via: Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0"
    exit 1
}

# Build the application
Write-Host "🔨 Building application..." -ForegroundColor Yellow
try {
    npm run build
    if (-not (Test-Path $BuildDir)) {
        throw "Build directory not found"
    }
    Write-Host "✅ Build completed successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Build failed: $_" -ForegroundColor Red
    exit 1
}

# Create deployment package
Write-Host "📦 Creating deployment package..." -ForegroundColor Yellow
if (Test-Path $TempDir) {
    Remove-Item $TempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
Copy-Item "$BuildDir\*" -Destination $TempDir -Recurse -Force

# Add .htaccess for Apache
$htaccessContent = @"
# Apache configuration for Single Page Application
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [QSA,L]

# Security headers
Header always set X-Content-Type-Options nosniff
Header always set X-Frame-Options DENY
Header always set X-XSS-Protection "1; mode=block"
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"

# Cache control
<filesMatch "\.(css|js|png|jpg|jpeg|gif|ico|svg)$">
    Header set Cache-Control "max-age=31536000, public"
</filesMatch>

<filesMatch "\.(html)$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
</filesMatch>
"@

$htaccessContent | Out-File -FilePath "$TempDir\.htaccess" -Encoding UTF8

# Test SSH connection
Write-Host "🔐 Testing SSH connection..." -ForegroundColor Yellow
try {
    $sshTest = ssh -o ConnectTimeout=10 -p $SSHPort "$SSHUser@$SSHHost" "echo 'SSH connection successful'" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "SSH connection failed"
    }
    Write-Host "✅ SSH connection successful" -ForegroundColor Green
} catch {
    Write-Host "❌ SSH connection failed. Please check your SSH configuration." -ForegroundColor Red
    Write-Host "   Make sure you can connect: ssh -p $SSHPort $SSHUser@$SSHHost" -ForegroundColor Yellow
    exit 1
}

# Create backup
Write-Host "💾 Creating backup of current deployment..." -ForegroundColor Yellow
$backupScript = @"
if [ -d '$RemotePath' ]; then
    sudo mkdir -p '$BackupPath'
    sudo cp -r '$RemotePath' '$BackupPath/backup-`$(date +%Y%m%d-%H%M%S)'
    echo 'Backup created successfully'
else
    echo 'No existing deployment to backup'
fi
"@

ssh -p $SSHPort "$SSHUser@$SSHHost" $backupScript

# Deploy files
Write-Host "🚀 Deploying to server..." -ForegroundColor Yellow
if (Get-Command rsync -ErrorAction SilentlyContinue) {
    # Use rsync if available (via WSL or Git Bash)
    rsync -avz --delete -e "ssh -p $SSHPort" "$TempDir/" "$SSHUser@$SSHHost`:$RemotePath/"
} else {
    # Fallback to scp
    Write-Host "   Using SCP (rsync not available)" -ForegroundColor Yellow
    scp -r -P $SSHPort "$TempDir\*" "$SSHUser@$SSHHost`:$RemotePath/"
}

# Set permissions and restart web server
Write-Host "🔧 Setting permissions and restarting web server..." -ForegroundColor Yellow
$serverScript = @"
sudo chown -R www-data:www-data '$RemotePath'
sudo chmod -R 755 '$RemotePath'
sudo chmod 644 '$RemotePath'/*.html '$RemotePath'/*.css '$RemotePath'/*.js 2>/dev/null || true

if systemctl is-active --quiet apache2; then
    sudo systemctl reload apache2
    echo 'Apache reloaded'
elif systemctl is-active --quiet nginx; then
    sudo systemctl reload nginx
    echo 'Nginx reloaded'
else
    echo 'Web server reload skipped - no Apache/Nginx found'
fi
"@

ssh -p $SSHPort "$SSHUser@$SSHHost" $serverScript

# Clean up
Remove-Item $TempDir -Recurse -Force

Write-Host ""
Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
Write-Host "🌐 Your application should now be available at: http://$SSHHost" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Post-deployment checklist:" -ForegroundColor Cyan
Write-Host "   ✅ Application deployed to $RemotePath"
Write-Host "   ✅ Backup created in $BackupPath"
Write-Host "   ✅ File permissions set correctly"
Write-Host "   ✅ Web server configuration updated"
Write-Host ""
Write-Host "🔍 To verify deployment:" -ForegroundColor Yellow
Write-Host "   Invoke-WebRequest -Uri http://$SSHHost -Method Head"
Write-Host "   ssh $SSHUser@$SSHHost 'ls -la $RemotePath'"