@echo off
title Credit Manager - Localhost
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Check Node.js/npm and your internet connection.
    pause
    exit /b 1
  )
)
start "" "http://localhost:5173"
call npm run dev
pause
