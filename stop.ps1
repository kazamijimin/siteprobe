[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateDirectory = Join-Path $repoRoot ".siteprobe"

if (-not (Test-Path -LiteralPath $stateDirectory -PathType Container)) {
    Write-Host "SiteProbe is not running (no state directory found)."
    exit 0
}

$stateFiles = @(Get-ChildItem -LiteralPath $stateDirectory -Filter "*.json" -File)
if ($stateFiles.Count -eq 0) {
    Write-Host "SiteProbe is not running."
    exit 0
}

foreach ($stateFile in $stateFiles) {
    $state = Get-Content -LiteralPath $stateFile.FullName -Raw | ConvertFrom-Json
    $process = Get-Process -Id ([int]$state.Pid) -ErrorAction SilentlyContinue

    if ($null -eq $process) {
        Write-Host "$($state.Name) is already stopped."
        Remove-Item -LiteralPath $stateFile.FullName -Force
        continue
    }

    $expectedStart = [DateTime]::Parse($state.StartTime).ToUniversalTime()
    $actualStart = $process.StartTime.ToUniversalTime()
    if ([Math]::Abs(($actualStart - $expectedStart).TotalSeconds) -gt 5) {
        Write-Warning "Skipping PID $($state.Pid) for $($state.Name): it is not the process started by start.ps1."
        Remove-Item -LiteralPath $stateFile.FullName -Force
        continue
    }

    & taskkill.exe /PID ([int]$state.Pid) /T /F 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Stopped $($state.Name) (PID $($state.Pid))."
    }
    else {
        Write-Warning "Could not stop $($state.Name) (PID $($state.Pid))."
    }
    Remove-Item -LiteralPath $stateFile.FullName -Force
}
