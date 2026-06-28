; NSIS install/uninstall hooks for DFR Toolkit.
;
; Tauri's stock NSIS template knows to kill the main app exe (DFR Toolkit.exe)
; before extracting files. It does NOT know about our Python sidecar
; (seo-backend.exe), which the Rust parent spawned as a child process. If
; the user has v0.1.x open when an auto-update fires, the new installer
; tries to overwrite seo-backend.exe at AppData\Local\DFR Toolkit\ and hits
; "Error opening file for writing" because the sidecar still holds the
; file lock. The user's only recovery was Task Manager.
;
; The pre-install hook below force-kills any seo-backend.exe AND any of
; its child processes (PyInstaller's bootloader spawns a python interpreter
; child, hence /T). A brief sleep gives the OS time to release the file
; handle before NSIS starts overwriting.

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Closing any running DFR Toolkit instances..."
  nsExec::Exec 'taskkill /F /T /IM "seo-backend.exe"'
  Pop $0
  ; Tauri's own template handles the main exe but belt-and-suspenders:
  ; if it skipped for any reason (renamed exe, weird state), do it here.
  nsExec::Exec 'taskkill /F /T /IM "DFR Toolkit.exe"'
  Pop $0
  ; Give Windows ~600ms to actually release the file handles.
  Sleep 600
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Closing any running DFR Toolkit instances..."
  nsExec::Exec 'taskkill /F /T /IM "seo-backend.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "DFR Toolkit.exe"'
  Pop $0
  Sleep 600
!macroend
