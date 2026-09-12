@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo         Building SirverData for Android (APK)
echo ========================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH.
    echo Please install Node.js (v18+) from https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Check Java (JDK)
where java >nul 2>nul
if %errorlevel% neq 0 (
    if not defined JAVA_HOME (
        echo [WARNING] Java (JDK 17+) was not found in PATH or JAVA_HOME.
        echo If you have Android Studio installed, you can set:
        echo set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
    )
)

echo [1/4] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

echo.
echo [2/4] Building Vite web application...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed.
    pause
    exit /b 1
)

echo.
echo [3/3] Compiling Tauri Android APK...
call npx tauri android build --debug --apk
set GRADLE_STATUS=%errorlevel%

if %GRADLE_STATUS% neq 0 (
    echo.
    echo [ERROR] Tauri Android build failed.
    echo Make sure Android SDK or Android Studio is installed on your computer.
    echo You can also open the /android folder directly inside Android Studio.
    pause
    exit /b %GRADLE_STATUS%
)

echo.
echo ========================================================
echo [SUCCESS] Tauri Android APK built successfully!
echo.
echo Output APK Location:
echo   src-tauri\gen\android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo You can install it on your device via USB:
echo   adb install src-tauri\gen\android\app\build\outputs\apk\debug\app-debug.apk
echo ========================================================
pause
