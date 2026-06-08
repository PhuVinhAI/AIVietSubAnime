<# :
@echo off
chcp 65001 > nul
set "input=%~1"
set "script_path=%~f0"

if "%input%"=="" (
    echo [LỖI] Hãy kéo và thả THƯ MỤC chứa các file .mkv anime vào đây!
    echo (Hoặc kéo 1 file .mkv bất kỳ, script sẽ xử lý tất cả .mkv trong folder đó)
    pause
    exit /b
)

powershell -noProfile -executionPolicy bypass -command "iex ([IO.File]::ReadAllText($env:script_path, [System.Text.Encoding]::UTF8))"

pause
exit /b
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$inputPath = $env:input

# Xác định folder: nếu input là file thì lấy parent, nếu là folder thì giữ nguyên
if (Test-Path $inputPath -PathType Container) {
    $folder = (Resolve-Path $inputPath).Path
} else {
    $folder = Split-Path (Resolve-Path $inputPath).Path -Parent
}

Write-Host "Folder làm việc: $folder`n" -ForegroundColor Cyan

# Tìm tất cả .mkv ở mức root của folder (không lục vào Ep* nếu đã tồn tại)
$mkvs = @(Get-ChildItem -Path $folder -Filter "*.mkv" -File)
if ($mkvs.Count -eq 0) {
    Write-Host "[LỖI] Không tìm thấy file .mkv nào ngay trong folder này." -ForegroundColor Red
    return
}

Write-Host "Đã tìm thấy $($mkvs.Count) file .mkv:" -ForegroundColor Cyan
$mkvs | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }

# Liệt kê track sub của file đầu tiên
$first = $mkvs[0]
Write-Host "`n=====================================================================" -ForegroundColor Yellow
Write-Host "Track sub trong file mẫu: $($first.Name)" -ForegroundColor Yellow
Write-Host "=====================================================================" -ForegroundColor Yellow

$dict = @{
    'eng'='Tiếng Anh'; 'fre'='Tiếng Pháp'; 'fra'='Tiếng Pháp';
    'ger'='Tiếng Đức'; 'deu'='Tiếng Đức'; 'spa'='Tiếng Tây Ban Nha';
    'por'='Tiếng Bồ Đào Nha'; 'ita'='Tiếng Ý'; 'rus'='Tiếng Nga';
    'chi'='Tiếng Trung'; 'zho'='Tiếng Trung'; 'jpn'='Tiếng Nhật';
    'kor'='Tiếng Hàn'; 'vie'='Tiếng Việt'; 'ind'='Tiếng Indonesia';
    'tha'='Tiếng Thái'; 'msa'='Tiếng Mã Lai'; 'may'='Tiếng Mã Lai'
}

$out = (ffmpeg -i $first.FullName 2>&1) | Select-String "Subtitle"
foreach ($l in $out) {
    if ($l.Line -match 'Stream #0:(\d+)\((\w+)\): Subtitle:') {
        $id = $Matches[1]; $code = $Matches[2].ToLower()
        $def = if ($l.Line -match 'default') { ' [Mặc định]' } else { '' }
        $langName = if ($dict.ContainsKey($code)) { $dict[$code] } else { $code.ToUpper() }
        Write-Host "  Track ID " -NoNewline -ForegroundColor Gray
        Write-Host "$id" -NoNewline -ForegroundColor Yellow
        Write-Host " : $langName" -NoNewline -ForegroundColor Green
        Write-Host "$def" -ForegroundColor Cyan
    }
}

Write-Host ""
$track_id = Read-Host "--> Nhập Track ID sẽ tách (áp dụng cho TẤT CẢ $($mkvs.Count) file)"
if ([string]::IsNullOrWhiteSpace($track_id)) {
    Write-Host "[LỖI] Track ID không hợp lệ." -ForegroundColor Red
    return
}

# Xác nhận
Write-Host "`n=====================================================================" -ForegroundColor Yellow
Write-Host "Script sẽ thực hiện cho từng file:" -ForegroundColor Yellow
Write-Host "  1. Parse số tập từ tên file (pattern ' - NN ')" -ForegroundColor Gray
Write-Host "  2. Tạo folder Ep<NN> (vd. Ep01, Ep02...)" -ForegroundColor Gray
Write-Host "  3. Move .mkv vào folder đó" -ForegroundColor Gray
Write-Host "  4. Xuất .mp3 audio (libmp3lame Q2)" -ForegroundColor Gray
Write-Host "  5. Tách sub track $track_id, copy thành vietsub.ass" -ForegroundColor Gray
Write-Host "=====================================================================" -ForegroundColor Yellow

$confirm = Read-Host "`n--> Xác nhận chạy? (Y/N)"
if ($confirm -ne 'Y' -and $confirm -ne 'y') {
    Write-Host "Đã huỷ." -ForegroundColor Red
    return
}

# Loop từng file
$success = 0; $failed = @()
foreach ($mkv in $mkvs) {
    Write-Host "`n=== Xử lý: $($mkv.Name) ===" -ForegroundColor Yellow

    # Parse số tập: tìm pattern " - NN" trong base name
    if ($mkv.BaseName -match ' - (\d{1,3})\b') {
        $epNum = $Matches[1].PadLeft(2, '0')
    } else {
        Write-Host "  [BỎ QUA] Không tìm được số tập trong tên file" -ForegroundColor Red
        $failed += $mkv.Name
        continue
    }

    $epFolder = Join-Path $folder "Ep$epNum"
    if (-not (Test-Path $epFolder)) {
        New-Item -ItemType Directory -Path $epFolder | Out-Null
    }

    Write-Host "  -> Folder: Ep$epNum" -ForegroundColor Cyan

    # Move .mkv
    $newMkv = Join-Path $epFolder $mkv.Name
    if ($mkv.FullName -ne $newMkv) {
        Move-Item -LiteralPath $mkv.FullName -Destination $newMkv -Force
    }

    # Extract audio mp3
    $mp3Path = Join-Path $epFolder "$($mkv.BaseName).mp3"
    Write-Host "  -> Xuất audio MP3..." -ForegroundColor Cyan
    & ffmpeg -y -i $newMkv -vn -c:a libmp3lame -q:a 2 $mp3Path 2>&1 | Out-Null

    # Extract sub
    $assPath = Join-Path $epFolder "$($mkv.BaseName)_Track$track_id.ass"
    Write-Host "  -> Tách sub track $track_id..." -ForegroundColor Cyan
    & mkvextract tracks $newMkv "${track_id}:$assPath" 2>&1 | Out-Null

    if (Test-Path $assPath) {
        Copy-Item -LiteralPath $assPath -Destination "$assPath.txt"
        Copy-Item -LiteralPath $assPath -Destination (Join-Path $epFolder "vietsub.ass")
        Write-Host "  -> HOÀN TẤT Ep$epNum" -ForegroundColor Green
        $success++
    } else {
        Write-Host "  [LỖI] Không tách được sub (track $track_id có tồn tại không?)" -ForegroundColor Red
        $failed += $mkv.Name
    }
}

Write-Host "`n=====================================================================" -ForegroundColor Green
Write-Host "HOÀN THÀNH! Thành công: $success / $($mkvs.Count)" -ForegroundColor Green
if ($failed.Count -gt 0) {
    Write-Host "Thất bại:" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}
Write-Host "=====================================================================" -ForegroundColor Green
