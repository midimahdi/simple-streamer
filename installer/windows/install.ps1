$ErrorActionPreference = "Stop"

$ObsDir = "$env:APPDATA\obs-studio"
$DockTitle = "Simple Streamer"
$DockUrl = "https://simple-streamer.bdjlmn.com"
$DockUuid = "1a0d6a153e5746ecb4f9685f62a6eb05"

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

# 2. Ensure OBS directory exists
if (-not (Test-Path $ObsDir)) {
    New-Item -ItemType Directory -Path $ObsDir -Force | Out-Null
}

Write-Host "[*] Configuring OBS Custom Browser Dock..." -ForegroundColor Cyan

# 3. Helper to inject dock into an ini file (supports global.ini for OBS <=29 and user.ini for OBS >=30)
function Set-ObsDockConfig($iniPath) {
    $dockObj = @{ title = $DockTitle; url = $DockUrl; uuid = $DockUuid }
    if (Test-Path $iniPath) {
        $content = Get-Content $iniPath -Raw -Encoding utf8
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
                $existing.uuid = $DockUuid
            } else {
                $docks += [PSCustomObject]$dockObj
            }
            $newJson = ConvertTo-Json -Compress @($docks)
            $content = $content.Replace($matches[0], "ExtraBrowserDocks=$newJson")
        } else {
            $newJson = ConvertTo-Json -Compress @([PSCustomObject]$dockObj)
            $newLine = "ExtraBrowserDocks=$newJson"
            if ($content -match '\[BasicWindow\]') {
                $content = $content.Replace('[BasicWindow]', "[BasicWindow]`r`n$newLine")
            } else {
                $content = $content + "`r`n[BasicWindow]`r`n$newLine`r`n"
            }
        }
        Set-Content -Path $iniPath -Value $content -Encoding utf8
    } else {
        $newJson = ConvertTo-Json -Compress @([PSCustomObject]$dockObj)
        $initialContent = "[BasicWindow]`r`nExtraBrowserDocks=$newJson`r`n"
        Set-Content -Path $iniPath -Value $initialContent -Encoding utf8
    }
}

# Inject into both global.ini (OBS 28/29) and user.ini (OBS 30+)
Set-ObsDockConfig "$ObsDir\global.ini"
Set-ObsDockConfig "$ObsDir\user.ini"
Write-Host "    [OK] Simple Streamer dock registered (compatible with OBS 28, 29, and 30+)." -ForegroundColor Green

# 4. Ensure OBS WebSocket server is enabled (port 4455)
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

# 5. Set up Native Background Bridge (Port 45455)
$BridgeDir = "$env:LOCALAPPDATA\SimpleStreamer"
if (-not (Test-Path $BridgeDir)) { New-Item -ItemType Directory -Path $BridgeDir -Force | Out-Null }
$BridgePsFile = "$BridgeDir\bridge.ps1"
$BridgeVbsFile = "$BridgeDir\bridge.vbs"

# Stop existing bridge if running (safe for PS 5.1 and PS 7+)
try {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*bridge.ps1*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}
Start-Sleep -Milliseconds 300

# Write pure PowerShell bridge
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

        $path = $req.Url.AbsolutePath.ToLower()
        if ($path -eq "/open" -or $path -eq "/open-browser") {
            $u = $req.QueryString["url"]
            if ($u -and ($u.StartsWith("http://") -or $u.StartsWith("https://"))) {
                $psi = New-Object System.Diagnostics.ProcessStartInfo
                $psi.FileName = $u
                $psi.UseShellExecute = $true
                [System.Diagnostics.Process]::Start($psi) | Out-Null
            }
        } elseif ($path -eq "/obs-config") {
            $f = "$env:APPDATA\obs-studio\plugin_config\obs-websocket\config.json"
            $b = if (Test-Path $f) { [System.IO.File]::ReadAllBytes($f) } else { [System.Text.Encoding]::UTF8.GetBytes('{"auth_required":false}') }
            $res.ContentType = "application/json"
            $res.ContentLength64 = $b.Length
            $res.OutputStream.Write($b, 0, $b.Length)
            $res.Close()
            continue
        } elseif ($path -eq "/save-destinations" -and $req.HttpMethod -eq "POST") {
            $d = "$env:APPDATA\obs-studio\plugin_config\simple-streamer"
            if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
            $s = [System.IO.File]::Create("$d\config.json")
            $req.InputStream.CopyTo($s)
            $s.Close()
        } elseif ($path -eq "/save-secondary") {
            $d = "$env:APPDATA\obs-studio\plugin_config\simple-streamer"
            if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
            $en = if ($req.QueryString["enabled"] -eq "1") { "true" } else { "false" }
            $srv = $req.QueryString["server"]
            $k = $req.QueryString["key"]
            $json = "{`"enabled`":$en,`"server`":`"$srv`",`"key`":`"$k`"}"
            [System.IO.File]::WriteAllText("$d\config.json", $json, [System.Text.Encoding]::UTF8)
        }

        $b = [System.Text.Encoding]::UTF8.GetBytes('{"status":"ok"}')
        $res.ContentType = "application/json"
        $res.ContentLength64 = $b.Length
        $res.OutputStream.Write($b, 0, $b.Length)
        $res.Close()
    } catch {}
}
'@
Set-Content -Path $BridgePsFile -Value $BridgeCode -Encoding utf8

# Create silent VBScript background launcher
$VbsCode = "CreateObject(`"Wscript.Shell`").Run `"powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"`"$BridgePsFile`"`"`", 0, False"
Set-Content -Path $BridgeVbsFile -Value $VbsCode -Encoding ascii

# Register in Windows Startup
try {
    Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "SimpleStreamerBridge" -Value "wscript.exe `"$BridgeVbsFile`"" -Force
} catch {}

# Start bridge process silently
Start-Process wscript.exe -ArgumentList "`"$BridgeVbsFile`""
Write-Host "    [OK] Background bridge running on port 45455." -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "    Installation Complete!" -ForegroundColor Green
Write-Host "    1. Open OBS Studio." -ForegroundColor Cyan
Write-Host "    2. Find 'Simple Streamer' in your Docks menu." -ForegroundColor Cyan
Write-Host "    3. Click 'Sign In' to connect your channels!" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
