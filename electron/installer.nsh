; MYRAA — custom NSIS installer hooks
; Runs after the standard electron-builder NSIS logic finishes.

; nsDialogs — used for the owner-name prompt.
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var OwnerDialog
Var OwnerLabel
Var OwnerInput
Var OwnerName

; Custom page: ask PC owner name (what MYRAA will call the user).
Page custom OwnerPageCreate OwnerPageLeave

Function OwnerPageCreate
  !insertmacro MUI_HEADER_TEXT "MYRAA Setup — Owner Name" "MYRAA tomake ki name a dakbe? (jemon: Rupom Sir, Boss, Ayan)"
  nsDialogs::Create 1018
  Pop $OwnerDialog
  ${If} $OwnerDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Ei name ta MYRAA tomake dakar somoy use korbe. Porei tumi app er settings theke change korte parbe."
  Pop $OwnerLabel

  ${NSD_CreateText} 0 40u 100% 14u "Sir"
  Pop $OwnerInput

  nsDialogs::Show
FunctionEnd

Function OwnerPageLeave
  ${NSD_GetText} $OwnerInput $OwnerName
  ${If} $OwnerName == ""
    StrCpy $OwnerName "Sir"
  ${EndIf}
FunctionEnd

!macro customInstall
  ; Persist the owner name so the app reads it on first launch.
  WriteRegStr HKCU "Software\MYRAA" "OwnerName" "$OwnerName"

  ; Ask the user (with default = Yes) whether MYRAA should launch on Windows startup.
  MessageBox MB_YESNO|MB_ICONQUESTION "Windows startup e MYRAA auto-start korte chao?$\r$\n(Later e tray menu theke o toggle kora jabe)" IDNO skipStartup
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MYRAA Hindi" '"$INSTDIR\MYRAA Hindi.exe" --hidden'
  Goto doneStartup
  skipStartup:
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MYRAA Hindi"
  doneStartup:
!macroend

!macro customUnInstall
  ; Clean up the startup entry no matter what on uninstall.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MYRAA Hindi"
  DeleteRegKey HKCU "Software\MYRAA"
!macroend