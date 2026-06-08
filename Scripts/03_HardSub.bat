@echo off
chcp 65001 > nul
set "input=%~1"

if "%input%"=="" (
    echo [LỖI] Hãy kéo và thả file .mkv gốc vào đây!
    pause
    exit /b
)

:: Auto-detect HandBrakeCLI trong Tools\HandBrakeCLI-*-win-*
set "HBCLI="
for /d %%D in ("%~dp0..\Tools\HandBrakeCLI-*-win-*") do set "HBCLI=%%D\HandBrakeCLI.exe"

if not defined HBCLI (
    echo [LỖI] Không tìm thấy folder HandBrakeCLI-*-win-* trong Tools\
    echo Hãy tải HandBrakeCLI tại https://handbrake.fr/downloads2.php và giải nén vào Tools\
    pause
    exit /b
)
if not exist "%HBCLI%" (
    echo [LỖI] Không tìm thấy HandBrakeCLI.exe tại "%HBCLI%"
    pause
    exit /b
)

:: Tìm vietsub.ass cùng folder với .mkv (cấu trúc 1 folder 1 ep)
set "video_dir=%~dp1"
set "ass_file=%video_dir%vietsub.ass"

if not exist "%ass_file%" (
    echo [LỖI] Không tìm thấy vietsub.ass trong folder của video!
    echo Expected: "%ass_file%"
    echo.
    echo Hãy đảm bảo file "vietsub.ass" đã được dịch nằm CÙNG folder với .mkv.
    pause
    exit /b
)

set "output=%video_dir%%~n1_vietsub.mp4"

cls
echo =====================================================================
echo                XÁC NHẬN HARDSUB BẰNG HANDBRAKE CLI
echo =====================================================================
echo  Input video : %~nx1
echo  Sub file    : vietsub.ass
echo  Output      : %~n1_vietsub.mp4
echo  Quality     : RF 20 (H.264 x264)
echo  Audio       : track tiếng Nhật, AAC 192 kbps
echo  HandBrakeCLI: "%HBCLI%"
echo =====================================================================
echo.
set /p choice="--> Bắt đầu encode? (15-40 phút tuỳ CPU) (Y/N): "
if /i "%choice%" neq "Y" (
    echo Đã huỷ.
    timeout /t 2 > nul
    exit /b
)

echo.
echo Đang encode, vui lòng đợi...
echo.

"%HBCLI%" -i "%input%" -o "%output%" --ssa-file "%ass_file%" --ssa-burn -e x264 -q 20 -E av_aac -B 192 --audio-lang-list jpn --first-audio

echo.
echo =====================================================================
echo [OK] HOÀN THÀNH! File hardsub đã lưu tại:
echo "%output%"
echo =====================================================================
echo.
echo Lưu ý: kiểm tra video bằng VLC để chắc font và sub hiển thị đúng.
pause
