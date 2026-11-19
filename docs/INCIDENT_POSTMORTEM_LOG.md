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

---

## 13. Missing Live Platform Cards, Mobile Remote LAN Block, and Orphaned YouTube Broadcasts

### What Happened
1. **Missing Platform Cards**: During live streaming, the dock displayed the live timer and bitrate metrics, but the platform status cards were completely absent from the UI.
2. **Mobile Remote "Page Unavailable"**: Scanning the QR code failed to open the mobile remote control app on phones connected to the same Wi-Fi.
3. **Orphaned Scheduled Broadcast in YouTube Studio**: After stopping a short test stream, the YouTube livestream remained in YouTube Studio in "Scheduled" status rather than "Ended / Complete".

### Root Causes
1. **Race Condition in Start Sequence**: In `dock/app.js`, `await state.obs.call('StartStream')` was invoked before `state.activeBroadcast` was assigned. As soon as OBS started streaming, the WebSocket event `StreamStateChanged` immediately triggered `setLiveUI(true)`. At that millisecond, `activeBroadcast.destinations` was empty, clearing the live container and rendering 0 cards.
2. **Missing Inbound Firewall Rule & Unresolvable mDNS**:
   - The QR code encoded an mDNS URL (`http://simple-streamer.local:45455/remote`), which mobile browsers cannot resolve without local Bonjour/Avahi services.
   - The local bridge on Windows was listening only on `127.0.0.1` and Windows Firewall dropped incoming connections on ports 4455 and 45455.
3. **Teardown Skipped + YouTube Auto-Start Threshold**:
   - Because `state.activeBroadcast.destinations` was empty due to the race condition, `handleStopLive()` skipped sending the `/end-live` API call.
   - The test stream only ran for ~13 seconds, below YouTube's ~20-second ingest threshold to auto-switch from `ready` to `live`.

### Permanent Patches Implemented
1. **Pre-populate `state.activeBroadcast`**: Assigned before `StartStream` is called, and added a defensive fallback in `setLiveUI(true)` that auto-populates from `state.destinations.filter(d => d.enabled)` if ever empty.
2. **Dynamic LAN IP Listener & Firewall Rule**:
   - Added inbound Windows Firewall rule for TCP 4455 and 45455.
   - Updated `bridge.ps1` to bind dynamically to the machine's actual LAN IPv4 address (`http://192.168.8.100:45455/`) and serve `remote.html` directly from disk.
   - Changed QR code generation to use the actual LAN IP URL.
3. **Automatic Orphan Deletion & Universal Teardown**:
   - Updated `StreamStateChanged` to invoke `/end-live` even when the stream is stopped via OBS native controls.
   - Updated `backend/src/youtube.mjs` to auto-delete orphaned scheduled broadcasts via the YouTube Data API if `transition?broadcastStatus=complete` is rejected because the stream never transitioned to live.
4. **Cloud Run Redeployed**: Shipped revision `00011-f4c` to production serving 100% of traffic.

---

## 14. Mobile Remote Multi-Rig Collision, Idle Bridge Hijacking, and OBS Liveness Gating

### What Happened
- During multi-rig testing on the same Wi-Fi subnet (`192.168.8.x`), opening the mobile remote on a smartphone caused it to display platform targets from the developer's MacBook Air (e.g. YouTube, Twitch, Kick) instead of the Mosque PC (Facebook + YouTube), even though OBS was open only on the Mosque PC and closed on the Mac.
- Furthermore, attempting to use a cloud-assisted router (`https://.../remote` redirecting to the active rig) failed when internet or mixed-content policies intervened.

### Root Causes
1. **Background Bridge Daemons Without OBS Liveness Verification**:
   - The macOS bridge (`simple-streamer-bridge`) runs as a persistent background daemon on port 45455 via `launchd`.
   - When the phone opened the remote app, it fell back to or probed `192.168.8.101` (Mac).
   - Because the bridge served `/remote-config` directly from cached disk files (`config.json`) without verifying if OBS Studio was actually running, it responded with `ok: true` and the Mac's credentials, hijacking the phone's auto-discovery before the Mosque PC could be probed.
2. **Cloud vs. Local Architecture Pitfalls**:
   - Public HTTPS domains cannot reliably query local private IP subnets (`192.168.x.x`) due to Private Network Access (PNA) and Mixed Content restrictions enforced by iOS Safari and Android Chrome.
   - Stateless Cloud Run containers experience memory drift across instances, making centralized single-variable presence unreliable without external database/Redis storage.
