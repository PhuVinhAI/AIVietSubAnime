# AIVietSubAnime

Bộ công cụ và quy trình dịch phụ đề anime từ tiếng Anh sang tiếng Việt theo chuẩn fansub an toàn (Safe Fansub Style), ưu tiên độ chính xác dựa trên audio gốc tiếng Nhật.

## Mục tiêu

Khắc phục lỗi phổ biến của AI khi dịch EN → VI: AI thường tự đoán đại từ nhân xưng (anh/chị/cô/chú...) sai vì không "nghe" được audio. Skill `anime-vi-translator-safe-fansub` ép quy trình dịch bám sát audio Nhật, giữ honorific Nhật, và áp dụng quy tắc lược chủ ngữ (pro-drop) của tiếng Việt.

## Cấu trúc thư mục

```
AIVietSubAnime/
├── Anime/                      # Mỗi anime một folder con
│   └── <Tên anime>/
│       ├── Raw/                # Video gốc .mkv (gitignored)
│       ├── Audio/              # Audio extract .mp3 (gitignored)
│       ├── Sub/                # Sub gốc tách ra
│       └── Translate/          # Sub đã dịch sang tiếng Việt (.ass)
├── Scripts/                    # Batch script tự động hoá
│   ├── TachSubAnime.bat        # Tách track phụ đề từ .mkv
│   └── XuatAudioAnime.bat      # Xuất audio MP3 từ .mkv
├── Skills/
│   └── SKILL.md                # Quy tắc dịch Safe Fansub Style
├── SubStyles/
│   └── Style1.txt              # Style mẫu cho .ass
└── Tools/                      # Installer (gitignored — tải từ trang chính)
```

## Yêu cầu công cụ

Tải các tool sau và cài vào PATH:

| Tool | Mục đích | Link |
|------|----------|------|
| FFmpeg | Tách audio, đọc thông tin track | https://ffmpeg.org/download.html |
| MKVToolNix | `mkvextract` để tách sub | https://mkvtoolnix.download/ |
| HandBrake | (Tuỳ chọn) re-encode | https://handbrake.fr/ |
| VLC | (Tuỳ chọn) preview | https://www.videolan.org/ |

## Quy trình làm việc

### 1. Chuẩn bị file

Copy file `.mkv` anime vào `Anime/<Tên anime>/Raw/`.

### 2. Xuất audio MP3

Kéo file `.mkv` thả vào `Scripts/XuatAudioAnime.bat`. Output tự động vào `Anime/<Tên anime>/Audio/`.

### 3. Tách phụ đề tiếng Anh

Kéo file `.mkv` thả vào `Scripts/TachSubAnime.bat`. Script sẽ:
- Liệt kê các track sub trong file
- Hỏi chọn track ID
- Tách ra 3 file trong `Anime/<Tên anime>/Translate/`:
  - `*_TrackN.ass` — file gốc
  - `*_TrackN.ass.txt` — bản copy backup
  - `vietsub.ass` — file để dịch trực tiếp

### 4. Dịch sang tiếng Việt

Mở Claude Code, gọi skill `anime-vi-translator-safe-fansub`. Skill sẽ:
- Đọc audio để xác định pronouns nói thực tế
- Giữ honorific Nhật (-san, -chan, -kun...)
- Lược chủ ngữ khi không có pronoun rõ ràng (tránh AI đoán bậy)
- Bảo toàn format ASS (9 dấu phẩy đầu, override tags, `\N`, `\h`)

Chi tiết quy tắc xem [Skills/SKILL.md](Skills/SKILL.md).

### 5. Style phụ đề

Copy block `[V4+ Styles]` từ `SubStyles/Style1.txt` đè lên block tương ứng trong `vietsub.ass` để chuẩn hoá font/màu/viền.

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

- File video `.mkv` và audio `.mp3` **không push** vì quá nặng (vài GB / tập).
- Installer trong `Tools/` không push — tải trực tiếp từ trang chính thức.
- File `.ass` đã dịch **có push** — đây là sản phẩm chính của dự án.
