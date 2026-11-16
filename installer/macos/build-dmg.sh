#!/usr/bin/env bash
# ==============================================================================
# Build SimpleStreamer-Setup.dmg (macOS Native Installer Package inside DMG)
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="/tmp/simple_streamer_build"
DIST_DIR="$SCRIPT_DIR/dist"
BIN_SOURCE="$SCRIPT_DIR/bin/simple-streamer-bridge"

echo "🔨 Building Simple Streamer macOS DMG Installer..."

mkdir -p "$BUILD_DIR/scripts" "$DIST_DIR"

# 1. Compile and bundle Simple Streamer Native OBS Plugin
echo "  Building native simple-streamer.plugin..."
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
"$PROJECT_DIR/plugin/build-mac.sh"
cp -R "$PROJECT_DIR/plugin/build/simple-streamer.plugin" "$BUILD_DIR/scripts/simple-streamer.plugin"

# 1b. Bundle Dock & Mobile Remote Web UI assets
echo "  Bundling Dock and Remote UI assets..."
cp -R "$PROJECT_DIR/dock" "$BUILD_DIR/scripts/dock"

# 2. Ensure Universal bridge binary exists
echo "  Compiling Universal bridge binary..."
mkdir -p "$SCRIPT_DIR/bin"
/usr/bin/clang -O3 -fobjc-arc -arch arm64 -arch x86_64 -framework Foundation "$SCRIPT_DIR/simple-streamer-bridge.m" -o "$BIN_SOURCE"
chmod +x "$BIN_SOURCE"
codesign --force --deep -s - -i com.bdjlmn.simple-streamer "$BIN_SOURCE" 2>/dev/null || true
cp "$BIN_SOURCE" "$BUILD_DIR/scripts/simple-streamer-bridge"

# 3. Create postinstall script
cat << 'EOF' > "$BUILD_DIR/scripts/postinstall"
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONSOLE_USER=$(stat -f "%Su" /dev/console)
USER_HOME=$(eval echo ~${CONSOLE_USER})
CONSOLE_UID=$(id -u "${CONSOLE_USER}")

BIN_DIR="${USER_HOME}/.simple-streamer/bin"
PLIST_PATH="${USER_HOME}/Library/LaunchAgents/com.bdjlmn.simple-streamer.plist"
OBS_DIR="${USER_HOME}/Library/Application Support/obs-studio"
PLUGINS_DIR="${OBS_DIR}/plugins"
CONFIG_DIR="${OBS_DIR}/plugin_config/simple-streamer"
USER_INI="${OBS_DIR}/user.ini"
DOCK_URL="http://127.0.0.1:45455/dock"

mkdir -p "${BIN_DIR}" "${USER_HOME}/Library/LaunchAgents" "${PLUGINS_DIR}" "${CONFIG_DIR}"

# Install native secondary stream plugin
if [ -d "$SCRIPT_DIR/simple-streamer.plugin" ]; then
    rm -rf "${PLUGINS_DIR}/simple-streamer.plugin"
    cp -R "$SCRIPT_DIR/simple-streamer.plugin" "${PLUGINS_DIR}/"
    chown -R "${CONSOLE_USER}" "${PLUGINS_DIR}/simple-streamer.plugin"
fi

# Install Dock and Remote UI assets
if [ -d "$SCRIPT_DIR/dock" ]; then
    cp -R "$SCRIPT_DIR/dock/"* "${CONFIG_DIR}/"
    chown -R "${CONSOLE_USER}" "${CONFIG_DIR}"
fi

# Pre-seed and guarantee OBS WebSocket server is enabled
WS_CONFIG_DIR="${OBS_DIR}/plugin_config/obs-websocket"
WS_CONFIG="${WS_CONFIG_DIR}/config.json"
mkdir -p "${WS_CONFIG_DIR}"

