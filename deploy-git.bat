@echo off
title Credit Manager - GitHub Deploy
cd /d "%~dp0"

echo =========================================================
echo   Deploying to https://github.com/kjiifnhuth/creditbottg
echo =========================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git is not installed on this computer!
  echo Opening GitHub web upload page in your browser instead...
  start "" "https://github.com/kjiifnhuth/creditbottg/upload/main"
  echo.
  echo Simply drag and drop "index.html" and the "src" folder into the opened browser window and click "Commit changes".
  pause
  exit /b 1
)

if not exist .git (
  echo [1/4] Initializing Git repository...
  call git init
)

echo [2/4] Connecting to https://github.com/kjiifnhuth/creditbottg.git ...
call git remote remove origin >nul 2>nul
call git remote add origin https://github.com/kjiifnhuth/creditbottg.git

call git config user.email >nul 2>nul
if errorlevel 1 (
  call git config user.email "kjiifnhuth@users.noreply.github.com"
  call git config user.name "kjiifnhuth"
)

echo [3/4] Fetching branch main and staging files...
call git fetch origin main
call git reset --mixed origin/main >nul 2>nul
call git branch -M main
call git add -A
call git commit -m "Optimize mobile UI, add Sandbox preview mode and overpay options"

echo [4/4] Pushing changes to GitHub...
call git push -u origin main
if errorlevel 1 (
  echo Retrying push with force-with-lease...
  call git push -u origin main --force-with-lease
)

if errorlevel 1 (
  echo.
  echo [WARNING] Git push could not complete automatically.
  echo Opening GitHub web upload page in your browser...
  start "" "https://github.com/kjiifnhuth/creditbottg/upload/main"
) else (
  echo.
  echo [SUCCESS] Successfully deployed to https://github.com/kjiifnhuth/creditbottg !
)
pause
