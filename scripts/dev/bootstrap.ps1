$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

corepack enable
pnpm install
docker compose up -d postgres

if (Get-Command flutter -ErrorAction SilentlyContinue) {
    Push-Location mobile
    try {
        flutter create --platforms=android,ios .
        flutter pub get
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Warning 'Flutter was not found. Install Flutter, then run: cd mobile; flutter create --platforms=android,ios .'
}

