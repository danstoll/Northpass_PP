# API key loaded from .env file - set NORTHPASS_API_KEY environment variable before running
# To load from .env: Get-Content .env | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim()) } }

$headers = @{
    "X-Api-Key" = $env:NORTHPASS_API_KEY
    "Accept" = "application/json"
}

Write-Host "Fetching all courses..."

$allCourses = @()
$page = 1
do {
    $response = Invoke-RestMethod -Uri "https://api.northpass.com/v2/courses?limit=50&page=$page" -Headers $headers
    $allCourses += $response.data
    $hasNext = $null -ne $response.links.next
    $page++
} while ($hasNext -and $page -le 20)

Write-Host "Total courses fetched: $($allCourses.Count)"

# Find archived courses
$archived = $allCourses | Where-Object { $_.attributes.name -match "archived|archive" }
Write-Host "`n=== ARCHIVED COURSES ($($archived.Count)) ==="
$archived | ForEach-Object {
    Write-Host "  $($_.id) | $($_.attributes.name)"
}

# Find draft courses
$drafts = $allCourses | Where-Object { $_.attributes.status -eq "draft" }
Write-Host "`n=== DRAFT COURSES ($($drafts.Count)) ==="
$drafts | ForEach-Object {
    Write-Host "  $($_.id) | $($_.attributes.name)"
}

# Test Properties API for each course
Write-Host "`n=== TESTING PROPERTIES API ==="
$failedProperties = @()
foreach ($course in $allCourses) {
    $id = $course.id
    $name = $course.attributes.name
    
    # Skip archived
    if ($name -match "archived|archive") { continue }
    
    try {
        $props = Invoke-RestMethod -Uri "https://api.northpass.com/v2/properties/courses/$id" -Headers $headers -ErrorAction Stop
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $failedProperties += [PSCustomObject]@{
            Id = $id
            Name = $name
            Status = $status
        }
        Write-Host "  FAILED ($status): $name"
    }
}

Write-Host "`n=== FAILED PROPERTIES API COURSES ($($failedProperties.Count)) ==="
$failedProperties | ForEach-Object {
    Write-Host "  $($_.Status) | $($_.Id) | $($_.Name)"
}

# Output to file for documentation
$output = @()
$output += "# Invalid/Problematic Courses"
$output += "# Generated: $(Get-Date)"
$output += ""
$output += "## Archived Courses ($($archived.Count))"
$archived | ForEach-Object {
    $output += "  '$($_.id)', // $($_.attributes.name)"
}
$output += ""
$output += "## Draft Courses ($($drafts.Count))"
$drafts | ForEach-Object {
    $output += "  '$($_.id)', // $($_.attributes.name)"
}
$output += ""
$output += "## Failed Properties API ($($failedProperties.Count))"
$failedProperties | ForEach-Object {
    $output += "  '$($_.Id)', // $($_.Name) - Status: $($_.Status)"
}

$output | Out-File -FilePath "invalid-courses.txt" -Encoding UTF8
Write-Host "`nResults saved to invalid-courses.txt"
