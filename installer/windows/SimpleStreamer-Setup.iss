; ==============================================================================
; Simple Streamer — Inno Setup Script (Compiles to SimpleStreamer-Setup.exe)
; ==============================================================================
[Setup]
AppName=Simple Streamer
AppVersion=1.0.0
DefaultDirName={localappdata}\SimpleStreamer
DefaultGroupName=Simple Streamer
OutputDir=dist
OutputBaseFilename=SimpleStreamer-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
DisableDirPage=yes
DisableProgramGroupPage=yes

[Files]
Source: "install.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install.ps1"""; Flags: runhidden waituntilterminated
