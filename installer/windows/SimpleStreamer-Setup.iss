; ==============================================================================
; Simple Streamer — Inno Setup Script (Compiles to SimpleStreamer-Setup.exe)
; ==============================================================================
[Setup]
AppName=Simple Streamer
AppVersion=2.2.0
DefaultDirName={localappdata}\SimpleStreamer
DefaultGroupName=Simple Streamer
OutputDir=..\..\dist
OutputBaseFilename=SimpleStreamer-Setup
Compression=lzma2/max
SolidCompression=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DisableDirPage=yes
DisableProgramGroupPage=yes
ArchitecturesInstallIn64BitMode=x64
WizardStyle=modern

[Files]
Source: "install.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "bridge.ps1"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "SimpleStreamer-Setup.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\dock\*"; DestDir: "{app}\dock"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\dock\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\plugin\build\x64\simple-streamer.dll"; DestDir: "{app}\plugin\64bit"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\..\plugin\build\x64\simple-streamer.dll"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install.ps1"""; StatusMsg: "Configuring OBS Studio integration and background services..."; Flags: runhidden waituntilterminated

