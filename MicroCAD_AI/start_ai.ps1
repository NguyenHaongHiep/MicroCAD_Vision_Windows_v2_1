$ErrorActionPreference='Stop';Set-Location $PSScriptRoot;$python=Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if(-not(Test-Path $python)){throw 'Chưa có .venv. Chạy .\setup.ps1 trước.'}
if(-not $env:MICROCAD_MODEL){$env:MICROCAD_MODEL=Join-Path $PSScriptRoot 'runs\segment\hole_inner-2\weights\best.pt'}
if(-not(Test-Path $env:MICROCAD_MODEL)){throw "Không tìm thấy checkpoint experimental: $env:MICROCAD_MODEL"}
$env:MICROCAD_CONF='0.25';$env:MICROCAD_IMGSZ='640'
& $python -m uvicorn server:app --host 127.0.0.1 --port 8000
