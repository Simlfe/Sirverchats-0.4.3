@echo off
echo ========================================================
echo        Building SirverData for Windows (x64)
echo ========================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

:: Check Rust / Cargo
where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Rust / Cargo is not installed or not in PATH.
    echo Please install Rust via rustup from https://rustup.rs/
    echo Make sure to select the "MSVC toolchain" during installation.
    pause
    exit /b 1
)

echo [1/3] Installing dependencies...
if exist package-lock.json del /f /q package-lock.json
call npm install
call npm install --no-save @rollup/rollup-win32-x64-msvc lightningcss-win32-x64-msvc @tailwindcss/oxide-win32-x64-msvc @esbuild/win32-x64
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

echo.
echo [2/3] Building Frontend Assets...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed.
    pause
    exit /b 1
)

echo.
echo [3/3] Compiling Tauri Windows Binary and Installer...
call npx tauri build
if %errorlevel% neq 0 (
    echo [ERROR] Tauri Windows build failed.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo [SUCCESS] Windows Build Complete!
echo.
echo Output Installer:
echo   src-tauri\target\release\bundle\nsis\*.exe
echo   src-tauri\target\release\bundle\msi\*.msi
echo ========================================================
pause
