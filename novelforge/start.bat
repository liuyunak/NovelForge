@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title NovelForge — AI 网文创作工作台

:: ===================================================
:: NovelForge 启动脚本 (Windows)
:: 自动检测 dev/prod 模式，一键启动前端+后端
:: ===================================================

cd /d "%~dp0"

:: Check if installed
if not exist "node_modules" (
    echo.
    echo   [提示] 项目尚未安装，正在自动安装...
    echo.
    call install.bat
    if %errorlevel% neq 0 (
        pause
        exit /b 1
    )
)

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║      NovelForge 服务启动中...            ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Kill existing processes on ports
for %%p in (3000 3001) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p.*LISTENING" 2^>nul') do (
        taskkill /pid %%a /f >nul 2>nul
    )
)

:: Start backend (production mode serves both API + frontend)
:: ===================================================
echo   [1/2] 启动后端服务...
if exist "dist\index.js" (
    start "NovelForge-Backend" /min cmd /c "node dist/index.js"
    echo        后端地址: http://localhost:3001  (生产模式 — 后端已托管前端)
) else (
    start "NovelForge-Backend" /min cmd /c "npx tsx src/index.ts"
    echo        后端地址: http://localhost:3001  (开发模式)
)

:: Start frontend dev server (only in dev mode, when no build exists)
:: ===================================================
if not exist "dist\index.js" (
    echo   [2/2] 启动前端开发服务器...
    start "NovelForge-Frontend" /min cmd /c "cd studio && npx vite --port 3000"
    echo        前端地址: http://localhost:3000
) else (
    echo   [2/2] 前端已由后端托管 ^(无需额外进程^)
)

:: Wait for services
echo.
echo   等待服务启动...（约 5-10 秒）
timeout /t 5 /nobreak >nul

:: Open browser (production: port 3001, dev: port 3000)
if exist "dist\index.js" (
    start "" "http://localhost:3001/setup"
) else (
    start "" "http://localhost:3000/setup"
)

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║      NovelForge 已成功启动！             ║
echo  ║                                         ║
echo  ║   前端: http://localhost:3001            ║
echo  ║   后端: http://localhost:3001            ║
echo  ║                                         ║
echo  ║   关闭此窗口即可停止服务                 ║
echo  ╚══════════════════════════════════════════╝
echo.
pause
