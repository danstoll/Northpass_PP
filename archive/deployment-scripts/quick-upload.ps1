# Quick upload script for when SSH connection is stable
# This uploads everything needed in one go

Write-Host "🚀 Quick Upload Script for Northpass Partner Portal" -ForegroundColor Green
Write-Host ""

$SSHHost = "20.125.24.28"
$SSHUser = "NTXPTRAdmin" 
$SSHPort = 22

# Check if files exist
if (-not (Test-Path "northpass-deployment.zip")) {
    Write-Host "❌ northpass-deployment.zip not found. Creating it..." -ForegroundColor Red
    Compress-Archive -Path dist/* -DestinationPath northpass-deployment.zip -Force
    Write-Host "✅ Created northpass-deployment.zip" -ForegroundColor Green
}

if (-not (Test-Path "deploy-server.sh")) {
    Write-Host "❌ deploy-server.sh not found" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Files ready for upload:" -ForegroundColor Cyan
Write-Host "   northpass-deployment.zip ($(((Get-Item northpass-deployment.zip).Length / 1KB).ToString('N0')) KB)"
Write-Host "   deploy-server.sh (deployment script)"
Write-Host ""

# Test connection first
Write-Host "🔐 Testing SSH connection..." -ForegroundColor Yellow
try {
    ssh -o ConnectTimeout=10 -p $SSHPort "$SSHUser@$SSHHost" "echo 'Connection test successful'" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Connection failed"
    }
    Write-Host "✅ SSH connection working" -ForegroundColor Green
} catch {
    Write-Host "❌ SSH connection failed. Try again when connection is stable." -ForegroundColor Red
    Write-Host "   Manual command: ssh -p $SSHPort $SSHUser@$SSHHost" -ForegroundColor Yellow
    exit 1
}

# Upload files
Write-Host "📤 Uploading deployment package..." -ForegroundColor Yellow
try {
    scp -P $SSHPort northpass-deployment.zip "$SSHUser@$SSHHost`:~/"
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to upload deployment package"
    }
    Write-Host "✅ Deployment package uploaded" -ForegroundColor Green
    
    scp -P $SSHPort deploy-server.sh "$SSHUser@$SSHHost`:~/"
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to upload deployment script"
    }
    Write-Host "✅ Deployment script uploaded" -ForegroundColor Green
    
} catch {
    Write-Host "❌ Upload failed: $_" -ForegroundColor Red
    Write-Host "Try manual upload when connection is more stable" -ForegroundColor Yellow
    exit 1
}

# Run deployment script
Write-Host "🚀 Running deployment script on server..." -ForegroundColor Yellow
try {
    ssh -p $SSHPort "$SSHUser@$SSHHost" "chmod +x ~/deploy-server.sh && ~/deploy-server.sh"
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
        Write-Host "🌐 Your application should be available at:" -ForegroundColor Cyan
        Write-Host "   http://$SSHHost`:3000" -ForegroundColor White
        Write-Host ""
        Write-Host "🔍 Verify deployment:" -ForegroundColor Cyan
        Write-Host "   Invoke-WebRequest -Uri http://$SSHHost`:3000 -Method Head" -ForegroundColor White
    } else {
        throw "Deployment script failed"
    }
} catch {
    Write-Host "❌ Deployment script failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔧 Manual fallback steps:" -ForegroundColor Yellow
    Write-Host "1. Connect: ssh -p $SSHPort $SSHUser@$SSHHost" -ForegroundColor White
    Write-Host "2. Run: chmod +x ~/deploy-server.sh && ~/deploy-server.sh" -ForegroundColor White
}