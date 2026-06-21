@echo off
cd /d "%~dp0"
call "%~dp0stop.bat"
timeout /t 2 /nobreak >nul
call "%~dp0start.bat"
