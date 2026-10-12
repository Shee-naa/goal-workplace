@echo off
chcp 65001 >nul
title Lianba - Stop
echo.
echo   Stopping Lianba local server (port 8848) ...
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 8848 -State Listen -ErrorAction SilentlyContinue; if ($c) { $c | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } ; 'stopped.' } else { 'not running.' }"
echo.
pause
