# Simple Streamer — Master Product & Architecture Reference

**Simple Streamer** is an open-source, stateless live streaming appliance embedded natively inside **OBS Studio**. It empowers mosques, non-profits, independent creators, and community volunteers to broadcast simultaneously to **YouTube**, **Facebook Live**, **Twitch**, and **Kick** with one click, 0% duplicate CPU encoding overhead, and zero manual web dashboard interaction.

---

## 1. What It Is & Why It Exists

### The Problem
Community streamers and non-technical volunteers face significant friction when trying to broadcast across multiple platforms:
1. **CPU/GPU Bottlenecks:** Third-party multi-RTMP plugins often re-encode video frames once for every destination, causing frame drops, encoder overload, and system crashes on standard laptops.
2. **Dynamic Key Friction:** Facebook Live generates dynamic, one-time RTMP stream keys for every session. Volunteers are forced to log into Facebook Live Producer, copy keys, and paste them into OBS settings every single week.
3. **Complex Third-Party Cloud Restreamers:** Paid restreaming services (e.g. Restream.io) cost $30–$80/month, store personal credentials on third-party databases, and introduce cloud latency.
4. **Broadcast Teardown Hangs:** Closing OBS without finalizing cloud broadcasts leaves viewers looking at a frozen 3-minute "Stream Starting / Reconnecting" screen on Facebook and YouTube.

### The Solution: Simple Streamer
* **Native libobs Output Forking:** Taps directly into the active video and audio encoders (`venc` and `aenc`) inside OBS Studio. It mirrors already-encoded H.264/AAC packets to $N$ secondary RTMP endpoints simultaneously with **0% extra encoding CPU load**.
* **Stateless Cloud Proxy:** A lightweight Google Cloud Run backend orchestrates dynamic Facebook `LIVE_NOW` keys and YouTube broadcasts on the fly. All OAuth tokens and stream destinations are stored strictly client-side in the streamer's local OBS CEF `localStorage`.
* **Zero Dashboard Interaction:** Volunteers enter a broadcast title once in OBS and click **▶ GO LIVE**. YouTube, Facebook, Twitch, and Kick go live simultaneously.

---

## 2. Complete Feature Matrix

| Feature | Description | Status |
| :--- | :--- | :---: |
| **Simultaneous 4-Platform Streaming** | Simultaneous output to YouTube, Facebook Pages, Twitch, and Kick. | **Active** |
| **0% Re-Encoding CPU Overhead** | Custom native C plugin (`simple-streamer.plugin`) replicates encoded bitstream. | **Active** |
| **Dynamic Facebook Ingestion** | Automatically mints `LIVE_NOW` RTMP keys via Meta Graph API v21.0. | **Active** |
| **1-Click In-App OAuth Linking** | Connect accounts via system browser; tokens sync straight to dock `localStorage`. | **Active** |
| **Kick API Stream Key Discovery** | Automatically fetches stream key via Kick's `streamkey:read` OAuth scope. | **Active** |
| **Automated Credential Health Probing** | Tests all connected tokens on OBS startup; displays live connectivity badges. | **Active** |
| **Real-Time Stream Diagnostics** | In-dock telemetry polling upload bitrate, encoding FPS, dropped frame %, and per-destination health. | **Active** |
| **Mid-Stream Platform Retry** | Inline `↻ Retry` button next to any failed destination to restart that specific output while live. | **Active** |
| **Instant Clean Remote Teardown** | Sends `end_live_video=true` to Facebook and transitions YouTube broadcast to `complete` immediately on stream stop. | **Active** |
| **1-Click Installers** | Native macOS DMG installer with automated launchd bridge and dock registration. | **Active** |

---

## 3. System Architecture & Data Flow

```
                      +--------------------------------------------------+
                      |                 OBS STUDIO                       |
                      |                                                  |
                      |  +--------------------------------------------+  |
                      |  |     Simple Streamer Custom Browser Dock    |  |
                      |  |       (Vanilla HTML5 / CSS3 / ES2022)      |  |
                      |  +--------------------------------------------+  |
                      |        |                     |                   |
                      |        | OBS-WS (4455)       | HTTP (45455)      |
                      |        v                     v                   |
                      |  +------------+      +---------------------+     |
                      |  | OBS Core   |      | Native Bridge       |     |
                      |  | (libobs)   |      | Helper Daemon       |     |
                      |  +------------+      +---------------------+     |
                      |     |       |                   |                |
                      |     | venc  | aenc              | Writes         |
                      |     v       v                   v                |
                      |  +------------------------------------+          |
                      |  |       simple-streamer.plugin       |          |
                      |  |    (Zero-Copy Secondary RTMP)      |          |
                      |  +------------------------------------+          |
                      +-------|-------------------|----------------------+
                              | Primary RTMP      | Secondary RTMPs (1..N)
                              v                   v
                        [ Twitch ]     [ Kick / YouTube / Facebook ]
```

