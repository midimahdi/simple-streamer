#!/usr/bin/env bash
# ==============================================================================
# Simple Streamer — 1-Click Installer for OBS Studio (macOS)
# ==============================================================================
# 1. Configures OBS Custom Browser Dock automatically.
# 2. Installs a native zero-dependency background bridge to open Safari/Chrome for OAuth.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.simple-streamer"
BIN_DIR="$INSTALL_DIR/bin"
PLIST_PATH="$HOME/Library/LaunchAgents/com.bdjlmn.simple-streamer.plist"
OBS_DIR="$HOME/Library/Application Support/obs-studio"
USER_INI="$OBS_DIR/user.ini"
DOCK_TITLE="Simple Streamer"
DOCK_URL="https://simple-streamer.bdjlmn.com"

echo ""
echo "=========================================================="
echo "    Simple Streamer — Automatic 1-Click Installer"
echo "=========================================================="
echo ""

# 1. Check if OBS is currently running
if pgrep -x "OBS" > /dev/null || pgrep -x "obs" > /dev/null; then
    echo "⚠️  OBS Studio is currently running."
    echo "   OBS must be closed so settings can be written safely."
    read -p "   Close OBS Studio now? [y/N]: " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        killall OBS 2>/dev/null || true
        sleep 2
        echo "   ✓ OBS Studio closed."
    else
        echo "❌ Please quit OBS Studio manually and re-run this installer."
        exit 1
    fi
fi

# 2. Install Universal native bridge binary (Apple Silicon + Intel)
echo "🔧 Setting up native browser bridge (Universal: M-Series & Intel)..."
mkdir -p "$BIN_DIR"

if [ -f "$SCRIPT_DIR/bin/simple-streamer-bridge" ]; then
    cp "$SCRIPT_DIR/bin/simple-streamer-bridge" "$BIN_DIR/simple-streamer-bridge"
else
    /usr/bin/clang -O2 -arch arm64 -arch x86_64 -framework Foundation "$SCRIPT_DIR/simple-streamer-bridge.m" -o "$BIN_DIR/simple-streamer-bridge"
fi

chmod +x "$BIN_DIR/simple-streamer-bridge"
echo "   ✓ Bridge installed at $BIN_DIR/simple-streamer-bridge"

# 3. Register LaunchAgent for background operation
echo "🚀 Setting up automatic background bridge..."
mkdir -p "$HOME/Library/LaunchAgents"

cat << EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bdjlmn.simple-streamer</string>
    <key>ProgramArguments</key>
    <array>
        <string>$BIN_DIR/simple-streamer-bridge</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>/tmp/simple-streamer.err</string>
    <key>StandardOutPath</key>
    <string>/tmp/simple-streamer.out</string>
</dict>
</plist>
EOF

# Restart service cleanly
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"
echo "   ✓ Background LaunchAgent active."

# 4. Inject Custom Browser Dock into OBS user.ini
if [ -f "$USER_INI" ]; then
    echo "🔌 Injecting '$DOCK_TITLE' Custom Dock into OBS Studio..."
    python3 -c "
import json
import re

ini_path = '$USER_INI'
with open(ini_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Look for ExtraBrowserDocks line
pattern = r'ExtraBrowserDocks=(.*)'
match = re.search(pattern, content)

docks = []
if match:
    raw = match.group(1).strip()
    try:
        docks = json.loads(raw) if raw else []
    except Exception:
        docks = []

# Check if Simple Streamer already present
existing = [d for d in docks if d.get('title') == '$DOCK_TITLE']
if not existing:
    docks.append({'title': '$DOCK_TITLE', 'url': '$DOCK_URL'})
    new_line = 'ExtraBrowserDocks=' + json.dumps(docks)
    if match:
        content = re.sub(pattern, new_line, content)
    else:
        # Append under [BasicWindow] or at end
        if '[BasicWindow]' in content:
            content = content.replace('[BasicWindow]', '[BasicWindow]\n' + new_line)
        else:
            content += '\n[BasicWindow]\n' + new_line + '\n'
    with open(ini_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('   ✓ Added Simple Streamer dock to OBS configuration.')
else:
    print('   ✓ Simple Streamer dock already registered in OBS.')
"
else
    echo "⚠️  OBS configuration ($USER_INI) not found yet."
    echo "   Launch OBS once, close it, and run this installer again."
fi

echo ""
echo "=========================================================="
echo "    🎉 Installation Complete!"
echo "    1. Open OBS Studio."
echo "    2. Find 'Simple Streamer' in your Docks menu."
echo "    3. Click 'Sign In' to authenticate in Safari/Chrome!"
echo "=========================================================="
echo ""
