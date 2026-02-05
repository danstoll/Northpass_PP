# Setup Umami on the server
$SSHHost = "20.125.24.28"
$SSHUser = "NTXPTRAdmin"
$SSHPass = 'w4Qq$LD&vZKod6v7oED7Gt&A'

function Invoke-SSH {
    param([string]$Command)
    $plinkPath = Get-Command plink -ErrorAction SilentlyContinue
    if ($plinkPath) {
        & plink -batch -pw $SSHPass "$SSHUser@$SSHHost" $Command
    } else {
        # Use sshpass if available, otherwise plain ssh
        $sshpassPath = Get-Command sshpass -ErrorAction SilentlyContinue
        if ($sshpassPath) {
            & sshpass -p $SSHPass ssh -o StrictHostKeyChecking=no "$SSHUser@$SSHHost" $Command
        } else {
            ssh -o StrictHostKeyChecking=no "$SSHUser@$SSHHost" $Command
        }
    }
}

Write-Host "Setting up Umami analytics..." -ForegroundColor Cyan

# Clone Umami
Write-Host "`n>> Step 1: Cloning Umami repository"
Invoke-SSH "cd /home/NTXPTRAdmin && if [ ! -d umami ]; then git clone https://github.com/umami-software/umami.git; else echo 'Already cloned'; fi"

# Install dependencies
Write-Host "`n>> Step 2: Installing dependencies (this may take a few minutes)"
Invoke-SSH "cd /home/NTXPTRAdmin/umami && npm install --legacy-peer-deps"

# Build Umami
Write-Host "`n>> Step 3: Building Umami"
Invoke-SSH "cd /home/NTXPTRAdmin/umami && DATABASE_URL='mysql://umami:Um@m1Tr@ck2024!@20.29.25.238:31337/umami_partner' npm run build"

# Create logs directory
Write-Host "`n>> Step 4: Creating logs directory"
Invoke-SSH "mkdir -p /home/NTXPTRAdmin/umami/logs"

Write-Host "`n>> Setup complete!" -ForegroundColor Green
Write-Host "Now run deploy.ps1 to deploy the portal with Umami proxy"
