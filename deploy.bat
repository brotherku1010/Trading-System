@echo off
chcp 65001 >nul
echo ==========================================
echo       PAW Trading PWA 一鍵部署工具
echo ==========================================
echo.

:: 檢查 Git 是否在 PATH 中，如果不在則手動加入常用路徑
where git >nul 2>nul
if %errorlevel% neq 0 (
    set "PATH=%PATH%;C:\Program Files\Git\cmd;C:\Program Files (x86)\Git\cmd"
    where git >nul 2>nul
    if %errorlevel% neq 0 (
        echo [錯誤] 找不到 Git 命令！請確認 Git 是否安裝成功，或手動重新啟動電腦。
        pause
        exit /b
    )
)

:: 檢查是否有設定遠端倉庫 (remote origin)
git remote get-url origin >nul 2>nul
if %errorlevel% neq 0 (
    echo [設定] 偵測到尚未設定 GitHub 遠端儲存庫網址！
    echo 請先在 GitHub 建立一個公開的 Repository (建議名稱: paw-trading)
    echo 並在下方輸入您的 HTTPS 網址 (例如: https://github.com/您的帳號/paw-trading.git)
    echo.
    set /p repo_url="請輸入您的 GitHub HTTPS 網址: "
    if "%repo_url%"=="" (
        echo [錯誤] 網址不能為空。
        pause
        exit /b
    )
    git remote add origin %repo_url%
    echo [成功] 已連結至遠端網址: %repo_url%
    echo.
)

echo [步驟 1/3] 正在暫存變更檔案 (git add) ...
git add .

echo [步驟 2/3] 正在提交變更內容 (git commit) ...
:: 使用目前日期與時間作為 commit 說明
git commit -m "Auto Update: %date% %time%"

echo [步驟 3/3] 正在推送至 GitHub (git push) ...
git push -u origin main

echo.
echo ==========================================
echo       部署完成！請等待 1 分鐘後在手機上查看更新
echo ==========================================
pause
