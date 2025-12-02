# Robust SSH deployment script that handles connection timeouts
# This script retries connections and uses compression for faster transfers

param(
    [int]$MaxRetries = 3,
    [int]$RetryDelay = 5
)

$SSHHost = "20.125.24.28"
$SSHUser = "NTXPTRAdmin"
$SSHPort = 22
$RemotePath = "~/northpass-pp"

Write-Host "🚀 Starting robust deployment to $SSHHost" -ForegroundColor Green

function Invoke-SSHWithRetry {
    param($Command, $Description)
    
    for ($i = 1; $i -le $MaxRetries; $i++) {
        Write-Host "[$i/$MaxRetries] $Description..." -ForegroundColor Yellow
        try {
            $result = ssh -o ConnectTimeout=30 -o ServerAliveInterval=10 -p $SSHPort "$SSHUser@$SSHHost" $Command 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Success: $Description" -ForegroundColor Green
                return $result
            } else {
                throw "SSH command failed with exit code $LASTEXITCODE"
            }
        } catch {
            Write-Host "❌ Attempt $i failed: $_" -ForegroundColor Red
            if ($i -lt $MaxRetries) {
                Write-Host "⏳ Waiting $RetryDelay seconds before retry..." -ForegroundColor Yellow
                Start-Sleep $RetryDelay
            }
        }
    }
    throw "Failed after $MaxRetries attempts"
}

function Copy-FilesWithRetry {
    param($LocalPath, $RemotePath, $Description)
    
    for ($i = 1; $i -le $MaxRetries; $i++) {
        Write-Host "[$i/$MaxRetries] $Description..." -ForegroundColor Yellow
        try {
            # Use compression and keep-alive for better reliability
            scp -C -o ConnectTimeout=30 -o ServerAliveInterval=10 -r -P $SSHPort $LocalPath "$SSHUser@$SSHHost`:$RemotePath" 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Success: $Description" -ForegroundColor Green
                return
            } else {
                throw "SCP failed with exit code $LASTEXITCODE"
            }
        } catch {
            Write-Host "❌ Attempt $i failed: $_" -ForegroundColor Red
            if ($i -lt $MaxRetries) {
                Write-Host "⏳ Waiting $RetryDelay seconds before retry..." -ForegroundColor Yellow
                Start-Sleep $RetryDelay
            }
        }
    }
    throw "File transfer failed after $MaxRetries attempts"
}

try {
    # Step 1: Test connection
    Invoke-SSHWithRetry "echo 'Connection test successful'" "Testing SSH connection"
    
    # Step 2: Prepare remote directory
    Invoke-SSHWithRetry "mkdir -p $RemotePath && echo 'Directory ready'" "Preparing remote directory"
    
    # Step 3: Create server files first (small files)
    Write-Host "📝 Creating server configuration files..." -ForegroundColor Yellow
    
    # Create server.js on remote server
    $serverJS = @'
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

app.use(express.static(__dirname, {
    maxAge: '1d',
    etag: true
}));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Northpass Partner Portal running on http://0.0.0.0:${PORT}`);
    console.log(`🌐 Access from outside: http://20.125.24.28:${PORT}`);
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
'@
    
    # Write server.js to remote server
    $serverJS | ssh -o ConnectTimeout=30 -p $SSHPort "$SSHUser@$SSHHost" "cat > $RemotePath/server.js"
    
    # Create package.json on remote server
    $packageJSON = @'
{
  "name": "northpass-partner-portal-server",
  "version": "1.0.0",
  "description": "Static file server for Northpass Partner Portal",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
'@
    
    $packageJSON | ssh -o ConnectTimeout=30 -p $SSHPort "$SSHUser@$SSHHost" "cat > $RemotePath/package.json"
    
    Write-Host "✅ Server configuration files created" -ForegroundColor Green
    
    # Step 4: Copy application files (the large files)
    Copy-FilesWithRetry "dist\index.html" "$RemotePath/" "Copying index.html"
    Copy-FilesWithRetry "dist\assets" "$RemotePath/" "Copying assets directory"
    
    # Step 5: Install dependencies and start server
    Invoke-SSHWithRetry "cd $RemotePath && npm install" "Installing dependencies"
    
    # Step 6: Start/restart the application
    $startCommand = @"
cd $RemotePath
pm2 stop northpass-portal 2>/dev/null || true
pm2 delete northpass-portal 2>/dev/null || true
pm2 start server.js --name northpass-portal
pm2 save
pm2 list
echo 'Application started successfully'
"@
    
    Invoke-SSHWithRetry $startCommand "Starting application with PM2"
    
    Write-Host ""
    Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
    Write-Host "🌐 Your application is now available at:" -ForegroundColor Cyan
    Write-Host "   http://20.125.24.28:3000" -ForegroundColor White
    Write-Host ""
    Write-Host "📋 To verify deployment:" -ForegroundColor Cyan
    Write-Host "   Invoke-WebRequest -Uri http://20.125.24.28:3000 -Method Head" -ForegroundColor White
    Write-Host "   ssh -p 22 $SSHUser@$SSHHost 'pm2 logs northpass-portal --lines 10'" -ForegroundColor White
    
} catch {
    Write-Host ""
    Write-Host "❌ Deployment failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔧 Troubleshooting steps:" -ForegroundColor Yellow
    Write-Host "1. Check network connection stability" -ForegroundColor White
    Write-Host "2. Try again - connection might be temporarily unstable" -ForegroundColor White
    Write-Host "3. Use manual deployment steps if automated deployment continues to fail" -ForegroundColor White
    exit 1
}