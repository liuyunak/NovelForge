@echo off
echo Stopping NovelForge Studio...
taskkill /FI "WINDOWTITLE eq NovelForge-Studio*" /T /F 2>nul
echo Done.
pause
