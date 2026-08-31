@echo off
setlocal
cd /d "%~dp0"
title Spa Coach Launcher

set "PY_CMD="
where py >nul 2>nul && set "PY_CMD=py"
if not defined PY_CMD (
  where python >nul 2>nul && set "PY_CMD=python"
)
if not defined PY_CMD (
  where python3 >nul 2>nul && set "PY_CMD=python3"
)

if not defined PY_CMD goto NO_PYTHON

echo Starting Spa Coach...
echo.
echo Keep the Spa Coach Server window open while using the app.
start "Spa Coach Server" /min %PY_CMD% -m http.server 8080 --bind 127.0.0.1

timeout /t 2 /nobreak >nul

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/ -TimeoutSec 3; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 goto SERVER_FAILED

echo Spa Coach is running at http://127.0.0.1:8080
start "" http://127.0.0.1:8080
exit /b 0

:NO_PYTHON
echo.
echo ============================================================
echo Spa Coach could not find Python on this PC.
echo ============================================================
echo.
echo OPTION 1 - Quickest:
echo   Double-click index.html in this folder.
echo   Photo upload and most prototype features will still work.
echo.
echo OPTION 2 - For the full localhost version:
echo   Install Python 3 from python.org, then run this file again.
echo   During installation, enable "Add Python to PATH" if offered.
echo.
pause
exit /b 1

:SERVER_FAILED
echo.
echo ============================================================
echo Python was found, but Spa Coach did not start on port 8080.
echo ============================================================
echo.
echo Another program may be using port 8080, or Windows security

echo may have blocked Python. Try double-clicking index.html for now.
echo.
pause
exit /b 1
