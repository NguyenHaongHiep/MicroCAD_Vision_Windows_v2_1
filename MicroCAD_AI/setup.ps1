[CmdletBinding()]
param([switch]$CpuOnly)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# ASCII-only so Windows PowerShell 5.1 can parse this file without a UTF-8 BOM.
$pythonCommand = $null
$pythonArgs = @()
$pyLauncher = Get-Command py -ErrorAction SilentlyContinue

if ($pyLauncher) {
    foreach ($candidate in @('3.12', '3.11')) {
        & py "-$candidate" --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            $pythonCommand = 'py'
            $pythonArgs = @("-$candidate")
            break
        }
    }
}

if (-not $pythonCommand) {
    $pythonExe = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonExe) {
        throw 'Python was not found. Install Python 3.11 or 3.12 x64 and enable Add Python to PATH.'
    }
    $version = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
    if ($version -notin @('3.11', '3.12')) {
        throw "Python 3.11 or 3.12 is required. Found Python $version."
    }
    $pythonCommand = 'python'
}

$selectedVersion = & $pythonCommand @pythonArgs --version
Write-Host "Using $selectedVersion"

if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
    & $pythonCommand @pythonArgs -m venv .venv
}

$venvPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
& $venvPython -m pip install --upgrade pip

if ($CpuOnly) {
    Write-Host 'Installing CPU-only PyTorch...'
    & $venvPython -m pip install --upgrade --force-reinstall torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cpu
}
else {
    if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
        & nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader
    }
    else {
        throw 'nvidia-smi was not found. Install/update the NVIDIA driver or explicitly run setup.ps1 -CpuOnly.'
    }
    Write-Host 'Installing PyTorch 2.6.0 with CUDA 12.6...'
    & $venvPython -m pip install --upgrade --force-reinstall torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu126
}

& $venvPython -m pip install -r requirements.txt
& $venvPython -c "import torch; print('torch', torch.__version__, 'cuda', torch.version.cuda, 'available', torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU fallback')"
if (-not $CpuOnly) {
    & $venvPython -c "import torch, sys; sys.exit(0 if torch.cuda.is_available() else 1)"
    if ($LASTEXITCODE -ne 0) {
        throw 'CUDA PyTorch was installed but torch.cuda.is_available() is False. Do not start GPU training.'
    }
}
& $venvPython -c "import cv2, fastapi, ultralytics, numpy; print('Dependencies OK', ultralytics.__version__)"

Write-Host 'Setup completed. Put the trained model at models\best.pt.'
