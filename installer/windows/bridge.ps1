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
$listener.Prefixes.Add("http://localhost:45455/")

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

$started = $false
try {
    $listener.Start()
    $started = $true
} catch {
    # If starting with wildcard or LAN IP failed (e.g. non-admin boot without URL ACL),
    # gracefully fall back to loopback-only which never requires elevation or URL ACL on Windows.
    try { $listener.Close() } catch {}
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://127.0.0.1:45455/")
    $listener.Prefixes.Add("http://localhost:45455/")
    try {
        $listener.Start()
        $started = $true
    } catch {}
}

if (-not $started) { exit }

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
            $res.ContentType = "application/json; charset=utf-8"
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/save-title") {
            $title = $null
            $desc = $null

            if ($req.HttpMethod -eq "POST" -or $req.HasEntityBody) {
                try {
                    $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $bJson = $body | ConvertFrom-Json
                    if ($null -ne $bJson.title) { $title = [string]$bJson.title }
                    if ($null -ne $bJson.description) { $desc = [string]$bJson.description }
                } catch {}
            }

            if ($null -eq $title -and $req.Url.Query) {
                try {
                    $rawQuery = $req.Url.Query.TrimStart('?')
                    $pairs = $rawQuery.Split('&')
                    foreach ($pair in $pairs) {
                        $parts = $pair.Split('=', 2)
                        if ($parts.Length -eq 2) {
                            $k = [System.Net.WebUtility]::UrlDecode($parts[0])
                            $v = [System.Net.WebUtility]::UrlDecode($parts[1])
                            if ($k -eq "title") { $title = $v }
                            if ($k -eq "description") { $desc = $v }
                        }
                    }
                } catch {}
            }

            $bState = Get-BroadcastState
            $changed = $false
            if ($null -ne $title) {
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
            $res.ContentType = "application/json; charset=utf-8"
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
            $res.StatusCode = 302
            $res.AddHeader("Location", "https://simple-streamer.bdjlmn.com/dock")
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
