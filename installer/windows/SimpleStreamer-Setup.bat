@echo off
:: ==============================================================================
:: Simple Streamer — 1-Click Double-Click Installer for Windows
:: ==============================================================================
title Simple Streamer Installer
echo Running Simple Streamer Setup...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause
