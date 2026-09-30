$ErrorActionPreference = 'Continue'
. "$PSScriptRoot\tool-env.ps1"
if (-not (Get-Command mvn -ErrorAction SilentlyContinue)) {
    Write-Error 'Maven was not found. Expected .tools\maven.zip to expand, or mvn on PATH.'
    exit 1
}
& mvn -B package 2>&1 | Tee-Object -FilePath 'logs/build.log'
exit $LASTEXITCODE
