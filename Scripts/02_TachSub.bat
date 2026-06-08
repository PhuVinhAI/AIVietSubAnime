<# :
@echo off
chcp 65001 > nul
set "input=%~1"
set "script_path=%~f0"

if "%input%"=="" (
    echo [LOI] Hãy kéo và thả file video MKV vào đây!
    pause
    exit /b
)

:: Xuất sub cùng folder với .mkv input (cấu trúc 1 folder 1 ep)
set "output_dir=%~dp1"

cls
echo =====================================================================
echo             DANH SÁCH CÁC TRACK PHỤ ĐỀ CÓ TRONG VIDEO
echo =====================================================================
echo.

powershell -noProfile -executionPolicy bypass -command "iex ([IO.File]::ReadAllText($env:script_path, [System.Text.Encoding]::UTF8))"

echo ---------------------------------------------------------------------
echo.
set /p track_id="--> Nhập số ID của track Sub muốn tách (Ví dụ: 2, 3...): "

set "ext=ass"

echo.
echo Đang tiến hành tách phụ đề bằng mkvextract...
echo.

:: Đường dẫn file sub gốc EN (cùng folder với .mkv)
set "file_goc=%output_dir%%~n1_Track%track_id%.%ext%"

:: 1. Tách file phụ đề gốc (.ass)
mkvextract tracks "%input%" %track_id%:"%file_goc%"

:: 2. Tạo backup .txt và file vietsub.ass để dịch (cùng folder)
if exist "%file_goc%" (
    copy "%file_goc%" "%file_goc%.txt" > nul
    copy "%file_goc%" "%output_dir%vietsub.ass" > nul
)

echo.
echo =====================================================================
echo [OK] HOÀN THÀNH! Đã xuất 3 file trong folder:
echo "%output_dir%"
echo   1. %~n1_Track%track_id%.ass        (sub gốc EN)
echo   2. %~n1_Track%track_id%.ass.txt    (backup)
echo   3. vietsub.ass                     (file để dịch)
echo =====================================================================
echo.
pause
exit /b
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$inputVideo = $env:input

$dict = @{ 
    'eng'='Tiếng Anh'; 'fre'='Tiếng Pháp'; 'fra'='Tiếng Pháp'; 
    'ger'='Tiếng Đức'; 'deu'='Tiếng Đức'; 'spa'='Tiếng Tây Ban Nha'; 
    'por'='Tiếng Bồ Đào Nha'; 'ita'='Tiếng Ý'; 'rus'='Tiếng Nga'; 
    'chi'='Tiếng Trung'; 'zho'='Tiếng Trung'; 'jpn'='Tiếng Nhật'; 
    'kor'='Tiếng Hàn'; 'vie'='Tiếng Việt'; 'ind'='Tiếng Indonesia'; 
    'tha'='Tiếng Thái'; 'msa'='Tiếng Mã Lai'; 'may'='Tiếng Mã Lai'
}

$out = (ffmpeg -i $inputVideo 2>&1) | Select-String "Subtitle"
foreach ($l in $out) {
    if ($l.Line -match 'Stream #0:(\d+)\((\w+)\): Subtitle:') {
        $id = $Matches[1]
        $code = $Matches[2].ToLower()
        
        $def = if ($l.Line -match 'default') { ' [Mặc định]' } else { '' }
        $langName = if ($dict.ContainsKey($code)) { $dict[$code] } else { $code.ToUpper() }
        
        Write-Host "  Track ID " -NoNewline -ForegroundColor Gray
        Write-Host "$id" -NoNewline -ForegroundColor Yellow
        Write-Host " : $langName" -NoNewline -ForegroundColor Green
        Write-Host "$def" -ForegroundColor Cyan
    }
}