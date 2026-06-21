@echo off
cd /d "%~dp0"
echo Starting NovelForge Studio...
start "NovelForge-Studio" cmd /c "npm run dev"
echo Done. Frontend running at http://localhost:5173
pause
