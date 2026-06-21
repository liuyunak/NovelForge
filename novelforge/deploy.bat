@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   NovelForge 一键部署脚本
echo   AI 辅助长篇网文创作工作台
echo ========================================
echo.

:: 检查 Node.js
echo [1/6] 检查 Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js v20+
    echo 下载地址：https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [成功] Node.js 已安装：!NODE_VERSION!

:: 检查 pnpm
echo.
echo [2/6] 检查 pnpm...
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo [提示] 正在安装 pnpm...
    call npm install -g pnpm
    if %errorlevel% neq 0 (
        echo [错误] pnpm 安装失败
        pause
        exit /b 1
    )
)
for /f "tokens=*" %%i in ('pnpm --version') do set PNPM_VERSION=%%i
echo [成功] pnpm 已安装：v!PNPM_VERSION!

:: 进入项目目录
echo.
echo [3/6] 进入项目目录...
cd /d "%~dp0novelforge"
if not exist "package.json" (
    echo [错误] 未找到 package.json，请确认项目在正确位置
    pause
    exit /b 1
)
echo [成功] 项目目录：%cd%

:: 安装依赖
echo.
echo [4/6] 安装依赖（约 5-10 分钟）...
if exist "node_modules" (
    echo [提示] 检测到已有依赖，跳过安装
) else (
    call pnpm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)
echo [成功] 依赖安装完成

:: 检查环境变量
echo.
echo [5/6] 配置环境变量...
if not exist ".env" (
    echo [提示] 未找到 .env 文件，正在从模板创建...
    copy ".env.example" ".env" >nul
    echo [完成] 已创建 .env 文件
    echo [注意] 请编辑 .env 文件，填入你的 DEEPSEEK_API_KEY
    echo.
    echo 可以用记事本打开 .env 文件编辑：
    echo notepad .env
    echo.
    pause
) else (
    echo [成功] 已检测到 .env 文件
)

:: 初始化项目
echo.
echo [6/6] 初始化项目...
call pnpm run init >nul 2>&1
echo [成功] 项目初始化完成

echo.
echo ========================================
echo   部署完成！
echo ========================================
echo.
echo 下一步操作：
echo   1. 编辑 .env 文件，填入 DEEPSEEK_API_KEY
echo   2. 运行 start.bat 启动服务
echo   3. 访问 http://localhost:3000
echo.
echo 详细操作请查阅：NovelForge_用户操作手册_v3.5.docx
echo.
pause
