# Simple Streamer — Operator & User Guide

**Simple Streamer** is an integrated live streaming appliance built directly inside OBS Studio. It allows anyone—especially non-technical volunteers and community streamers—to broadcast simultaneously to **YouTube**, **Facebook Live**, **Twitch**, and **Kick** with zero dashboard configuration and zero manual stream key handling.

---

## 1. Quick Installation (1-Click)

### macOS Setup
1. Download or open `SimpleStreamer-Setup.dmg` (found in your Downloads or distributed via releases).
2. Double-click **`Install Simple Streamer.pkg`** inside the DMG.
3. Complete the macOS installer wizard. The installer automatically:
   - Installs the native multi-output plugin (`simple-streamer.plugin`) to OBS plugins directory.
   - Configures the background bridge helper (`com.bdjlmn.simple-streamer`).
   - Registers the **Simple Streamer** browser dock inside OBS Studio.
4. Launch (or restart) **OBS Studio**.
5. The **Simple Streamer** dock will appear docked in your OBS window (or accessible via **Docks → Simple Streamer** in the menu bar).

### Windows Setup
1. Run `SimpleStreamer-Setup.exe` (or `SimpleStreamer-Setup.bat`).
2. Follow the setup wizard; it installs the OBS 64-bit plugin and native background service.
3. Launch OBS Studio.

---

## 2. Interface Overview

```
+-------------------------------------------------------+
|  SIMPLE STREAMER                    ● CONNECTED  [⚙]  |
+-------------------------------------------------------+
|  BROADCAST TARGETS                                    |
|  [● YouTube]  [● Facebook]  [● Twitch]  [● Kick]      |
+-------------------------------------------------------+
|  Broadcast Title                                      |
|  [ Friday Sermon & Community Reflections            ] |
|                                                       |
|  Broadcast Description (Optional)                     |
|  [ Join us live from Mosque El-Islah...             ] |
+-------------------------------------------------------+
|  [               GO LIVE NOW                        ] |
+-------------------------------------------------------+
|  DIAGNOSTICS & STATUS LOG                             |
|  > ✓ Connected to OBS WebSocket v5                    |
|  > ✓ All 4 destinations verified healthy              |
+-------------------------------------------------------+
```

* **Header:** Displays connection status (`● CONNECTED` to OBS) and the **Settings button `[⚙]`**.
* **Broadcast Targets (Pills):** One-click toggle pills for each connected platform. Click a pill to enable (`●`) or disable (`○`) that platform for the upcoming stream.
* **Stream Details:** Enter your sermon, lecture, or event title and optional description.
* **Main Action Button:** Transitions through **▶ GO LIVE**, **PREPARING STREAM...**, and **⏹ STOP STREAM**.
* **Diagnostics Console:** Live activity log showing connection status, bitrate, FPS, and dropped frames.

---

## 3. Connecting Your Streaming Platforms

Click the **Settings `[⚙]`** button in the top right to open the **Stream Destinations** drawer. Click **+ Add Platform** and choose the destination to connect:

### 1. YouTube
1. Click **+ Add Platform → YouTube**.
2. Your web browser will open Google's authorization page.
3. Sign in with the Google account managing your YouTube channel.
4. Grant permission to manage YouTube live broadcasts.
5. Return to OBS: Simple Streamer automatically detects your channel name and ingestion address.
6. Click **✓ Confirm & Add**.

### 2. Facebook Live (Pages)
1. Click **+ Add Platform → Facebook**.
2. Log in with your Facebook account and confirm permissions for Pages you manage.
3. Complete authorization in the browser.
4. Return to OBS: Simple Streamer automatically probes your eligible Pages and displays them in a checklist.
   > [!NOTE]
   > Meta requires Facebook Pages to have at least **100 followers** to be eligible for live broadcasting via the Live Video API. Pages with fewer than 100 followers will be automatically filtered out to prevent broadcast failures.
5. Check the Page(s) you wish to add and click **✓ Confirm & Add**.

