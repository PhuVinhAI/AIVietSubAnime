# anime-cli

CLI TypeScript + React (Ink) tự động hoá pipeline dịch phụ đề anime. Thay thế toàn bộ batch scripts cũ bằng 1 binary tương tác.

## Cài

```bash
cd anime-cli
npm install
```

## Chạy

```bash
# Menu chính (chọn mode prepare/hardsub bằng phím mũi tên)
npm run dev

# Hoặc chỉ định mode + path trực tiếp
npm run dev -- prepare "D:\Raw\Oi Tonbo"
npm run dev -- hardsub "../Anime/Oi Tonbo 2nd Season"
```

## 2 chế độ

### `prepare` — Tự động chuẩn bị toàn bộ series

Workflow:
1. Trỏ vào folder bất kỳ chứa `.mkv` (anywhere on disk)
2. CLI scan + suggest tên anime (auto-detect từ tên file)
3. Probe toàn bộ video bằng ffmpeg → phát hiện track sub
4. **Smart group**: nếu tất cả file có cùng track structure → hỏi 1 lần. Nếu khác → group theo signature, hỏi từng group.
5. Confirm → tự move .mkv vào `Anime/<tên>/EpNN/`, extract audio `.mp3`, tách sub `.ass`, tạo `vietsub.ass`

### `hardsub` — Burn-in qua HandBrake CLI

Workflow:
1. Trỏ vào folder anime đã có `EpNN/` bên trong
2. CLI quét: ep nào có cả `.mkv` + `vietsub.ass` → "ready"; thiếu file hoặc đã encode → "skip"
3. Confirm → encode serial (1 ep/lần, ~10-40 phút mỗi ep)
4. Output `<tên>_vietsub.mp4` vào cùng folder Ep

## Yêu cầu

| Tool | Mục đích | Cài |
|---|---|---|
| `ffmpeg` | Probe + extract audio | Add vào PATH |
| `mkvextract` (MKVToolNix) | Tách sub | Add vào PATH |
| `HandBrakeCLI.exe` | Hardsub | Giải nén vào `<project-root>/Tools/HandBrakeCLI-*-win-*/`. CLI tự dò. |

## Kiến trúc

```
src/
├── index.tsx           # Entry: parse argv, render <App>
├── App.tsx             # Menu mode selector
├── types.ts            # Shared types
├── lib/
│   ├── tools.ts        # Detect ffmpeg/mkvextract/HandBrakeCLI
│   ├── probe.ts        # ffmpeg probe → SubTrack/AudioTrack
│   ├── episode.ts      # Parse "Ep XX" từ tên file + detect anime name
│   ├── trackGroup.ts   # Group videos by track signature
│   ├── extract.ts      # ffmpeg + mkvextract wrappers
│   ├── handbrake.ts    # HandBrakeCLI wrapper + scanHardsubJobs
│   ├── fsx.ts          # File helpers
│   └── langDict.ts     # Mã ISO ngôn ngữ → tên tiếng Việt
├── modes/
│   ├── PrepareMode.tsx # State machine: path → probe → pick → confirm → process
│   └── HardsubMode.tsx # State machine: path → scan → confirm → queue
└── components/
    ├── PathInput.tsx
    ├── StepHeader.tsx
    ├── StatusList.tsx
    └── ToolStatus.tsx
```

## Dev notes

- ESM only (`"type": "module"`). Import `.js` extension cho TS imports.
- Node 18+ cần thiết, đã test trên Node 24.
- Ink 7 + React 19.
- `tsx` chạy trực tiếp .tsx không cần build. `npm run build` ra `dist/` cho production.
