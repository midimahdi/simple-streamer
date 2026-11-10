@echo off
setlocal EnableExtensions
title Simple Streamer Setup for OBS Studio

echo =======================================================
echo          SIMPLE STREAMER - SETUP WIZARD
echo =======================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "LOCAL_PS1=%SCRIPT_DIR%install.ps1"
set "TARGET_PS1=%LOCAL_PS1%"

:: Always pull the latest installer from GitHub if network is available
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { (New-Object Net.WebClient).DownloadFile('https://raw.githubusercontent.com/midimahdi/simple-streamer/main/installer/windows/install.ps1', '%TEMP%\SimpleStreamer_install.ps1'); exit 0 } catch { exit 1 }" >nul 2>&1

if exist "%TEMP%\SimpleStreamer_install.ps1" (
    set "TARGET_PS1=%TEMP%\SimpleStreamer_install.ps1"
) else (
    if not exist "%LOCAL_PS1%" (
        echo [ERROR] Could not find or download install.ps1.
        pause
        exit /b 1
    )
)

echo [*] Running Simple Streamer setup...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TARGET_PS1%"

set "RET=%ERRORLEVEL%"
if exist "%TEMP%\SimpleStreamer_install.ps1" del /f /q "%TEMP%\SimpleStreamer_install.ps1" >nul 2>&1

echo.
if "%RET%"=="0" (
    echo =======================================================
    echo   [SUCCESS] Setup finished successfully!
    echo   Open OBS Studio and find 'Simple Streamer' under Docks.
    echo =======================================================
) else (
    echo [ERROR] Setup encountered an issue (Exit Code: %RET%).
)

pause
exit /b %RET%
