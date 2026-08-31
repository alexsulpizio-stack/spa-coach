@echo off
cd /d "%~dp0android"
call gradlew.bat :app:syncWebAssets
if errorlevel 1 exit /b %errorlevel%
echo Spa Coach web files generated in the Android app.
pause
