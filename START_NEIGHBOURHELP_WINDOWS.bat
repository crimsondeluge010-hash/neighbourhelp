@echo off
setlocal
cd /d "%~dp0"

echo NeighbourHelp setup
if not exist package.json (
  echo ERROR: Run this file from the extracted NeighbourHelp project folder.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 20 or newer is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm was not found. Enabling it through Corepack...
  call corepack enable
  call corepack prepare pnpm@10.4.1 --activate
)

if not exist node_modules (
  echo Installing dependencies. This may take a few minutes...
  call pnpm install
  if errorlevel 1 goto failed
)

if not exist .env (
  echo NOTE: .env is missing. Copy ENVIRONMENT_SETUP.md values into a new .env file before using Firebase, MySQL, or admin features.
)

echo Starting NeighbourHelp at http://localhost:3000
call pnpm dev
exit /b %errorlevel%

:failed
echo.
echo Dependency installation failed. Check your internet connection and try again.
pause
exit /b 1
