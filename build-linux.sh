#!/usr/bin/env bash
set -e

echo "========================================================"
echo "          Building SirverData for Linux (x64)"
echo "========================================================"

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is required. Please install Node.js 18+."
    exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
    echo "[ERROR] Rust/Cargo is required. Please install Rust via https://rustup.rs/"
    exit 1
fi

echo "[1/3] Installing NPM packages..."
npm install

echo "[2/3] Building frontend assets..."
npm run build

echo "[3/3] Compiling Tauri Linux App..."
npx tauri build

echo "========================================================"
echo "[SUCCESS] Linux build complete!"
echo "Binaries & Bundles available at:"
echo "  src-tauri/target/release/bundle/appimage/*.AppImage"
echo "  src-tauri/target/release/bundle/deb/*.deb"
echo "  src-tauri/target/release/sirverdata (binary)"
echo "========================================================"
