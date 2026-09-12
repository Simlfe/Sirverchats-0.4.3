#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_DIR="${ROOT_DIR}/build/linux/x64/release/bundle"
OUT_DIR="${ROOT_DIR}/build/linux/packages"
VERSION="${1:-0.5.0}"

if [[ ! -d "${BUNDLE_DIR}" ]]; then
  echo "Flutter Linux bundle not found: ${BUNDLE_DIR}" >&2
  exit 1
fi

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

# Relocatable archive used by distributions that do not consume deb packages.
tar -C "${BUNDLE_DIR}" -czf "${OUT_DIR}/sirverdata-desktop-${VERSION}-linux-x64.tar.gz" .

# Debian package. The Flutter bundle is kept under /opt so it can be upgraded
# atomically without relying on a system Flutter installation.
DEB_ROOT="${OUT_DIR}/deb-root"
DESKTOP_FILE="${OUT_DIR}/sirverdata-desktop.desktop"
mkdir -p "${DEB_ROOT}/DEBIAN" "${DEB_ROOT}/opt/sirverdata-desktop"
cp -a "${BUNDLE_DIR}/." "${DEB_ROOT}/opt/sirverdata-desktop/"
cat > "${DEB_ROOT}/DEBIAN/control" <<CONTROL
Package: sirverdata-desktop
Version: ${VERSION}
Section: net
Priority: optional
Architecture: amd64
Maintainer: SirverData
Description: Native SirverChats desktop client
 SirverChats messaging client for Linux.
CONTROL
cat > "${DESKTOP_FILE}" <<DESKTOP
[Desktop Entry]
Name=SirverChats
Comment=Native SirverChats messaging client
Exec=/opt/sirverdata-desktop/sirverdata_desktop
Icon=sirverdata-desktop
Terminal=false
Type=Application
Categories=Network;Chat;
DESKTOP
mkdir -p "${DEB_ROOT}/usr/share/applications"
cp "${DESKTOP_FILE}" "${DEB_ROOT}/usr/share/applications/sirverdata-desktop.desktop"
dpkg-deb --build "${DEB_ROOT}" "${OUT_DIR}/sirverdata-desktop-${VERSION}-amd64.deb" >/dev/null

# AppImage creation is optional locally. CI installs appimagetool and sets its
# path, while developers still receive the tarball and deb without extra tools.
if [[ -n "${APPIMAGETOOL:-}" && -x "${APPIMAGETOOL}" ]]; then
  APP_DIR="${OUT_DIR}/SirverChats.AppDir"
  mkdir -p "${APP_DIR}/usr/bin" "${APP_DIR}/usr/share/icons/hicolor/256x256/apps"
  cp -a "${BUNDLE_DIR}/." "${APP_DIR}/usr/bin/"
  cp "${ROOT_DIR}/web/icons/Icon-512.png" "${APP_DIR}/usr/share/icons/hicolor/256x256/apps/sirverdata-desktop.png" 2>/dev/null || true
  cp "${DESKTOP_FILE}" "${APP_DIR}/sirverdata-desktop.desktop"
  cat > "${APP_DIR}/AppRun" <<'APPRUN'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "$0")")"
exec "${HERE}/usr/bin/sirverdata_desktop" "$@"
APPRUN
  chmod +x "${APP_DIR}/AppRun"
  "${APPIMAGETOOL}" "${APP_DIR}" "${OUT_DIR}/SirverChats-${VERSION}-x86_64.AppImage"
fi

rm -rf "${DEB_ROOT}" "${DESKTOP_FILE}"

find "${OUT_DIR}" -maxdepth 1 -type f -print
