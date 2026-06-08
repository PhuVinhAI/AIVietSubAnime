# AIVietSubAnime

Bộ công cụ và quy trình dịch phụ đề anime từ tiếng Anh sang tiếng Việt theo chuẩn fansub an toàn (Safe Fansub Style), ưu tiên độ chính xác dựa trên audio gốc tiếng Nhật.

## Mục tiêu

Khắc phục lỗi phổ biến của AI khi dịch EN → VI: AI thường tự đoán đại từ nhân xưng (anh/chị/cô/chú...) sai vì không "nghe" được audio. Skill `anime-vi-translator-safe-fansub` ép quy trình dịch bám sát audio Nhật, giữ honorific Nhật, và áp dụng quy tắc lược chủ ngữ (pro-drop) của tiếng Việt.

## Cấu trúc thư mục

Mỗi anime một folder, **mỗi tập một subfolder `EpNN`** chứa đầy đủ raw + audio + sub + hardsub:

```
AIVietSubAnime/
├── Anime/<tên-anime>/
│   ├── Ep01/
│   │   ├── <tên-gốc>.mkv          # Raw video                  [ignored]
│   │   ├── <tên-gốc>.mp3          # Audio extract              [ignored]
│   │   ├── <tên-gốc>_TrackN.ass   # Sub EN gốc                 [push]
│   │   ├── <tên-gốc>_TrackN.ass.txt # Backup .txt              [push]
│   │   ├── vietsub.ass             # Sub VN đã dịch            [push]
│   │   └── <tên-gốc>_vietsub.mp4  # Video hardsub              [ignored]
│   ├── Ep02/
│   │   └── ...
│   └── Ep13/
├── Scripts/
│   ├── 00_ChuanBiTatCa.bat # BATCH: tạo Ep01-EpNN + extract audio + sub TOÀN BỘ
│   ├── 01_XuatAudio.bat    # Single file: extract .mp3 từ 1 .mkv
│   ├── 02_TachSub.bat      # Single file: tách sub track từ 1 .mkv
│   └── 03_HardSub.bat      # Burn-in vietsub.ass vào video bằng HandBrake CLI
├── Styles/
│   └── Default.ass         # Style mẫu cho .ass (font, màu, viền)
├── Skills/
│   └── SKILL.md            # Quy tắc dịch Safe Fansub Style
└── Tools/                  # Installer + HandBrakeCLI            [ignored]
    └── HandBrakeCLI-*-win-*/HandBrakeCLI.exe (script tự detect)
```

**Vì sao 1 folder 1 ep?**
- HandBrake / VLC chỉ cần mở 1 folder là thấy đủ video + sub
- Dễ quản lý theo tập, xoá Ep nào sau khi xong không ảnh hưởng tập khác
- Không cần truyền path lung tung qua nhiều folder con

## Yêu cầu công cụ

| Tool | Mục đích | Cách cài |
|------|----------|----------|
| FFmpeg | Tách audio, đọc thông tin track sub | Add vào PATH — https://ffmpeg.org/download.html |
| MKVToolNix | `mkvextract` tách sub | Add vào PATH — https://mkvtoolnix.download/ |
| HandBrake CLI | Burn-in (hardsub) | Giải nén vào `Tools/HandBrakeCLI-*-win-*/` — script tự dò |
| VLC | (Tuỳ chọn) preview | https://www.videolan.org/ |

> **HandBrake CLI**: tải tại https://handbrake.fr/downloads2.php (chọn "HandBrakeCLI"), giải nén nguyên folder `HandBrakeCLI-x.x.x-win-x86_64/` vào `Tools/`. Script `03_HardSub.bat` tự tìm đường dẫn — không cần add PATH.

## Quy trình làm việc (Cách 1: Batch toàn bộ — KHUYẾN NGHỊ)

### Bước 1 — Để raw vào folder anime

Tạo folder `Anime/<tên-anime>/`, copy toàn bộ file `.mkv` của series vào.

### Bước 2 — Chạy `00_ChuanBiTatCa.bat`

