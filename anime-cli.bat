@echo off
chcp 65001 >nul
REM ============================================================
REM   anime-cli launcher — chạy từ thư mục gốc, truyền args sang CLI.
REM
REM   anime-cli                       (mở menu)
REM   anime-cli prepare "D:\Raw\Foo"
REM   anime-cli hardsub ".\Anime\Foo"
REM   anime-cli export  ".\Anime\Foo"
REM ============================================================
setlocal
set ROOT=%~dp0
set CLI=%ROOT%anime-cli
set DIST=%CLI%\dist\index.js

if not exist "%CLI%\node_modules" (
  echo [anime-cli] Chưa có node_modules. Đang chạy npm install...
  pushd "%CLI%" || (echo [anime-cli] Không tìm thấy thư mục anime-cli & exit /b 1)
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
  echo [anime-cli] Build thất bại. Kiểm tra đã cài Node.js chưa nhé.
  exit /b 1
)

node "%DIST%" %*
endlocal
