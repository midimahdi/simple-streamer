@echo off
setlocal
title Simple Streamer Setup for OBS Studio

echo =======================================================
echo          SIMPLE STREAMER - SETUP WIZARD
echo =======================================================
echo.

set "DIR=%~dp0"
set "PS1=%DIR%install.ps1"

if not exist "%PS1%" (
    echo [*] Downloading installer script...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://raw.githubusercontent.com/midimahdi/simple-streamer/main/installer/windows/install.ps1', '%TEMP%\install.ps1')"
    set "PS1=%TEMP%\install.ps1"
)

if not exist "%PS1%" (
    echo [ERROR] Could not load install.ps1. Please ensure an internet connection is available or extract install.ps1 in the same folder.
    pause
    exit /b 1
)

echo [*] Running Simple Streamer setup...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%"

set "RET=%ERRORLEVEL%"
if exist "%TEMP%\install.ps1" del /f /q "%TEMP%\install.ps1" 2>nul

echo.
if "%RET%"=="0" (
    echo =======================================================
    echo   [SUCCESS] Setup completed!
    echo   Launch OBS Studio and check Docks -^> Simple Streamer.
    echo =======================================================
) else (
    echo [ERROR] Setup encountered an issue (Code: %RET%).
)

pause
