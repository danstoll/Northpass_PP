# Simple PowerShell deployment script for 20.125.24.28
# This script deploys the built application to your Node.js server

param(
    [Parameter(Mandatory=$false)]
    [string]$Port = "3000"
)

# Configuration
$SSHHost = "20.125.24.28"
$SSHUser = "NTXPTRAdmin" 
$SSHPort = 22
$RemotePath = "~/northpass-pp"  # Using home directory
$BuildDir = "dist"

Write-Host "🚀 Deploying Northpass Partner Portal to $SSHHost" -ForegroundColor Green

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

# Test SSH connection
Write-Host "🔐 Testing SSH connection..." -ForegroundColor Yellow
try {
    ssh -o ConnectTimeout=15 -p $SSHPort "$SSHUser@$SSHHost" "echo 'SSH connection successful'" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "SSH connection failed"
    }
    Write-Host "✅ SSH connection successful" -ForegroundColor Green
} catch {
    Write-Host "❌ SSH connection failed. Please check your connection." -ForegroundColor Red
    Write-Host "   Try: ssh $SSHUser@$SSHHost" -ForegroundColor Yellow
    exit 1
}

# Prepare remote directory
Write-Host "💾 Preparing remote directory..." -ForegroundColor Yellow
$prepareScript = @"
if [ -d '$RemotePath' ]; then
    cp -r '$RemotePath' '$RemotePath-backup-`$(date +%Y%m%d-%H%M%S)'
    echo 'Backup created'
fi
mkdir -p '$RemotePath'
echo 'Directory prepared'
"@

ssh -p $SSHPort "$SSHUser@$SSHHost" $prepareScript

# Deploy files
Write-Host "🚀 Deploying files..." -ForegroundColor Yellow
scp -r -P $SSHPort "$BuildDir\*" "$SSHUser@$SSHHost`:$RemotePath/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ File transfer failed" -ForegroundColor Red
    exit 1
}

# Create server configuration
Write-Host "📝 Creating server configuration..." -ForegroundColor Yellow
$serverScript = @"
cat > '$RemotePath/server.js' << 'EOF'
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || $Port;

// Serve static files from current directory
app.use(express.static(__dirname));

// Handle SPA routing - serve index.html for all routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(\`🚀 Northpass Partner Portal running on http://0.0.0.0:\${PORT}\`);
    console.log(\`🌐 Access from outside: http://20.125.24.28:\${PORT}\`);
});
EOF

# Create package.json for the server
cat > '$RemotePath/package.json' << 'EOF'
{
  \"name\": \"northpass-partner-portal-server\",
  \"version\": \"1.0.0\",
  \"description\": \"Static file server for Northpass Partner Portal\",
  \"main\": \"server.js\",
  \"scripts\": {
    \"start\": \"node server.js\"
  },
  \"dependencies\": {
    \"express\": \"^4.18.2\"
  }
}
EOF

echo 'Server files created'
"@

ssh -p $SSHPort "$SSHUser@$SSHHost" $serverScript

# Install dependencies and start server
Write-Host "📦 Installing server dependencies and starting application..." -ForegroundColor Yellow
$startScript = @"
cd '$RemotePath'
npm install

# Stop any existing process
pm2 stop northpass-portal 2>/dev/null || true
pm2 delete northpass-portal 2>/dev/null || true

# Start the new server with PM2
pm2 start server.js --name northpass-portal
pm2 save

echo 'Server started successfully'
"@

ssh -p $SSHPort "$SSHUser@$SSHHost" $startScript

Write-Host ""
Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
Write-Host "🌐 Your application should now be available at:" -ForegroundColor Cyan
Write-Host "   http://$SSHHost`:$Port" -ForegroundColor White
Write-Host ""
Write-Host "📋 Server Management Commands:" -ForegroundColor Cyan
Write-Host "   pm2 list                    # View running processes"
Write-Host "   pm2 logs northpass-portal   # View application logs"
Write-Host "   pm2 restart northpass-portal # Restart the application"
Write-Host "   pm2 stop northpass-portal   # Stop the application"
Write-Host ""
Write-Host "🔍 To verify deployment:" -ForegroundColor Yellow
Write-Host "   Invoke-WebRequest -Uri http://$SSHHost`:$Port -Method Head"