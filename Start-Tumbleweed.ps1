param([switch]$NoBrowser, [ValidateRange(1,65535)][int]$Port = 4318)
$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$localUrl = "http://127.0.0.1:$Port"
try {
    $running = Invoke-RestMethod -Uri "$localUrl/api/state" -TimeoutSec 2
    if ($running.state.format -eq 'tumbleweed-local-1' -and $running.data_path -eq (Join-Path $appRoot 'data\workspace.json')) {
        if (-not $NoBrowser) { Start-Process $localUrl }
        exit 0
    }
    throw "Port $Port is occupied by another workspace. Choose a different -Port."
} catch {
    if ($_.Exception.Message -like '*occupied*') { throw }
}
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCommand) { throw 'Install Python 3.10 or later and make its python command available on PATH.' }
$logFolder = Join-Path $appRoot 'data'
New-Item -ItemType Directory -Force -Path $logFolder | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$serverProcess = Start-Process -FilePath $pythonCommand.Source -ArgumentList @('-X', 'utf8', ('"' + (Join-Path $appRoot 'server.py') + '"'), '--port', $Port) -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logFolder "server-$stamp.log") -RedirectStandardError (Join-Path $logFolder "server-$stamp-error.log")
Set-Content -LiteralPath (Join-Path $logFolder 'server.pid') -Value $serverProcess.Id
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    if ($serverProcess.HasExited) { throw 'The local server stopped. Read the newest server error log in the data folder.' }
    try {
        $running = Invoke-RestMethod -Uri "$localUrl/api/state" -TimeoutSec 1
        if ($running.state.format -eq 'tumbleweed-local-1' -and $running.data_path -eq (Join-Path $appRoot 'data\workspace.json')) {
            if (-not $NoBrowser) { Start-Process $localUrl }
            exit 0
        }
    } catch { }
}
throw 'The local server did not start in time. Read the newest server error log in the data folder.'
