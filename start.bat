@echo off
rem BookHaven — one-click server start (Windows)
cd /d "%~dp0"
echo Starting BookHaven server...
echo Keep this window open. Then open http://localhost:3000 in your browser.
echo.
npm start
pause