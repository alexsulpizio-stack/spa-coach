@echo off
cd /d "%~dp0"
title Spa Coach - Phone Mode
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0spa_server.ps1"
pause
