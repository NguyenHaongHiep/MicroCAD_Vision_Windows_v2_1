@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Launch-MicroCAD.ps1"
if errorlevel 1 (
  echo Could not start MicroCAD. Open MicroCAD_Vision.html in Microsoft Edge.
  pause
)
