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
