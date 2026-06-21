@echo off
chcp 65001 >nul
cd /d "%~dp0"

set PID_DIR=%~dp0.pids

echo ============================================
echo   NovelForge - Stopping...
echo ============================================

:: Kill by PID file first (precise)
if exist "%PID_DIR%\backend.pid" (
    set /p B_PID=<"%PID_DIR%\backend.pid"
    echo [1/2] Stopping backend (PID: !B_PID!)...
    taskkill /F /PID !B_PID! 2>nul
    del "%PID_DIR%\backend.pid" 2>nul
) else (
    echo [1/2] Backend PID file not found, scanning port 3001...
)

if exist "%PID_DIR%\frontend.pid" (
    set /p F_PID=<"%PID_DIR%\frontend.pid"
    echo [2/2] Stopping frontend (PID: !F_PID!)...
    taskkill /F /PID !F_PID! 2>nul
    del "%PID_DIR%\frontend.pid" 2>nul
) else (
    echo [2/2] Frontend PID file not found, scanning port 3000...
)

:: Fallback: kill any process still listening on our ports
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    echo   Killing leftover on port 3001 (PID: %%a)
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo   Killing leftover on port 3000 (PID: %%a)
    taskkill /F /PID %%a 2>nul
)

:: Clean up PID directory if empty
rmdir "%PID_DIR%" 2>nul

echo.
echo ============================================
echo   NovelForge Stopped.
echo ============================================
