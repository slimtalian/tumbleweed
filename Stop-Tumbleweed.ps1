param([ValidateRange(1,65535)][int]$Port = 4318)
$ErrorActionPreference = 'Stop'
$localUrl = "http://127.0.0.1:$Port"
try { $running = Invoke-RestMethod -Uri "$localUrl/api/state" -TimeoutSec 2 }
catch { Write-Output 'The local server is already stopped or unavailable.'; exit }
if ($running.state.format -ne 'tumbleweed-local-1' -or $running.data_path -ne (Join-Path $PSScriptRoot 'data\workspace.json')) {
    throw 'This is not the matching Tumbleweed workspace. No server was stopped.'
}
Invoke-RestMethod -Uri "$localUrl/api/stop" -Method Post -ContentType 'application/json' -Headers @{'X-Tumbleweed-Token' = $running.token} -Body '{}' | Out-Null
Write-Output 'Tumbleweed Local stopped. Your data is retained.'
