@echo off
chcp 65001 > nul

:: ============================================================
::  anime-cli launcher - ch?y t? thý m?c g?c, truy?n args sang CLI
::
::   anime-cli                       (m? menu)
::   anime-cli prepare "D:\Raw\Foo"
::   anime-cli hardsub ".\Anime\Foo"
::   anime-cli export  ".\Anime\Foo"
:: ============================================================

set "ROOT=%~dp0"
set "CLI=%ROOT%anime-cli"
set "DIST=%CLI%\dist\index.js"

where node > nul 2>&1
if errorlevel 1 (
    echo [L?I] Không t?m th?y Node.js trong PATH.
    echo T?i b?n LTS t?i https://nodejs.org/ r?i m? l?i c?a s? cmd.
    pause
    exit /b 1
)

where npm > nul 2>&1
if errorlevel 1 (
    echo [L?I] Không t?m th?y npm trong PATH.
    echo Cài l?i Node.js ^(npm ði kèm gói cài ð?t^) r?i th? l?i.
    pause
    exit /b 1
)

if not exist "%CLI%" (
    echo [L?I] Không t?m th?y thý m?c "%CLI%".
    echo File anime-cli.bat ph?i n?m cùng c?p v?i thý m?c anime-cli\.
    pause
    exit /b 1
)

if not exist "%CLI%\node_modules" (
    echo [anime-cli] Chýa có node_modules. Ðang ch?y npm install...
    pushd "%CLI%"
    call npm install
    popd
)

if not exist "%DIST%" (
    echo [anime-cli] Chýa build dist. Ðang build...
    pushd "%CLI%"
    call npm run build
    popd
)

if not exist "%DIST%" (
    echo [L?I] Build th?t b?i ho?c không th?y "%DIST%".
    echo M? cmd trong anime-cli\ và ch?y "npm run build" th? công ð? xem log.
    pause
    exit /b 1
)

node "%DIST%" %*
set "EXITCODE=%ERRORLEVEL%"

echo.
echo ============================================================
if "%EXITCODE%"=="0" (
    echo [anime-cli] CLI ð? thoát b?nh thý?ng.
) else (
    echo [anime-cli] CLI thoát v?i exit code %EXITCODE%.
    echo N?u th?y l?i "Raw mode is not supported": double-click tr?c ti?p
    echo t? Windows Explorer thay v? ch?y qua git bash / VS Code terminal.
)
echo.
pause
exit /b %EXITCODE%
