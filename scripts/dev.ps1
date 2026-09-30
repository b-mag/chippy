$ErrorActionPreference = 'Continue'
. "$PSScriptRoot\tool-env.ps1"
Write-Output 'Starting Spring Boot on http://localhost:8080 and the Angular dev server on http://localhost:4200'
Write-Output 'Logs: logs/dev-api.log and logs/dev-ui.log'
$api = Start-Process -FilePath 'powershell' -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    ". '$PSScriptRoot\tool-env.ps1'; mvn -pl chippy-api spring-boot:run 2>&1 | Tee-Object -FilePath 'logs/dev-api.log'"
) -PassThru -WindowStyle Normal
$ui = Start-Process -FilePath 'powershell' -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    ". '$PSScriptRoot\tool-env.ps1'; npm --prefix frontend start 2>&1 | Tee-Object -FilePath 'logs/dev-ui.log'"
) -PassThru -WindowStyle Normal
Write-Output "API pid $($api.Id), UI pid $($ui.Id). Close those windows to stop."
exit 0
