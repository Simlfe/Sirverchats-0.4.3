# SirverData Windows Build Script (PowerShell)
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       Building SirverData for Windows (x64)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not found. Install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# 2. Check Cargo
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Rust/Cargo not found. Install via https://rustup.rs/ (MSVC toolchain)." -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] Installing NPM dependencies..." -ForegroundColor Yellow
if (Test-Path "package-lock.json") {
    Remove-Item -Force "package-lock.json"
}
npm install
npm install --no-save @rollup/rollup-win32-x64-msvc lightningcss-win32-x64-msvc @tailwindcss/oxide-win32-x64-msvc @esbuild/win32-x64
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm install failed." -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/3] Building Frontend..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Frontend build failed." -ForegroundColor Red
    exit 1
}

Write-Host "`n[3/3] Compiling Tauri Windows App (NSIS & MSI)..." -ForegroundColor Yellow
npx tauri build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Windows compilation failed." -ForegroundColor Red
    exit 1
}

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "[SUCCESS] SirverData Windows Build Completed!" -ForegroundColor Green
Write-Host "Find your installer at:" -ForegroundColor Green
Write-Host "  src-tauri\target\release\bundle\nsis\*.exe" -ForegroundColor White
Write-Host "  src-tauri\target\release\bundle\msi\*.msi" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Green
