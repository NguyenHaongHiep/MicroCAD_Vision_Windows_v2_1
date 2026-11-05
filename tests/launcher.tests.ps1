$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
function Assert($condition,[string]$message){if(-not $condition){throw $message}}
$source=Join-Path $repo 'Launch-MicroCAD.ps1'
foreach($file in @($source,(Join-Path $repo 'MicroCAD_AI/start_ai.ps1'))){
 $tokens=$null;$errors=$null
 $ast=[System.Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
 Assert ($errors.Count -eq 0) ('Parse errors in '+$file+': '+$errors)
 Assert (([IO.File]::ReadAllBytes($file))[0] -eq 239) 'UTF-8 BOM required for Windows PowerShell Vietnamese messages'
}
# Mock COM/Windows process operations; these are not native Windows integration tests.
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
foreach($node in $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true)) {Invoke-Expression $node.Extent.Text}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('Micro CAD tiếng Việt '+[guid]::NewGuid())
New-Item -ItemType Directory $temp | Out-Null
try {
 $appRoot=$temp;$launcherPath=Join-Path $temp 'Launch-MicroCAD.ps1';$powershell='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
 $script:shortcut=$null
 function New-Object([string]$ComObject){
  Assert ($ComObject -eq 'WScript.Shell') 'Unexpected COM object'
  $shell=[pscustomobject]@{}
  $shell | Add-Member ScriptMethod CreateShortcut {param($path)
   $script:shortcut=[pscustomobject]@{Path=$path;TargetPath='';Arguments='';WorkingDirectory='';Description='';IconLocation='';WindowStyle=0;Saved=$false}
   $script:shortcut | Add-Member ScriptMethod Save {$this.Saved=$true}
   return $script:shortcut
  }
  return $shell
 }
 New-LauncherShortcut 'MicroCAD Vision' '' $temp
 Assert $shortcut.Saved 'Shortcut not saved'
 Assert ($shortcut.TargetPath -eq $powershell) 'Shortcut must target launcher host, not browser'
 Assert ($shortcut.Arguments.Contains('"'+$launcherPath+'"')) 'Unicode/space launcher path must be quoted'
 New-LauncherShortcut 'Stop MicroCAD AI' ' -StopAI' $temp
 Assert ($shortcut.Arguments.EndsWith(' -StopAI')) 'Stop shortcut argument missing'
 $aiScript=Join-Path $temp 'MicroCAD_AI/start_ai.ps1';$StartupTimeoutSeconds=90
 $oldLocal=$env:LOCALAPPDATA;$env:LOCALAPPDATA=$temp
 $script:exitCode=0;$script:calls=@()
 function Start-Process {
  param($FilePath,$ArgumentList,$WindowStyle,[switch]$PassThru,$RedirectStandardOutput,$RedirectStandardError)
  $script:calls+=@{file=$FilePath;args=$ArgumentList;window=$WindowStyle}
  Set-Content -LiteralPath $RedirectStandardOutput -Value 'AI is ready'
  Set-Content -LiteralPath $RedirectStandardError -Value 'simulated startup failure'
  $child=[pscustomobject]@{ExitCode=$script:exitCode}
  $child | Add-Member ScriptMethod WaitForExit {param($ms) return $true}
  return $child
 }
 Invoke-AILifecycle
 Assert ($calls[-1].args.Contains('"'+$aiScript+'"')) 'Child script path must be quoted'
 Assert ($calls[-1].args.Contains('-EnsureRunning')) 'Ensure-running mode missing'
 Assert ($calls[-1].window -eq 'Hidden') 'AI must not require an interactive console'
 Invoke-AILifecycle -Stopping
 Assert ($calls[-1].args.EndsWith('-Stop')) 'Stop command missing'
 $script:exitCode=1;$failed=$false
 try{Invoke-AILifecycle}catch{$failed=$_.Exception.Message.Contains('simulated startup failure')}
 Assert $failed 'Child startup failure was swallowed'
 $env:LOCALAPPDATA=$oldLocal
 # Exercise the real main script, with browser/Windows operations mocked.
 Copy-Item $source $launcherPath
 Set-Content (Join-Path $temp 'MicroCAD_Vision.html') '<html></html>'
 $oldSystem=$env:SystemRoot;$oldProgram=$env:ProgramFiles;$oldX86=${env:ProgramFiles(x86)}
 $env:SystemRoot=$temp;$env:ProgramFiles=$temp;${env:ProgramFiles(x86)}=$temp
 $browser=Join-Path $temp 'Microsoft/Edge/Application/msedge.exe'
 New-Item -ItemType Directory (Split-Path $browser) -Force | Out-Null
 Set-Content $browser ''
 function Add-Type {throw 'Mocked dialog - no native UI'}
 function Start-Process {param($FilePath,$ArgumentList,$WindowStyle) $global:launcherTestBrowserCount++;$global:launcherTestLastBrowser=$FilePath}
 $global:launcherTestBrowserCount=0
 & $launcherPath -ManualOnly
 Assert ($global:launcherTestBrowserCount -eq 1) 'Manual launch should open one browser'
 New-Item -ItemType Directory (Join-Path $temp 'MicroCAD_AI') -Force | Out-Null
 Set-Content (Join-Path $temp 'MicroCAD_AI/server.py') '# fixture'
 Set-Content (Join-Path $temp 'MicroCAD_AI/start_ai.ps1') '# fixture'
 & $launcherPath
 Assert ($global:launcherTestBrowserCount -eq 2) 'Missing venv must still open manual browser once'
 & $launcherPath -InspectOnly
 Assert ($global:launcherTestBrowserCount -eq 2) 'Inspect-only must not start anything'
 Remove-Item $browser
 & $launcherPath -InspectOnly
 Assert ($LASTEXITCODE -eq 1) 'Missing browser should report failure'
 $env:SystemRoot=$oldSystem;$env:ProgramFiles=$oldProgram;${env:ProgramFiles(x86)}=$oldX86
 Write-Output 'PASS: parsing/BOM, shortcut target/quoting, child success/failure/stop, manual fallback, missing venv/browser, inspect-only'
} finally {Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue}
