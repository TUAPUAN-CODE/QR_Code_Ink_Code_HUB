@echo off
title QR Code Tool - Node.js Server
cd /d "%~dp0"

echo ============================================================
echo   QR Code Tool - Node.js server
echo ============================================================
echo.

echo   This machine:      http://localhost:81/
echo   Other PCs on LAN:  http://172.48.0.115:81/
echo.
echo   (For production use PM2 instead: pm2 start ecosystem.config.js - see README.md)
echo   Do NOT close this window while using the tool.
echo   Close this window when finished to stop the server.
echo.
echo   NOTE: You may need to allow port 81 through Windows Firewall
echo   for other PCs on the network to connect.
echo.

start "" "http://localhost:81/"

node server.js

pause
