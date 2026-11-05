param([switch]$CreateShortcut,[switch]$ShortcutOnly,[switch]$InspectOnly,[switch]$ManualOnly,[switch]$StopAI,[ValidateRange(1,600)][int]$StartupTimeoutSeconds=90)
$ErrorActionPreference='Stop'
$appRoot=$PSScriptRoot
$launcherPath=$PSCommandPath
$appHtml=Join-Path $appRoot 'MicroCAD_Vision.html'
$powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$aiScript=Join-Path $appRoot 'MicroCAD_AI\start_ai.ps1'
function Show-Notice([string]$text) {
 Write-Warning $text
 try { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($text,'MicroCAD Vision') | Out-Null } catch { Write-Warning $text }
}
function New-LauncherShortcut([string]$name,[string]$extra,[string]$desktopPath=[Environment]::GetFolderPath('Desktop')) {
 $shell=New-Object -ComObject WScript.Shell
 $shortcut=$shell.CreateShortcut((Join-Path $desktopPath ($name+'.lnk')))
 $shortcut.TargetPath=$powershell
 $shortcut.Arguments='-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$launcherPath+'"'+$extra
 $shortcut.WorkingDirectory=$appRoot
 $shortcut.Description=$name
 $shortcut.IconLocation=(Join-Path $appRoot 'MicroCAD.ico')+',0'
 $shortcut.WindowStyle=7
 $shortcut.Save()
}
function Show-StartupProgress {
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){return $null}
 try {
  Add-Type -AssemblyName System.Windows.Forms
  $form=New-Object System.Windows.Forms.Form
  $form.Text='MicroCAD Vision - AI';$form.Width=430;$form.Height=140;$form.StartPosition='CenterScreen';$form.ControlBox=$false
  $label=New-Object System.Windows.Forms.Label
  $label.Text='Đang kiểm tra Python/model và chờ YOLO sẵn sàng...';$label.AutoSize=$true;$label.Left=15;$label.Top=15
  $bar=New-Object System.Windows.Forms.ProgressBar
  $bar.Style='Marquee';$bar.Left=15;$bar.Top=48;$bar.Width=380
  $form.Controls.Add($label);$form.Controls.Add($bar);$form.Show();[System.Windows.Forms.Application]::DoEvents();return $form
 } catch {return $null}
}
function Invoke-AILifecycle([switch]$Stopping) {
 $stateDir=Join-Path $env:LOCALAPPDATA 'MicroCADVision'
 New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
 $prefix=Join-Path $stateDir ('launcher-'+[Guid]::NewGuid().ToString('N'))
 $arguments='-NoLogo -NoProfile -ExecutionPolicy Bypass -File "'+$aiScript+'" '
 if($Stopping){$arguments+='-Stop'}else{$arguments+='-EnsureRunning -StartupTimeoutSeconds '+$StartupTimeoutSeconds}
 $child=Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput ($prefix+'.out.log') -RedirectStandardError ($prefix+'.err.log')
 $progress=$null
 if(-not $Stopping){$progress=Show-StartupProgress}
 try {
  $limit=[DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds+40)
  while(-not $child.WaitForExit(200)) {
   Write-Progress -Activity 'MicroCAD AI' -Status 'Đang kiểm tra và chờ backend sẵn sàng...'
   if($null -ne $progress){[System.Windows.Forms.Application]::DoEvents()}
   if([DateTime]::UtcNow -gt $limit){throw ('Hết thời gian chờ launcher. Xem log: '+$prefix)}
  }
 } finally {if($null -ne $progress){$progress.Close();$progress.Dispose()};Write-Progress -Activity 'MicroCAD AI' -Completed}

 if($child.ExitCode -ne 0){$details=Get-Content -LiteralPath ($prefix+'.err.log') -Raw -Encoding UTF8 -ErrorAction SilentlyContinue;throw ("AI không sẵn sàng hoặc không thể tắt an toàn.`n"+$details+"`nLog: "+$prefix)}
 Get-Content -LiteralPath ($prefix+'.out.log') -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
}
try {
 if($StopAI){$result=Invoke-AILifecycle -Stopping;Show-Notice ("Kết quả kiểm tra/tắt AI (không tắt backend của ứng dụng khác):`n"+$result);exit 0}
 if(-not(Test-Path -LiteralPath $appHtml)){throw 'Thiếu MicroCAD_Vision.html. Hãy giải nén đầy đủ thư mục ứng dụng.'}
 $browserCandidates=@()
 foreach($root in @(${env:ProgramFiles(x86)},$env:ProgramFiles,$env:LOCALAPPDATA)) {
  if($root){$browserCandidates+=Join-Path $root 'Microsoft\Edge\Application\msedge.exe';$browserCandidates+=Join-Path $root 'Google\Chrome\Application\chrome.exe'}
 }
 $browserPath=$browserCandidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
 if(-not $browserPath){throw 'Cần Microsoft Edge hoặc Google Chrome để mở MicroCAD Vision.'}
 $browserArguments='--app="'+([System.Uri]::new($appHtml)).AbsoluteUri+'" --no-first-run'
 if($InspectOnly){Write-Output "Browser: $browserPath";Write-Output "App: $appHtml";Write-Output "AI script: $aiScript";exit 0}
 if($CreateShortcut){New-LauncherShortcut 'MicroCAD Vision' '';New-LauncherShortcut 'Stop MicroCAD AI' ' -StopAI'}
 if($ShortcutOnly){exit 0}
 if(-not $ManualOnly){
  try {
   if(-not(Test-Path -LiteralPath (Join-Path $appRoot 'MicroCAD_AI\server.py'))){throw 'Thiếu MicroCAD_AI/server.py.'}
   if(-not(Test-Path -LiteralPath $aiScript)){throw 'Thiếu MicroCAD_AI/start_ai.ps1.'}
   if(-not(Test-Path -LiteralPath (Join-Path $appRoot 'MicroCAD_AI\.venv\Scripts\python.exe'))){throw 'Thiếu môi trường Python .venv. Hãy chạy MicroCAD_AI/setup.ps1 một lần trước khi dùng AI.'}
   Invoke-AILifecycle
  } catch {Show-Notice ("AI chưa sẵn sàng. Ứng dụng vẫn mở để đo thủ công.`nKiểm tra best.pt và .venv; chạy setup.ps1 riêng nếu cần. Launcher không cài Torch/CUDA, không tải model.`n"+$_.Exception.Message)}
 }
 Start-Process -FilePath $browserPath -ArgumentList $browserArguments -WindowStyle Normal
} catch {Show-Notice $_.Exception.Message;exit 1}
