@echo off
chcp 65001 >nul
title Lianba - Share to the Internet
cd /d "%~dp0"

set "NODE=%~dp0.runtime\node-v24.20.0-win-x64\node.exe"
if not exist "%NODE%" set "NODE=node"
set "CF=%~dp0.runtime\cloudflared.exe"
if not exist "%CF%" (
  echo [ERROR] cloudflared.exe not found in .runtime\
  pause
  exit /b 1
)

set "LIANBA_PASSWORD="

echo.
echo   [1/2] Starting local server on http://127.0.0.1:8848 ...
start "Lianba Server" /min "%NODE%" server.js
timeout /t 3 /nobreak >nul

set "LBPW="
if exist "%~dp0data\share-password.txt" set /p LBPW=<"%~dp0data\share-password.txt"
if not defined LBPW set "LBPW=(first run - see data\share-password.txt)"

echo   [2/2] Opening public tunnel ...
echo.
echo   Access password: %LBPW%
echo   (change it by editing data\share-password.txt ; local 127.0.0.1 needs no password)
echo.
echo   Wait about 10 seconds, then copy the link that looks like:
echo       https://xxxx-xxxx-xxxx.trycloudflare.com
echo.
echo   Keep this window open while sharing. Press Ctrl+C to stop sharing.
echo.

"%CF%" tunnel --url http://127.0.0.1:8848 --no-autoupdate

echo.
echo   Sharing stopped. The local server window can be closed too.
pause
