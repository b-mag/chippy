$ErrorActionPreference = 'Continue'
. "$PSScriptRoot\tool-env.ps1"

$uiUrl = 'http://localhost:4200'
$apiUrl = 'http://localhost:8080'
$waitSeconds = 120

Write-Output "Starting Spring Boot on $apiUrl and the Angular dev server on $uiUrl"
Write-Output 'Logs: logs/dev-api.log and logs/dev-ui.log'

$api = Start-Process -FilePath 'powershell' -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    ". '$PSScriptRoot\tool-env.ps1'; mvn -pl chippy-api spring-boot:run 2>&1 | Tee-Object -FilePath 'logs/dev-api.log'"
) -PassThru -WindowStyle Normal

$ui = Start-Process -FilePath 'powershell' -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    ". '$PSScriptRoot\tool-env.ps1'; npm --prefix frontend start 2>&1 | Tee-Object -FilePath 'logs/dev-ui.log'"
) -PassThru -WindowStyle Normal

Write-Output "API pid $($api.Id), UI pid $($ui.Id). Waiting for $uiUrl ..."

$deadline = (Get-Date).AddSeconds($waitSeconds)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $response = Invoke-WebRequest -Uri $uiUrl -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}

if ($ready) {
    Write-Output "Opening $uiUrl"
    Start-Process $uiUrl
} else {
    Write-Warning "Timed out waiting for $uiUrl after ${waitSeconds}s. Open it manually when the UI window is ready."
}

Write-Output 'Close the API and UI windows to stop.'
exit 0
