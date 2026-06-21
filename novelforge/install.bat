@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title NovelForge 一键安装

:: ===================================================
:: NovelForge Windows 一键安装脚本
:: 面向网文作者的零门槛安装体验
:: ===================================================

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║        NovelForge 一键安装向导           ║
echo  ║    AI 辅助长篇网文创作工作台 v3.5        ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ==================== 检查 Node.js ====================
echo [1/4] 检查 Node.js...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo   [错误] 未检测到 Node.js！
    echo.
    echo   请先安装 Node.js v20 或更高版本：
    echo   https://nodejs.org
    echo.
    echo   下载 LTS 版本 → 双击安装 → 一路下一步即可
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo   [√] Node.js 已安装：%NODE_VER%

:: Check version
node -e "process.exit(parseFloat(process.version.slice(1)) >= 20 ? 0 : 1)" 2>nul
if %errorlevel% neq 0 (
    echo   [警告] Node.js 版本过低，需要 v20+
    echo   请更新 Node.js 后重试
    pause
    exit /b 1
)

:: ==================== 检查 pnpm ====================
echo [2/4] 检查 pnpm...

where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo   [提示] 正在自动安装 pnpm（包管理器）...
    call npm install -g pnpm --silent
    if %errorlevel% neq 0 (
        echo   [错误] pnpm 安装失败，请检查网络后重试
        pause
        exit /b 1
    )
)
echo   [√] pnpm 已就绪

:: ==================== 安装依赖 ====================
echo [3/4] 安装项目依赖...

cd /d "%~dp0"

if exist "node_modules" (
    echo   [√] 项目依赖已存在，跳过安装
) else (
    echo   正在下载依赖包，请耐心等待（约 2-5 分钟）...
    echo.
    call pnpm install --silent
    if %errorlevel% neq 0 (
        echo   [错误] 依赖安装失败
        echo   请检查网络连接后重试
        pause
        exit /b 1
    )
    echo   [√] 依赖安装完成
)

:: ==================== 环境配置 ====================
echo [4/4] 初始化配置...

if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
    )
)

:: 创建必要目录
if not exist "data" mkdir data
if not exist "workspace" mkdir workspace

echo   [√] 配置初始化完成

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║         安装完成！✨                      ║
echo  ╚══════════════════════════════════════════╝
echo.
echo   下一步：
echo   1. 双击 start.bat 启动服务
echo   2. 浏览器访问 http://localhost:3000
echo   3. 首次使用会自动弹出配置向导
echo.
echo   详细文档：docs/NovelForge_用户操作手册_v3.5.docx
echo.
pause
