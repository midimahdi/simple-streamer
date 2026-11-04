#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$SCRIPT_DIR/build"
BUNDLE_DIR="$BUILD_DIR/simple-streamer.plugin"

echo "==> Building Simple Streamer OBS Plugin..."

rm -rf "$BUILD_DIR"
mkdir -p "$BUNDLE_DIR/Contents/MacOS"

# 1. Compile native bundle
clang -bundle -fPIC -O3 \
  -arch arm64 \
  -I"$SCRIPT_DIR/include" \
  -I"$SCRIPT_DIR/include/libobs" \
  -I"$SCRIPT_DIR/include/frontend-api" \
  -F"/Applications/OBS.app/Contents/Frameworks" \
  -framework libobs \
  "/Applications/OBS.app/Contents/Frameworks/obs-frontend-api.dylib" \
  -rpath @loader_path/../../.. \
  -rpath /Applications/OBS.app/Contents/Frameworks \
  "$SCRIPT_DIR/src/simple-streamer.c" \
  -o "$BUNDLE_DIR/Contents/MacOS/simple-streamer"

# 2. Write Info.plist
cat << 'EOF' > "$BUNDLE_DIR/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleDisplayName</key>
	<string>Simple Streamer</string>
	<key>CFBundleExecutable</key>
	<string>simple-streamer</string>
	<key>CFBundleIdentifier</key>
	<string>com.bdjlmn.simple-streamer.plugin</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>simple-streamer</string>
	<key>CFBundlePackageType</key>
	<string>BNDL</string>
	<key>CFBundleShortVersionString</key>
	<string>1.0.0</string>
	<key>CFBundleSupportedPlatforms</key>
	<array>
		<string>MacOSX</string>
	</array>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>LSMinimumSystemVersion</key>
	<string>11.0</string>
</dict>
</plist>
EOF

echo "✓ Compiled simple-streamer.plugin successfully!"

# 3. Install to current user's OBS plugins directory
USER_PLUGINS="$HOME/Library/Application Support/obs-studio/plugins"
mkdir -p "$USER_PLUGINS"
rm -rf "$USER_PLUGINS/simple-streamer.plugin"
cp -R "$BUNDLE_DIR" "$USER_PLUGINS/"
echo "✓ Installed simple-streamer.plugin to $USER_PLUGINS"
