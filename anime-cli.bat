@echo off
chcp 65001 > nul

:: ============================================================
::  anime-cli launcher
::
::   anime-cli                       (open menu)
::   anime-cli prepare "D:\Raw\Foo"
::   anime-cli hardsub ".\Anime\Foo"
::   anime-cli export  ".\Anime\Foo"
:: ============================================================

set "ROOT=%~dp0"
set "CLI=%ROOT%anime-cli"
set "DIST=%CLI%\dist\index.js"

where node > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found in PATH.
    echo Install LTS from https://nodejs.org/ then reopen cmd.
    pause
    exit /b 1
)

where npm > nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found in PATH. Reinstall Node.js.
    pause
    exit /b 1
)

if not exist "%CLI%" (
    echo [ERROR] Folder not found: "%CLI%"
    echo anime-cli.bat must sit next to the anime-cli\ folder.
    pause
    exit /b 1
)

if not exist "%CLI%\node_modules" (
    echo [anime-cli] Installing dependencies...
    pushd "%CLI%"
    call npm install
    popd
)

if not exist "%DIST%" (
    echo [anime-cli] Building dist...
    pushd "%CLI%"
    call npm run build
    popd
)

if not exist "%DIST%" (
    echo [ERROR] Build failed or missing "%DIST%".
    echo Open cmd inside anime-cli\ and run "npm run build" to see the log.
    pause
    exit /b 1
)

node "%DIST%" %*
set "EXITCODE=%ERRORLEVEL%"

echo.
echo ============================================================
if "%EXITCODE%"=="0" (
    echo [anime-cli] CLI exited normally.
) else (
    echo [anime-cli] CLI exited with code %EXITCODE%.
)
echo.
pause
exit /b %EXITCODE%
