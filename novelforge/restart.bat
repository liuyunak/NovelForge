@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   NovelForge - Restarting...
echo ============================================
echo.

call "%~dp0stop.bat"
timeout /t 2 /nobreak >nul
echo.
call "%~dp0start.bat"
