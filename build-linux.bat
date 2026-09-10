@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo        Building SirverData for Linux (Universal)
echo ========================================================
echo.

:: Check for WSL (Windows Subsystem for Linux)
where wsl >nul 2>nul
if %errorlevel% equ 0 (
    echo [*] Windows Subsystem for Linux (WSL) detected.
    echo [*] Launching automated Linux build inside WSL...
    echo.
    wsl bash -c "cd '$(wslpath '%CD%')' && chmod +x build-linux.sh && ./build-linux.sh"
    if %errorlevel% equ 0 (
        echo.
        echo ========================================================
        echo [SUCCESS] Linux Build Complete via WSL!
        echo Outputs:
        echo   src-tauri\target\release\bundle\appimage\*.AppImage
        echo   src-tauri\target\release\bundle\deb\*.deb
        echo   src-tauri\target\release\sirverdata
        echo ========================================================
        pause
        exit /b 0
    ) else (
        echo.
        echo [WARNING] WSL build returned an error code.
        echo Check if Linux build dependencies are installed inside your WSL distro:
        echo   sudo apt update && sudo apt install libwebkit2gtk-4.1-dev build-essential curl libssl-dev libayatana-appindicator3-dev librsvg2-dev
    )
)

:: Check for Docker
where docker >nul 2>nul
if %errorlevel% equ 0 (
    echo.
    echo [*] Docker detected. You can build via container or run GitHub Actions:
    echo     docker run --rm -v "%CD%":/app -w /app node:20 bash -c "./build-linux.sh"
)

echo.
echo ========================================================
echo [TIP] To build for Linux on Windows without local setup:
echo 1. Push your code to GitHub.
echo 2. Go to Actions -> 'Build and Deploy Linux App' -> 'Run workflow'.
echo 3. Download the compiled AppImage or .deb directly from GitHub!
echo ========================================================
pause
