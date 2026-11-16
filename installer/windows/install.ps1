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
$DockUrl = "http://127.0.0.1:45455/dock"

function Set-ObsDockConfig($file) {
    if (-not (Test-Path $file)) { return }
    $content = Get-Content $file -Raw -Encoding utf8

    # 1. Migrate legacy remote URLs
    if ($content -match 'https://simple-streamer\.bdjlmn\.com/dock') {
        $content = $content -replace 'https://simple-streamer\.bdjlmn\.com/dock', $DockUrl
    }

    # 2. Configure Modern OBS 28-31+ format (JSON string under [BasicWindow])
    $dockEntry = @{
        title = $DockName
        url   = $DockUrl
    }

    if ($content -match '(?m)^ExtraBrowserDocks=(.*)$') {
        $rawJson = $matches[1].Trim()
        $docks = @()
        try {
            $parsed = $rawJson | ConvertFrom-Json
            if ($parsed -is [System.Collections.IEnumerable] -and $parsed -isnot [string]) {
                $docks = @($parsed)
            } elseif ($parsed) {
                $docks = @($parsed)
            }
        } catch {
            $docks = @()
        }

        $found = $false
        foreach ($d in $docks) {
            if ($d.title -eq $DockName) {
                $d.url = $DockUrl
                $found = $true
            }
        }
        if (-not $found) {
            $docks += $dockEntry
        }

        $newJson = $docks | ConvertTo-Json -Compress
        if (-not $newJson.Trim().StartsWith("[")) {
            $newJson = "[$newJson]"
        }
        $content = [System.Text.RegularExpressions.Regex]::Replace($content, '(?m)^ExtraBrowserDocks=.*$', "ExtraBrowserDocks=$newJson")
    } else {
        $newEntry = "ExtraBrowserDocks=[{`"title`":`"$DockName`",`"url`":`"$DockUrl`"}]"
        if ($content -match '(?m)^\[BasicWindow\]') {
            $content = [System.Text.RegularExpressions.Regex]::Replace($content, '(?m)^\[BasicWindow\]', "[BasicWindow]`r`n$newEntry")
        } else {
            $content += "`r`n[BasicWindow]`r`n$newEntry`r`n"
        }
    }

    [System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
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

# 5. Install Native Multi-Output Plugin (simple-streamer.dll)
$UserPluginDir = "$ObsDir\plugins\simple-streamer\bin\64bit"
if (-not (Test-Path $UserPluginDir)) { New-Item -ItemType Directory -Path $UserPluginDir -Force | Out-Null }

$localDll = $null
if ($PSScriptRoot) {
    if (Test-Path (Join-Path $PSScriptRoot "plugin\64bit\simple-streamer.dll")) {
        $localDll = Join-Path $PSScriptRoot "plugin\64bit\simple-streamer.dll"
    } elseif (Test-Path (Join-Path $PSScriptRoot "simple-streamer.dll")) {
        $localDll = Join-Path $PSScriptRoot "simple-streamer.dll"
    } elseif (Test-Path (Join-Path $PSScriptRoot "..\..\plugin\build\x64\simple-streamer.dll")) {
        $localDll = Join-Path $PSScriptRoot "..\..\plugin\build\x64\simple-streamer.dll"
    }
}
$installedDll = "$UserPluginDir\simple-streamer.dll"

if ($localDll -and (Test-Path $localDll)) {
    Copy-Item -Path $localDll -Destination $installedDll -Force
    Write-Host "    [OK] Simple Streamer native plugin installed from local bundle." -ForegroundColor Green
} else {
    try {
        $dllUrl = "https://github.com/midimahdi/simple-streamer/releases/latest/download/simple-streamer.dll"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $dllUrl -OutFile $installedDll -UseBasicParsing -TimeoutSec 15
        Write-Host "    [OK] Simple Streamer native plugin downloaded and installed." -ForegroundColor Green
    } catch {
        Write-Host "    [!] Could not download native plugin binary. Multi-streaming will fall back to bridge." -ForegroundColor Yellow
    }
}

$ProgFilesPluginDir = "C:\Program Files\obs-studio\obs-plugins\64bit"
if ((Test-Path $installedDll) -and (Test-Path $ProgFilesPluginDir)) {
    try {
        Copy-Item -Path $installedDll -Destination "$ProgFilesPluginDir\simple-streamer.dll" -Force -ErrorAction SilentlyContinue
    } catch {}
}

# 6. Set up Native Background Bridge (Port 45455)
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

# Configure Windows Firewall and URL ACL for Mobile Remote Control
Write-Host "    Configuring Windows Firewall for Mobile Remote..." -ForegroundColor Cyan
try {
    netsh advfirewall firewall add rule name="Simple Streamer Services" dir=in action=allow protocol=TCP localport=4455,45455 profile=any | Out-Null
    netsh advfirewall firewall add rule name="Simple Streamer Discovery" dir=in action=allow protocol=UDP localport=45456 profile=any | Out-Null
    netsh http add urlacl url=http://+:45455/ user=Everyone | Out-Null
} catch {}

# Copy Mobile Remote Web UI & Dock assets to bridge directory & plugin config
$DockDir = $null
if ($PSScriptRoot) {
    if (Test-Path "$PSScriptRoot\..\..\dock") {
        $DockDir = "$PSScriptRoot\..\..\dock"
    } elseif (Test-Path "$PSScriptRoot\dock") {
        $DockDir = "$PSScriptRoot\dock"
    }
}
if (-not $DockDir -and (Test-Path "$BridgeDir\dock")) {
    $DockDir = "$BridgeDir\dock"
}
$PluginConfigDir = "$ObsDir\plugin_config\simple-streamer"
if (-not (Test-Path $PluginConfigDir)) { New-Item -ItemType Directory -Path $PluginConfigDir -Force | Out-Null }

if ($DockDir -and (Test-Path $DockDir)) {
    Copy-Item -Path "$DockDir\*" -Destination $BridgeDir -Recurse -Force
    Copy-Item -Path "$DockDir\*" -Destination $PluginConfigDir -Recurse -Force
    Write-Host "    [OK] Dock and Remote assets deployed from local bundle." -ForegroundColor Green
} else {
    Write-Host "    [!] Local dock bundle not found. Downloading assets from GitHub..." -ForegroundColor Cyan
    $files = @(
        "app.js", "locales.js", "index.html", "style.css", "obs-client.js",
        "remote.html", "manifest.json", "sw.js", "icon.svg",
        "icon-192.png", "icon-512.png", "vendor/qrcode.min.js"
    )
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $baseUrl = "https://raw.githubusercontent.com/midimahdi/simple-streamer/main/dock"
    foreach ($f in $files) {
        $destPath = "$BridgeDir\$f"
        $destDir = Split-Path $destPath
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        $obsDestPath = "$PluginConfigDir\$f"
        $obsDestDir = Split-Path $obsDestPath
        if (-not (Test-Path $obsDestDir)) { New-Item -ItemType Directory -Path $obsDestDir -Force | Out-Null }
        try {
            Invoke-WebRequest -Uri "$baseUrl/$f" -OutFile $destPath -UseBasicParsing -TimeoutSec 10
            Copy-Item -Path $destPath -Destination $obsDestPath -Force -ErrorAction SilentlyContinue
        } catch {}
    }
    Write-Host "    [OK] Dock and Remote assets downloaded and deployed." -ForegroundColor Green
}

$BridgeCode = @'
$BridgeDir = "$env:LOCALAPPDATA\SimpleStreamer"

function Get-BroadcastState {
    $bFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\broadcast_state.json"
    if (Test-Path $bFile) {
        try {
            $parsed = Get-Content $bFile -Raw -Encoding utf8 | ConvertFrom-Json
            if ($parsed) { return $parsed }
        } catch {}
    }
    return @{
        title = "Mosque Live Broadcast"
        description = "Weekly Lecture from Main Prayer Hall"
        destinations = @(
            @{ name = "YouTube"; platform = "youtube"; enabled = $true },
            @{ name = "Facebook Live"; platform = "facebook"; enabled = $true }
        )
    }
}

function Save-BroadcastState($stateObj) {
    $d = "$env:APPDATA\obs-studio\plugin_config\simple-streamer"
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    $bFile = "$d\broadcast_state.json"
    $json = $stateObj | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($bFile, $json, [System.Text.Encoding]::UTF8)
}

# Start background UDP discovery responder
try {
    $udpScript = {
        try {
            $udp = New-Object System.Net.Sockets.UdpClient(45456)
            $udp.EnableBroadcast = $true
            while ($true) {
                $ep = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
                $bytes = $udp.Receive([ref]$ep)
                $str = [System.Text.Encoding]::UTF8.GetString($bytes)
                if ($str -match "SIMPLE_STREAMER_DISCOVER") {
                    $resp = [System.Text.Encoding]::UTF8.GetBytes("SIMPLE_STREAMER_HERE:45455:4455")
                    $udp.Send($resp, $resp.Length, $ep) | Out-Null
                }
            }
        } catch {}
    }
    $runspace = [powershell]::Create().AddScript($udpScript)
    $runspace.BeginInvoke() | Out-Null
} catch {}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:45455/")

try {
    $ipObj = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi*','Ethernet*' -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.254\.' } | Select-Object -First 1
    if ($ipObj) {
        $localIp = $ipObj.IPAddress
        try { $listener.Prefixes.Add("http://$($localIp):45455/") } catch {}
    }
} catch {}

try {
    $listener.Prefixes.Add("http://+:45455/")
} catch {}
try {
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

        if ($path -eq "/open") {
            $targetUrl = $req.QueryString["url"]
            if ($targetUrl) {
                try {
                    $psi = New-Object System.Diagnostics.ProcessStartInfo
                    $psi.FileName = $targetUrl
                    $psi.UseShellExecute = $true
                    [System.Diagnostics.Process]::Start($psi) | Out-Null
                } catch {
                    try {
                        Start-Process -FilePath $targetUrl
                    } catch {
                        cmd.exe /c start "" "$targetUrl"
                    }
                }
            }
            $buf = [System.Text.Encoding]::UTF8.GetBytes("{\`"ok\`":true}")
            $res.ContentType = "application/json"
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

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
            $globalIni = "$env:APPDATA\obs-studio\global.ini"
            $obsWs = "$env:APPDATA\obs-studio\plugin_config\obs-websocket\config.json"
            $pass = ""
            $port = 4455

            if (Test-Path $globalIni) {
                try {
                    $txt = [System.IO.File]::ReadAllText($globalIni, [System.Text.Encoding]::UTF8)
                    if ($txt -match "ServerPassword=([^\r\n]+)") {
                        $pass = $matches[1]
                    }
                    if ($txt -match "ServerPort=(\d+)") {
                        $port = [int]$matches[1]
                    }
                } catch {}
            }

            if (-not $pass -and (Test-Path $obsWs)) {
                try {
                    $jsonObj = Get-Content $obsWs -Raw | ConvertFrom-Json
                    if ($jsonObj.server_password) { $pass = $jsonObj.server_password }
                    if ($jsonObj.server_port) { $port = $jsonObj.server_port }
                } catch {}
            }

            $respObj = @{
                server_password = $pass
                server_port = $port
                auth_required = [bool]$pass
            }
            $respJson = $respObj | ConvertTo-Json
            $buf = [System.Text.Encoding]::UTF8.GetBytes($respJson)
            $res.ContentType = "application/json"
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/remote" -or $path -eq "/remote.html") {
            $remoteFile = "$BridgeDir\remote.html"
            if (-not (Test-Path $remoteFile)) { $remoteFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\remote.html" }
            if (Test-Path $remoteFile) {
                $html = [System.IO.File]::ReadAllBytes($remoteFile)
                $res.ContentType = "text/html; charset=utf-8"
                $res.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")
                $res.AddHeader("Pragma", "no-cache")
                $res.OutputStream.Write($html, 0, $html.Length)
            } else {
                $res.StatusCode = 404
            }
            $res.Close()
            continue
        }

        if ($path -eq "/machine-id") {
            $midFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\machine_id.txt"
            $machineGuid = ""
            if (Test-Path $midFile) {
                try { $machineGuid = (Get-Content $midFile -Raw).Trim() } catch {}
            }
            if (-not $machineGuid -or $machineGuid.Length -lt 8) {
                try {
                    $machineGuid = (Get-CimInstance Win32_ComputerSystemProduct -ErrorAction SilentlyContinue).UUID
                } catch {}
                if (-not $machineGuid -or $machineGuid.Length -lt 8) {
                    $machineGuid = [System.Guid]::NewGuid().ToString()
                }
                try { [System.IO.File]::WriteAllText($midFile, $machineGuid, [System.Text.Encoding]::UTF8) } catch {}
            }
            $mResp = @{ ok = $true; machineId = $machineGuid; hwid = $machineGuid } | ConvertTo-Json
            $mBuf = [System.Text.Encoding]::UTF8.GetBytes($mResp)
            $res.ContentType = "application/json"
            $res.OutputStream.Write($mBuf, 0, $mBuf.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/remote-config") {
            $localIp = "127.0.0.1"
            try {
                $ipObj = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi*','Ethernet*' -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.254\.' } | Select-Object -First 1
                if ($ipObj) { $localIp = $ipObj.IPAddress }
            } catch {}

            $obsRunning = $false
            try {
                $tcp = New-Object System.Net.Sockets.TcpClient
                $iar = $tcp.BeginConnect("127.0.0.1", $port, $null, $null)
                $success = $iar.AsyncWaitHandle.WaitOne(200, $false)
                if ($success -and $tcp.Connected) {
                    $obsRunning = $true
                    $tcp.EndConnect($iar)
                }
                $tcp.Close()
            } catch {}

            $cfgFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\config.json"
            $bState = Get-BroadcastState
            $bTitle = if ($bState.title) { $bState.title } else { "Mosque Live Broadcast" }
            $bDesc = if ($bState.description) { $bState.description } else { "" }
            $bDest = if ($bState.destinations) { $bState.destinations } else { @() }
            if (Test-Path $cfgFile) {
                try {
                    $cObj = Get-Content $cfgFile -Raw | ConvertFrom-Json
                    if ($cObj.outputs) { $bDest = $cObj.outputs }
                } catch {}
            }

            $midFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\machine_id.txt"
            $machineGuid = ""
            if (Test-Path $midFile) {
                try { $machineGuid = (Get-Content $midFile -Raw).Trim() } catch {}
            }
            if (-not $machineGuid -or $machineGuid.Length -lt 8) {
                try {
                    $machineGuid = (Get-CimInstance Win32_ComputerSystemProduct -ErrorAction SilentlyContinue).UUID
                } catch {}
                if (-not $machineGuid -or $machineGuid.Length -lt 8) {
                    $machineGuid = [System.Guid]::NewGuid().ToString()
                }
                try { [System.IO.File]::WriteAllText($midFile, $machineGuid, [System.Text.Encoding]::UTF8) } catch {}
            }

            $authToken = ""
            $authFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\auth_token.txt"
            if (Test-Path $authFile) {
                try { $authToken = (Get-Content $authFile -Raw).Trim() } catch {}
            }

            $respObj = @{
                ok = $true
                obsOnline = $obsRunning
                machineName = if ($env:COMPUTERNAME) { $env:COMPUTERNAME } else { "Broadcasting Workstation" }
                machineId = $machineGuid
                hwid = $machineGuid
                authToken = $authToken
                bridgePort = 45455
                obsPort = $port
                hostIp = $localIp
                obsPass = $pass
                title = $bTitle
                description = $bDesc
                destinations = $bDest
            }
            $respJson = $respObj | ConvertTo-Json -Depth 5
            $buf = [System.Text.Encoding]::UTF8.GetBytes($respJson)
            $res.ContentType = "application/json"
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/save-title") {
            $title = $req.QueryString["title"]
            $desc = $req.QueryString["description"]

            if (-not $title -and $req.HttpMethod -eq "POST") {
                try {
                    $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $bJson = $body | ConvertFrom-Json
                    if ($bJson.title) { $title = $bJson.title }
                    if ($bJson.description) { $desc = $bJson.description }
                } catch {}
            }

            $bState = Get-BroadcastState
            $changed = $false
            if ($title) {
                if ($bState -is [PSCustomObject]) {
                    $bState.title = $title
                } else {
                    $bState["title"] = $title
                }
                $changed = $true
            }
            if ($null -ne $desc) {
                if ($bState -is [PSCustomObject]) {
                    $bState.description = $desc
                } else {
                    $bState["description"] = $desc
                }
                $changed = $true
            }
            if ($changed) {
                Save-BroadcastState $bState
            }

            $buf = [System.Text.Encoding]::UTF8.GetBytes("{\`"status\`":\`"ok\`"}")
            $res.ContentType = "application/json"
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/toggle-destination") {
            $destId = $req.QueryString["id"]
            $stateStr = $req.QueryString["enabled"]

            $bState = Get-BroadcastState
            $dests = if ($bState.destinations) { $bState.destinations } else { @() }
            $changed = $false

            foreach ($d in $dests) {
                $curId = if ($d -is [PSCustomObject]) { $d.id } else { $d["id"] }
                $curName = if ($d -is [PSCustomObject]) { $d.name } else { $d["name"] }
                $curPlatform = if ($d -is [PSCustomObject]) { $d.platform } else { $d["platform"] }

                if ($curId -eq $destId -or $curName -eq $destId -or $curPlatform -eq $destId) {
                    $curEn = if ($d -is [PSCustomObject]) { [bool]$d.enabled } else { [bool]$d["enabled"] }
                    $nextEn = if ($null -ne $stateStr) { ($stateStr -eq "1" -or $stateStr -eq "true") } else { -not $curEn }
                    if ($d -is [PSCustomObject]) {
                        $d.enabled = $nextEn
                    } else {
                        $d["enabled"] = $nextEn
                    }
                    $changed = $true
                }
            }

            if ($changed) {
                if ($bState -is [PSCustomObject]) {
                    $bState.destinations = $dests
                } else {
                    $bState["destinations"] = $dests
                }
                Save-BroadcastState $bState
            }

            $buf = [System.Text.Encoding]::UTF8.GetBytes("{\`"status\`":\`"ok\`"}")
            $res.ContentType = "application/json"
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/sync-destinations" -and $req.HttpMethod -eq "POST") {
            try {
                $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                $json = $body | ConvertFrom-Json
                if ($json.destinations) {
                    $bState = Get-BroadcastState
                    $curDests = if ($bState.destinations) { $bState.destinations } else { @() }
                    $changed = $false

                    foreach ($nd in $json.destinations) {
                        $nid = $nd.id
                        $nen = [bool]$nd.enabled
                        if (-not $nid) { continue }

                        foreach ($d in $curDests) {
                            $curId = if ($d -is [PSCustomObject]) { $d.id } else { $d["id"] }
                            if ($curId -eq $nid) {
                                $curEn = if ($d -is [PSCustomObject]) { [bool]$d.enabled } else { [bool]$d["enabled"] }
                                if ($curEn -ne $nen) {
                                    if ($d -is [PSCustomObject]) { $d.enabled = $nen } else { $d["enabled"] = $nen }
                                    $changed = $true
                                }
                            }
                        }
                    }

                    if ($changed) {
                        if ($bState -is [PSCustomObject]) { $bState.destinations = $curDests } else { $bState["destinations"] = $curDests }
                        Save-BroadcastState $bState
                    }
                }
            } catch {}

            $buf = [System.Text.Encoding]::UTF8.GetBytes("{\`"status\`":\`"ok\`"}")
            $res.ContentType = "application/json"
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/manifest.json") {
            $mFile = "$BridgeDir\manifest.json"
            if (-not (Test-Path $mFile)) { $mFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\manifest.json" }
            if (Test-Path $mFile) {
                $bytes = [System.IO.File]::ReadAllBytes($mFile)
            } else {
                $manifest = '{"id":"/remote","name":"Simple Streamer","short_name":"Streamer","start_url":"/remote","scope":"/","display":"standalone","background_color":"#0d0f12","theme_color":"#0d0f12","icons":[{"src":"/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any maskable"},{"src":"/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]}'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($manifest)
            }
            $res.ContentType = "application/manifest+json; charset=utf-8"
            $res.AddHeader("Cache-Control", "no-cache")
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/sw.js") {
            $swFile = "$BridgeDir\sw.js"
            if (-not (Test-Path $swFile)) { $swFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\sw.js" }
            if (Test-Path $swFile) {
                $bytes = [System.IO.File]::ReadAllBytes($swFile)
                $res.ContentType = "application/javascript; charset=utf-8"
                $res.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
            }
            $res.Close()
            continue
        }

        if ($path -eq "/icon-192.png" -or $path -eq "/icon-512.png") {
            $iconFile = "$BridgeDir$path"
            if (-not (Test-Path $iconFile)) { $iconFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer$path" }
            if (Test-Path $iconFile) {
                $bytes = [System.IO.File]::ReadAllBytes($iconFile)
                $res.ContentType = "image/png"
                $res.AddHeader("Cache-Control", "public, max-age=86400")
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
            }
            $res.Close()
            continue
        }

        if ($path -eq "/icon.svg") {
            $svgFile = "$BridgeDir\icon.svg"
            if (-not (Test-Path $svgFile)) { $svgFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\icon.svg" }
            if (Test-Path $svgFile) {
                $bytes = [System.IO.File]::ReadAllBytes($svgFile)
            } else {
                $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#10b981"/><polygon points="40,30 70,50 40,70" fill="#ffffff"/></svg>'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($svg)
            }
            $res.ContentType = "image/svg+xml"
            $res.AddHeader("Cache-Control", "public, max-age=86400")
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/dock" -or $path -eq "/dock/" -or $path -eq "/dock/index.html") {
            $dockFile = "$BridgeDir\index.html"
            if (-not (Test-Path $dockFile)) { $dockFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\index.html" }
            if (Test-Path $dockFile) {
                $bytes = [System.IO.File]::ReadAllBytes($dockFile)
                $res.ContentType = "text/html; charset=utf-8"
                $res.AddHeader("Cache-Control", "no-cache")
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
            }
            $res.Close()
            continue
        }

        if ($path -eq "/dock/locales.js" -or $path -eq "/locales.js") {
            $locFile = "$BridgeDir\locales.js"
            if (-not (Test-Path $locFile)) { $locFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\locales.js" }
            if (Test-Path $locFile) {
                $bytes = [System.IO.File]::ReadAllBytes($locFile)
                $res.ContentType = "application/javascript; charset=utf-8"
                $res.AddHeader("Cache-Control", "no-cache")
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
            }
            $res.Close()
            continue
        }

        if ($path -eq "/dock/app.js" -or $path -eq "/app.js") {
            $appFile = "$BridgeDir\app.js"
            if (-not (Test-Path $appFile)) { $appFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\app.js" }
            if (Test-Path $appFile) {
                $bytes = [System.IO.File]::ReadAllBytes($appFile)
                $res.ContentType = "application/javascript; charset=utf-8"
                $res.AddHeader("Cache-Control", "no-cache")
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
            }
            $res.Close()
            continue
        }

        if ($path -eq "/dock/obs-client.js" -or $path -eq "/obs-client.js") {
            $jsFile = "$BridgeDir\obs-client.js"
            if (-not (Test-Path $jsFile)) { $jsFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\obs-client.js" }
            if (Test-Path $jsFile) {
                $bytes = [System.IO.File]::ReadAllBytes($jsFile)
                $res.ContentType = "application/javascript; charset=utf-8"
                $res.AddHeader("Cache-Control", "no-cache")
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
            }
            $res.Close()
            continue
        }

        if ($path -match "qrcode(\.min)?\.js$") {
            $qrFile = "$BridgeDir\vendor\qrcode.min.js"
            if (-not (Test-Path $qrFile)) { $qrFile = "$BridgeDir\qrcode.min.js" }
            if (-not (Test-Path $qrFile)) { $qrFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\vendor\qrcode.min.js" }
            if (Test-Path $qrFile) {
                $bytes = [System.IO.File]::ReadAllBytes($qrFile)
                $res.ContentType = "application/javascript; charset=utf-8"
                $res.AddHeader("Cache-Control", "public, max-age=86400")
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
            }
            $res.Close()
            continue
        }

        if ($path -eq "/auth-challenge") {
            $salt = $req.QueryString["salt"]
            $challenge = $req.QueryString["challenge"]
            $sha = [System.Security.Cryptography.SHA256]::Create()
            $secretBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($pass + $salt))
            $secretBase64 = [Convert]::ToBase64String($secretBytes)
            $authBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($secretBase64 + $challenge))
            $authBase64 = [Convert]::ToBase64String($authBytes)
            $respObj = @{ authResponse = $authBase64 }
            $respJson = $respObj | ConvertTo-Json
            $buf = [System.Text.Encoding]::UTF8.GetBytes($respJson)
            $res.ContentType = "application/json"
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/save-auth") {
            $token = $req.QueryString["token"]
            if (-not $token -and $req.HttpMethod -eq "POST") {
                try {
                    $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
                    $bJson = $reader.ReadToEnd() | ConvertFrom-Json
                    if ($bJson.token) { $token = $bJson.token }
                } catch {}
            }
            if ($token) {
                $d = "$env:APPDATA\obs-studio\plugin_config\simple-streamer"
                if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
                try { [System.IO.File]::WriteAllText("$d\auth_token.txt", $token.Trim(), [System.Text.Encoding]::UTF8) } catch {}
                try {
                    $ws = New-Object -ComObject WScript.Shell
                    $ws.AppActivate("OBS") | Out-Null
                } catch {}
            }
            $buf = [System.Text.Encoding]::UTF8.GetBytes("{\`"ok\`":true}")
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
            try {
                $obj = $body | ConvertFrom-Json
                if ($null -eq $obj.armed -and $obj.outputs -and $obj.outputs.Count -gt 0) {
                    $obj | Add-Member -NotePropertyName "armed" -NotePropertyValue $true -Force
                    $body = $obj | ConvertTo-Json -Depth 10 -Compress
                }
            } catch {}
            [System.IO.File]::WriteAllText("$d\config.json", $body, [System.Text.Encoding]::UTF8)
            $buf = [System.Text.Encoding]::UTF8.GetBytes("{\`"ok\`":true}")
            $res.ContentType = "application/json"
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/save-state-destinations" -and $req.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            try {
                $obj = $body | ConvertFrom-Json
                if ($obj.destinations) {
                    $bState = Get-BroadcastState
                    if ($bState -is [PSCustomObject]) {
                        $bState.destinations = $obj.destinations
                    } else {
                        $bState["destinations"] = $obj.destinations
                    }
                    Save-BroadcastState $bState
                }
            } catch {}
            $buf = [System.Text.Encoding]::UTF8.GetBytes("{\`"status\`":\`"ok\`"}")
            $res.ContentType = "application/json"
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/dock/style.css" -or $path -eq "/style.css") {
            $cssFile = "$BridgeDir\style.css"
            if (-not (Test-Path $cssFile)) { $cssFile = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\style.css" }
            if (Test-Path $cssFile) {
                $bytes = [System.IO.File]::ReadAllBytes($cssFile)
                $res.ContentType = "text/css; charset=utf-8"
                $res.AddHeader("Cache-Control", "no-cache")
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
            }
            $res.Close()
            continue
        }

        # General static file fallback for all dock/remote assets
        $rel = $path.TrimStart('/')
        if ($rel.StartsWith("dock/")) { $rel = $rel.Substring(5) }
        $candidate = "$BridgeDir\$rel"
        if (-not (Test-Path $candidate)) { $candidate = "$env:APPDATA\obs-studio\plugin_config\simple-streamer\$rel" }
        if ((Test-Path $candidate) -and (-not (Test-Path $candidate -PathType Container))) {
            $bytes = [System.IO.File]::ReadAllBytes($candidate)
            $ext = [System.IO.Path]::GetExtension($candidate).ToLower()
            $mime = "application/octet-stream"
            switch ($ext) {
                ".html" { $mime = "text/html; charset=utf-8" }
                ".js"   { $mime = "application/javascript; charset=utf-8" }
                ".css"  { $mime = "text/css; charset=utf-8" }
                ".svg"  { $mime = "image/svg+xml" }
                ".png"  { $mime = "image/png" }
                ".jpg"  { $mime = "image/jpeg" }
                ".json" { $mime = "application/json; charset=utf-8" }
            }
            $res.ContentType = $mime
            $res.AddHeader("Cache-Control", "no-cache")
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
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
Write-Host "    [OK] Non-destructive stream settings preservation active." -ForegroundColor Green

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  [SUCCESS] Simple Streamer setup completed!" -ForegroundColor Green
Write-Host "  Launch OBS Studio and check Docks -> Simple Streamer." -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
