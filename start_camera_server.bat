@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>&1
if errorlevel 1 (
    echo Python is not installed. Please open MicroCAD_Vision.html directly,
    echo or install Python to enable the localhost camera workaround.
    pause
    exit /b 1
)
echo Starting MicroCAD Vision at http://127.0.0.1:8765/MicroCAD_Vision.html
start "" "http://127.0.0.1:8765/MicroCAD_Vision.html"
python -m http.server 8765 --bind 127.0.0.1
pause
