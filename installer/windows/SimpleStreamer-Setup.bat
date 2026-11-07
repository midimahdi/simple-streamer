@echo off
setlocal
chcp 65001 >nul 2>&1
title Simple Streamer Installer
echo ==========================================================
echo     Simple Streamer - Windows Installer
echo ==========================================================
echo.
echo Running Simple Streamer Setup...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
