@echo off
rem justwrite-server: the headless server, the app's own exe run as Node (the Electron
rem move, ruling 4) - the same server and UI the desktop app runs, no window.
rem The exe is justwrite.exe: a launcher never shares its name (Windows would resolve the
rem bare name to the GUI exe first - JustVoice's CreateProcessW trap).
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0justwrite.exe" "%~dp0resources\app.asar\server\src\serve.js" %*
