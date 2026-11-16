# 🔬 Simple Streamer — Technical Architecture & Developer Guide

This document covers the internal engineering architecture, zero-copy encoder multiplexing mechanics, network topology, and source code build procedures for **Simple Streamer**.

---

## 1. System Topology & Architecture

Simple Streamer is designed as a hybrid local/edge appliance that eliminates CPU re-encoding overhead and cloud relay latency by multiplexing active encoder bitstreams locally inside OBS Studio.

```mermaid
flowchart TD
    subgraph OBS_Studio ["OBS Studio Environment (Local Machine)"]
        Dock["OBS Custom Browser Dock\n(Vanilla HTML5 / ES6 Client)"]
        OBSCore["OBS Studio Engine\n(libobs core)"]
        ActiveEnc["Active Hardware Encoder\n(NVENC / VideoToolbox / QuickSync / x264)"]
        Plugin["Simple Streamer Native C Plugin\n(simple-streamer.plugin / .dll)"]
        Bridge["Local Bridge Daemon\n(127.0.0.1:45455)"]
    end

    subgraph Edge_Cloud ["Stateless Edge Infrastructure"]
        CF["Cloudflare Worker\n(simple-streamer.bdjlmn.com)"]
        CR["Google Cloud Run Stateless Orchestrator\n(Node.js 20 ES Modules)"]
    end

    subgraph Streaming_Platforms ["Ingest Endpoints"]
        YT["YouTube Live Ingest (RTMP/RTMPS)"]
        FB["Facebook Live Ingest (RTMPS)"]
        TW["Twitch Ingest (RTMP)"]
        KC["Kick Ingest (RTMP)"]
    end

    Dock -->|1. Fetch Auth & Ephemeral Endpoints| CF
    CF --> CR
    CR -->|API OAuth & Scheduled Broadcast Creation| YT
    CR -->|Meta Graph API v21.0 Broadcast Creation| FB
    CR -->|Return Stream URLs & Keys| Dock

    Dock -->|2. Configures Primary Destination| OBSCore
    Dock -->|3. Arm Secondary Destinations via HTTP| Bridge
    Bridge --> Plugin
    
    OBSCore --> ActiveEnc
    ActiveEnc -->|Raw NAL Packets| Plugin
    
    OBSCore -->|Output 1 (Primary RTMP)| YT
    Plugin -->|Output 2 (Secondary RTMPS)| FB
    Plugin -->|Output 3 (Secondary RTMP)| TW
    Plugin -->|Output 4 (Secondary RTMP)| KC
```

---

## 2. Zero-Copy Encoder Multiplexing (`libobs`)

### The Problem with Traditional Multi-RTMP
Standard third-party multi-streaming plugins (such as `obs-multi-rtmp`) create a new `obs_encoder_t` instance for each target output. If broadcasting to 4 destinations at 1080p60 6000 kbps:
- **Total Encoders Running:** 4 separate encoder sessions.
- **GPU / CPU Impact:** 4× video frame quantization and color conversion.
- **Result:** Severe frame drops, high VRAM usage, and GPU thermal throttling.

### How Simple Streamer Achieves 0% Duplicate CPU
Simple Streamer interfaces directly with the OBS C API (`libobs`):

1. **Borrowing Running Encoders:**
   When the primary OBS output starts, Simple Streamer retrieves the active video and audio encoder instances:
   ```c
   obs_output_t *main_out = obs_frontend_get_streaming_output();
   obs_encoder_t *venc = obs_output_get_video_encoder(main_out);
   obs_encoder_t *aenc = obs_output_get_audio_encoder(main_out, 0);
   ```

2. **Output Registration Without Instantiating Encoders:**
   For each secondary destination, an `rtmp_output` object and `rtmp_custom` service are created and bound directly to the existing `venc` and `aenc`:
   ```c
   obs_output_t *out = obs_output_create("rtmp_output", out_name, NULL, NULL);
   obs_output_set_service(out, svc);
   obs_output_set_video_encoder(out, venc);
   obs_output_set_audio_encoder(out, aenc, 0);
   obs_output_start(out);
   ```

3. **Packet Fan-Out:**
   The hardware encoder renders and compresses the frame **once**. As compressed NAL units leave the encoder, `libobs` broadcasts the memory buffer to the primary output and every attached secondary output concurrently. Extra CPU/GPU overhead is **0.0%**.

