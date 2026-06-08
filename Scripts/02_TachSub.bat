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

for %%A in ("%~dp1..") do set "parent_folder=%%~fA"
set "subgoc_dir=%parent_folder%\03_SubGoc"
set "vietsub_dir=%parent_folder%\04_VietSub"

if not exist "%subgoc_dir%" mkdir "%subgoc_dir%"
if not exist "%vietsub_dir%" mkdir "%vietsub_dir%"

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

:: Định nghĩa đường dẫn file gốc EN (vào 03_SubGoc)
set "file_goc=%subgoc_dir%\%~n1_Track%track_id%.%ext%"

:: 1. Lệnh tách file phụ đề gốc (.ass) vào 03_SubGoc
mkvextract tracks "%input%" %track_id%:"%file_goc%"

:: 2. Tạo backup .txt trong 03_SubGoc và file vietsub.ass trong 04_VietSub để dịch
if exist "%file_goc%" (
    copy "%file_goc%" "%file_goc%.txt" > nul
    copy "%file_goc%" "%vietsub_dir%\vietsub.ass" > nul
)

echo.
echo =====================================================================
echo [OK] HOÀN THÀNH! Đã xuất 3 file:
echo 1. 03_SubGoc\%~n1_Track%track_id%.ass        (sub gốc EN)
echo 2. 03_SubGoc\%~n1_Track%track_id%.ass.txt    (backup)
echo 3. 04_VietSub\vietsub.ass                     (file để dịch)
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