### 3. Twitch
1. Click **+ Add Platform → Twitch**.
2. Click **Authorize** on the Twitch authorization screen.
3. Return to OBS: Your Twitch channel name and stream key are linked automatically.
4. Click **✓ Confirm & Add**.

### 4. Kick
1. Click **+ Add Platform → Kick**.
2. Click **Authorize** on Kick.
3. Return to OBS: Simple Streamer links your stream key automatically using Kick's `streamkey:read` API scope.
4. Click **✓ Confirm & Add**.

---

## 4. Starting a Live Broadcast

Once your platforms are added and verified:

1. **Check Your Targets:**
   On the main screen, make sure the destination pills you want to stream to are active (highlighted with platform brand colors). You can disable any destination with a single click.
2. **Enter Title & Description:**
   Type your broadcast title in the **Broadcast Title** input.
3. **Click "GO LIVE":**
   - Simple Streamer communicates with YouTube, Meta, Twitch, and Kick simultaneously.
   - It mints fresh broadcast keys and dynamically updates the stream titles.
   - It sets the primary stream in OBS settings and routes all secondary platforms to the native multi-output plugin.
   - OBS begins streaming to all selected destinations simultaneously.
4. **Live Monitoring & Per-Platform Retries:**
   - The status badge changes to **● LIVE (00:00:00)** with an active timer.
   - The diagnostics panel displays real-time health stats:
     - **Bitrate:** Real-time upload speed (e.g. `4500 kbps`).
     - **FPS:** Encoding frame rate (e.g. `60 fps`).
     - **Dropped Frames:** Network loss counter (e.g. `0 (0.0%)`).
     - **Platform Grid:** Displays active broadcast status (`● LIVE`, `STARTING...`, or `● OFFLINE`) for each individual destination.
   - **Retrying a Destination Mid-Stream:**
     - If an individual platform drops or fails to connect (e.g. temporary network blip or API handshake delay), an inline **`↻ Retry`** button appears directly next to that platform's status badge.
     - Clicking **`↻ Retry`** re-authorizes or re-initiates that specific destination with the native engine on the fly without stopping your active stream to other platforms.

---

## 5. Ending the Broadcast

1. Click **⏹ STOP STREAM** (red button).
2. Simple Streamer prompts: `"Stop live stream to all destinations?"`. Click **Confirm Stop**.
3. Simple Streamer:
   - Stops the OBS primary stream and native multi-output streams immediately.
   - Sends an instant termination signal to Meta Graph API (`end_live_video=true`) and YouTube Live API, cleanly finalizing the broadcasts so viewers do not see a 3-minute frozen screen.
   - Resets the UI back to ready mode.

---

## 6. Daily Best Practices & Troubleshooting

### Recommended OBS Encoder Settings
For optimal multi-destination streaming to all 4 platforms simultaneously:
* **Video Bitrate:** `4500 kbps` to `6000 kbps` (1080p) or `3000 kbps` (720p).
* **Keyframe Interval:** **`2 s`** (*strictly required by Meta and Kick*).
* **Rate Control:** `CBR`.
* **Audio Bitrate:** `160 kbps` (AAC).

### Common Questions

#### "What happens to my personal stream key in OBS Settings → Stream?"
Simple Streamer operates non-destructively. Before injecting the primary stream output, it automatically takes a snapshot of your existing OBS `Settings → Stream` configuration (e.g. your personal Facebook Live key, custom RTMP server, or YouTube service). As soon as the broadcast ends (or if OBS is restarted), your original stream settings are automatically restored. You can continue streaming manually through native OBS at any time without re-entering your keys.

#### "Can I record locally while streaming?"
Yes. You can click **Start Recording** in OBS at any time, or configure OBS to automatically record whenever a stream begins. Local recording runs independently of live streaming.

#### "OBS WebSocket Disconnected"
If the status badge shows `WAITING FOR OBS...`, ensure OBS Studio is open. Simple Streamer automatically attempts reconnection every few seconds.
