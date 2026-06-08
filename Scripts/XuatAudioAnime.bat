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

:: Tự động tìm thư mục cha và chuyển hướng từ \Raw\ sang \Audio\
for %%A in ("%~dp1..") do set "parent_folder=%%~fA"
set "output_dir=%parent_folder%\Audio"

:: Nếu thư mục \Audio\ chưa tồn tại thì tự động tạo mới
if not exist "%output_dir%" mkdir "%output_dir%"

:: Chạy lệnh FFmpeg để xuất audio MP3
ffmpeg -i "%input%" -vn -c:a libmp3lame -q:a 2 "%output_dir%\%~n1.mp3"

echo.
echo ===================================================
echo [OK] Đã xong! File MP3 được lưu tại:
echo "%output_dir%\%~n1.mp3"
echo ===================================================
timeout /t 5