4. **Lifecycle & Teardown Coordination:**
   Because secondary outputs share the primary output's encoder, stopping the primary stream halts the encoder. To prevent memory access violations or frozen streams, the plugin hooks `OBS_FRONTEND_EVENT_STREAMING_STOPPED` and cleanly terminates all secondary outputs.

---

## 3. Stream State Isolation & Detection

Simple Streamer maintains strict separation between managed multi-destination broadcasts and external/independent streams:

* **Managed Stream:** When started through the Simple Streamer dock, the dock sets `simple_streamer_stream_managed = true` in session storage and arms the native plugin via `config.json`. Telemetry watches all configured endpoints.
* **External Stream:** If a broadcaster initiates streaming via OBS's native UI button, a third-party plugin, or a hotkey, Simple Streamer detects the active output but marks it as `● OBS STREAMING (EXTERNAL)`. It suppresses broadcast timers, disables automated metadata pushes, and does not start secondary outputs unless explicitly armed.

---

## 4. Mobile Remote Control & Signaling Relay

The mobile remote controller (`dock/remote.html`) operates on a two-tier network transport:

1. **Local Network Transport (mDNS / WebSocket):**
   * The local bridge daemon runs a lightweight HTTP/WebSocket server on `127.0.0.1:45455`.
   * Broadcasts mDNS hostname `simple-streamer.local`.
   * When the mobile device is on the same local Wi-Fi, low-latency control packets and base64 confidence preview frames travel directly over the local network without touching the internet.

2. **Cellular / WAN Transport (WebRTC & TURN):**
   * If local network discovery fails (e.g. mobile device on 5G/LTE), the controller negotiates an encrypted connection via a secure cloud relay.
   * Remote commands are verified against a session PIN displayed on the OBS dock.
   * Telemetry polling automatically pauses when the mobile tab is backgrounded or the screen is locked to preserve mobile device battery life.

---

## 5. Security & Privacy Architecture

* **Stateless API Gateway:** The cloud backend (`Google Cloud Run`) processes broadcast creation and OAuth handshakes in memory. No user database, credentials, stream keys, or logs are retained.
* **Client-Side Token Storage:** OAuth tokens and channel configurations reside strictly in local OBS `localStorage`. Clearing local storage or clicking Disconnect instantly purges all credentials.
* **Direct RTMP Transmission:** Video and audio bitstreams travel directly from your computer's network interface to the platform servers (YouTube, Twitch, Meta, Kick). Video traffic never passes through any intermediary proxy.

---

## 6. Building from Source

### Prerequisites
* **CMake 3.20+**
* **Node.js 20+** (LTS)
* **macOS:** Xcode Command Line Tools (`clang`, `pkgbuild`, `hdiutil`)
* **Windows:** Visual Studio 2022 (C++ Desktop Development) or MSVC build tools

### 1. Compiling the Native C Plugin (macOS)
```bash
cd plugin
bash build-mac.sh
```
This builds a universal binary (`arm64` for Apple Silicon M1–M4 and `x86_64` for Intel) and automatically installs it into `~/Library/Application Support/obs-studio/plugins/simple-streamer/`.

### 2. Running the Backend Test Suite
```bash
cd backend
npm test
```
Executes the 9/9 automated orchestrator test suite:
- Presets and description generator verification
- Health check and static asset delivery
- OAuth gatekeeping and hardware identifier (HWID) enforcement
- Anti-spam rate limiting
- Cloud preset synchronization and conflict resolution
- Stripe signature verification

### 3. Packaging Automated Installers
* **macOS Installer (.dmg):**
  ```bash
  cd installer/macos
  ./build-dmg.sh
  ```
  Generates `SimpleStreamer-Setup.dmg` containing the installer package, bridge daemon, and auto-dock configuration.

* **Windows Installer (.exe):**
  Compile the Inno Setup script located at `installer/windows/setup.iss` using Inno Setup 6.

---

## 7. Package Manager Distribution

### Windows (Winget)
Manifest: [`packaging/winget/MahdiDigital.SimpleStreamer.yaml`](../packaging/winget/MahdiDigital.SimpleStreamer.yaml)
```powershell
winget install --exact --id MahdiDigital.SimpleStreamer
```

### macOS (Homebrew Cask)
Formula: [`packaging/homebrew/simple-streamer.rb`](../packaging/homebrew/simple-streamer.rb)
```bash
brew install --cask packaging/homebrew/simple-streamer.rb
```
