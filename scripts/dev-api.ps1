$ErrorActionPreference = 'Continue'
. "$PSScriptRoot\tool-env.ps1"
& mvn -pl chippy-api spring-boot:run 2>&1 | Tee-Object -FilePath 'logs/dev-api.log'
exit $LASTEXITCODE
