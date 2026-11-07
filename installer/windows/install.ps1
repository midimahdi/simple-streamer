# ==============================================================================
# Simple Streamer - 1-Click Installer for OBS Studio (Windows PowerShell)
# ==============================================================================
# 1. Configures OBS Custom Browser Dock automatically in user.ini.
# 2. Ensures OBS WebSocket v5 is enabled.
# 3. Compiles and starts the zero-dependency background bridge on port 45455.
# ==============================================================================

$ErrorActionPreference = "Stop"

$ObsDir = "$env:APPDATA\obs-studio"
$UserIni = "$ObsDir\user.ini"
$DockTitle = "Simple Streamer"
$DockUrl = "https://simple-streamer.bdjlmn.com"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    Simple Streamer - Automatic 1-Click Installer" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check if OBS is running
$obsProc = Get-Process -Name "obs64", "obs32" -ErrorAction SilentlyContinue
if ($obsProc) {
    Write-Host "[!] OBS Studio is currently running." -ForegroundColor Yellow
    $ans = Read-Host "    Close OBS Studio now to apply settings? [Y/n]"
    if ([string]::IsNullOrWhiteSpace($ans) -or $ans -eq "y" -or $ans -eq "Y" -or $ans -eq "o" -or $ans -eq "O") {
        Stop-Process -Name "obs64", "obs32" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "    [OK] OBS Studio closed." -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Please close OBS Studio and run this installer again." -ForegroundColor Red
        Exit 1
    }
}

# 2. Ensure OBS directory and configuration exist
if (-not (Test-Path $ObsDir)) {
    New-Item -ItemType Directory -Path $ObsDir -Force | Out-Null
}

Write-Host "[*] Configuring OBS Custom Browser Dock..." -ForegroundColor Cyan

if (Test-Path $UserIni) {
    $content = Get-Content $UserIni -Raw -Encoding utf8
    $pattern = 'ExtraBrowserDocks=(.*)'
    if ($content -match $pattern) {
        $rawJson = $matches[1].Trim()
        $docks = @()
        if ($rawJson -and $rawJson -ne "[]") {
            try { $docks = ConvertFrom-Json $rawJson } catch { $docks = @() }
        }
        $existing = $docks | Where-Object { $_.title -eq $DockTitle }
        if ($existing) {
            $existing.url = $DockUrl
        } else {
            $docks += [PSCustomObject]@{ title = $DockTitle; url = $DockUrl }
        }
        $newJson = ConvertTo-Json -Compress @($docks)
        $content = $content.Replace($matches[0], "ExtraBrowserDocks=$newJson")
        Set-Content -Path $UserIni -Value $content -Encoding utf8
        Write-Host "    [OK] Simple Streamer dock configured in OBS Studio." -ForegroundColor Green
    } else {
        $newJson = ConvertTo-Json -Compress @([PSCustomObject]@{ title = $DockTitle; url = $DockUrl })
        $newLine = "ExtraBrowserDocks=$newJson"
        if ($content -match '\[BasicWindow\]') {
            $content = $content -replace '\[BasicWindow\]', "[BasicWindow]`r`n$newLine"
        } else {
            $content = $content + "`r`n[BasicWindow]`r`n$newLine`r`n"
        }
        Set-Content -Path $UserIni -Value $content -Encoding utf8
        Write-Host "    [OK] Added Simple Streamer dock to OBS Studio." -ForegroundColor Green
    }
} else {
    $newJson = ConvertTo-Json -Compress @([PSCustomObject]@{ title = $DockTitle; url = $DockUrl })
    $initialContent = "[BasicWindow]`r`nExtraBrowserDocks=$newJson`r`n"
    Set-Content -Path $UserIni -Value $initialContent -Encoding utf8
    Write-Host "    [OK] Initialized OBS configuration with Simple Streamer dock." -ForegroundColor Green
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
    Write-Host "    [OK] Initialized OBS WebSocket configuration (port 4455, enabled)." -ForegroundColor Green
} else {
    try {
        $wsData = Get-Content $wsConfigFile -Raw | ConvertFrom-Json
        if (-not $wsData.server_enabled) {
            $wsData.server_enabled = $true
            $wsData | ConvertTo-Json | Set-Content -Path $wsConfigFile -Encoding utf8
            Write-Host "    [OK] Enabled OBS WebSocket server in config." -ForegroundColor Green
        }
    } catch {}
}

# 3. Create native background bridge (Port 45455)
$BridgeDir = "$env:LOCALAPPDATA\SimpleStreamer"
if (-not (Test-Path $BridgeDir)) { New-Item -ItemType Directory -Path $BridgeDir -Force | Out-Null }
$BridgeExe = "$BridgeDir\SimpleStreamerBridge.exe"
$SourceFile = "$BridgeDir\Bridge.cs"
$PsBridgeFile = "$BridgeDir\bridge.ps1"

# Stop existing bridge if running
Get-Process -Name "SimpleStreamerBridge" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

$BridgeSource = @'
using System;
using System.IO;
using System.Net;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

