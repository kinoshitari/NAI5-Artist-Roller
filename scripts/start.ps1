param([ValidateSet('Start','Stop')][string]$Action='Start',[switch]$NoBrowser)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script=Join-Path $PSScriptRoot 'serve.mjs'
$url='http://127.0.0.1:4173/'
if($Action -eq 'Stop') {
  $recordPath=Join-Path $root '.runtime\server.json'
  if(!(Test-Path -LiteralPath $recordPath)){Write-Host '本工具没有运行记录。';exit 0}
  $record=Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
  $process=Get-CimInstance Win32_Process -Filter ('ProcessId = '+[int]$record.pid)
  if($process -and $process.Name -eq 'node.exe' -and $process.CommandLine.Contains($script)) {
    Stop-Process -Id ([int]$record.pid)
    Write-Host '已停止本工具。'
  } else {Write-Host '记录中的工具进程已结束；未停止其他进程。'}
  exit 0
}
if(!(Test-Path -LiteralPath (Join-Path $root 'dist\index.html'))){throw '缺少构建文件。请在项目目录运行 npm.cmd ci 和 npm.cmd run build。'}
$existing=$null
try {$existing=Invoke-RestMethod ($url+'__nai5_health') -TimeoutSec 2} catch {}
if($existing -and ($existing.app -ne 'nai5-artist-roller' -or $existing.root -ne $root)){throw '4173 端口已被其他应用占用。'}
if(!$existing) {
  $node=(Get-Command node -ErrorAction Stop).Source
  $logs=Join-Path $root '.runtime'
  New-Item -ItemType Directory -Path $logs -Force | Out-Null
  $process=Start-Process -FilePath $node -ArgumentList @('"'+$script+'"') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'server.log') -RedirectStandardError (Join-Path $logs 'server-error.log')
  $ready=$false
  for($i=0;$i -lt 20;$i++) {
    Start-Sleep -Milliseconds 150
    try {$health=Invoke-RestMethod ($url+'__nai5_health') -TimeoutSec 1;if($health.app -eq 'nai5-artist-roller' -and $health.root -eq $root){$ready=$true;break}} catch {}
    if($process.HasExited){break}
  }
  if(!$ready){throw ('启动失败，请查看 '+(Join-Path $logs 'server-error.log'))}
}
Write-Host ('已启动：'+$url)
if(!$NoBrowser){Start-Process $url}
