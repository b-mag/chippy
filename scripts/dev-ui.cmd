@echo off
cd /d "%~dp0.."
if not exist logs mkdir logs
powershell -NoProfile -ExecutionPolicy Bypass -Command ". '%~dp0tool-env.ps1'; npm --prefix frontend start 2>&1 | Tee-Object -FilePath 'logs/dev-ui.log'; exit $LASTEXITCODE"
exit /b %ERRORLEVEL%
