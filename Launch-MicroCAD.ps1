param([switch]$CreateShortcut,[switch]$ShortcutOnly,[switch]$InspectOnly)
$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$appHtml = Join-Path $appRoot 'MicroCAD_Vision.html'
if (-not (Test-Path -LiteralPath $appHtml)) { throw 'MicroCAD_Vision.html is missing. Extract the complete ZIP first.' }
$browserCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
$browserPath = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browserPath) { throw 'Microsoft Edge or Google Chrome is required.' }
$appUri = ([System.Uri]::new($appHtml)).AbsoluteUri
$browserArguments = '--app="' + $appUri + '" --no-first-run'
if ($InspectOnly) {
    Write-Output ('Browser: ' + $browserPath)
    Write-Output ('Arguments: ' + $browserArguments)
    Write-Output ('App: ' + $appHtml)
    exit 0
}
if ($CreateShortcut) {
    $desktopPath = [Environment]::GetFolderPath('Desktop')
    $shortcutPath = Join-Path $desktopPath 'MicroCAD Vision.lnk'
    $shellObject = New-Object -ComObject WScript.Shell
    $shortcut = $shellObject.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $browserPath
    $shortcut.Arguments = $browserArguments
    $shortcut.WorkingDirectory = $appRoot
    $shortcut.Description = 'MicroCAD Vision - Circle diameter and edge gap measurement'
    $shortcut.IconLocation = (Join-Path $appRoot 'MicroCAD.ico') + ',0'
    $shortcut.WindowStyle = 1
    $shortcut.Save()
    Write-Output ('Created Desktop shortcut: ' + $shortcutPath)
}
if (-not $ShortcutOnly) {
    # Visible interactive app window requested by the user when launching this file.
    Start-Process -FilePath $browserPath -ArgumentList $browserArguments -WindowStyle Normal
}
