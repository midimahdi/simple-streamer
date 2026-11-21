#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "  Simple Streamer — macOS Clean Uninstaller"
echo "=========================================================="
echo ""
read -r -p "Remove Simple Streamer plugin, background bridge, and OBS dock? [y/N] " REPLY
if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

CONSOLE_UID=$(id -u)
PLIST_PATH="$HOME/Library/LaunchAgents/com.bdjlmn.simple-streamer.plist"
OBS_DIR="$HOME/Library/Application Support/obs-studio"

# 1. Close OBS cleanly if running so plugin & ini files aren't overwritten on exit
if pgrep -x "OBS" >/dev/null 2>&1; then
  echo "Closing OBS Studio..."
  osascript -e 'tell application "OBS" to quit' 2>/dev/null || true
  sleep 2
  pkill -x "OBS" 2>/dev/null || true
fi

# 2. Unload LaunchAgent & stop background bridge
if [ -f "$PLIST_PATH" ]; then
  echo "Unloading LaunchAgent..."
  launchctl bootout "gui/${CONSOLE_UID}" "$PLIST_PATH" 2>/dev/null || launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
fi
pkill -f "simple-streamer-bridge" 2>/dev/null || true

# 3. Remove plugin, config, and bridge directories
echo "Removing plugin and bridge files..."
rm -rf "$OBS_DIR/plugins/simple-streamer.plugin"
rm -rf "$OBS_DIR/plugin_config/simple-streamer"
rm -rf "$HOME/.simple-streamer"

# 4. Remove Simple Streamer entry from OBS ExtraBrowserDocks (preserving all other docks)
for INI_FILE in "$OBS_DIR/user.ini" "$OBS_DIR/global.ini"; do
  if [ -f "$INI_FILE" ]; then
    python3 - "$INI_FILE" << 'PYEOF'
import json, re, sys

ini_path = sys.argv[1]
try:
    with open(ini_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    m = re.search(r'^ExtraBrowserDocks=(.*)$', content, re.MULTILINE)
    if m:
        docks = json.loads(m.group(1).strip())
        filtered = [d for d in docks if d.get('title') != 'Simple Streamer']
        if len(filtered) != len(docks):
            new_line = 'ExtraBrowserDocks=' + json.dumps(filtered)
            content = re.sub(r'^ExtraBrowserDocks=.*$', new_line, content, count=1, flags=re.MULTILINE)
            with open(ini_path, 'w', encoding='utf-8') as f:
                f.write(content)
except Exception:
    pass
PYEOF
  fi
done

echo ""
echo "✓ Simple Streamer completely removed."
echo "You can now close this window."
