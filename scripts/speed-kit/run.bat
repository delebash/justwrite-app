@echo off
rem run.bat - the DOUBLE-CLICK launcher. Windows opens .ps1 files in Notepad and
rem ExecutionPolicy can block them; this wrapper runs run.ps1 properly and keeps
rem the window open at the end so the result stays readable. Args pass through
rem (e.g.  run.bat -PlanOnly  or  run.bat -RamGB 16).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
pause
