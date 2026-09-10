# SirverData Multi-Platform Compilation & Deployment Guide
# دليل بناء ونشر التطبيق لجميع المنصات (Windows, Linux Arch, Android)

This repository is fully configured for automated multi-platform compilation, producing native binaries and packages for **Windows**, **Linux (including Arch Linux)**, and **Android**.

---

## 1. Arch Linux (x86_64) & Universal Linux

### Microphone & Video Calls Verification on Arch Linux:
SirverData's real-time calling engine runs on WebRTC and WebKit2GTK on Linux. For microphone access, camera capture, and WebRTC signaling to function smoothly on Arch Linux (x86_64), the following multimedia libraries are required:
```bash
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  gst-plugins-base \
  gst-plugins-good \
  gst-plugins-bad \
  gst-libav \
  gst-plugin-pipewire \
  pipewire \
  pipewire-pulse \
  wireplumber \
  v4l-utils
```
- **`gst-plugins-bad`**: Contains the essential WebRTC DTLS/SRTP components required by WebKitGTK for audio and video calls.
- **`gst-plugins-good`**: Provides V4L2 device capture (webcams) and PulseAudio/ALSA microphone inputs.
- **`gst-plugin-pipewire`**: Enables modern Wayland/X11 PipeWire screen sharing and microphone streams.
- **Application Fallbacks**: The frontend includes 5-level adaptive constraint fallback ending in `{ video: true }` and bypasses premature Permission API query blocks so webcams and microphones prompt cleanly.

### Option A: One-Click Windows BAT Build
```cmd
build-arch.bat
```
Automatically detects your WSL Arch or Linux environment, checks all media dependencies, builds frontend assets, and packages the x86_64 package.

### Option B: Native Arch Linux Package (`makepkg` / `PKGBUILD`)
The repository includes a dedicated `arch/PKGBUILD` and `arch/sirverdata.desktop`:
```bash
cd arch
makepkg -si
```
This builds an official Arch package (`.pkg.tar.zst`), installs `/usr/bin/sirverdata`, and registers icons and desktop menu entries.

### Option C: Universal Linux Build
```cmd
build-linux.bat
```
Or in bash:
```bash
./build-linux.sh
# Binaries placed in src-tauri/target/release/bundle/appimage/
```

---

## 2. Android (APK & AAB)

### Option A: One-Click Windows BAT Build
```cmd
build-android.bat
```
Checks Node and JDK, compiles Vite web assets, synchronizes Capacitor, builds `app-debug.apk` with Gradle, and prints the APK location:
```
android\app\build\outputs\apk\debug\app-debug.apk
```

### Option B: Automated Cloud Build via GitHub Actions
Trigger **Build and Deploy Android App** under GitHub Actions to download the APK without local Java/Android SDK setup.

---

## 3. Windows (x64)

### Option A: One-Click Windows BAT Build
```cmd
build-windows.bat
```
Checks Node and Cargo, compiles Vite, and bundles:
- `src-tauri\target\release\bundle\nsis\SirverData_0.3.8_x64-setup.exe`
- `src-tauri\target\release\bundle\msi\SirverData_0.3.8_x64.msi`

---

## Summary of 1-Click BAT Scripts (for Windows Users)
| Batch File | Platform Target | Output Artifact |
| :--- | :--- | :--- |
| **`build-windows.bat`** | Windows 10/11 (x64) | NSIS `.exe` installer & `.msi` |
| **`build-android.bat`** | Android Phone / Tablet | `app-debug.apk` |
| **`build-arch.bat`** | Arch Linux (x86_64) | Pacman `.pkg.tar.zst` & binary |
| **`build-linux.bat`** | Linux (Ubuntu/Debian/Fedora) | `.AppImage` & `.deb` |