3. **Aggressive Mobile Caching**:
   - Mobile browsers cache `remote.html` and Service Workers, causing the phone to run older client scripts locked to previously cached IP addresses.

### Permanent Patches Implemented
1. **OBS Liveness Gating in Bridge Daemons**:
   - Updated macOS bridge (`simple-streamer-bridge.m`) and Windows bridge (`bridge.ps1` and `install.ps1`) to perform a 150ms TCP loopback probe to OBS WebSocket port `4455`.
   - `/remote-config` now explicitly returns `obsOnline: true/false` and `machineName` (e.g. `"Mosque PC"` vs `"Mahdi’s MacBook Air"`).
2. **Multi-Broadcaster LAN Rig Switcher**:
   - Updated `dock/remote.html` to maintain an active registry of discovered rigs on the subnet (`discoveredRigs`).
   - If the current machine has OBS closed, the app surfaces an `OBS Closed` notice and automatically switches to any machine where OBS is running.
   - If multiple machines have OBS running simultaneously, a persistent top switcher bar allows 1-tap switching between broadcasting rigs without page reloads.
3. **Local-First PWA Topology**:
   - Disabled the cloud presence redirect, ensuring the system remains 100% offline-capable and immune to WAN outages.




## 15. OBS 29 Native Module Compatibility & Windows Bridge Boot Failure

### What Happened
- During live test broadcasting on the Mosque PC (Windows 10, running OBS Studio 29.1.3), YouTube streamed successfully (as Primary Destination 0), but Facebook Live (Secondary Destination 1) did not stream.
- In the OBS dock, the Facebook card initially showed "LIVE" (or "STARTING..."), then transitioned to "PLUGIN NOT RUNNING".
- On PC boot, Windows displayed an error popup: `Windows Script Host: Impossible de trouver le fichier script '...\SimpleStreamer\bridge.vbs'`.

### Root Causes
1. **libobs Module API Version Header Incompatibility**:
   - The native C plugin had initially been compiled against OBS 30 headers with `LIBOBS_API_MAJOR_VER 30` (or `33`), causing OBS 29.1.3 to reject `simple-streamer.dll` at module load time (`MODULE_INCOMPATIBLE_VER`).
2. **Broken Bridge Boot Lifecycle Caused Disarmed Secondary Outputs**:
   - An obsolete registry startup entry (`HKCU:\...\Run\SimpleStreamerBridge`) attempted to run `bridge.vbs`, which had been deleted during migration to PowerShell background execution.
   - Because the script failed to launch, `bridge.ps1` was never started on port `45455`.
   - When the operator started the stream from the dock, the call to `http://127.0.0.1:45455/save-destinations` failed to reach the bridge.
   - Consequently, `config.json` was never written with Facebook's dynamic RTMP credentials and remained `armed: false`.
   - When OBS started streaming, `simple-streamer.dll` checked `config.json`, saw `armed == false`, and logged:
     `[SimpleStreamer] Stream started independently (OBS button/other). Secondary outputs not armed (skipping).`
3. **Session Platform Credential Loss in Teardown**:
   - In `dock/app.js`, `activeBroadcast.destinations` was not carrying forward raw `accessToken` and `refreshToken` objects, causing the `/end-live` cloud orchestrator endpoint to fail Facebook live video closure with `"Cannot parse access token"`.

### Permanent Patches Implemented
1. **OBS 29 Native SDK Compilation**:
   - Pinned `LIBOBS_API_MAJOR_VER 29` in `plugin/include/libobs/obs-config.h` and compiled MSVC `/MT` 64-bit binaries against the OBS 29.1.3 SDK. OBS 29 and OBS 30+ load the module seamlessly.
   - Published standalone `simple-streamer.dll` to GitHub Releases (`latest`) with fallback archive extraction in `install.ps1`.
