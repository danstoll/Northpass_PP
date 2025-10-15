# SSH Key Setup Script for 20.125.24.28
# Run this script when you have a stable connection to set up passwordless SSH

Write-Host "🔐 SSH Key Setup for Passwordless Authentication" -ForegroundColor Green
Write-Host ""

# Your public key (generated above)
$PublicKey = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDABNvgowdtSKJQeY5nRP+Y+/GXTR/AqEWbrPeRrKnLvBbhW6c3LHvcyjJ9e+5c1GpJbBU1rtH2VHDZUcOQ62yBun8PkHT0/VbGn9waqEb7BdJypG+LP5rC6KLUEOrLFxqj9gXJMDeGNRAMmaaXil9FSilkJzWI+MiOOC5NPIKO7At8x2hkcX3/+2IhfYckwroYsfCJE3r/UiJHm6Pf1vBrefLqrupdNI6Nqdo9CzIZrry8ZKTiINcyKy7+IKCEm9K0Cv40CQdZucHbc0/6X3yhd3PikRoJ3SbnIzYTtfWNTpNFsLldjsJbT47IJmPGWnyVZ03OruomLQ4EBbOX9MiGBpVr18wrgNUJcCjoayFQPCHXw/tlpWVM+/YniccbfH3808Fz0eFoKNQs4wUq0Ye+gNXAmWQfdt7ML4c6CZWD/1i8+EaTdAmTBLhxNbbA+ceBGT8bWVfQ5WaX78DaHw1IQiM42YlM2AK7chTBhXvMyY0zZJ5F4RlLB4ICvCFTShUNb8XptNWkYM0/JRCTzWmHWxWb1fgi2QkzecDn0f7RjsVx8+5IhvTKhRjo5DAQ7+H7S7etLs1AbcX/JPQ2VUgTSuBlW3Sh7mpysdJ1IJtOALt6qdEsmJWbJLfsxOQeOisuU/BO3dQKTUfpqC0DvbNCa7+iBIJ+2oKk/sLZMh2GEw== NorthpassPP-deployment"

Write-Host "Step 1: Testing SSH connection..." -ForegroundColor Yellow
try {
    $result = ssh -o ConnectTimeout=10 -p 22 NTXPTRAdmin@20.125.24.28 "echo 'Connection successful'" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ SSH connection successful" -ForegroundColor Green
    } else {
        Write-Host "❌ SSH connection failed. Please try again when connection is stable." -ForegroundColor Red
        Write-Host "Error: $result" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ SSH connection failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "Step 2: Setting up SSH directory on server..." -ForegroundColor Yellow
ssh -p 22 NTXPTRAdmin@20.125.24.28 "mkdir -p ~/.ssh && chmod 700 ~/.ssh"

Write-Host "Step 3: Installing public key..." -ForegroundColor Yellow
$sshCommand = "echo '$PublicKey' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && sort ~/.ssh/authorized_keys | uniq > ~/.ssh/authorized_keys.tmp && mv ~/.ssh/authorized_keys.tmp ~/.ssh/authorized_keys"
ssh -p 22 NTXPTRAdmin@20.125.24.28 $sshCommand

Write-Host "Step 4: Testing passwordless authentication..." -ForegroundColor Yellow
try {
    $testResult = ssh -o ConnectTimeout=10 -o PasswordAuthentication=no -p 22 NTXPTRAdmin@20.125.24.28 "echo 'Passwordless SSH works!'" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "🎉 SUCCESS! Passwordless SSH is now configured!" -ForegroundColor Green
        Write-Host "✅ You can now run deployments without password prompts" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Key installed but authentication test failed." -ForegroundColor Yellow
        Write-Host "   This might be due to server configuration." -ForegroundColor Yellow
        Write-Host "   Try the deployment - it might still work!" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Could not test passwordless authentication, but key should be installed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Try deploying now: .\deploy-simple.ps1" -ForegroundColor White
Write-Host "2. If it still asks for password, the server might need configuration" -ForegroundColor White
Write-Host "3. Contact server admin to ensure SSH key authentication is enabled" -ForegroundColor White
Write-Host ""
Write-Host "🔧 Server Configuration (if needed):" -ForegroundColor Cyan
Write-Host "   Edit /etc/ssh/sshd_config:" -ForegroundColor White
Write-Host "   - PubkeyAuthentication yes" -ForegroundColor White
Write-Host "   - AuthorizedKeysFile ~/.ssh/authorized_keys" -ForegroundColor White
Write-Host "   - Restart SSH: sudo systemctl restart sshd" -ForegroundColor White