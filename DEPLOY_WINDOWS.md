# Windows Deployment Guide | دليل النشر لنظام ويندوز

SirverData is fully configured for native Windows deployment as a lightweight, high-performance desktop application using **Tauri v2** (producing NSIS `.exe` installers and `.msi` packages) as well as an installable **Progressive Web App (PWA)**.

---

## Method 1: Automated Cloud Build via GitHub Actions (Recommended)
You do not need to install Rust or C++ build tools on your computer.

1. Push your latest code or create a release tag (e.g. `v0.3.8`) on your GitHub repository (`Simlfe/SirverData`).
2. Go to the **Actions** tab on your GitHub repository.
3. Select **Build and Deploy Windows App** and click **Run workflow** (or wait for the automatic push trigger).
4. When finished, download the **SirverData-Windows-Setup** artifact containing:
   - `SirverData_0.3.8_x64-setup.exe` (NSIS Installer)
   - `SirverData_0.3.8_x64.msi` (Windows Installer Package)

---

## Method 2: Local Windows Build (Direct on PC)

### Prerequisites:
- **Node.js** (v18 or higher): [nodejs.org](https://nodejs.org/)
- **Rust & Cargo** (stable-x86_64-pc-windows-msvc): [rustup.rs](https://rustup.rs/)
- **Microsoft C++ Build Tools** (Visual Studio Build Tools with "Desktop development with C++" workload).

### Steps:
1. Open Command Prompt or PowerShell in the project directory.
2. Run the build script:
   ```cmd
   build-windows.bat
   ```
   Or using npm:
   ```bash
   npm install
   npm run build:windows
   ```
3. Your installer will be generated in:
   ```
   src-tauri/target/release/bundle/nsis/SirverData_0.3.8_x64-setup.exe
   src-tauri/target/release/bundle/msi/SirverData_0.3.8_x64.msi
   ```

---

## Method 3: Instant Windows Desktop App (PWA / Edge / Chrome)
1. Open the deployed application URL in Microsoft Edge or Google Chrome on Windows.
2. Click the **App available** / **Install** icon in the browser address bar (or Menu > Apps > **Install SirverData as an App**).
3. The app opens in its own standalone, frameless desktop window with Windows taskbar pin and start menu shortcut integration.
