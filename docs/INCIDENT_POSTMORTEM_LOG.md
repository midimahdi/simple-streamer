# Simple Streamer — Incident & Post-Mortem Master Log

**Session Date:** 2026-11-10  
**Target Environments:** macOS (Apple Silicon arm64) & Windows 10 (OBS Studio 29.1.3 x64)

This document tracks every single bug, crash, deadlock, permission block, and silent failure encountered across this session, its root cause, and the permanent architectural patch required for zero-friction future installations.

---

## 1. Native OBS UI Freeze & Output Deadlock (Critical Broadcast Failure)

### What Happened
During an active live broadcast, the OBS Studio interface completely froze on macOS, while existing RTMP streams on primary targets continued running in the background.

### Root Cause
- A secondary target (Kick) received a malformed RTMP URL lacking `/app`.
- Kick's ingestion rejected the socket handshake, triggering an immediate `obs_output_signal_stop` inside `libobs`.
- Concurrently, `rtmp_stream_destroy` invoked `pthread_join(stream->connect_thread)` on Thread 1 (the main UI Qt thread) while `connect_thread` was awaiting lock release in `__ulock_wait`.
- **Result:** Permanent deadlock on the main UI thread. OBS remained broadcasting on already-connected sockets, but the user interface completely froze.

### Permanent Patch Implemented
- In `plugin/src/simple-streamer.c`:
  - Hooked into `obs_output_signal_handler` cleanly without calling blocking forced teardowns.
  - Replaced blocking stops with non-blocking graceful teardown flags.
  - Added target destination collision checks comparing secondary server URLs against the primary stream output before spawning instances.

---

## 2. Accidental Plugin Firing & Dual-Start Collision

### What Happened
Starting a stream via the native OBS "Start Streaming" button or an external multistream plugin (e.g., Aitum) inadvertently triggered Simple Streamer's secondary RTMP outputs.

