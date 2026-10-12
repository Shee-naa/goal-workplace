@echo off
chcp 65001 >nul
title Lianba - Local Study Workbench
cd /d "%~dp0"

set "NODE=%~dp0.runtime\node-v24.20.0-win-x64\node.exe"
if not exist "%NODE%" set "NODE=node"

"%NODE%" server.js

echo.
echo   Lianba stopped.
pause
