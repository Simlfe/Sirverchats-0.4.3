#!/usr/bin/env bash
set -e

echo "========================================================"
echo "      Building SirverData for Arch Linux (x86_64)"
echo "========================================================"

# Check for pacman / Arch Linux
if command -v pacman >/dev/null 2>&1; then
    echo "[*] Arch Linux environment detected."
    echo "[*] Checking required system packages..."
    MISSING_PKGS=()
    for pkg in base-devel webkit2gtk-4.1 gtk3 openssl cairo pango libayatana-appindicator libsoup3 gst-plugins-base gst-plugins-good gst-plugins-bad gst-libav gst-plugin-pipewire rust nodejs npm; do
        if ! pacman -Q "$pkg" >/dev/null 2>&1; then
            MISSING_PKGS+=("$pkg")
        fi
    done

    if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
        echo "[!] Some recommended packages are missing (critical for audio/mic/video calls):"
        echo "    ${MISSING_PKGS[*]}"
        echo "    Install with: sudo pacman -S --needed ${MISSING_PKGS[*]}"
    fi
fi

# Step 1: Install frontend deps
echo "[1/3] Installing NPM packages..."
npm install

# Step 2: Build frontend
echo "[2/3] Building Vite frontend..."
npm run build

# Step 3: Build Tauri Linux application
echo "[3/3] Building native desktop application..."
npx tauri build

echo "========================================================"
echo "[SUCCESS] Build finished!"
echo "Find your Linux packages in: src-tauri/target/release/bundle/"
echo "  - AppImage: src-tauri/target/release/bundle/appimage/"
echo "  - Debian (.deb): src-tauri/target/release/bundle/deb/"
echo "  - Standalone Binary: src-tauri/target/release/sirverdata"
echo "To build pacman package (.pkg.tar.zst), run:"
echo "  cd arch && makepkg -si"
echo "========================================================"
