# OBS Forums Resource Listing Copy-Paste Draft

Use this text when submitting Simple Streamer to the official **OBS Studio Resources Directory** at [https://obsproject.com/forum/resources/add](https://obsproject.com/forum/resources/add).

---

### **Resource Name:**
Simple Streamer — 1-Click Multi-Streaming to YouTube, Facebook, Twitch & Kick (0% Extra CPU)

### **Category:**
`Plugins` / `Tools`

### **Version String:**
`1.0.0`

### **Short Summary (Under 100 characters):**
Stream simultaneously to YouTube, Facebook, Twitch & Kick from OBS with 0% extra CPU.

---

### **Resource Description (BBCode / Rich Text Format):**

```text
[B][SIZE=6]Simple Streamer for OBS Studio[/SIZE][/B]
[B]One-Click Multi-Platform Broadcasting with 0% Duplicate Encoding CPU[/B]

Stop paying $20–$50/month for cloud restreaming services, and stop overloading your GPU/CPU with plugins that run 4 separate encoders. 

[B]Simple Streamer[/B] is an open-source native plugin and browser dock that taps into OBS Studio's active encoder bitstream, broadcasting simultaneously to YouTube, Facebook Live, Twitch, and Kick with zero duplicate encoding penalty.

[HR][/HR]

[B][SIZE=5]⚡ Key Features[/SIZE][/B]
[LIST]
[*][B]0% Extra CPU / GPU Usage:[/B] Native C11 plugin directly relays the active encoder's compressed NAL packets across all RTMP outputs. No duplicate NVENC, VideoToolbox, or x264 sessions.
[*][B]1-Click OAuth Platform Sync:[/B] Connect YouTube and Facebook Pages once. Broadcast containers, privacy settings, and ingest RTMP keys are provisioned in under 3 seconds—no manual stream key juggling.
[*][B]Dynamic Facebook Key Renewal:[/B] Eliminates Facebook's 24-hour expiring stream keys by generating fresh live broadcasts dynamically on launch.
[*][B]Kick & Twitch OAuth Token Refresh:[/B] Auto-discovers Twitch ingest endpoints and Kick channel stream keys via official API handshakes, with automatic offline fallback to manual RTMP keys.
[*][B]Native OBS Browser Dock:[/B] Sits seamlessly in your OBS layout with real-time per-destination status indicators (LIVE, CONNECTING, FAILED) and bitrate telemetry.
[*][B]Smartphone Remote Control:[/B] Monitor a 1-FPS confidence preview, trigger scene cuts, and slide to Go Live over local Wi-Fi without touching your streaming PC.
[*][B]Privacy & Local-First:[/B] Zero centralized databases. OAuth tokens and channel configurations remain strictly on your local PC in OBS storage.
[/LIST]

[HR][/HR]

[B][SIZE=5]📊 Simple Streamer vs. Alternatives[/SIZE][/B]

[TABLE]
[TR]
[TH]Feature[/TH]
[TH]Simple Streamer[/TH]
[TH]Traditional Multi-RTMP[/TH]
[TH]Cloud Relays (Restream)[/TH]
[/TR]
[TR]
[TD][B]Annual Cost[/B][/TD]
[TD][B]Free / $5 Lifetime[/B][/TD]
[TD]Free[/TD]
[TD]$228 – $588 / yr[/TD]
[/TR]
[TR]
[TD][B]Extra Encoder Overhead[/B][/TD]
[TD][B]0% (Encoder Sharing)[/B][/TD]
[TD]Multiple Encoders / Heavy CPU[/TD]
[TD]0% (Relayed in Cloud)[/TD]
[/TR]
[TR]
[TD][B]Stream Key Workflow[/B][/TD]
[TD][B]1-Click Automated Sync[/B][/TD]
[TD]Manual Copy-Paste Every Session[/TD]
[TD]Platform OAuth[/TD]
[/TR]
[TR]
[TD][B]Added Stream Latency[/B][/TD]
[TD][B]0s (Direct RTMP)[/B][/TD]
[TD]0s (Direct RTMP)[/TD]
[TD]2 – 5s Cloud Proxy Delay[/TD]
[/TR]
[TR]
[TD][B]Mobile Wi-Fi Remote[/B][/TD]
[TD][B]Included (Native)[/B][/TD]
[TD]Not Available[/TD]
[TD]Requires 3rd-Party Tools[/TD]
[/TR]
[/TABLE]

[HR][/HR]

[B][SIZE=5]💻 System Compatibility[/SIZE][/B]
[LIST]
[*][B]OBS Studio:[/B] Version 28.0.0 through 31.x+
[*][B]Windows:[/B] Windows 10 & Windows 11 (64-bit)
[*][B]macOS:[/B] macOS 12 (Monterey), 13 (Ventura), 14 (Sonoma), 15 (Sequoia) — Universal Binary (Apple Silicon M1/M2/M3/M4 & Intel x86_64)
[/LIST]

[HR][/HR]

[B][SIZE=5]🚀 Installation Guide[/SIZE][/B]

[B]Windows:[/B]
[LIST=1]
[*]Download [B]SimpleStreamer-Setup.exe[/B] from the GitHub Releases link below.
[*]Run the installer (sets up the native plugin and OBS browser dock automatically).
[*]Launch OBS Studio. The [B]Simple Streamer[/B] dock will appear in your workspace.
[/LIST]

[B]macOS:[/B]
[LIST=1]
[*]Download [B]SimpleStreamer-Setup.dmg[/B].
[*]Open the DMG and double-click [B]Install Simple Streamer.pkg[/B].
[*]Launch OBS Studio. Click [B]Settings [⚙][/B] in the Simple Streamer dock to connect your platforms.
[/LIST]

[HR][/HR]

[B][SIZE=5]🔗 Links & Support[/SIZE][/B]
[LIST]
[*][B]Official Website:[/B] [URL]https://simple-streamer.bdjlmn.com[/URL]
[*][B]GitHub Repository:[/B] [URL]https://github.com/midimahdi/simple-streamer[/URL]
[*][B]Bug Reports & Source Code:[/B] [URL]https://github.com/midimahdi/simple-streamer/issues[/URL]
[*][B]Documentation & Architecture:[/B] [URL]https://github.com/midimahdi/simple-streamer/blob/main/docs/architecture.md[/URL]
[/LIST]
```
