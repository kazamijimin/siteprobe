[CmdletBinding()]
param(
    [switch]$IncludeMobile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateDirectory = Join-Path $repoRoot ".siteprobe"
$pnpmCommand = (Get-Command pnpm.cmd -ErrorAction Stop).Source

Set-Location $repoRoot

foreach ($requiredEnvFile in @("services/api/.env", "services/scanner/.env")) {
    $path = Join-Path $repoRoot $requiredEnvFile
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing $requiredEnvFile. Copy its .env.example file and configure it before starting SiteProbe."
    }
}

New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null

$services = @(
    [pscustomobject]@{ Name = "scanner"; Script = "scanner:dev" },
    [pscustomobject]@{ Name = "api"; Script = "api:dev" }
)

if ($IncludeMobile) {
    $services += [pscustomobject]@{ Name = "mobile"; Script = "mobile:start" }
}

$startedStateFiles = [System.Collections.Generic.List[string]]::new()

try {
    foreach ($service in $services) {
        $stateFile = Join-Path $stateDirectory "$($service.Name).json"

        if (Test-Path -LiteralPath $stateFile -PathType Leaf) {
            $existing = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
            $existingProcess = Get-Process -Id ([int]$existing.Pid) -ErrorAction SilentlyContinue
            if ($null -ne $existingProcess) {
                Write-Host "$($service.Name) is already running (PID $($existing.Pid))."
                continue
            }
            Remove-Item -LiteralPath $stateFile -Force
        }

        $logPath = Join-Path $stateDirectory "$($service.Name).log"
        $errorLogPath = Join-Path $stateDirectory "$($service.Name).error.log"
        $process = Start-Process `
            -FilePath $pnpmCommand `
            -ArgumentList $service.Script `
            -WorkingDirectory $repoRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput $logPath `
            -RedirectStandardError $errorLogPath `
            -PassThru

        Start-Sleep -Milliseconds 300
        if ($process.HasExited) {
            throw "$($service.Name) exited during startup. See $errorLogPath."
        }

        [pscustomobject]@{
            Name = $service.Name
            Pid = $process.Id
            StartTime = $process.StartTime.ToUniversalTime().ToString("o")
            Script = $service.Script
        } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8

        $startedStateFiles.Add($stateFile)
        Write-Host "Started $($service.Name) (PID $($process.Id)). Logs: $logPath"
    }

    Write-Host "SiteProbe is running. Use .\stop.ps1 to stop the processes."
}
catch {
    foreach ($stateFile in $startedStateFiles) {
        if (Test-Path -LiteralPath $stateFile -PathType Leaf) {
            $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
            & taskkill.exe /PID ([int]$state.Pid) /T /F 2>$null | Out-Null
            Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
        }
    }
    throw
}
