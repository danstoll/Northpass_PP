# Enrollment Sync Runner
# Runs the sync script multiple times until all users are processed

$maxRuns = 20  # Maximum number of batches to process
$run = 0

while ($run -lt $maxRuns) {
    $run++
    Write-Host "`n========== Run $run/$maxRuns ==========" -ForegroundColor Cyan
    
    # Run the sync
    node server/db/robustSync.cjs
    
    # Check if sync completed (check progress file)
    if (Test-Path "server/db/sync_progress.json") {
        $progress = Get-Content "server/db/sync_progress.json" | ConvertFrom-Json
        
        # Get total users from DB
        $count = node -e "require('./server/db/connection.cjs').getPool().then(p => p.query('SELECT COUNT(*) as c FROM lms_users').then(r => {console.log(r[0][0].c); process.exit(0)}))"
        
        if ($progress.lastOffset -ge [int]$count) {
            Write-Host "`n✅ All users processed!" -ForegroundColor Green
            break
        }
        
        Write-Host "Progress: $($progress.lastOffset) users processed" -ForegroundColor Yellow
    }
    
    # Small pause between runs
    Start-Sleep -Seconds 2
}

Write-Host "`nDone!" -ForegroundColor Green

# Final count
Write-Host "`nFinal enrollment count:"
node server/db/count.cjs
