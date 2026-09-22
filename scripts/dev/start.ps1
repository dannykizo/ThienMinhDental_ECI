$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$logDir = Join-Path $repoRoot 'logs'
$apiUrl = 'http://localhost:3001/api/health'
$webUrl = 'http://localhost:3000/login'

function Test-ApiReady {
    try {
        $response = Invoke-RestMethod -Uri $apiUrl -TimeoutSec 3
        return $response.status -eq 'ok'
    }
    catch {
        return $false
    }
}

function Test-WebReady {
    try {
        $response = Invoke-WebRequest -Uri $webUrl -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200 -and $response.Content.Contains('Dental Workforce')
    }
    catch {
        return $false
    }
}

function Wait-UntilReady {
    param(
        [scriptblock]$Check,
        [string]$Name,
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (& $Check) {
            Write-Host "$Name da san sang."
            return
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    throw "$Name khong san sang sau $TimeoutSeconds giay. Xem cua so terminal cua dich vu de biet loi."
}

function Test-PortInUse {
    param([int]$Port)
    return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Test-DockerReady {
    try {
        & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    }
    catch {
        return $false
    }
}

function Test-PostgresReady {
    try {
        $health = & docker inspect --format '{{.State.Health.Status}}' thien-minh-dental-postgres 2>$null
        return $LASTEXITCODE -eq 0 -and $health -eq 'healthy'
    }
    catch {
        return $false
    }
}

function Start-DevService {
    param(
        [string]$Name,
        [string]$Script,
        [string]$LogName
    )

    $stdoutLog = Join-Path $logDir "$LogName.log"
    $stderrLog = Join-Path $logDir "$LogName.err.log"

    if (-not (Test-Path -LiteralPath $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }

    Write-Host "Dang bat $Name (development mode, chay nen)..."
    Start-Process -FilePath 'powershell.exe' `
        -WorkingDirectory $repoRoot `
        -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', "corepack pnpm $Script" `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog
}

Set-Location -LiteralPath $repoRoot

if (-not (Test-Path -LiteralPath 'backend\.env') -or -not (Test-Path -LiteralPath 'frontend\.env.local')) {
    throw 'Thieu backend/.env hoac frontend/.env.local. Hay lam buoc thiet lap ban dau trong README.md.'
}

if (-not (Test-ApiReady)) {
    if (Test-PortInUse -Port 3001) {
        throw 'Cong 3001 dang duoc su dung nhung API health khong dung. Hay kiem tra tien trinh tren cong nay.'
    }
    if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
        throw 'Khong tim thay Corepack. Hay cai Node.js theo README.md.'
    }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Khong tim thay Docker. Hay cai va bat Docker Desktop.'
    }

    if (-not (Test-DockerReady)) {
        $dockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
        if (-not (Test-Path -LiteralPath $dockerDesktop)) {
            throw 'Docker Desktop chua chay va khong tim thay duong dan cai dat mac dinh.'
        }
        Write-Host 'Dang bat Docker Desktop...'
        Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
        Wait-UntilReady -Check { Test-DockerReady } -Name 'Docker Desktop' -TimeoutSeconds 120
    }

    Write-Host 'Dang bat PostgreSQL...'
    & corepack pnpm infra:up
    if ($LASTEXITCODE -ne 0) {
        throw 'Khong khoi dong duoc PostgreSQL.'
    }
    Wait-UntilReady -Check { Test-PostgresReady } -Name 'PostgreSQL' -TimeoutSeconds 90

    Start-DevService -Name 'Backend API' -Script 'dev:api' -LogName 'api'
    Wait-UntilReady -Check { Test-ApiReady } -Name 'Backend API'
}
else {
    Write-Host 'Backend API da chay.'
}

if (-not (Test-WebReady)) {
    if (Test-PortInUse -Port 3000) {
        throw 'Cong 3000 dang duoc su dung nhung khong phai Admin Web. Hay kiem tra tien trinh tren cong nay.'
    }
    if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
        throw 'Khong tim thay Corepack. Hay cai Node.js theo README.md.'
    }
    Start-DevService -Name 'Admin Web' -Script 'dev:web' -LogName 'web'
    Wait-UntilReady -Check { Test-WebReady } -Name 'Admin Web'
}
else {
    Write-Host 'Admin Web da chay.'
}

Write-Host "Mo Admin Web: $webUrl"
Write-Host "Log dich vu: $logDir"
Write-Host 'Dung chuong trinh bang STOP.cmd.'
Start-Process $webUrl
