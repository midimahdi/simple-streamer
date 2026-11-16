<div align="center">

# 📡 Simple Streamer

**Stream to YouTube, Twitch, Facebook & Kick at the same time—directly inside OBS Studio.**  
*No lag. No extra CPU usage. No expensive monthly subscriptions.*

[![Latest Release](https://img.shields.io/github/v/release/midimahdi/simple-streamer?color=10B981&label=Release)](https://github.com/midimahdi/simple-streamer/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/midimahdi/simple-streamer/total?color=blue&label=Downloads)](https://github.com/midimahdi/simple-streamer/releases)
[![Platforms](https://img.shields.io/badge/Platform-Windows%2010%2F11%20%7C%20macOS-0284c7)](https://github.com/midimahdi/simple-streamer/releases/latest)
[![OBS Studio](https://img.shields.io/badge/OBS%20Studio-%E2%89%A5%2028.0-9333ea)](https://obsproject.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<br/>

[**📥 Download Now**](#download) &nbsp;•&nbsp; [**🚀 3-Step Setup**](#quick-start) &nbsp;•&nbsp; [**✨ Why Use It**](#features) &nbsp;•&nbsp; [**📊 Comparison**](#comparison) &nbsp;•&nbsp; [**❓ FAQ**](#faq) &nbsp;•&nbsp; [**🔬 Technical Specs**](docs/TECHNICAL.md)

</div>

---

<a id="download"></a>
## ⚡ Download Simple Streamer

Click your operating system below to start downloading:

### 🪟 Windows (10 & 11)
| Version | Download Link | Notes |
| :--- | :--- | :--- |
| **Windows Installer (Recommended)** | [📥 **SimpleStreamer-Setup.exe**](https://github.com/midimahdi/simple-streamer/releases/latest/download/SimpleStreamer-Setup.exe) | 1-click setup: installs the plugin and adds the control dock to OBS |
| **Package Manager (Winget)** | `winget install --exact --id MahdiDigital.SimpleStreamer` | Fast 1-line install in Windows Terminal / PowerShell |

### 🍎 Mac (macOS 12 Monterey through 15 Sequoia)
| Version | Download Link | Notes |
| :--- | :--- | :--- |
| **Mac Disk Image (Apple Silicon & Intel)** | [📥 **SimpleStreamer-Setup.dmg**](https://github.com/midimahdi/simple-streamer/releases/latest/download/SimpleStreamer-Setup.dmg) | Works on all M1, M2, M3, M4 and Intel Mac computers |
| **Homebrew Cask** | `brew install --cask packaging/homebrew/simple-streamer.rb` | Fast 1-line install via Homebrew |

> [!TIP]
> **First-Time Install Note:**  
> Because Simple Streamer is an independent open-source tool, your computer may ask for a quick confirmation:
> - **On Windows:** If SmartScreen appears, click **More info** $\rightarrow$ **Run anyway**.
> - **On Mac:** If prompted by Gatekeeper, right-click the installer and click **Open**.

---

<a id="quick-start"></a>
## 🚀 Quick Start (Up & Running in 3 Steps)

1. **Install Simple Streamer:**  
   Run the installer for Windows or Mac. It sets up everything automatically.

2. **Open OBS Studio:**  
   The **Simple Streamer** panel will appear right inside your OBS sidebar.

3. **Connect & Go Live:**  
   Click the **Settings `[⚙]`** button to sign into your YouTube, Twitch, Facebook, or Kick accounts. Type your stream title and click **▶ Start Broadcast**!

---

<a id="features"></a>
## ✨ Why Broadcasters Love Simple Streamer

Most multi-streaming solutions either cost hundreds of dollars every year (like Restream or Castr) or overload your computer by encoding your video multiple times, causing game lag and dropped frames.

Simple Streamer runs right inside OBS Studio to give you a clean, smooth broadcast:

* **⚡ Zero Extra Computer Lag (0% Extra CPU):**  
  Other multi-stream plugins force your graphics card to encode your video 2, 3, or 4 times. Simple Streamer encodes your video **just once** and shares it with every platform. Your computer stays cool, your fans stay quiet, and your games run at full speed.

* **💰 No Expensive Monthly Subscriptions:**  
  Cloud restreaming services charge \$20 to \$50 every single month (\$240 to \$600 every year). Simple Streamer is free for core streaming, with an optional \$5 one-time lifetime pass for cloud automations.

* **🚀 1-Click Multi-Platform Live:**  
  Type your stream title and description once in OBS. Simple Streamer creates your YouTube broadcast, sets up Facebook Live, and updates your Twitch and Kick stream info automatically.

* **📝 Update Titles While You Are Live:**  
  Spotted a typo or switching to a new game? Change your title and description inside OBS and click **Update Live**—it instantly syncs to all your active channels without having to stop your stream.

* **📱 Phone Remote Control:**  
  Scan the QR code on your OBS screen with your phone. You can start/stop the stream, switch scenes, adjust microphone audio, and monitor a live preview from anywhere in your room.

* **🔒 100% Private & Direct:**  
  Your video streams directly from your computer to YouTube, Twitch, and Facebook. It never goes through our servers, and your passwords stay safe on your computer.

---

<a id="comparison"></a>
## 📊 How Simple Streamer Compares

| Feature | Simple Streamer | Other OBS Multi-RTMP Plugins | Paid Cloud Websites (Restream, Castr) |
| :--- | :--- | :--- | :--- |
| **Cost** | **Free / \$5 Lifetime** | Free | \$228 to \$588 every year |
| **Extra Computer Work (CPU/GPU)** | **0% (Uses existing encoder)** | High (Encodes video multiple times) | None (Handled on remote servers) |
| **Stream Delay (Lag)** | **0 seconds (Direct)** | 0 seconds (Direct) | 2 to 5 seconds extra cloud delay |
| **Stream Key Setup** | **1-Click Automatic Sync** | Manual copy-paste every stream | Automatic |
| **Mobile Phone Remote** | **Included Free (Wi-Fi + Cellular)** | ❌ None | ❌ Requires separate paid apps |
| **Update Title Mid-Stream** | **1-Click Sync to All Platforms** | ❌ None | Web dashboard only |
| **Data Privacy** | **100% Local on Your PC** | Local on Your PC | Stored on third-party cloud servers |

---

<a id="faq"></a>
## ❓ Frequently Asked Questions

<details>
<summary><b>How fast does my internet upload speed need to be?</b></summary>
Because Simple Streamer broadcasts directly from your computer, each platform needs about 5 to 6 Mbps of upload bandwidth for high-definition 1080p video.  
* For 1 platform: ~6 Mbps upload  
* For 2 platforms: ~12 Mbps upload  
* For 3 platforms: ~18 Mbps upload  
If your internet connection has lower upload speeds, you can stream at 720p or lower your bitrate in OBS settings.
</details>

<details>
<summary><b>Can I turn specific platforms on and off?</b></summary>
Yes! On the Simple Streamer panel in OBS, simply click on any platform pill (YouTube, Twitch, Facebook, Kick) to enable or disable it before starting your stream.
</details>

<details>
<summary><b>Will this change or break my existing OBS settings?</b></summary>
No. Simple Streamer automatically takes a snapshot of your personal OBS stream settings before going live and restores them safely when your broadcast ends.
</details>

<details>
<summary><b>Why is there a paid option if it is open source?</b></summary>
Simple Streamer Core is 100% free and open-source under the GPL-2.0 license. The optional \$5 one-time lifetime pass helps pay for the cloud infrastructure required for automated YouTube and Facebook broadcast creation and cellular phone remote control.
</details>

<details>
<summary><b>How does the phone remote control work?</b></summary>
Open the Simple Streamer settings inside OBS, click **Mobile Control**, and scan the QR code with your smartphone camera. You can control your scenes, see your stream timer, and adjust microphone audio from your phone without installing any mobile apps.
</details>

---

## 🔬 Looking for Technical Architecture & Developer Guides?

If you are a developer, systems engineer, or contributor looking for C plugin source code, zero-copy packet multiplexing details, network topologies, or compilation guides:

👉 **[Read the Full Technical Architecture & Developer Guide (docs/TECHNICAL.md)](docs/TECHNICAL.md)**

---

## 💬 Community & Support

* **Found a bug?** Submit a [GitHub Bug Report](https://github.com/midimahdi/simple-streamer/issues/new?template=bug_report.yml).
* **Have an idea?** Request features on the [Feature Request Form](https://github.com/midimahdi/simple-streamer/issues/new?template=feature_request.yml).
* **OBS Community:** Visit our [OBS Forums Resource Listing](docs/OBS_FORUMS_RESOURCE_LISTING.md) to join the discussion.

---

## 📜 License

Distributed under the **MIT License**. Created with care by [MAHDI DIGITAL LLC](https://bdjlmn.com).
