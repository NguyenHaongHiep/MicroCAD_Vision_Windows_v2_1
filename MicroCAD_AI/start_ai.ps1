param([switch]$EnsureRunning,[switch]$Stop,[ValidateRange(1,600)][int]$StartupTimeoutSeconds=90)
try{[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding;$OutputEncoding=[Console]::OutputEncoding}catch{}
$ErrorActionPreference='Stop';Set-Location $PSScriptRoot;$python=Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
$env:YOLO_AUTOINSTALL='false'
$env:YOLO_OFFLINE='true'
if($Stop -and -not(Test-Path -LiteralPath $python -PathType Leaf)){
 $fallback=Get-Command python -ErrorAction SilentlyContinue
 if($fallback){$python=$fallback.Source}
}
if(-not(Test-Path -LiteralPath $python -PathType Leaf)){
 [Console]::Error.WriteLine('AI [PYTHON]: Không tìm thấy Python trong .venv. Xác minh môi trường Python 3.11/3.12 của thư mục MicroCAD_AI.')
 exit 1
}
# python.exe can exist even when its base Python in pyvenv.cfg is no longer usable.
$version = & {
 $ErrorActionPreference='Continue'
 & $python --version 2>&1
}
if($LASTEXITCODE -ne 0){
 [Console]::Error.WriteLine("AI [PYTHON]: Không chạy được $python. Kiểm tra đường dẫn Python gốc trong .venv/pyvenv.cfg. $version")
 exit 1
}
if($Stop){& $python (Join-Path $PSScriptRoot 'launcher.py') stop;exit $LASTEXITCODE}
if($EnsureRunning){& $python (Join-Path $PSScriptRoot 'launcher.py') ensure --timeout $StartupTimeoutSeconds;exit $LASTEXITCODE}
if(-not $env:MICROCAD_MODEL){$env:MICROCAD_MODEL=Join-Path $PSScriptRoot 'runs\segment\hole_inner-2\weights\best.pt'}
if(-not(Test-Path $env:MICROCAD_MODEL)){throw "Không tìm thấy checkpoint experimental: $env:MICROCAD_MODEL"}
$env:MICROCAD_CONF='0.25';$env:MICROCAD_IMGSZ='640'
& $python -m uvicorn server:app --host 127.0.0.1 --port 8000
