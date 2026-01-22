$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$userDataDir = Join-Path $PSScriptRoot "user_data"
$port = 9223

Write-Host "Starting Chrome with debugging port $port..."
Write-Host "User Data Directory: $userDataDir"

& $chromePath --remote-debugging-port=$port --user-data-dir="$userDataDir"
