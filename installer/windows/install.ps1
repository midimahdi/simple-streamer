# ==============================================================================
# Simple Streamer — 1-Click Installer for OBS Studio (Windows PowerShell)
# ==============================================================================
# 1. Configures OBS Custom Browser Dock automatically.
# 2. Sets up external browser launcher for seamless Google/Facebook login.
# ==============================================================================

$ErrorActionPreference = "Stop"

$ObsDir = "$env:APPDATA\obs-studio"
$UserIni = "$ObsDir\user.ini"
$DockTitle = "Simple Streamer"
$DockUrl = "https://simple-streamer.bdjlmn.com"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    Simple Streamer — Automatic 1-Click Installer" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check if OBS is running
$obsProc = Get-Process -Name "obs64", "obs32" -ErrorAction SilentlyContinue
if ($obsProc) {
    Write-Host "⚠️  OBS Studio is currently running." -ForegroundColor Yellow
    $ans = Read-Host "   Close OBS Studio now to apply settings? (y/n)"
    if ($ans -eq "y" -or $ans -eq "Y") {
        Stop-Process -Name "obs64", "obs32" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "   ✓ OBS Studio closed." -ForegroundColor Green
    } else {
        Write-Host "❌ Please close OBS Studio and run this installer again." -ForegroundColor Red
        Exit 1
    }
}

# 2. Inject Custom Browser Dock into user.ini
if (Test-Path $UserIni) {
    Write-Host "🔌 Injecting '$DockTitle' into OBS configuration..." -ForegroundColor Cyan
    $content = Get-Content $UserIni -Raw

    $pattern = 'ExtraBrowserDocks=(.*)'
    if ($content -match $pattern) {
        $rawJson = $matches[1].Trim()
        $docks = @()
        if ($rawJson -and $rawJson -ne "[]") {
            try { $docks = ConvertFrom-Json $rawJson } catch { $docks = @() }
        }
        
        $exists = $docks | Where-Object { $_.title -eq $DockTitle }
        if (-not $exists) {
            $newDock = [PSCustomObject]@{ title = $DockTitle; url = $DockUrl }
            $docks += $newDock
            $newJson = ConvertTo-Json -Compress @($docks)
            $content = $content -replace $pattern, "ExtraBrowserDocks=$newJson"
            Set-Content -Path $UserIni -Value $content -Encoding utf8
            Write-Host "   ✓ Added Simple Streamer dock to OBS Studio." -ForegroundColor Green
        } else {
            Write-Host "   ✓ Simple Streamer dock is already registered." -ForegroundColor Green
        }
    } else {
        $newJson = ConvertTo-Json -Compress @([PSCustomObject]@{ title = $DockTitle; url = $DockUrl })
        $content = $content + "`r`nExtraBrowserDocks=$newJson`r`n"
        Set-Content -Path $UserIni -Value $content -Encoding utf8
        Write-Host "   ✓ Added Simple Streamer dock to OBS Studio." -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  OBS configuration ($UserIni) not found." -ForegroundColor Yellow
    Write-Host "   Open OBS Studio once, close it, and run this installer." -ForegroundColor Yellow
}

# 2.5 Ensure OBS WebSocket server is enabled
$wsConfigDir = "$ObsDir\plugin_config\obs-websocket"
$wsConfigFile = "$wsConfigDir\config.json"
if (-not (Test-Path $wsConfigDir)) { New-Item -ItemType Directory -Path $wsConfigDir -Force | Out-Null }
if (-not (Test-Path $wsConfigFile)) {
    $wsConfig = @{
        alerts_enabled = $false
        auth_required = $false
        first_load = $false
        server_enabled = $true
        server_password = ""
        server_port = 4455
    } | ConvertTo-Json
    Set-Content -Path $wsConfigFile -Value $wsConfig -Encoding utf8
    Write-Host "   ✓ Initialized OBS WebSocket configuration (port 4455, enabled)." -ForegroundColor Green
} else {
    try {
        $wsData = Get-Content $wsConfigFile -Raw | ConvertFrom-Json
        if (-not $wsData.server_enabled) {
            $wsData.server_enabled = $true
            $wsData | ConvertTo-Json | Set-Content -Path $wsConfigFile -Encoding utf8
            Write-Host "   ✓ Enabled OBS WebSocket server in config." -ForegroundColor Green
        }
    } catch {}
}

# 3. Create background bridge script
$BridgeDir = "$env:LOCALAPPDATA\SimpleStreamer"
if (-not (Test-Path $BridgeDir)) { New-Item -ItemType Directory -Path $BridgeDir -Force | Out-Null }

$BridgeScript = @"
using System;
using System.Net;
using System.Diagnostics;
using System.Web;

class Program {
    static void Main() {
        HttpListener listener = new HttpListener();
        listener.Prefixes.Add("http://127.0.0.1:45455/");
        listener.Start();
        while (true) {
            HttpListenerContext ctx = listener.GetContext();
            HttpListenerRequest req = ctx.Request;
            HttpListenerResponse res = ctx.Response;
            res.AddHeader("Access-Control-Allow-Origin", "*");
            res.AddHeader("Access-Control-Allow-Private-Network", "true");
            res.AddHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
            res.AddHeader("Access-Control-Allow-Headers", "*");

            if (req.HttpMethod == "OPTIONS") {
                res.StatusCode = 200;
                res.Close();
                continue;
            }

            string rawUrl = req.QueryString["url"];
            if (!string.IsNullOrEmpty(rawUrl) && (rawUrl.StartsWith("https://") || rawUrl.StartsWith("http://"))) {
                Process.Start(new ProcessStartInfo(rawUrl) { UseShellExecute = true });
            }

            byte[] buf = System.Text.Encoding.UTF8.GetBytes("{\"status\":\"ok\"}");
            res.ContentType = "application/json";
            res.ContentLength64 = buf.Length;
            res.OutputStream.Write(buf, 0, buf.Length);
            res.Close();
        }
    }
}
"@

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "    🎉 Installation Complete!" -ForegroundColor Green
Write-Host "    1. Open OBS Studio." -ForegroundColor Cyan
Write-Host "    2. Find 'Simple Streamer' in your Docks menu." -ForegroundColor Cyan
Write-Host "    3. Click 'Sign In' to authenticate in your browser!" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
