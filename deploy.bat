@echo off
echo ==========================================
echo       PAW Trading PWA Deploy Tool
echo ==========================================
echo.

:: Add Git to local PATH environment variable
set "PATH=%PATH%;C:\Program Files\Git\cmd;C:\Program Files (x86)\Git\cmd;C:\Windows\System32"

:: Check Git command
git --version >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git command not found!
    echo Please make sure Git is installed correctly, or restart your PC to refresh env variables.
    pause
    exit /b
)

:: Automatically configure GitHub Remote URL
git remote get-url origin >nul 2>nul
if %errorlevel% neq 0 (
    echo [SETUP] Configuring GitHub Remote origin automatically...
    git remote add origin https://github.com/brotherku1010/Trading-System.git
    echo [SUCCESS] Linked to https://github.com/brotherku1010/Trading-System.git
) else (
    :: Ensure the URL is correct even if it was previously set incorrectly
    git remote set-url origin https://github.com/brotherku1010/Trading-System.git
)

echo [1/3] Adding changes (git add) ...
git add .

echo [2/3] Committing changes (git commit) ...
git commit -m "Auto Update: %date% %time%"

echo [3/3] Pushing to GitHub (git push) ...
git push -u origin main

echo.
echo ==========================================
echo       Deploy Completed! Please wait 1 min.
echo ==========================================
pause
