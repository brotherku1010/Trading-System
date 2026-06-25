@echo off
chcp 65001 >nul
echo ==========================================
echo       PAW Trading PWA 一鍵部署工具
echo ==========================================
echo.

:: 直接把 Git 的預設安裝路徑加入目前視窗的 PATH 中
set "PATH=%PATH%;C:\Program Files\Git\cmd;C:\Program Files (x86)\Git\cmd;C:\Windows\System32"

:: 測試 git 命令是否可用
git --version >nul 2>nul
if %errorlevel% neq 0 (
    echo [錯誤] 系統找不到 Git 命令！
    echo 請先確認 Git 是否安裝成功。如果已安裝，請嘗試重新啟動電腦讓系統載入變數。
    pause
    exit /b
)

:: 檢查是否有設定遠端倉庫 (remote origin)
git remote get-url origin >nul 2>nul
if %errorlevel% neq 0 (
    echo [設定] 尚未設定 GitHub 遠端儲存庫網址！
    echo 請至 GitHub 建立一個公開的 Repository (例如: paw-trading)
    echo 並在此處貼上您的 HTTPS 網址 (格式為 https://github.com/您的帳號/專案名.git)
    echo.
    set /p repo_url="請輸入您的 GitHub HTTPS 網址: "
    if "%repo_url%"=="" (
        echo [錯誤] 網址不能為空。
        pause
        exit /b
    )
    :: 移除使用者可能不小心輸入的雙引號
    set repo_url=%repo_url:"=%
    git remote add origin %repo_url%
    echo [成功] 已連結至遠端網址: %repo_url%
    echo.
)

echo [步驟 1/3] 正在暫存變更檔案 (git add) ...
git add .

echo [步驟 2/3] 正在提交變更內容 (git commit) ...
git commit -m "Auto Update: %date% %time%"

echo [步驟 3/3] 正在推送至 GitHub (git push) ...
git push -u origin main

echo.
echo ==========================================
echo       部署完成！請等待 1 分鐘後查看您的網頁
echo ==========================================
pause