if [ ! -f "${WS_CONFIG}" ]; then
    cat << 'WS_EOF' > "${WS_CONFIG}"
{
  "alerts_enabled": false,
  "auth_required": false,
  "first_load": false,
  "server_enabled": true,
  "server_password": "",
  "server_port": 4455
}
WS_EOF
    chown -R "${CONSOLE_USER}" "${WS_CONFIG_DIR}"
else
    python3 -c "
import json
p = '${WS_CONFIG}'
try:
    with open(p, 'r') as f: data = json.load(f)
    if not data.get('server_enabled', False):
        data['server_enabled'] = True
        with open(p, 'w') as f: json.dump(data, f, indent=2)
except Exception: pass
" 2>/dev/null || true
fi

cp -f "$SCRIPT_DIR/simple-streamer-bridge" "${BIN_DIR}/simple-streamer-bridge"
chmod +x "${BIN_DIR}/simple-streamer-bridge"
chown -R "${CONSOLE_USER}" "${USER_HOME}/.simple-streamer"

cat << PLIST_EOF > "${PLIST_PATH}"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bdjlmn.simple-streamer</string>
    <key>ProgramArguments</key>
    <array>
        <string>${BIN_DIR}/simple-streamer-bridge</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
PLIST_EOF
chown "${CONSOLE_USER}" "${PLIST_PATH}"

launchctl bootout gui/${CONSOLE_UID} "${PLIST_PATH}" 2>/dev/null || true
launchctl bootstrap gui/${CONSOLE_UID} "${PLIST_PATH}" 2>/dev/null || true

if [ -f "${USER_INI}" ]; then
    python3 -c "
import json, re
ini_path = '${USER_INI}'
try:
    with open(ini_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    pattern = r'ExtraBrowserDocks=(.*)'
    match = re.search(pattern, content)
    docks = []
    if match:
        try: docks = json.loads(match.group(1).strip())
        except: docks = []
    
    updated = False
    for d in docks:
        if d.get('title') == 'Simple Streamer':
            if d.get('url') != '${DOCK_URL}':
                d['url'] = '${DOCK_URL}'
                updated = True
    if not any(d.get('title') == 'Simple Streamer' for d in docks):
        docks.append({'title': 'Simple Streamer', 'url': '${DOCK_URL}'})
        updated = True

    if updated:
        new_line = 'ExtraBrowserDocks=' + json.dumps(docks)
        if match: content = re.sub(pattern, new_line, content)
        else: content += '\n[BasicWindow]\n' + new_line + '\n'
        with open(ini_path, 'w', encoding='utf-8') as f:
            f.write(content)
except Exception:
    pass
"
fi
exit 0
EOF
chmod +x "$BUILD_DIR/scripts/postinstall"

# 3. Build .pkg
pkgbuild --identifier com.bdjlmn.simple-streamer \
         --version 1.0.0 \
         --scripts "$BUILD_DIR/scripts" \
         --nopayload \
         "$BUILD_DIR/SimpleStreamer-Installer.pkg"

# 4. Package into .dmg
mkdir -p "$BUILD_DIR/dmg"
cp "$BUILD_DIR/SimpleStreamer-Installer.pkg" "$BUILD_DIR/dmg/Install Simple Streamer.pkg"

DMG_OUTPUT="$DIST_DIR/SimpleStreamer-Setup.dmg"
rm -f "$DMG_OUTPUT"

hdiutil create -volname "Simple Streamer" \
               -srcfolder "$BUILD_DIR/dmg" \
               -ov -format UDZO \
               "$DMG_OUTPUT"

cp -f "$DMG_OUTPUT" "$HOME/Downloads/SimpleStreamer-Setup.dmg"
echo "  ✓ Copied installer to $HOME/Downloads/SimpleStreamer-Setup.dmg"

rm -rf "$BUILD_DIR"
echo ""
echo "=========================================================="
echo "  ✓ DMG Successfully Built:"
echo "    $DMG_OUTPUT"
echo "=========================================================="
