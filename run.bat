@echo off
title MediCap Hospital System
cd /d "%~dp0"

echo Starting MediCap...
echo.

where node >nul 2>nul
if errorlevel 1 goto no_node

if not exist node_modules goto install_deps
:check_db
if not exist hospital.db goto init_db
:start_app

echo ============================================================
echo   MediCap Hospital Capacity System
echo   Browser URL:  http://localhost:5000
echo   To stop:      Press Ctrl+C or close this window
echo ============================================================
echo.

start powershell -NoProfile -Command "Start-Sleep -Seconds 1.5; Start-Process 'http://localhost:5000'"
node server.js
goto end

:install_deps
echo Installing dependencies, please wait...
call npm install
goto check_db

:init_db
echo Initializing SQLite database...
node init-db.js
goto start_app

:no_node
echo [ERROR] Node.js is not found in PATH.
echo Please install Node.js from https://nodejs.org/
pause
exit /b 1

:end
pause
