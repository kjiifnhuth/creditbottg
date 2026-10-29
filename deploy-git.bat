@echo off
title Credit Manager - GitHub Deploy
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  start "" "https://github.com/kjiifnhuth/creditbottg/upload/main"
  exit /b 1
)

if not exist .git (
  call git init
)

call git remote remove origin >nul 2>nul
call git remote add origin https://github.com/kjiifnhuth/creditbottg.git
call git fetch origin main
call git reset --mixed origin/main >nul 2>nul
call git branch -M main
call git add -A
call git commit -m "Remove mobile borders, dynamic Safari theme-color, compact payment rows"
call git push -u origin main
pause
