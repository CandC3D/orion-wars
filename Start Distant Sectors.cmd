@echo off
rem Serves the Distant Sectors arena and editor on http://localhost:8642 and opens the editor.
rem Browsers block the editor when opened straight from disk, so it must be served.
cd /d "%~dp0"
start "Distant Sectors server" /min node scripts\serve.js
timeout /t 1 /nobreak >nul
start "" "http://localhost:8642/arena/editor.html"
echo Distant Sectors is running at http://localhost:8642/arena/editor.html
echo Close the minimized "Distant Sectors server" window to stop it.