### Component Breakdown
1. **Browser Dock (`dock/`):** Pure vanilla JavaScript state machine inside OBS CEF. Communicates with OBS Core via OBS WebSocket v5 (`obs-client.js`) and persists configuration in `localStorage`.
2. **Native C Plugin (`plugin/`):** `libobs` module that hooks into `OBS_FRONTEND_EVENT_STREAMING_STARTED` and `OBS_FRONTEND_EVENT_STREAMING_STOPPED`. Re-uses active video/audio encoders without spawning extra encoding threads.
3. **Bridge Helper Daemon (`installer/macos/bin/simple-streamer-bridge`):** Local Objective-C HTTP daemon on `127.0.0.1:45455`. Handles secure system browser opening for OAuth, raises OBS window on completion, and safely writes plugin configuration.
4. **Edge Proxy (`cloudflare-site/`):** Cloudflare Worker at `simple-streamer.bdjlmn.com`. Enforces strict `no-store` cache headers on dynamic OAuth endpoints and serves public privacy/terms documentation.
5. **Cloud Run Backend (`backend/`):** Stateless Node.js 20 ES module deployed to Google Cloud Run (`simple-streamer-513609` in `europe-west1`). Handles OAuth token exchanges, Meta Graph API v21.0 calls, and YouTube Data API v3 orchestration.

---

## 4. Platform Constraints & Operational Rules

* **Title Character Limit:** **Strict 100-character ceiling**.
  * YouTube: 100 chars max.
  * Kick: 100 chars max.
  * Twitch: 140 chars max.
  * Facebook: 255 chars max.
  * *Global rule:* Cap title input at 100 characters to guarantee universal compatibility.
* **Keyframe Interval:** Strictly **`2 s`** in OBS encoder settings (required by Meta and Kick).
* **Rate Control:** **CBR** (Constant Bitrate) between `4500 kbps` and `6000 kbps` for 1080p60.
* **Facebook Page Minimum:** Meta Graph API requires Pages to have at least **100 followers** to be eligible for Live Video API streaming.

---

## 5. Feature Prioritization Matrix & Ranked Roadmap

Every proposed feature has been evaluated and ranked by **Impact**, **Effort**, **Volunteer Simplicity**, and **Technical Risk**.

```
+---------------------------------------------------------------------------------------------------+
| PRIORITY | FEATURE                              | NEED VS NICE-TO-HAVE | EFFORT | RISK TO SIMPLICITY |
|----------|--------------------------------------|----------------------|--------|--------------------|
| P0       | Strict 100-Char Title Guard          | Essential (Fixes bug)| Low    | None (Simplifies)  |
| P0       | User-Selectable Primary Platform     | Essential (Stability)| Medium | None (Under hood)  |
| P1       | Dual Experience Modes (Simple/Adv)   | Architectural Core   | Low    | Solves all clutter |
| P1       | Pre-Filled Broadcast Templates       | High Need (Workflow) | Low    | None (Huge win)    |
| P1       | Universal Mid-Stream Title Update    | High Need (Live Ops) | Medium | Low                |
| P1       | Individual Secondary Stream Teardown | High Need (Control)  | Medium | Low                |
| P2       | Granular Per-Platform Metadata Edit  | Power Feature        | Medium | Contained in Adv   |
| P2       | Stream Kickoff & Category Wizard     | Power Feature        | High   | Contained in Adv   |
| P3       | Dedicated Analytics / Stats Window   | Nice-to-Have (Phase2)| Medium | None (Separate UI) |
+---------------------------------------------------------------------------------------------------+
```

---

## 6. Progressive Disclosure: Experience Tiers (Simple vs. Advanced)

To bridge the gap between non-technical mosque volunteers and advanced content creators without adding UI clutter, the dock introduces **Experience Modes** toggled inside **Settings**:

### Mode 1: Simple Mode (Default — Volunteer-Proof)
* **Target Audience:** Mosque volunteers, community centers, one-click operators.
* **Interface State:**
  * Clean, minimal 1-screen dock.
  * Platform toggle pills (`YouTube`, `Facebook`, `Twitch`, `Kick`).
  * Single Broadcast Title input (100 char limit).
  * Optional Description input.
  * Big `▶ GO LIVE` button.
  * Diagnostics console.
* **Guarantees:** Zero categories, zero tags, zero multi-step setup wizards. Impossible to misconfigure.

### Mode 2: Advanced / Creator Mode (Opt-In Power Features)
* **Target Audience:** Independent SaaS streamers, gaming/tech creators, multi-purpose studios.
* **Unlocked Capabilities:**
  * **Templates & Presets:** Quick template selector with dynamic date/time variables.
  * **Pre-Flight Kickoff Wizard:** Configure Twitch categories (*Education*, *Talk Shows*), stream tags, Kick subcategories, and YouTube privacy flags.
  * **Granular Platform Overrides:** Option to set distinct titles and hashtags per platform (e.g. YouTube vs. Twitch).
  * **Dedicated Analytics Trigger:** Opens the separate stats and concurrent viewer window.
* **Configuration:** Stored client-side in `localStorage` under `simple_streamer_mode: "simple" | "advanced"`.

---

## 7. Detailed Specifications by Priority Tier

