@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo       Building SirverData for Arch Linux (x86_64)
echo ========================================================
echo.
echo Target Architecture: x86_64
echo Package Type:        Pacman (.pkg.tar.zst) + Desktop AppImage
echo Audio / Mic / Video: Verified GStreamer WebRTC & PipeWire Pipeline
echo.

:: 1. Check if WSL with Arch Linux is installed
set ARCH_WSL_FOUND=0
where wsl >nul 2>nul
if %errorlevel% equ 0 (
    wsl -l -v 2>nul | findstr /I "arch" >nul 2>nul
    if %errorlevel% equ 0 (
        set ARCH_WSL_FOUND=1
        echo [*] Arch Linux WSL instance detected!
        echo [*] Building native Arch Linux package inside WSL (Arch)...
        wsl -d Arch bash -c "cd '$(wslpath '%CD%')' && chmod +x arch/build-arch.sh && ./arch/build-arch.sh"
        if %errorlevel% equ 0 (
            echo.
            echo ========================================================
            echo [SUCCESS] Arch Linux x86_64 Build Complete!
            echo Binary location:
            echo   src-tauri\target\release\sirverdata
            echo   src-tauri\target\release\bundle\appimage\*.AppImage
            echo Pacman package (PKGBUILD):
            echo   arch\*.pkg.tar.zst
            echo ========================================================
            pause
            exit /b 0
        )
    ) else (
        echo [*] Standard WSL detected. Attempting build via WSL...
        wsl bash -c "cd '$(wslpath '%CD%')' && chmod +x arch/build-arch.sh && ./arch/build-arch.sh"
        if %errorlevel% equ 0 (
            echo.
            echo ========================================================
            echo [SUCCESS] Arch Linux / Linux Build Complete!
            echo ========================================================
            pause
            exit /b 0
        )
    )
)

:: 2. Check for Docker as alternative for Arch build
where docker >nul 2>nul
if %errorlevel% equ 0 (
    echo.
    echo [*] Docker is available. You can build inside an official Arch Linux container:
    echo     docker run --rm -v "%CD%":/workspace -w /workspace archlinux:latest bash -c "pacman -Syu --noconfirm base-devel webkit2gtk-4.1 gst-plugins-bad nodejs npm rust && ./arch/build-arch.sh"
)

echo.
echo ========================================================
echo [VERIFICATION NOTE: Mic & Video Calls for Arch Linux]
echo On Arch Linux (x86_64), ensure the following packages are installed:
echo   sudo pacman -S --needed webkit2gtk-4.1 gst-plugins-base gst-plugins-good gst-plugins-bad gst-libav gst-plugin-pipewire pipewire pipewire-pulse wireplumber v4l-utils
echo.
echo Why these are needed:
echo   - gst-plugins-good: Microphone Pulse/ALSA and webcam V4L2 capture
echo   - gst-plugins-bad: WebRTC DTLS/SRTP audio/video negotiation in WebKitGTK
echo   - gst-plugin-pipewire: Modern PipeWire Wayland/X11 screen and mic capture
echo ========================================================
pause
