# OBS Studio & Dual-Stream Setup Guide

This guide details the exact OBS Studio configuration required for the Mosque Dual-Stream Orchestrator. Follow these steps once during initial setup.

---

## 1. Prerequisites

1. **OBS Studio 28.0+** (includes native WebSocket v5 support).
2. **`obs-multi-rtmp` Plugin** installed:
   - Windows: Run the installer from GitHub (`obs-multi-rtmp`).
   - macOS: Install via `.pkg` or copy to `~/Library/Application Support/obs-studio/plugins/`.

---

## 2. OBS Video & Encoder Settings

Facebook Live and YouTube have strict keyframe requirements. Mismatched keyframes cause buffering, audio desync, or delayed stream starts.

1. In OBS, go to **Settings → Output → Output Mode: Advanced → Streaming**:
   - **Encoder:** Hardware encoder preferred (`NVIDIA NVENC H.264`, `Apple VT H264 Hardware`, or `Intel QuickSync`). Fallback: `x264`.
   - **Rate Control:** `CBR` (Constant Bitrate).
   - **Bitrate:** `2500 kbps` (for 720p 30fps) or `3500 kbps` (for 1080p 30fps).
     *Ensure total upstream bandwidth (2x stream bitrate = ~5 to 7 Mbps) is below 70% of mosque upload speed.*
   - **Keyframe Interval:** **`2 s`** *(CRITICAL: Facebook rejects streams or stalls if keyframe interval is > 4 seconds or set to 0/Auto).*
   - **CPU Usage Preset:** `p4: Medium` (NVENC) or `veryfast` (x264).
   - **Profile:** `high`
   - **B-frames:** `2`

2. In OBS, go to **Settings → Video**:
   - **Base (Canvas) Resolution:** `1920x1080` (or your camera feed resolution).
   - **Output (Scaled) Resolution:** `1280x720` or `1920x1080`.
   - **Downscale Filter:** `Bicubic (Sharpened scaling, 16 samples)`.
   - **Common FPS Values:** `30` (30 fps is optimal for lectures/sermons and saves 40% upload bandwidth compared to 60 fps).

3. In OBS, go to **Settings → Output → Recording**:
   - **Recording Format:** `mkv` (fail-safe if power cuts out; convert via OBS Remux afterwards).
   - **Video Encoder:** Use Stream Encoder (zero overhead).

---

## 3. Configuring `obs-multi-rtmp` for Secondary Output (YouTube)

Because YouTube uses a permanent static stream key that never changes, YouTube is assigned to `obs-multi-rtmp` with synchronized start enabled.

1. Open OBS. From the menu bar, open **Docks → Multiple Output** to display the `obs-multi-rtmp` panel.
2. Click **Add new target**:
   - **Name:** `YouTube (Mosque Permanent)`
   - **RTMP Server:** `rtmp://a.rtmp.youtube.com/live2`
   - **RTMP Key:** `<Paste your permanent YouTube stream key>` *(Obtained via YouTube Studio or `bootstrap-auth.mjs`)*
   - **Video Encoder:** **`Get from OBS`** *(Consumes 0% additional CPU/GPU)*
   - **Audio Encoder:** **`Get from OBS`**
   - **Sync start with OBS:** **`[x] CHECKED`** *(Crucial: triggers automatically when OBS starts streaming)*
3. Click **OK**.

---

## 4. Enabling OBS WebSocket v5

1. In OBS, go to **Tools → WebSocket Server Settings**.
2. Check **Enable WebSocket server**.
3. **Server Port:** `4455` (default).
4. If **Enable Authentication** is checked:
   - Note the password (or leave authentication unchecked if on a secure local mosque computer).
   - If using a password, input it into the Dock's **Diagnostics panel (⚙)**.
5. Click **Apply** and **OK**.

---

## 5. Automated 1-Click Installer (DMG for Mac / Setup for Windows)

Instead of manually creating custom browser docks and setting up launch configurations:

### macOS Installation
1. Open [`SimpleStreamer-Setup.dmg`](file:///Users/mahdi/Business/brain/01-projects/mosque-stream-orchestrator/installer/macos/dist/SimpleStreamer-Setup.dmg) (also copied to `~/Downloads/`).
2. Double-click **Install Simple Streamer.pkg**.
3. It automatically:
   - Injects the `Simple Streamer` dock into OBS `user.ini`.
   - Installs the Universal (Apple Silicon & Intel) background LaunchAgent to spawn Safari/Chrome on OAuth clicks.
4. Launch OBS Studio — the dock is already in your Docks menu.

### Windows Installation
1. Double-click [`SimpleStreamer-Setup.bat`](file:///Users/mahdi/Business/brain/01-projects/mosque-stream-orchestrator/installer/windows/SimpleStreamer-Setup.bat) (or compile `SimpleStreamer-Setup.iss` with Inno Setup).
2. It automatically adds the dock to OBS `%APPDATA%\obs-studio\user.ini` and registers the background launcher.

---

## 6. Adding the Custom Browser Dock Manually (Fallback)

1. In OBS, go to **Docks → Custom Browser Docks...**
2. In the list, enter:
   - **Dock Name:** `Simple Streamer`
   - **URL:** `https://simple-streamer.bdjlmn.com`
3. Click **Apply**.
4. The panel will appear. Drag and dock it into your OBS interface.

---

## 7. Daily Volunteer Checklist

1. Turn on camera, microphone, and open OBS.
2. Verify dock badge displays **STANDBY**.
3. Select series (e.g., *Jumu'ah Khutbah* or *Custom Title*).
4. Type title of lesson (e.g., *Tafsir Surat Al-Kahf - Lesson 4*).
5. Click **GO LIVE**.
   - Dock transitions to **PREPARING...** for 3–5 seconds.
   - Primary output starts pushing to Facebook.
   - Secondary output (`obs-multi-rtmp`) simultaneously pushes to YouTube.
   - Local recording starts automatically in the background.
   - Dock turns high-contrast inverted with live elapsed timer.
6. When finished, click **END STREAM**. All streams close cleanly.
