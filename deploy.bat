@echo off
setlocal
cd /d "%~dp0"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js and npm are required.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci
  if errorlevel 1 goto failed
)
call npm.cmd run deploy
if errorlevel 1 goto failed
echo [SUCCESS] Cloudflare deployment completed. GitHub was not changed.
pause
exit /b 0
:failed
echo [ERROR] Validation, build, or deployment failed. No success is assumed.
pause
exit /b 1
