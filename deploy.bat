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

:: Check Remote Origin URL
git remote get-url origin >nul 2>nul
if %errorlevel% neq 0 (
    echo [SETUP] GitHub Remote URL is not set yet!
    echo Please create a public repository on GitHub (e.g. paw-trading)
    echo and paste your HTTPS clone URL below (e.g. https://github.com/user/repo.git)
    echo.
    set /p repo_url="Enter GitHub HTTPS URL: "
    if "%repo_url%"=="" (
        echo [ERROR] URL cannot be empty.
        pause
        exit /b
    )
    :: Remove quotes
    set repo_url=%repo_url:"=%
    git remote add origin %repo_url%
    echo [SUCCESS] Remote origin added successfully.
    echo.
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
