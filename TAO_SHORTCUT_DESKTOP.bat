@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-MicroCAD.ps1" -CreateShortcut -ShortcutOnly
if errorlevel 1 (
  echo Failed to create shortcut. Keep all app files in the same extracted folder.
) else (
  echo Desktop shortcut created: MicroCAD Vision
  echo Keep this app folder in its current location.
)
pause
