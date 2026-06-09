# anime-cli

CLI TypeScript + React (Ink) tự động hoá pipeline dịch phụ đề anime. Thay thế toàn bộ batch scripts cũ bằng 1 binary tương tác với progress bar, multi-select, recent-paths history.

## Cài

```bash
cd anime-cli
npm install
npm run build
```

Hoặc dùng launcher ở project root: `..\anime-cli.bat` — tự `npm install` + `npm run build` lần đầu chạy.

## Chạy

```bash
# Menu chính — chọn mode bằng phím mũi tên
npm run dev

# Chỉ định mode + path trực tiếp
npm run dev -- prepare "D:\Raw\Oi Tonbo"
npm run dev -- hardsub "../Anime/Oi Tonbo 2nd Season"
npm run dev -- export  "../Anime/Oi Tonbo 2nd Season"
```

Hoặc từ project root:

```bat
anime-cli                           REM Menu
anime-cli prepare "D:\Raw\Foo"
anime-cli hardsub ".\Anime\Foo"
anime-cli export  ".\Anime\Foo"
```

## 3 chế độ

### `prepare` — Tự động chuẩn bị toàn bộ series

1. Trỏ vào folder bất kỳ chứa `.mkv` (anywhere on disk)
2. CLI scan + suggest tên anime (auto-detect từ tên file)
3. Probe toàn bộ video bằng ffmpeg → phát hiện track sub
4. **Smart group**: tất cả file cùng track structure → hỏi 1 lần. Khác → group theo signature, hỏi từng group.
5. Phát hiện ep đã xử lý trước → hỏi xử lý tất cả / chỉ ep mới / multiselect
6. Confirm → tự move `.mkv` vào `Anime/<tên>/EpNN/`, extract audio `.mp3`, tách sub `.ass`, tạo `vietsub.ass`
7. Process **song song** (audio + sub mỗi file chạy đồng thời)

### `hardsub` — Burn-in qua HandBrake CLI

1. Trỏ vào folder anime đã có `EpNN/` bên trong
2. CLI quét: ep nào có `.mkv` + `vietsub.ass` → "ready"; thiếu file → "skip"; đã có `_vietsub.mp4` → "ghi đè"
3. Pick all / only-new / multiselect riêng
4. Hỏi tích hợp style từ `<project-root>/Styles/` không. Có → CLI replace block `[V4+ Styles]` trong tất cả `vietsub.ass` được chọn.
5. Confirm → encode **serial** (1 ep/lần, ~10-40 phút mỗi ep)
6. Output `<tên>_vietsub.mp4` vào cùng folder Ep

**HandBrake args** (xem `src/lib/handbrake.ts`):
- `-e qsv_h265_10bit --vfr -q 18 --encoder-preset quality`
- `-a 1 -E eac3`
- `--ssa-file vietsub.ass --ssa-burn` (KHÔNG có `-s` → không include internal sub từ MKV).
  Lưu ý: `--subtitle-burned` chỉ cho `-s` list; external SSA phải dùng `--ssa-burn` riêng — trộn nhầm 2 hệ là không burn được.

### `export` — Copy vietsub.mp4 ra USB / điện thoại

1. Trỏ vào folder anime đã hardsub xong
2. Quét tất cả `EpNN/`, gom `*_vietsub.mp4`
3. Pick all / multiselect
4. Hỏi path đích → tự phân loại:
   - **Filesystem** (`D:\Anime`, `\\nas\share`, …) → copy stream với progress bar + ETA + tốc độ
   - **MTP** (`This PC\<phone>\…`) → copy qua Windows Shell COM (PowerShell). Chậm hơn 5–10× nhưng không phải mở ổ lưu trữ thủ công
5. Confirm → copy **serial** (1 channel cho USB/MTP, parallel chỉ thrash)

## Recent paths

Mọi màn hình nhập folder hiện ra danh sách path gần nhất (lưu ở `~/.aivietsub-anime-cli/recent.json`).

