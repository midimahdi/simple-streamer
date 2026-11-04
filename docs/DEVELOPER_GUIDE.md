# Simple Streamer — Developer & Contributor Guide

This guide covers building, testing, packaging, and deploying the components of **Simple Streamer**.

---

## 1. Repository Layout

```
mosque-stream-orchestrator/
├── backend/                 # Node.js 20 ES module serverless orchestrator
│   ├── src/
│   │   ├── index.mjs        # HTTP server & routing (Cloud Run & Local)
│   │   ├── youtube.mjs      # YouTube Data API v3 integration
│   │   ├── facebook.mjs     # Meta Graph API v21.0 integration
│   │   ├── twitch.mjs       # Twitch Helix OAuth & Channel integration
│   │   └── kick.mjs         # Kick Public API & streamkey:read integration
│   ├── dock/                # Synced bundle of the browser dock
│   └── Dockerfile           # Production container for Cloud Run
├── cloudflare-site/         # Cloudflare Worker proxy & public legal pages
│   ├── src/index.ts         # Reverse proxy with zero-cache enforcement
│   └── wrangler.toml        # Cloudflare deployment config
├── dock/                    # Canonical Custom OBS Browser Dock UI
│   ├── index.html           # Dark studio interface
│   ├── app.js               # Reactive dock state machine & OBS WS client
│   ├── obs-client.js        # Zero-dependency OBS WebSocket v5 implementation
│   └── style.css            # Responsive layout & custom scrollbar styling
├── plugin/                  # Native C OBS Studio Multi-Output Plugin
│   ├── simple-streamer.c    # libobs RTMP zero-copy output mirroring
│   └── CMakeLists.txt       # Cross-platform build script
├── installer/
│   ├── macos/               # macOS native packaging scripts
│   │   ├── simple-streamer-bridge.m  # Objective-C local HTTP daemon
│   │   ├── build-dmg.sh     # Universal binary compilation & DMG packager
│   │   └── dist/            # Compiled SimpleStreamer-Setup.dmg
│   └── windows/             # Windows PowerShell & Inno Setup scripts
└── scripts/
    └── test-orchestrator.mjs# Test runner for API contracts & state
```

---

## 2. Local Development

### Prerequisites
* **Node.js 20+**
* **macOS:** Xcode Command Line Tools (`clang`, `pkgbuild`)
* **Google Cloud SDK (`gcloud`)** logged into project `simple-streamer-513609`
* **Cloudflare Wrangler CLI (`wrangler`)**

### Running the Backend Locally
```bash
cd backend
npm install
node src/index.mjs
```
The backend starts on `http://0.0.0.0:8080`.

### Developing the Dock
Because the dock is 100% vanilla HTML/JS/CSS, you can open `dock/index.html` directly in a browser or test it inside OBS Studio:
1. In OBS, go to **Docks → Custom Browser Docks...**.
2. Add Dock:
   - **Dock Name:** `Simple Streamer Dev`
   - **URL:** `http://localhost:8080` (or `file:///Users/mahdi/Business/brain/01-projects/mosque-stream-orchestrator/dock/index.html`)

---

## 3. Building the Native Components

### Compiling the C Plugin on macOS
To compile `simple-streamer.plugin` for macOS (arm64 & x86_64):
```bash
clang -dynamiclib -O3 \
  -I/Applications/OBS.app/Contents/Resources/include \
  -F/Applications/OBS.app/Contents/Frameworks \
  -framework libobs \
  -o plugin/simple-streamer.so plugin/simple-streamer.c
```
*(The automated build script `installer/macos/build-dmg.sh` handles this automatically).*

### Building the macOS DMG Installer
To compile the universal bridge, build the plugin, package the installer PKG, and create `SimpleStreamer-Setup.dmg`:
```bash
cd installer/macos
./build-dmg.sh
```
Output DMG: `installer/macos/dist/SimpleStreamer-Setup.dmg` (also copied to `~/Downloads/SimpleStreamer-Setup.dmg`).

---

## 4. Deploying Backend & Edge Infrastructure

### 1. Cloudflare Worker Edge Proxy
To deploy the edge proxy that enforces `Cache-Control: no-store` and serves public legal docs:
```bash
cd cloudflare-site
npx wrangler deploy
```
* Custom domain: `https://simple-streamer.bdjlmn.com`
* Worker origin: `https://mosque-stream-orchestrator-259167398353.europe-west1.run.app`

### 2. Google Cloud Run Backend
To build and deploy the containerized backend:
```bash
gcloud run deploy mosque-stream-orchestrator \
  --source backend \
  --region europe-west1 \
  --project simple-streamer-513609 \
  --allow-unauthenticated
```

---

## 5. Adding a New Platform to Simple Streamer

To add a 5th streaming platform (e.g. X / Twitter, LinkedIn, Trovo):

1. **Backend Integration:**
   - Create `backend/src/<platform>.mjs` with:
     - OAuth 2.0 PKCE / token exchange methods.
     - Live broadcast creation / ingestion URL resolution.
     - Real-time status query & teardown methods.
   - Wire `/auth/<platform>/start` and `/auth/callback/<platform>` in `backend/src/index.mjs`.
2. **Dock UI (`dock/app.js` & `dock/index.html`):**
   - Add platform button in `addPlatformsGrid`.
   - Add brand icon SVG with brand coloring.
   - Add `start<Platform>Poll(sessionId)` routine with `{ cache: 'no-store' }`.
   - Add `promptConfirm<Platform>(data)` confirmation dialog.
3. **Multi-Output Ingestion:**
   - The native C plugin automatically handles any RTMP endpoint provided in `serverUrl` and `streamKey`. No native C changes are required.
