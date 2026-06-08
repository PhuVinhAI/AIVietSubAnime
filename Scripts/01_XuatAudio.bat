@echo off
chcp 65001 > nul
set "input=%~1"

:: Kiểm tra nếu không có file nào được kéo thả vào
if "%input%"=="" (
    echo [LỖI] Hãy kéo và thả file video vào file .bat này để chạy!
    pause
    exit /b
)

cls
echo ===================================================
echo             XÁC NHẬN XUẤT ÂM THANH (MP3)
echo ===================================================
echo.
echo Bạn đã kéo thả file video:
echo "%~nx1"
echo.
echo ===================================================
echo.

:: Yêu cầu người dùng xác nhận trước khi chạy
set /p choice="--> Bạn có chắc chắn muốn xuất Audio file này không? (Y/N): "

:: Nếu người dùng nhập KHÁC chữ Y hoặc y (bao gồm cả việc ấn Enter luôn) thì sẽ hủy lệnh
if /i "%choice%" neq "Y" (
    echo.
    echo [THÔNG BÁO] Đã hủy thao tác. File video của bạn chưa bị xử lý.
    timeout /t 3 > nul
    exit /b
)

echo.
echo Đang tiến hành trích xuất âm thanh, vui lòng đợi...
echo.

:: Xuất .mp3 cùng folder với .mkv input (cấu trúc 1 folder 1 ep)
set "output_dir=%~dp1"
set "output_file=%output_dir%%~n1.mp3"

:: Chạy lệnh FFmpeg để xuất audio MP3
ffmpeg -i "%input%" -vn -c:a libmp3lame -q:a 2 "%output_file%"

echo.
echo ===================================================
echo [OK] Đã xong! File MP3 được lưu tại:
echo "%output_file%"
echo ===================================================
timeout /t 5