2. **Native Windows Startup Shortcut Migration**:
   - Cleaned up obsolete VBS registry keys from `HKCU:\Software\Microsoft\Windows\CurrentVersion\Run`.
   - Created a native `.lnk` shortcut targeting `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$env:LOCALAPPDATA\SimpleStreamer\bridge.ps1"` in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SimpleStreamerBridge.lnk`.
3. **Credential Preservation for Safe Teardown**:
   - Merged original credential objects into `activeBroadcast.destinations` before OBS stream kickoff in `dock/app.js`, guaranteeing clean multi-platform teardown on broadcast completion.




## 16. Windows Bridge Silent Exit on Non-Admin Startup & Localized URL ACL Failure

### What Happened
- On Nov 19, 2026, after testing worked cleanly two days earlier, Facebook Live failed to stream on the Mosque PC (`masjidbbsd@gmail.com`).
- YouTube streamed successfully as OBS Primary Destination. Facebook showed "PLUGIN NOT RUNNING" in the dock after 15 seconds.
- Cloud Run logs showed `/orchestrate-live` returned `youtube(OK), facebook(OK)` with valid RTMP ingest URLs.
- Inspection of the Mosque PC revealed that `$env:APPDATA\obs-studio\plugin_config\simple-streamer\config.json` was `{"armed":false,"outputs":[]}`, and OBS logs recorded:
  `[SimpleStreamer] Stream started independently (OBS button/other). Secondary outputs not armed (skipping).`
- The background bridge process (`bridge.ps1`) was not running.

### Root Causes
1. **Unconditional Exit on Access Denied During Wildcard Listener Start**:
   - In `bridge.ps1`, the HTTP listener attempted to bind `http://+:45455/` and the machine's LAN IP alongside loopback (`http://127.0.0.1:45455/`).
   - On Windows, binding `http://+:45455/` requires either Administrator privileges or a registered URL ACL in `http.sys`.
   - On system startup, the shortcut `SimpleStreamerBridge.lnk` executed `bridge.ps1` as a standard non-elevated user.
   - When `$listener.Start()` ran, Windows threw `System.Net.HttpListenerException (5): Access is denied`.
   - Because `$listener.Start()` was wrapped in `try { $listener.Start() } catch { exit }`, the bridge process silently killed itself immediately on boot.
   - Two days earlier, the bridge had been started manually inside an elevated Administrator terminal (`PS C:\WINDOWS\system32>`), which masked the non-admin startup failure.
2. **Localized Account Name Incompatibility in URL ACL Registration**:
   - `install.ps1` had executed:
     `netsh http add urlacl url=http://+:45455/ user=Everyone`
   - On non-English Windows installations (such as French Windows 10 on the Mosque PC), the account group `Everyone` does not exist; it is localized as `"Tout le monde"`.
   - `netsh` silently rejected `user=Everyone` (`Le paramètre est incorrect`), leaving no URL ACL registered for non-admin users.

### Permanent Patches Implemented
1. **Resilient Dual-Tier Listener Fallback**:
   - In `bridge.ps1`, `HttpListener` initialization now attempts full LAN/wildcard binding first.
   - If `$listener.Start()` throws Access Denied or fails, it catches the exception, closes the failed listener, and falls back to a clean loopback-only listener (`http://127.0.0.1:45455/` and `http://localhost:45455/`).
   - Loopback binding never requires administrative rights or URL ACLs on any Windows version, guaranteeing that local OBS communication and dock arming succeed 100% of the time on boot.
2. **SID-Based Localized URL ACL Configuration**:
   - In `install.ps1`, `netsh http add urlacl` now dynamically resolves the well-known SID `S-1-1-0` into the OS-localized account name (`(New-Object SecurityIdentifier("S-1-1-0")).Translate([NTAccount]).Value`), ensuring valid URL ACL registration on French, German, Spanish, Arabic, or any Windows locale.




## 17. Facebook Status Badge Flapping Between LIVE and ERROR During Active Ingest

### What Happened
- During live test broadcasting on the Mosque PC, the actual Facebook Live video stream worked cleanly on Facebook.
- However, in the OBS dock card for Facebook, the status badge repeatedly flapped: `LIVE` -> `ERROR` (or `NO VIDEO INGEST`) -> (1.5 seconds later) -> `LIVE`.

### Root Causes
1. **Third-Party Graph API Rate Limits and Transient Check Failures**:
   - The dock's `pollCloudStatus()` queried Meta Graph API via `/broadcast-status` every 9 seconds.
   - If Meta Graph API returned a transient rate-limit warning, momentary network timeout, or non-200 error, `pollCloudStatus()` unilaterally marked the destination as `activeFB.isLive = false`, `cloudStatus = 'error'`, and called `updateCardBadge(..., 'offline', 'ERROR')`.
   - Meanwhile, OBS was actively encoding and pushing healthy RTMP frames (`secStatus.outputActive === true`).
   - The high-frequency local OBS telemetry loop (`metricsInterval`), running every 1.5 seconds, saw that OBS's RTMP output was healthy and immediately flipped the badge back to `LIVE`.
   - This created a continuous 9-second visual flapping cycle between `LIVE` and `ERROR`.
