export type SubTrack = {
  id: number;
  langCode: string;
  langName: string;
  isDefault: boolean;
  codec: string;
};

export type AudioTrack = {
  id: number;
  langCode: string;
  langName: string;
};

export type VideoProbe = {
  filePath: string;
  fileName: string;
  baseName: string;
  episodeNumber: string | null;
  subTracks: SubTrack[];
  audioTracks: AudioTrack[];
  signature: string;
  /** Tổng thời lượng (giây). Null nếu ffmpeg không in `Duration:`. */
  durationSeconds: number | null;
};

export type TrackGroup = {
  signature: string;
  subTracks: SubTrack[];
  videos: VideoProbe[];
  chosenTrackId?: number;
};

export type ProcessResult = {
  video: VideoProbe;
  epFolder: string;
  audioOk: boolean;
  subOk: boolean;
  error?: string;
};

export type HardsubJob = {
  epFolder: string;
  mkvPath: string;
  assPath: string;
  outputPath: string;
};

export type HardsubCandidate = HardsubJob & {
  /** Folder Ep ngắn gọn (vd "Ep01"). */
  epName: string;
  /** Đã có file output _vietsub.mp4 từ lần encode trước. */
  hasOutput: boolean;
  /** Thiếu vietsub.ass → không thể hardsub. */
  missingAss: boolean;
};

export type ExportCandidate = {
  /** Folder Ep gốc (vd ".../Anime/Foo/Ep01"). */
  epFolder: string;
  /** Tên Ep (vd "Ep01"). */
  epName: string;
  /** Full path đến file _vietsub.mp4. */
  vietsubPath: string;
  /** Tên file (vd "Foo - 01_vietsub.mp4"). */
  fileName: string;
  /** Kích thước file (byte). */
  sizeBytes: number;
};

export type ExportJob = {
  candidate: ExportCandidate;
  /** Path đích đầy đủ (đã ghép destDir + fileName). */
  destPath: string;
};
