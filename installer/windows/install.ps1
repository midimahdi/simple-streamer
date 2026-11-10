# Simple Streamer Windows Installer (PowerShell)
# Requires PowerShell 5.1+ (Built-in on Windows 10/11)

$ErrorActionPreference = "Stop"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "      SIMPLE STREAMER - OBS STUDIO INSTALLER" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check if OBS Studio is running
$obsProc = Get-Process -Name "obs64" -ErrorAction SilentlyContinue
if ($obsProc) {
    Write-Host "[!] OBS Studio is currently running." -ForegroundColor Yellow
    Write-Host "    Closing OBS Studio to register docks safely..." -ForegroundColor Yellow
    Stop-Process -Name "obs64" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# 2. Check OBS Config Directory
$ObsDir = "$env:APPDATA\obs-studio"
if (-not (Test-Path $ObsDir)) {
    Write-Host "[!] OBS Studio config directory not found at:" $ObsDir -ForegroundColor Red
    Write-Host "    Please launch OBS Studio at least once and run this installer again." -ForegroundColor Yellow
    exit 1
}

# 3. Register Custom Browser Dock
$DockName = "Simple Streamer"
$DockUrl = "https://simple-streamer.bdjlmn.com/dock"

function Set-ObsDockConfig($file) {
    if (-not (Test-Path $file)) { return }
    $content = Get-Content $file -Raw -Encoding utf8
    if ($content -notmatch '\[ExtraBrowserDocks\]') {
        $content += "`r`n[ExtraBrowserDocks]`r`n"
    }
    if ($content -match 'ExtraBrowserDocks') {
        if ($content -notmatch 'Simple Streamer') {
            $lines = $content -split "`r?`n"
            $newLines = @()
            $inSection = $false
            $added = $false
            foreach ($line in $lines) {
                $newLines += $line
                if ($line -match '^\[ExtraBrowserDocks\]') {
                    $inSection = $true
                    continue
                }
                if ($inSection -and ($line -match '^\[.*\]' -or [string]::IsNullOrWhiteSpace($line)) -and (-not $added)) {
                    $newLines = $newLines[0..($newLines.Count - 2)]
                    $newLines += "titles=`"$DockName`""
                    $newLines += "urls=`"$DockUrl`""
                    $newLines += $line
                    $added = $true
                    $inSection = $false
                }
            }
            if (-not $added) {
                $newLines += "titles=`"$DockName`""
                $newLines += "urls=`"$DockUrl`""
            }
            $content = $newLines -join "`r`n"
            [System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
        }
    }
}

Set-ObsDockConfig "$ObsDir\global.ini"
Set-ObsDockConfig "$ObsDir\user.ini"
Write-Host "    [OK] Simple Streamer dock registered (compatible with OBS 28-31+)." -ForegroundColor Green

# 4. Ensure OBS WebSocket server is enabled with zero auth on localhost
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
    Write-Host "    [OK] Initialized zero-auth OBS WebSocket configuration (port 4455)." -ForegroundColor Green
} else {
    try {
        $wsData = Get-Content $wsConfigFile -Raw | ConvertFrom-Json
        $dirty = $false
        if (-not $wsData.server_enabled) { $wsData.server_enabled = $true; $dirty = $true }
        if ($wsData.auth_required) { $wsData.auth_required = $false; $dirty = $true }
        if ($wsData.server_password -ne "") { $wsData.server_password = ""; $dirty = $true }
        if ($dirty) {
            $wsData | ConvertTo-Json | Set-Content -Path $wsConfigFile -Encoding utf8
            Write-Host "    [OK] Configured zero-auth localhost OBS WebSocket." -ForegroundColor Green
        }
    } catch {}
}

# 5. Set up Native Background Bridge (Port 45455)
$BridgeDir = "$env:LOCALAPPDATA\SimpleStreamer"
if (-not (Test-Path $BridgeDir)) { New-Item -ItemType Directory -Path $BridgeDir -Force | Out-Null }
$BridgePsFile = "$BridgeDir\bridge.ps1"

# Stop any running bridge process
try {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*bridge.ps1*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}

# Clean up legacy VBS launcher if present
$OldVbs = "$BridgeDir\bridge.vbs"
if (Test-Path $OldVbs) { Remove-Item $OldVbs -Force -ErrorAction SilentlyContinue }

$BridgeCode = @'
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

        $path = $req.Url.AbsolutePath

        if ($path -eq "/focus-obs") {
            try {
                $ws = New-Object -ComObject WScript.Shell
                $ws.AppActivate("OBS") | Out-Null
            } catch {}
            $buf = [System.Text.Encoding]::UTF8.GetBytes("{\`"ok\`":true}")
            $res.ContentType = "application/json"
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/obs-config") {
            $obsWs = "$env:APPDATA\obs-studio\plugin_config\obs-websocket\config.json"
            $json = "{}"
            if (Test-Path $obsWs) { $json = [System.IO.File]::ReadAllText($obsWs, [System.Text.Encoding]::UTF8) }
            $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = "application/json"
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/save-destinations" -and $req.HttpMethod -eq "POST") {
            $d = "$env:APPDATA\obs-studio\plugin_config\simple-streamer"
            if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            [System.IO.File]::WriteAllText("$d\config.json", $body, [System.Text.Encoding]::UTF8)
            $buf = [System.Text.Encoding]::UTF8.GetBytes("{\`"ok\`":true}")
            $res.ContentType = "application/json"
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/save-secondary") {
            $d = "$env:APPDATA\obs-studio\plugin_config\simple-streamer"
            if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
            $en = if ($req.QueryString["enabled"] -eq "1") { "true" } else { "false" }
            $srv = $req.QueryString["server"]
            $k = $req.QueryString["key"]
            $json = "{\`"enabled\`":$en,\`"armed\`":$en,\`"server\`":\`"$srv\`",\`"key\`":\`"$k\`"}"
            [System.IO.File]::WriteAllText("$d\config.json", $json, [System.Text.Encoding]::UTF8)
        }

        $buf = [System.Text.Encoding]::UTF8.GetBytes("{\`"ok\`":true}")
        $res.ContentType = "application/json"
        $res.OutputStream.Write($buf, 0, $buf.Length)
        $res.Close()
    } catch {
        try { $res.Close() } catch {}
    }
}
'@
[System.IO.File]::WriteAllText($BridgePsFile, $BridgeCode, [System.Text.Encoding]::UTF8)

# Create 100% Native Windows Startup Shortcut (Powershell -WindowStyle Hidden directly)
$StartupDir = [Environment]::GetFolderPath('Startup')
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$StartupDir\SimpleStreamerBridge.lnk")
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$BridgePsFile`""
$Shortcut.WindowStyle = 7
$Shortcut.Description = "Simple Streamer OBS Bridge"
$Shortcut.Save()

# Launch bridge directly right now (invisible)
Start-Process "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$BridgePsFile`"" -WindowStyle Hidden -ErrorAction SilentlyContinue
Write-Host "    [OK] Background bridge installed and running on port 45455." -ForegroundColor Green

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  [SUCCESS] Simple Streamer setup completed!" -ForegroundColor Green
Write-Host "  Launch OBS Studio and check Docks -> Simple Streamer." -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
