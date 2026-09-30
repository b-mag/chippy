@echo off
cd /d "%~dp0.."
if not exist logs mkdir logs
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-api.ps1"
exit /b %ERRORLEVEL%