class SimpleStreamerBridge {
    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr hWnd);

    static void Main() {
        HttpListener listener = new HttpListener();
        try {
            listener.Prefixes.Add("http://127.0.0.1:45455/");
            listener.Start();
        } catch {
            return;
        }

        while (true) {
            try {
                HttpListenerContext ctx = listener.GetContext();
                HttpListenerRequest req = ctx.Request;
                HttpListenerResponse res = ctx.Response;

                res.AddHeader("Access-Control-Allow-Origin", "*");
                res.AddHeader("Access-Control-Allow-Private-Network", "true");
                res.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                res.AddHeader("Access-Control-Allow-Headers", "*");

                if (req.HttpMethod == "OPTIONS") {
                    res.StatusCode = 200;
                    res.Close();
                    continue;
                }

                string path = req.Url.AbsolutePath.ToLower();
                byte[] responseBytes = Encoding.UTF8.GetBytes("{"status":"ok"}");

                if (path == "/open" || path == "/open-browser") {
                    string targetUrl = req.QueryString["url"];
                    if (!string.IsNullOrEmpty(targetUrl) && (targetUrl.StartsWith("http://") || targetUrl.StartsWith("https://"))) {
                        Process.Start(new ProcessStartInfo(targetUrl) { UseShellExecute = true });
                    }
                } else if (path == "/focus-obs") {
                    Process[] procs = Process.GetProcessesByName("obs64");
                    if (procs.Length == 0) procs = Process.GetProcessesByName("obs32");
                    if (procs.Length > 0 && procs[0].MainWindowHandle != IntPtr.Zero) {
                        SetForegroundWindow(procs[0].MainWindowHandle);
                    }
                } else if (path == "/obs-config") {
                    string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                    string cfg = Path.Combine(appData, "obs-studio", "plugin_config", "obs-websocket", "config.json");
                    if (File.Exists(cfg)) {
                        responseBytes = File.ReadAllBytes(cfg);
                    } else {
                        responseBytes = Encoding.UTF8.GetBytes("{"auth_required":false}");
                    }
                    res.ContentType = "application/json";
                } else if (path == "/save-destinations" && req.HttpMethod == "POST") {
                    string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                    string dir = Path.Combine(appData, "obs-studio", "plugin_config", "simple-streamer");
                    Directory.CreateDirectory(dir);
                    string destFile = Path.Combine(dir, "config.json");
                    using (FileStream fs = File.Create(destFile)) {
                        req.InputStream.CopyTo(fs);
                    }
                } else if (path == "/save-secondary") {
                    string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                    string dir = Path.Combine(appData, "obs-studio", "plugin_config", "simple-streamer");
                    Directory.CreateDirectory(dir);
                    string enabled = req.QueryString["enabled"] == "1" ? "true" : "false";
                    string server = req.QueryString["server"] ?? "";
                    string key = req.QueryString["key"] ?? "";
                    string json = string.Format("{{"enabled":{0},"server":"{1}","key":"{2}"}}", enabled, server, key);
                    File.WriteAllText(Path.Combine(dir, "config.json"), json, Encoding.UTF8);
                }

                res.ContentType = res.ContentType ?? "application/json";
                res.ContentLength64 = responseBytes.Length;
                res.OutputStream.Write(responseBytes, 0, responseBytes.Length);
                res.Close();
            } catch {}
        }
    }
}
'@

Set-Content -Path $SourceFile -Value $BridgeSource -Encoding utf8

$compiled = $false
try {
    Add-Type -TypeDefinition $BridgeSource -OutputAssembly $BridgeExe -OutputType WindowsApplication -ErrorAction Stop
    $compiled = $true
} catch {
    $csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
    if (Test-Path $csc) {
        & $csc /nologo /target:winexe /out:"$BridgeExe" "$SourceFile" 2>$null
        if (Test-Path $BridgeExe) { $compiled = $true }
    }
}

if ($compiled -and (Test-Path $BridgeExe)) {
    try {
        Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "SimpleStreamerBridge" -Value "`"$BridgeExe`"" -Force
    } catch {}

    Start-Process -FilePath $BridgeExe
    Write-Host "    [OK] Native background bridge started on port 45455." -ForegroundColor Green
} else {
    # Fail-safe PowerShell bridge fallback
    $PsBridgeContent = @'
$listener = New-Object System.Net.HttpListener
try {
    $listener.Prefixes.Add("http://127.0.0.1:45455/")
    $listener.Start()
} catch { exit }

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        $res.AddHeader("Access-Control-Allow-Origin", "*")
        $res.AddHeader("Access-Control-Allow-Private-Network", "true")
        $res.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $res.AddHeader("Access-Control-Allow-Headers", "*")

        if ($req.HttpMethod -eq "OPTIONS") {
            $res.StatusCode = 200
            $res.Close()
            continue
        }

        $path = $req.Url.AbsolutePath.ToLower()
        if ($path -eq "/open" -or $path -eq "/open-browser") {
            $targetUrl = $req.QueryString["url"]
            if ($targetUrl -and ($targetUrl.StartsWith("http://") -or $targetUrl.StartsWith("https://"))) {
                [System.Diagnostics.Process]::Start($targetUrl)
            }
        }

        $buf = [System.Text.Encoding]::UTF8.GetBytes('{"status":"ok"}')
        $res.ContentType = "application/json"
        $res.ContentLength64 = $buf.Length
        $res.OutputStream.Write($buf, 0, $buf.Length)
        $res.Close()
    } catch {}
}
'@
    Set-Content -Path $PsBridgeFile -Value $PsBridgeContent -Encoding utf8
    Start-Process powershell.exe -ArgumentList "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$PsBridgeFile`""
    Write-Host "    [OK] PowerShell background bridge started on port 45455." -ForegroundColor Green
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "    Installation Complete!" -ForegroundColor Green
Write-Host "    1. Open OBS Studio." -ForegroundColor Cyan
Write-Host "    2. Find 'Simple Streamer' in your Docks menu." -ForegroundColor Cyan
Write-Host "    3. Click 'Sign In' to connect your channels!" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
