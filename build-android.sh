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
echo "[2/4] Building Vite web application..."
npm run build

# Step 3: Capacitor sync
echo "[3/4] Syncing web assets to Android project..."
npx cap sync android

# Step 4: Build APK with Gradle
echo "[4/4] Building APK using Gradle..."
chmod +x android/gradlew
cd android
./gradlew assembleDebug

echo "========================================================"
echo "[SUCCESS] Android APK built successfully!"
echo "APK location:"
echo "  android/app/build/outputs/apk/debug/app-debug.apk"
echo "========================================================"
