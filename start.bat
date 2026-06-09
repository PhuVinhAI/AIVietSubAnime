@echo off
chcp 65001 > nul

:: ============================================================
::  anime-cli launcher - chạy từ thư mục gốc, truyền args sang CLI
::
::   anime-cli                       (mở menu)
::   anime-cli prepare "D:\Raw\Foo"
::   anime-cli hardsub ".\Anime\Foo"
::   anime-cli export  ".\Anime\Foo"
:: ============================================================

set "ROOT=%~dp0"
set "CLI=%ROOT%anime-cli"
set "DIST=%CLI%\dist\index.js"

where node > nul 2>&1
if errorlevel 1 (
    echo [LỖI] Không tìm thấy Node.js trong PATH.
    echo Tải bản LTS tại https://nodejs.org/ rồi mở lại cửa sổ cmd.
    pause
    exit /b 1
)

where npm > nul 2>&1
if errorlevel 1 (
    echo [LỖI] Không tìm thấy npm trong PATH.
    echo Cài lại Node.js ^(npm đi kèm gói cài đặt^) rồi thử lại.
    pause
    exit /b 1
)

if not exist "%CLI%" (
    echo [LỖI] Không tìm thấy thư mục "%CLI%".
    echo File anime-cli.bat phải nằm cùng cấp với thư mục anime-cli\.
    pause
    exit /b 1
)

if not exist "%CLI%\node_modules" (
    echo [anime-cli] Chưa có node_modules. Đang chạy npm install...
    pushd "%CLI%"
    call npm install
    popd
)

if not exist "%DIST%" (
    echo [anime-cli] Chưa build dist. Đang build...
    pushd "%CLI%"
    call npm run build
    popd
)

if not exist "%DIST%" (
    echo [LỖI] Build thất bại hoặc không thấy "%DIST%".
    echo Mở cmd trong anime-cli\ và chạy "npm run build" thủ công để xem log.
    pause
    exit /b 1
)

node "%DIST%" %*
set "EXITCODE=%ERRORLEVEL%"

echo.
echo ============================================================
if "%EXITCODE%"=="0" (
    echo [anime-cli] CLI đã thoát bình thường.
) else (
    echo [anime-cli] CLI thoát với exit code %EXITCODE%.
    echo Nếu thấy lỗi "Raw mode is not supported": double-click trực tiếp
    echo từ Windows Explorer thay vì chạy qua git bash / VS Code terminal.
)
echo.
pause
exit /b %EXITCODE%
