; MYRAA — custom NSIS installer hooks
; Runs after the standard electron-builder NSIS logic finishes.

!macro customInstall
  ; Ask the user (with default = Yes) whether MYRAA should launch on Windows startup.
  MessageBox MB_YESNO|MB_ICONQUESTION "Windows startup e MYRAA auto-start korte chao?$\r$\n(Later e tray menu theke o toggle kora jabe)" IDNO skipStartup
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MYRAA" '"$INSTDIR\MYRAA.exe" --hidden'
  Goto doneStartup
  skipStartup:
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MYRAA"
  doneStartup:
!macroend

!macro customUnInstall
  ; Clean up the startup entry no matter what on uninstall.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MYRAA"
!macroend