### Root Cause
- The native plugin listened to `OBS_FRONTEND_EVENT_STREAMING_STARTED`.
- Whenever *any* stream was started in OBS (even outside Simple Streamer's dock), the plugin assumed it was supposed to start all configured secondary outputs.

### Permanent Patch Implemented
- **Armed Protocol:** Added an `armed` boolean in `config.json`.
- The dock sets `"armed": true` only when the user explicitly clicks **"GO LIVE"** in the Simple Streamer dock.
- When OBS streaming begins, the native C plugin inspects `armed`:
  - If `armed == true`: proceeds and immediately clears `armed` back to `false`.
  - If `armed == false`: ignores the event completely, preventing dual-start collisions.

---

## 3. Google OAuth Verification Rejection ("Home Page Behind Login")

### What Happened
Google Trust & Safety rejected OAuth branding verification with:
> *"Your home page is behind a login page. We were unable to confirm your app's compliance."*

### Root Cause
- The root URL `https://simple-streamer.bdjlmn.com/` redirected directly into the OBS dock UI, which presented operational controls rather than a public, unauthenticated compliance landing page explaining scopes.

### Permanent Patch Implemented
- Rewrote `cloudflare-site/src/index.ts`:
  - Standard web browsers and crawlers hitting `/` receive an unauthenticated public home page containing full app disclosures, YouTube scope justifications, privacy policy, and terms of service.
  - Only requests containing `/dock`, `/app`, `?dock=1`, or an `OBS/` User-Agent proxy through to the OBS dock interface.
  - Deployed live to Cloudflare Worker.

---

## 4. Dock Action Button UX & Ambiguous Green Indicators

### What Happened
The "GO LIVE" button was clickable even when OBS WebSocket was disconnected or credentials had errors, leading to unexpected error popups right before broadcasting.

### Root Cause
- UI lacked a strict "fail-fast" state machine; the button defaulted to active while background reconnection was still pending.

### Permanent Patch Implemented
- Removed all ambiguous green status badges.
- Implemented `updateActionBtnState()` in `dock/app.js`:
  - When WebSocket is connecting: `disabled = true`, label `CONNECTING TO OBS...`
  - When no targets are enabled: `disabled = true`, label `SELECT DESTINATION FIRST`
  - When credentials fail validation: `disabled = true`, label `DESTINATION ERROR - CHECK SETTINGS`
  - Only when all systems are green: `disabled = false`, label `▶ GO LIVE`.

---

## 5. Windows Shell String Parsing & Command Line Length Limit

### What Happened
Running `SimpleStreamer-Setup.bat` on Windows produced:
- `Accolade fermante « } » manquante` (Missing end curly brace)
- `'$ErrorActionPreference' n’est pas reconnu...`
- `La ligne entrée est trop longue` (Input line too long)

### Root Cause
- `cmd.exe` has an 8,191-character maximum command buffer.
- Multi-line PowerShell blocks wrapped inside `powershell -Command "& { ... }"` get corrupted by DOS character parsing (e.g. `&`, `<`, `>`, parentheses).
- Attempting to base64-encode the script directly into the `.bat` file exceeded `cmd.exe` line length limits.

### Permanent Patch Implemented
- Replaced monolithic batch commands with a clean 30-line launcher.
- The `.bat` downloads or streams `install.ps1` into a temporary file and runs it strictly via `-File "%PS1%"`, completely bypassing `cmd.exe` length limits and escaping bugs.

---

## 6. Windows Script Host VBScript Charset Failures (`800A0408` & `800A0409`)

### What Happened
Running the background bridge installer triggered two successive modal error dialogs from Windows Script Host (`wscript.exe`):
1. **Code `800A0408`** (`Invalid Character / حرف غير صالح`) at Line 1, Char 1.
2. **Code `800A0409`** (`Unterminated String Constant / ثابت سلسلة غير منتهي`) at Line 2, Char 157.

### Root Cause
1. PowerShell wrote `bridge.vbs` using default `[System.Text.Encoding]::UTF8`, which writes a 3-byte Byte Order Mark (BOM: `0xEF, 0xBB, 0xBF`). Classic Windows Script Host does not support UTF-8 BOM.
2. Escaping nested double-quotes inside VBScript string literals to pass file paths with spaces into `WScript.Shell.Run` caused VBScript's string tokenizer to fail.

### Permanent Patch Implemented
- **Eliminated VBScript and `wscript.exe` entirely.**
- Background process execution and startup persistence now use native PowerShell features:
  - Startup shortcut points directly to `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File bridge.ps1`.
  - Process launch uses native `Start-Process` or `schtasks` with `-WindowStyle Hidden`.

---

## 7. OBS 28 vs 29 Config Architecture Divergence (`global.ini` vs `config.json`)

### What Happened
Even after `config.json` was set to zero-auth, OBS Studio 29 continuously rejected WebSocket connections with error code `1000`/`4009`, leaving the dock stuck on *"Ensure OBS is running"*.

### Root Cause
- In OBS 28 and 29.x, WebSocket server settings (password and port) are stored and managed in **`%APPDATA%\obs-studio\global.ini`** under the section `[OBSWebSocket]`:
  ```ini
  [OBSWebSocket]
  AuthRequired=true
  ServerPassword=CgMcmebVWN3D7pco
  ServerPort=4455
  ```
- The bridge script was only reading `%APPDATA%\obs-studio\plugin_config\obs-websocket\config.json` (introduced in OBS 30+), which had an empty password.
- Because the dock received `password: ""`, it attempted unauthenticated authentication against an OBS server that required `CgMcmebVWN3D7pco`, causing silent rejection on every connection attempt.

### Permanent Patch Implemented
- Updated `installer/windows/bridge.ps1`:
  - Dynamically checks `global.ini` first for `[OBSWebSocket]` credentials (`ServerPassword` and `ServerPort`).
  - Falls back to `plugin_config\obs-websocket\config.json`.
  - Seamlessly supplies the active password to the browser dock via `http://127.0.0.1:45455/obs-config`.
  - Verified live: WebSocket handshake instantly completed with `op: 2 (Identified)`.

---

## 8. Truncated Script File in Downloads Directory (`Writ` Error)

### What Happened
Running the installer gave:
`Writ : Le terme «Writ» n'est pas reconnu... au caractère install.ps1:216`

### Root Cause
- The user had a stale or incomplete copy of `install.ps1` previously downloaded into `Downloads\windows\`, which cut off mid-word on the last line (`Writ` instead of `Write-Host`).

### Permanent Patch Implemented
- `SimpleStreamer-Setup.bat` always fetches the latest, complete script from GitHub directly into `%TEMP%` before execution, ensuring stale local files never run.

---

## 9. Missing `/open` Endpoint in Windows Bridge (OAuth Browser Failure)

### What Happened
In OBS Studio on Windows, clicking "+ Add Platform" (YouTube, Facebook, Twitch, Kick) failed silently. No browser tab opened, leaving the user unable to authenticate.

### Root Cause
- OBS Browser Docks run in a sandboxed Chromium (CEF) environment where `window.open()` is blocked by OBS security policy.
- The dock delegates external URL launching to the local bridge via `GET http://127.0.0.1:45455/open?url=...`.
- The macOS bridge had this endpoint (`/usr/bin/open`), but the Windows PowerShell bridge (`bridge.ps1`) did not implement the `/open` route, causing the request to 404 and fail silently.

### Permanent Patch Implemented
- In `installer/windows/install.ps1`:
  - Implemented `/open` using native Windows `Start-Process $targetUrl` with fallback to `[System.Diagnostics.Process]::Start`.
  - Ensures the user's default Windows browser (Chrome, Edge, Firefox) immediately pops open with the OAuth authentication window.
  - Committed and pushed in `51c48c5`.

---

## 10. Secondary Destinations (YouTube) Failed Live Stream Due to Missing Native Plugin Binary (`simple-streamer.dll`)

### What Happened
During a live broadcast test with both Facebook and YouTube selected, Facebook started streaming successfully, but YouTube failed. Clicking retry also failed.

### Root Cause
- Simple Streamer uses a dual-engine architecture:
  1. The **Primary Destination** (in this test, Facebook) is injected directly into OBS core as the main streaming service (`obs_frontend_streaming_start`).
  2. Any **Secondary Destinations** (in this test, YouTube) are managed in real time by the native OBS C plugin (`simple-streamer.dll`), which hooks `OBS_FRONTEND_EVENT_STREAMING_STARTED` and spawns independent RTMP outputs from OBS encoders.
- `simple-streamer.dll` had never been compiled for Windows in CI or bundled in `installer/windows/install.ps1`. When OBS started streaming, the plugin was missing, so no secondary output was ever created for YouTube.

### Permanent Patch Implemented
1. **Automated CI Build**: Updated `.github/workflows/build-plugin.yml` to extract symbol tables via `dumpbin` and generate MSVC import libraries (`obs.lib`, `obs-frontend-api.lib`), compiling a production `simple-streamer.dll` on Windows runners.
2. **Installer Automation**: Updated `installer/windows/install.ps1` to deploy `simple-streamer.dll` into `%APPDATA%\obs-studio\plugins\simple-streamer\bin\64bit\` and `C:\Program Files\obs-studio\obs-plugins\64bit\`.
3. **Live Machine Deployed**: Transferred and installed `simple-streamer.dll` into OBS on the remote Windows machine.

---

## 11. `LoadLibrary` Error (Missing Dependency) for `simple-streamer.dll` on Windows

### What Happened
When OBS Studio restarted with `simple-streamer.dll`, the OBS log showed:
`LoadLibrary failed for '../../obs-plugins/64bit/simple-streamer.dll': The specified module could not be found.`

### Root Cause
- The initial CI build compiled with `/MD` (Dynamic Multithreaded CRT), binding the binary to the Visual Studio 2022 C++ runtime (`vcruntime140.dll` / `msvcp140.dll`).
- On end-user Windows machines lacking that specific MSVC 2022 redistributable version, Windows refused to load the DLL.

### Permanent Patch Implemented
- Updated `.github/workflows/build-plugin.yml` compiler flag from `/MD` to `/MT` (Static Multithreaded CRT).
- Verified with `dumpbin /DEPENDENTS` that `simple-streamer.dll` now imports ONLY `obs.dll` and `KERNEL32.dll` — zero external runtime requirements.
- Configured automated continuous GitHub Releases publishing the standalone `SimpleStreamer-Windows-x64.zip` package to `https://github.com/midimahdi/simple-streamer/releases/tag/latest`.

---

## 12. Secondary Stream Skipped in Multi-Destination Due to Un-armed Payload

### What Happened
Single destination to YouTube succeeded. When both Facebook and YouTube were selected, Facebook went live (primary output), but YouTube (secondary output via native plugin) did not start. OBS log recorded:
`[SimpleStreamer] Stream started independently (OBS button/other). Secondary outputs not armed (skipping).`

### Root Cause
- The production dock frontend currently hosted on Cloud Run had not yet been redeployed with the `"armed": true` protocol introduced in commit `6b10543`.
- When the dock called POST `/save-destinations`, the JSON payload contained `outputs` but lacked `"armed": true`.
- The native plugin's guard check (`bool armed = obs_data_get_bool(cfg, "armed");`) evaluated to `false`, treating the stream start as an external/unarmed trigger and aborting secondary outputs.

### Permanent Patch Implemented
- Updated `bridge.ps1` (and `installer/windows/install.ps1`) to automatically inspect incoming POST `/save-destinations` payloads: if `outputs` is present and non-empty and `armed` was not explicitly provided, the bridge automatically sets `"armed": true`.
- Hot-reloaded `SimpleStreamerBridge` on the production Windows streaming PC.

