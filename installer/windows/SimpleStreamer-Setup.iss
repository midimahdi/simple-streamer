; ==============================================================================
; Simple Streamer — Native Inno Setup Installer (Compiles to SimpleStreamer-Setup.exe)
; Zero hidden PowerShell spawning; native C bridge + native Inno Setup registration.
; ==============================================================================
[Setup]
AppId={{8D6B4A2E-5C3F-4B8E-9A1D-7E3F2B1A09C4}
AppName=Simple Streamer
AppVersion=2.2.0
AppVerName=Simple Streamer 2.2.0
AppPublisher=MAHDI DIGITAL LLC
AppPublisherURL=https://simple-streamer.bdjlmn.com
AppSupportURL=https://github.com/midimahdi/simple-streamer/issues
AppUpdatesURL=https://github.com/midimahdi/simple-streamer/releases/latest
VersionInfoVersion=2.2.0.0
VersionInfoCompany=MAHDI DIGITAL LLC
VersionInfoDescription=Simple Streamer Multi-Output Plugin & Control Dock Installer
DefaultDirName={localappdata}\SimpleStreamer
DefaultGroupName=Simple Streamer
OutputDir=..\..\dist
OutputBaseFilename=SimpleStreamer-Setup
Compression=lzma2/normal
SolidCompression=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DisableDirPage=yes
DisableProgramGroupPage=yes
ArchitecturesInstallIn64BitMode=x64
WizardStyle=modern
AppMutex=Local\SimpleStreamerBridgeMutex

[Files]
Source: "..\..\dist\simple-streamer-bridge.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\dock\*"; DestDir: "{app}\dock"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\dock\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\dock\*"; DestDir: "{userappdata}\obs-studio\plugin_config\simple-streamer"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\plugin\build\x64\simple-streamer.dll"; DestDir: "{userappdata}\obs-studio\plugins\simple-streamer\bin\64bit"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\..\plugin\build\x64\simple-streamer.dll"; DestDir: "{app}\plugin\64bit"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{userstartup}\Simple Streamer Bridge"; Filename: "{app}\simple-streamer-bridge.exe"; WorkingDir: "{app}"; Comment: "Simple Streamer Local Control Bridge"
Name: "{group}\Uninstall Simple Streamer"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\simple-streamer-bridge.exe"; Description: "Start Simple Streamer Local Bridge"; Flags: nowait postinstall skipifsilent
Filename: "{app}\simple-streamer-bridge.exe"; Flags: nowait skipifnotsilent

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/F /IM simple-streamer-bridge.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM obs64.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('wmic.exe', 'process where "name=''powershell.exe'' and commandline like ''%bridge.ps1%''" call terminate', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

procedure EnsureObsDockInIni(const IniPath: String);
var
  RawContent: AnsiString;
  Content, NewEntry: String;
  P: Integer;
begin
  if not FileExists(IniPath) then Exit;
  if not LoadStringFromFile(IniPath, RawContent) then Exit;
  Content := String(RawContent);

  if Pos('simple-streamer.bdjlmn.com/dock', Content) > 0 then Exit;

  if Pos('http://127.0.0.1:45455/dock', Content) > 0 then
  begin
    StringChangeEx(Content, 'http://127.0.0.1:45455/dock', 'https://simple-streamer.bdjlmn.com/dock', True);
    SaveStringToFile(IniPath, AnsiString(Content), False);
    Exit;
  end;

  NewEntry := '{"title":"Simple Streamer","url":"https://simple-streamer.bdjlmn.com/dock"}';
  P := Pos('ExtraBrowserDocks=[', Content);
  if P > 0 then
  begin
    if Pos('ExtraBrowserDocks=[]', Content) > 0 then
      StringChangeEx(Content, 'ExtraBrowserDocks=[]', 'ExtraBrowserDocks=[' + NewEntry + ']', False)
    else
      StringChangeEx(Content, 'ExtraBrowserDocks=[', 'ExtraBrowserDocks=[' + NewEntry + ',', False);
  end
  else
  begin
    P := Pos('[BasicWindow]', Content);
    if P > 0 then
      StringChangeEx(Content, '[BasicWindow]', '[BasicWindow]' + #13#10 + 'ExtraBrowserDocks=[' + NewEntry + ']', False)
    else
      Content := Content + #13#10 + '[BasicWindow]' + #13#10 + 'ExtraBrowserDocks=[' + NewEntry + ']' + #13#10;
  end;
  SaveStringToFile(IniPath, AnsiString(Content), False);
end;

procedure EnsureObsWebSocketConfig(const WsDir: String);
var
  CfgPath, Content: String;
begin
  ForceDirectories(WsDir);
  CfgPath := WsDir + '\config.json';
  if not FileExists(CfgPath) then
  begin
    Content := '{' + #13#10 +
               '  "alerts_enabled": false,' + #13#10 +
               '  "auth_required": false,' + #13#10 +
               '  "first_load": false,' + #13#10 +
               '  "server_enabled": true,' + #13#10 +
               '  "server_password": "",' + #13#10 +
               '  "server_port": 4455' + #13#10 +
               '}' + #13#10;
    SaveStringToFile(CfgPath, AnsiString(Content), False);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ObsDir, StartupDir: String;
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    ObsDir := ExpandConstant('{userappdata}\obs-studio');
    if DirExists(ObsDir) then
    begin
      EnsureObsDockInIni(ObsDir + '\global.ini');
      EnsureObsDockInIni(ObsDir + '\user.ini');
      EnsureObsWebSocketConfig(ObsDir + '\plugin_config\obs-websocket');
    end;

    { Clean up legacy PowerShell/VBS startup artifacts from older versions }
    StartupDir := ExpandConstant('{userstartup}');
    if FileExists(StartupDir + '\SimpleStreamerBridge.lnk') then
      DeleteFile(StartupDir + '\SimpleStreamerBridge.lnk');

    if FileExists('C:\Program Files\obs-studio\obs-plugins\64bit\simple-streamer.dll') then
      DeleteFile('C:\Program Files\obs-studio\obs-plugins\64bit\simple-streamer.dll');
    if FileExists(ExpandConstant('{app}\bridge.vbs')) then
      DeleteFile(ExpandConstant('{app}\bridge.vbs'));
    if FileExists(ExpandConstant('{app}\bridge.ps1')) then
      DeleteFile(ExpandConstant('{app}\bridge.ps1'));

    { Allow bridge LAN ports in Windows Firewall if possible (non-fatal) }
    Exec('netsh.exe', 'advfirewall firewall add rule name="Simple Streamer Bridge" dir=in action=allow program="' + ExpandConstant('{app}\simple-streamer-bridge.exe') + '" enable=yes profile=any', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

procedure RemoveObsDockFromIni(const IniPath: String);
var
  RawContent: AnsiString;
  Content, Target1, Target2: String;
begin
  if not FileExists(IniPath) then Exit;
  if not LoadStringFromFile(IniPath, RawContent) then Exit;
  Content := String(RawContent);

  Target1 := '{"title":"Simple Streamer","url":"https://simple-streamer.bdjlmn.com/dock"}';
  Target2 := '{"title":"Simple Streamer","url":"http://127.0.0.1:45455/dock"}';

  StringChangeEx(Content, Target1 + ',', '', False);
  StringChangeEx(Content, ',' + Target1, '', False);
  StringChangeEx(Content, Target1, '', False);

  StringChangeEx(Content, Target2 + ',', '', False);
  StringChangeEx(Content, ',' + Target2, '', False);
  StringChangeEx(Content, Target2, '', False);

  SaveStringToFile(IniPath, AnsiString(Content), False);
end;

function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/F /IM simple-streamer-bridge.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM obs64.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ObsDir, StartupDir: String;
  ResultCode: Integer;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    ObsDir := ExpandConstant('{userappdata}\obs-studio');
    if DirExists(ObsDir) then
    begin
      RemoveObsDockFromIni(ObsDir + '\global.ini');
      RemoveObsDockFromIni(ObsDir + '\user.ini');
      DelTree(ObsDir + '\plugin_config\simple-streamer', True, True, True);
      DelTree(ObsDir + '\plugins\simple-streamer', True, True, True);
    end;

    StartupDir := ExpandConstant('{userstartup}');
    if FileExists(StartupDir + '\SimpleStreamerBridge.lnk') then
      DeleteFile(StartupDir + '\SimpleStreamerBridge.lnk');
    if FileExists(StartupDir + '\Simple Streamer Bridge.lnk') then
      DeleteFile(StartupDir + '\Simple Streamer Bridge.lnk');

    if FileExists('C:\Program Files\obs-studio\obs-plugins\64bit\simple-streamer.dll') then
      DeleteFile('C:\Program Files\obs-studio\obs-plugins\64bit\simple-streamer.dll');

    DelTree(ExpandConstant('{app}'), True, True, True);
    Exec('netsh.exe', 'advfirewall firewall delete rule name="Simple Streamer Bridge"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