2. **Missing Ingest Stream Health Evaluation**:
   - In `facebook.mjs`, `getFacebookLiveStatus()` only checked `data.status === 'LIVE' || data.status === 'LIVE_NOW'`.
   - During video ingest, Facebook's video object often reports `status: "UNPUBLISHED"` while simultaneously reporting `stream_health: { status: "GOOD" }`. By ignoring `stream_health`, the backend falsely reported `isLive: false` during ingest.

### Permanent Patches Implemented
1. **Primary Source of Truth Arbitration**:
   - In `dock/app.js`, OBS's local RTMP output status is enforced as the authoritative source of truth. If OBS confirms the output is transmitting (`activeFB.isLive === true`), transient cloud polling errors are logged to diagnostics and prevented from overwriting the live badge.
2. **Meta Stream Health Recognition**:
   - In `facebook.mjs`, `isLive` now checks `healthStatus === 'GOOD' || healthStatus === 'OK'` alongside `data.status === 'LIVE'`, correctly recognizing active ingest.
3. **Adaptive Cloud Poll Throttle**:
   - In `dock/app.js`, once all destinations are confirmed live, cloud status polling backs off from 9s to 20s to prevent hitting Meta Graph API rate limits during long broadcasts.




## 18. Multi-Layer Mojibake of Arabic Text in Metadata Fields (Query String ANSI Decoding & Bidirectional Sync Loop)

### What Happened
- When entering Arabic text into the title or description inputs on the OBS dock (e.g., `د. يحي بن صالح طباخ - درس بعنوان...`), the text was consistently replaced by long strings of garbled Latin characters like `ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¯. ÃƒÆ’Ã¢â€žÂ¢Ãƒâ€¦Ã‚Â ...`.

### Root Causes
1. **Query String ANSI Decoding in .NET HttpListener**:
   - `dock/app.js` synchronized title updates using `GET /save-title?title=${encodeURIComponent(title)}...`.
   - In Windows PowerShell 5.1 / .NET Framework 4.8, `HttpListenerRequest.QueryString` decodes percent-encoded query parameters using the system default ANSI code page (Windows-1252 on French/English Windows) rather than UTF-8.
   - Each 2-byte Arabic UTF-8 character (such as `0xD8 0xAF` for `د`) was parsed as two individual ANSI characters (`Ø¯`).
2. **Aggressive Bidirectional Polling Overwrite**:
   - Every 1.5 seconds, the dock's background loop polled `/remote-config`.
   - When the operator paused typing (`!isTypingTitle`), the dock checked `if (cfg.title !== titleEl.value)` and clobbered the user's input box with the corrupted string returned by the bridge.
3. **Exponential Cascading Mojibake**:
   - When the user attempted to edit or correct the title, the corrupted string was re-sent through the ANSI query string decoder, compounding `Ø¯` into `Ã˜Â¯` (Round 2) and `ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¯` (Rounds 3 and 4).
4. **Unsafe String Chunk Concatenation in Node.js**:
   - In `backend/src/index.mjs`, `parseJsonBody` used `body += chunk` on incoming Buffer events, which can split multi-byte UTF-8 sequences across packet boundaries.

### Permanent Patches Implemented
1. **POST JSON Metadata Persistence**:
   - `syncMetadataToBridgeAndRemote()` in `dock/app.js` and `dock/remote.html` now transmits metadata via `POST /save-title` with `Content-Type: application/json; charset=utf-8` and `{ title, description }`, entirely bypassing URL query string decoding.
2. **UTF-8 Decoding for Query Fallback**:
   - In `bridge.ps1` and `install.ps1`, GET requests now decode query parameters using `[System.Net.WebUtility]::UrlDecode()`, strictly enforcing UTF-8 decoding.
3. **Mojibake Detection and Ingest Protection**:
   - Added `cleanMojibake()` and `isLikelyMojibake()` guards in `dock/app.js` to automatically heal historical Mojibake and prevent corrupted strings from overwriting valid user-entered Arabic text.
4. **Binary-Safe Buffer Concatenation**:
   - Updated `parseJsonBody` in `backend/src/index.mjs` to buffer raw data chunks and decode via `Buffer.concat(chunks).toString('utf8')`.



