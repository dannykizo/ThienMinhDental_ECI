$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path

function Get-ListenerProcessId {
    param([int]$Port)

    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($connection) {
        return $connection.OwningProcess
    }
    return $null
}

function Get-LauncherProcesses {
    param([string]$CommandHint)

    return Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*$CommandHint*" }
}

function Stop-ProcessTree {
    param(
        [int]$TargetProcessId,
        [string]$Name
    )

    try {
        & taskkill.exe /PID $TargetProcessId /T /F 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Da dung $Name (PID $TargetProcessId)."
        }
        else {
            Write-Warning "Khong dung duoc $Name (PID $TargetProcessId)."
        }
    }
    catch {
        Write-Warning "Khong dung duoc $Name (PID $TargetProcessId): $($_.Exception.Message)"
    }
}

function Stop-DevService {
    param(
        [string]$Name,
        [int]$Port,
        [string]$CommandHint
    )

    $launchers = @(Get-LauncherProcesses -CommandHint $CommandHint)
    foreach ($launcher in $launchers) {
        Stop-ProcessTree -TargetProcessId $launcher.ProcessId -Name $Name
    }

    if ($launchers.Count -eq 0) {
        $listenerId = Get-ListenerProcessId -Port $Port
        if ($listenerId) {
            Stop-ProcessTree -TargetProcessId $listenerId -Name $Name
        }
        else {
            Write-Host "$Name khong chay."
        }
    }
}

Stop-DevService -Name 'Backend API' -Port 3001 -CommandHint 'dev:api'
Stop-DevService -Name 'Admin Web' -Port 3000 -CommandHint 'dev:web'

if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host 'Dang dung PostgreSQL...'
    Set-Location -LiteralPath $repoRoot
    & corepack pnpm infra:down
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'Khong dung duoc PostgreSQL. Hay kiem tra Docker Desktop.'
    }
    else {
        Write-Host 'Da dung PostgreSQL.'
    }
}
else {
    Write-Warning 'Khong tim thay Docker; bo qua buoc dung PostgreSQL.'
}

Write-Host 'Da dung chuong trinh.'
