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
├── anime-cli/                # ⭐ CLI TypeScript + Ink (tự động hoá toàn bộ pipeline)
│   ├── src/                  #    code TypeScript + React (Ink)
│   ├── package.json
│   └── README.md
├── Styles/
│   └── Default.ass           # Style mẫu cho .ass (font, màu, viền)
├── Skills/
│   └── SKILL.md              # Quy tắc dịch Safe Fansub Style
└── Tools/                    # HandBrakeCLI + installer            [ignored]
    └── HandBrakeCLI-*-win-*/HandBrakeCLI.exe (CLI tự detect)
```

**Vì sao 1 folder 1 ep?**
- HandBrake / VLC chỉ cần mở 1 folder là thấy đủ video + sub
- Dễ quản lý theo tập, xoá Ep nào sau khi xong không ảnh hưởng tập khác
- Không cần truyền path lung tung qua nhiều folder con

## Yêu cầu công cụ

| Tool | Mục đích | Cách cài |
|------|----------|----------|
| Node.js 18+ | Chạy `anime-cli` | https://nodejs.org/ |
| FFmpeg | Tách audio, đọc thông tin track sub | Add vào PATH — https://ffmpeg.org/download.html |
| MKVToolNix | `mkvextract` tách sub | Add vào PATH — https://mkvtoolnix.download/ |
| HandBrake CLI | Burn-in (hardsub) | Giải nén vào `Tools/HandBrakeCLI-*-win-*/` — CLI tự dò |
| VLC | (Tuỳ chọn) preview | https://www.videolan.org/ |

> **HandBrake CLI**: tải tại https://handbrake.fr/downloads2.php (chọn "HandBrakeCLI"), giải nén nguyên folder `HandBrakeCLI-x.x.x-win-x86_64/` vào `Tools/`. CLI tự tìm — không cần add PATH.

## Cài CLI lần đầu

```bash
cd anime-cli
npm install
```

## Quy trình làm việc

### Bước 1 — Prepare: extract audio + sub cho toàn series

```bash
cd anime-cli
npm run dev -- prepare "D:\Raw\Oi Tonbo 2nd Season"
```

CLI sẽ tự:
1. Quét folder, liệt kê tất cả `.mkv`
2. Auto-detect tên anime (cho phép sửa)
3. Probe tất cả file → phân tích track sub
4. **Smart grouping**:
   - Tất cả file có cùng track structure → hỏi 1 lần
   - Khác nhau → group theo signature, hỏi từng group
5. Xác nhận → tự move `.mkv` vào `Anime/<tên>/EpNN/` + extract `.mp3` + tách `.ass` + tạo `vietsub.ass`

### Bước 2 — Dịch (Claude Code)

Mở Claude Code trong project root, gọi skill `anime-vi-translator-safe-fansub`. Skill đọc `Anime/<tên>/EpXX/<tên>.mp3` + `..._TrackN.ass` rồi sửa trực tiếp `vietsub.ass`.

Chi tiết quy tắc: [Skills/SKILL.md](Skills/SKILL.md).

### Bước 3 — Áp style chuẩn

Copy block `[V4+ Styles]` từ `Styles/Default.ass` đè lên block tương ứng trong `EpXX/vietsub.ass`.

### Bước 4 — Hardsub queue

```bash
cd anime-cli
npm run dev -- hardsub "../Anime/Oi Tonbo 2nd Season"
```

CLI sẽ:
1. Quét tất cả `EpNN/`, check ep nào có cả `.mkv` + `vietsub.ass` → "ready"
2. Liệt kê ready vs skipped, xác nhận
3. Encode serial qua HandBrake CLI (mỗi ep ~10-40 phút), tự xuất `<tên>_vietsub.mp4` vào folder ep

**Lưu ý font:** Cài font ghi trong `Styles/Default.ass` (mặc định Roboto) vào Windows trước khi encode, nếu không HandBrake sẽ thay bằng font hệ thống.

### Mode menu (interactive)

Nếu không truyền args, CLI hiện menu cho chọn:

```bash
cd anime-cli
npm run dev
```

→ chọn `Prepare` hoặc `Hardsub` rồi nhập path tại prompt.

Chi tiết kiến trúc CLI: [anime-cli/README.md](anime-cli/README.md).

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
- Folder `Tools/` (HandBrake CLI + installer) **không push** — tải lại từ trang chính thức.
- `anime-cli/node_modules/` và `anime-cli/dist/` **không push** — chỉ giữ source.
