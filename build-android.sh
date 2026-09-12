#!/usr/bin/env bash
set -e

echo "========================================================"
echo "          Building SirverData for Android"
echo "========================================================"

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is required. Please install Node.js 18+."
    exit 1
fi

# Step 1: Install deps
echo "[1/4] Installing NPM dependencies..."
npm install

# Step 2: Build web assets
echo "[2/3] Building Vite web application..."
npm run build

# Step 3: Build through the Tauri Android target
echo "[3/3] Building APK with Tauri..."
npx tauri android build --debug --apk

echo "========================================================"
echo "[SUCCESS] Android APK built successfully!"
echo "APK location:"
echo "  src-tauri/gen/android/app/build/outputs/apk/debug/app-debug.apk"
echo "========================================================"