### Tier P0: Immediate Stability & Error Prevention

1. **Strict 100-Character Title Enforcement:**
   * **Need:** YouTube and Kick hard-reject titles exceeding 100 characters.
   * **Implementation:** `maxlength="100"` on `<input id="lessonTitle">` with a subtle, non-intrusive live counter (`0/100`) beneath the field.
   * **Effort:** Low (15 mins).

2. **User-Selectable Primary Destination:**
   * **Need:** Stops OBS Core encoder from terminating when an individual platform is stopped early.
   * **Implementation:**
     * In **Settings → Stream Destinations**, add a radio selector or `[★ Set as Primary]` badge on each connected platform card.
     * The selected platform becomes Destination 0 (injected into OBS Core `SetStreamServiceSettings`).
     * All remaining enabled platforms become secondary outputs managed by `simple-streamer.plugin`.
     * Persisted in `localStorage` under `simple_streamer_primary_dest_id`.
   * **Effort:** Medium.

---

### Tier P1: Workflow Accelerators (High Impact)

1. **Pre-Filled Broadcast Templates:**
   * **Need:** Eliminates manual re-typing for recurring weekly events (Friday Khutbah, weekly Halaqa, youth sessions).
   * **Implementation:**
     * A template dropdown selector directly above the title input: `[Templates ▾]`.
     * Default presets: *Friday Sermon*, *Quran Study*, *Youth Tech Club*, plus `[+ Save Current as Template]`.
     * Supports dynamic variables: `{date}` (YYYY-MM-DD), `{day}` (Friday, Saturday...), `{time}` (HH:MM).
     * Saved in `localStorage` under `simple_streamer_templates`.
   * **Effort:** Low.

2. **Universal Mid-Stream Title & Description Updates:**
   * **Need:** Allows streamers to correct typos or update lecture topics while live without opening any browser dashboards.
   * **Implementation:**
     * Live screen features an inline `[✎ Edit Info]` button next to the active title.
     * Clicking expands an inline modal with Title and Description inputs and an `[Update Live Broadcast]` button.
     * Dispatches `POST /update-metadata` to Cloud Run, which calls platform APIs in parallel:
       * YouTube: `PUT /liveBroadcasts?part=snippet`
       * Facebook: `POST /{live-video-id}`
       * Twitch: `PATCH /helix/channels`
       * Kick: `PATCH /public/v1/channels`
   * **Effort:** Medium.

3. **Individual Secondary Stream Teardown:**
   * **Need:** Allows stopping a broadcast on YouTube or Facebook early while keeping Twitch or Kick running.
   * **Implementation:**
     * Each secondary platform card displays an inline `[⏹ End]` button alongside `● LIVE`.
     * Invokes `obs_output_stop()` on that specific output and `/end-live` for that destination only.
     * Primary destination remains active to protect the main video encoder pipeline.
   * **Effort:** Medium.

---

### Tier P2: Power Features & Granular Customization

1. **Granular Per-Platform Metadata Overrides:**
   * **Concept:** While universal updates cover 90% of use cases, advanced streamers may want distinct titles per platform (e.g. punchy 40-char title on Twitch, SEO-rich title on YouTube, long descriptive post with hashtags on Facebook).
   * **Design Rule (Protect Simplicity):** Universal by default!
     * The edit drawer shows the universal title/description.
     * An expandable accordion `[⚙ Platform Overrides ▾]` exposes tabbed overrides for YouTube, Facebook, Twitch, and Kick only when toggled.
   * **Effort:** Medium.

2. **Stream Kickoff & Pre-Flight Wizard:**
   * **Concept:** An optional pre-stream setup wizard to configure platform-specific parameters before going live:
     * **Twitch:** Category search (e.g. *Education*, *Talk Shows*, *Just Chatting*) via Helix API + Stream Tags.
     * **Kick:** Category selection via Kick Public API.
     * **YouTube:** Privacy selection (*Public*, *Unlisted*, *Private*) and Made for Kids flag.
     * **Facebook:** Targeting / Audience restrictions.
   * **Stress-Test & Simplicity Guard:**
     * *Risk:* Multi-step wizards create friction for non-technical volunteers.
     * *Solution:* Embed these parameters directly into the **Broadcast Templates**! Selecting the "Friday Khutbah" template auto-configures Twitch to *Education*, YouTube to *Public*, and adds relevant tags automatically. A manual wizard is available only via an optional `[⚙ Pre-Flight Setup]` button.
   * **Effort:** High.

---

### Tier P3: Telemetry & Multi-Platform Analytics (Phase 2 Separate Window)

To keep the primary OBS dock lightweight and distraction-free:

1. **Dedicated Analytics Window / Drawer:**
   * A discrete `[📊 Stats]` icon in the dock header opens a separate window or slide-out drawer.
2. **Aggregated & Per-Platform Live Metrics:**
   * Real-time concurrent viewer counters polled every 30s: YouTube, Facebook, Twitch, and Kick.
   * Independent live duration timers per destination (tracking individual start and retry times).
   * Network bitrate stability graphs and frame-drop alarms per output.
