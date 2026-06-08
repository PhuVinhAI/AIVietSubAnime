# AIVietSubAnime

Bộ công cụ và quy trình dịch phụ đề anime từ tiếng Anh sang tiếng Việt theo chuẩn fansub an toàn (Safe Fansub Style), ưu tiên độ chính xác dựa trên audio gốc tiếng Nhật.

## Mục tiêu

Khắc phục lỗi phổ biến của AI khi dịch EN → VI: AI thường tự đoán đại từ nhân xưng (anh/chị/cô/chú...) sai vì không "nghe" được audio. Skill `anime-vi-translator-safe-fansub` ép quy trình dịch bám sát audio Nhật, giữ honorific Nhật, và áp dụng quy tắc lược chủ ngữ (pro-drop) của tiếng Việt.

## Cấu trúc thư mục

Mỗi anime một folder con trong `Anime/`, các bước workflow được đánh số `01_ → 05_` để nhìn là biết thứ tự:

```
AIVietSubAnime/
├── Anime/<tên-anime>/
│   ├── 01_Raw/          # Video .mkv gốc                       [ignored]
│   ├── 02_Audio/        # MP3 trích từ .mkv (cho AI nghe)      [ignored]
│   ├── 03_SubGoc/       # Sub EN gốc tách từ .mkv              [push]
│   ├── 04_VietSub/      # Sub VN đã dịch (.ass)                [push]
│   └── 05_HardSub/      # Video burn-in tiếng Việt cuối        [ignored]
├── Scripts/
│   ├── 01_XuatAudio.bat # Bước 2: xuất .mp3 từ .mkv
│   ├── 02_TachSub.bat   # Bước 3: tách track sub từ .mkv
│   └── 03_HardSub.md    # Bước 6: hướng dẫn HandBrake
├── Styles/
│   └── Default.ass      # Style mẫu cho .ass (font, màu, viền)
├── Skills/
│   └── SKILL.md         # Quy tắc dịch Safe Fansub Style
└── Tools/               # Installer ngoài                       [ignored]
```

## Yêu cầu công cụ

Tải các tool sau và cài vào PATH:

| Tool | Mục đích | Link |
|------|----------|------|
| FFmpeg | Tách audio, đọc thông tin track sub | https://ffmpeg.org/download.html |
| MKVToolNix | `mkvextract` để tách file phụ đề | https://mkvtoolnix.download/ |
| HandBrake | Burn-in (hardsub) phụ đề vào video | https://handbrake.fr/ |
| VLC | (Tuỳ chọn) preview video & sub | https://www.videolan.org/ |

## Quy trình làm việc (6 bước)

### Bước 1 — Chuẩn bị file

Copy file `.mkv` anime vào `Anime/<tên-anime>/01_Raw/`.

### Bước 2 — Xuất audio MP3

Kéo file `.mkv` thả vào `Scripts/01_XuatAudio.bat`. Output tự động vào `Anime/<tên-anime>/02_Audio/`. Audio này để AI "nghe" trong bước dịch.

### Bước 3 — Tách phụ đề tiếng Anh

Kéo file `.mkv` thả vào `Scripts/02_TachSub.bat`. Script sẽ:
- Liệt kê các track sub trong file
- Hỏi chọn track ID
- Xuất 3 file:
  - `03_SubGoc/<tên>_TrackN.ass` — sub gốc EN
  - `03_SubGoc/<tên>_TrackN.ass.txt` — backup .txt
  - `04_VietSub/vietsub.ass` — file copy để bắt đầu dịch

### Bước 4 — Dịch sang tiếng Việt

Mở Claude Code, gọi skill `anime-vi-translator-safe-fansub`. Skill sẽ:
- Đọc audio (`02_Audio/`) để xác định pronouns thực tế
- Đối chiếu với sub gốc (`03_SubGoc/`) khi cần
- Sửa trực tiếp `04_VietSub/vietsub.ass`
- Giữ honorific Nhật (-san, -chan, -kun...)
- Lược chủ ngữ khi không có pronoun rõ ràng (tránh AI đoán bậy)
- Bảo toàn format ASS (9 dấu phẩy đầu, override tags, `\N`, `\h`)

Chi tiết quy tắc xem [Skills/SKILL.md](Skills/SKILL.md).

### Bước 5 — Áp style chuẩn

Copy block `[V4+ Styles]` từ `Styles/Default.ass` đè lên block tương ứng trong `04_VietSub/vietsub.ass` để chuẩn hoá font/màu/viền.

### Bước 6 — Hardsub bằng HandBrake

Xem hướng dẫn chi tiết trong [Scripts/03_HardSub.md](Scripts/03_HardSub.md). Tóm tắt: Open Source → Import Subtitle `vietsub.ass` → tick **Burned In** → H.264 RF 20 → Save vào `05_HardSub/` → Start Encode.

> **Lưu ý font:** Cài font ghi trong `Styles/Default.ass` (mặc định Roboto) vào Windows trước khi encode, không HandBrake sẽ thay bằng font mặc định.

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

- Video `.mkv` (01_Raw) và audio `.mp3` (02_Audio) **không push** — vài GB/tập.
- Video hardsub `.mp4` (05_HardSub) **không push** — vài trăm MB/tập.
- Sub `.ass` trong `03_SubGoc/` và `04_VietSub/` **có push** — đây là sản phẩm chính.
- Installer trong `Tools/` **không push** — tải trực tiếp từ trang chính thức.