Kéo folder anime (hoặc 1 file .mkv bất kỳ trong đó) thả vào `Scripts/00_ChuanBiTatCa.bat`. Script sẽ:
1. Liệt kê tất cả `.mkv` tìm thấy
2. Hiển thị danh sách track sub của file đầu tiên (vd. Track 2: Tiếng Anh)
3. Hỏi chọn Track ID — sẽ áp cho **TẤT CẢ** file (cùng release thường cùng cấu trúc)
4. Với từng file:
   - Parse số tập từ tên file (pattern ` - NN `)
   - Tạo folder `EpNN`
   - Move `.mkv` vào
   - Xuất `.mp3` (libmp3lame Q2)
   - Tách sub track đã chọn → `*_TrackN.ass`
   - Copy thành `vietsub.ass` (file để dịch)

Kết quả: 13 tập anime sẽ có 13 folders `Ep01..Ep13`, mỗi folder sẵn sàng để dịch.

### Bước 3 — Dịch

Mở Claude Code trong folder dự án, gọi skill `anime-vi-translator-safe-fansub`. Skill đọc `EpXX/<tên>.mp3` + `EpXX/<tên>_TrackN.ass` rồi sửa trực tiếp `EpXX/vietsub.ass`.

Chi tiết quy tắc: [Skills/SKILL.md](Skills/SKILL.md).

### Bước 4 — Áp style chuẩn

Copy block `[V4+ Styles]` từ `Styles/Default.ass` đè lên block tương ứng trong `EpXX/vietsub.ass`.

### Bước 5 — Hardsub bằng `03_HardSub.bat`

Kéo file `.mkv` (trong folder `EpXX/`) thả vào `Scripts/03_HardSub.bat`. Script tự:
- Dò `HandBrakeCLI.exe` trong `Tools/HandBrakeCLI-*-win-*/`
- Tìm `vietsub.ass` cùng folder với .mkv
- Burn-in → xuất `<tên>_vietsub.mp4` cùng folder
- Cài đặt: H.264 RF 20, AAC 192 kbps, audio track tiếng Nhật

**Lưu ý font:** Cài font ghi trong `Styles/Default.ass` (mặc định Roboto) vào Windows trước khi encode, không HandBrake sẽ thay bằng font hệ thống.

## Quy trình thủ công (Cách 2: từng file một)

Khi chỉ muốn xử lý 1 tập riêng lẻ:

1. Tạo thủ công folder `Anime/<tên-anime>/EpXX/`, để `.mkv` vào.
2. Kéo `.mkv` vào `Scripts/01_XuatAudio.bat` → xuất `.mp3` cùng folder.
3. Kéo `.mkv` vào `Scripts/02_TachSub.bat` → chọn track → xuất `.ass` + `vietsub.ass` cùng folder.
4. Dịch như Cách 1 Bước 3.
5. Hardsub như Cách 1 Bước 5.

## Quy tắc dịch (tóm tắt)

1. **Honorific Rule** — Tên + honorific trong audio → giữ nguyên (`Tonbo-chan`, `Igarashi-san`).
2. **Audio-Adapted Pronoun Rule** — Pronoun Nhật được phát ra → ánh xạ theo tuổi/quan hệ nghe được:
   - Người lớn → trẻ con: `chú/cô — cháu`
   - Cùng tuổi: `tôi/tớ — cậu`
   - Trong gia đình: `mẹ — con`, `bố — con`
3. **Pro-Drop Rule** — Audio KHÔNG có pronoun → BẮT BUỘC lược chủ ngữ trong tiếng Việt, dùng particle (`ạ, nhé, nhỉ, đấy`) để câu mượt.

> "Cháu ăn ngon miệng ghê" ❌ (tự đoán "cháu")
> "Ăn ngon miệng ghê" ✅ (lược chủ ngữ)

## Ghi chú gitignore

- Video `.mkv`, audio `.mp3`, hardsub `.mp4` **không push** — quá nặng.
- Sub `.ass` trong từng `EpXX/` **có push** — đây là sản phẩm chính của dự án.
- Folder `Tools/` (gồm HandBrake CLI, installer các tool) **không push** — tải lại từ trang chính thức.
