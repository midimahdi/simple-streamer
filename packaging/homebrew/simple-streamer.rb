cask "simple-streamer" do
  version "1.0.0"
  sha256 :no_check # Updated on release tagging

  url "https://github.com/midimahdi/simple-streamer/releases/download/v#{version}/SimpleStreamer-Setup.dmg",
      verified: "github.com/midimahdi/simple-streamer/"
  name "Simple Streamer"
  desc "One-click multi-platform live streaming plugin for OBS Studio"
  homepage "https://simple-streamer.bdjlmn.com"

  depends_on macos: ">= :monterey"

  installer manual: "Install Simple Streamer.pkg"

  uninstall pkgutil: [
    "com.mahdidigital.simplestreamer.plugin",
    "com.mahdidigital.simplestreamer.bridge",
  ],
  launchctl: "com.mahdidigital.simple-streamer-bridge",
  delete: [
    "#{ENV.fetch("HOME", nil)}/.simple-streamer",
    "#{ENV.fetch("HOME", nil)}/Library/Application Support/obs-studio/plugins/simple-streamer.plugin",
  ]

  zap trash: [
    "#{ENV.fetch("HOME", nil)}/.simple-streamer",
    "#{ENV.fetch("HOME", nil)}/Library/Application Support/obs-studio/plugin_config/simple-streamer",
  ]
end
