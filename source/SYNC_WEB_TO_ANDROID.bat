@echo off
set ROOT=%~dp0
set DEST=%ROOT%android\app\src\main\assets\www
if not exist "%DEST%" mkdir "%DEST%"
for %%F in (index.html app.js styles.css manifest.webmanifest service-worker.js icon.svg icon-192.png icon-512.png apple-touch-icon.png) do copy /Y "%ROOT%%%F" "%DEST%\%%F" >nul
echo Spa Coach web files copied into the Android app.
pause