- Mặc định focus ô gõ text — nhập như bình thường.
- `↓` chuyển focus xuống list recent → `↑↓` chọn → `Enter` dùng lại.
- 4 category riêng: `prepare-raw`, `hardsub-anime`, `export-anime`, `export-dest`. Mỗi category cap 10 item, dedupe, filter path FS không còn tồn tại.

## Yêu cầu

| Tool | Mục đích | Cài |
|---|---|---|
| `ffmpeg` | Probe + extract audio | Add vào PATH |
| `mkvextract` (MKVToolNix) | Tách sub | Add vào PATH |
| `HandBrakeCLI.exe` | Hardsub | Giải nén vào `<project-root>/Tools/HandBrakeCLI-*-win-*/`. CLI tự dò. |

ToolStatus header ở mỗi mode hiển thị OK / FAIL — chưa đủ tool là chặn ngay.

## Kiến trúc

```
src/
├── index.tsx              # Entry: parse argv, find project root, render <App>
├── App.tsx                # Menu mode selector (Prepare/Hardsub/Export)
├── types.ts               # Shared types (VideoProbe, HardsubJob, ExportJob…)
├── lib/
│   ├── tools.ts           # Detect ffmpeg / mkvextract / HandBrakeCLI
│   ├── probe.ts           # ffmpeg probe → SubTrack/AudioTrack
│   ├── episode.ts         # Parse "Ep XX" từ tên file + detect anime name
│   ├── trackGroup.ts      # Group videos by track signature
│   ├── extract.ts         # ffmpeg + mkvextract wrappers (audio + sub)
│   ├── handbrake.ts       # HandBrakeCLI wrapper + scanHardsubCandidates
│   ├── exportSync.ts      # FS stream copy + scanExportCandidates + classifyDestPath
│   ├── mtpCopy.ts         # Windows Shell COM copy cho MTP devices
│   ├── styles.ts          # Scan + replace [V4+ Styles] block
│   ├── progress.ts        # humanBytes, formatDuration
│   ├── recentPaths.ts     # Lưu/đọc 10 path gần nhất per category
│   ├── useStepNav.ts      # Stack-based state machine hook (back / go)
│   ├── fsx.ts             # File helpers
│   ├── theme.ts           # Palette + symbols thống nhất
│   └── langDict.ts        # ISO code → tên ngôn ngữ tiếng Việt
├── modes/
│   ├── PrepareMode.tsx    # path → probe → pick-track → confirm → process
│   ├── HardsubMode.tsx    # path → scan → pick-eps → style → confirm → encode
│   └── ExportMode.tsx     # path → scan → pick-eps → dest → confirm → copy
└── components/
    ├── Brand.tsx          # Hero gradient header
    ├── HintBar.tsx        # Footer keybinding hints
    ├── KeyValue.tsx       # Bảng key:value cho confirm screens
    ├── MultiSelect.tsx    # Custom multi-select (Space/A/N/Enter)
    ├── PathInput.tsx      # Text input + recent picker (↑↓ switch)
    ├── StatusList.tsx     # Progress list cho processing/done steps
    ├── StepHeader.tsx     # "Bước N/Total — title"
    └── ToolStatus.tsx     # Header check ffmpeg/mkvextract/HandBrake
```

## Dev notes

- ESM only (`"type": "module"`). TS imports phải pass extension `.js`.
- Node 18+ cần thiết, đã test trên Node 24.
- Ink 7 + React 19. `@inkjs/ui` cho `Select` / `ProgressBar` / `Alert` / `Spinner`.
- `tsx` chạy trực tiếp `.tsx` không cần build. `npm run build` ra `dist/` cho production.
- State machine: mỗi mode có 1 `Step` discriminated union + `useStepNav` hook quản lý lịch sử để Esc quay lại bước trước.
- Recent paths: PathInput tự `getRecent(category)` lúc mount, tự `addRecent(category, path)` khi submit. Caller chỉ pass prop `category`.
