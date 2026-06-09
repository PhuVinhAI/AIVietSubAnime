import { execa } from 'execa';
import { basename } from 'node:path';
import type { AudioTrack, SubTrack, VideoProbe } from '../types.js';
import { parseEpisode } from './episode.js';
import { langName } from './langDict.js';
import { resolvedTools } from './tools.js';

/**
 * Probe an .mkv file with ffmpeg to extract its subtitle and audio tracks.
 * ffmpeg writes the info to stderr by design.
 */
export async function probeVideo(filePath: string): Promise<VideoProbe> {
  const { stderr } = await execa(resolvedTools.ffmpeg, ['-i', filePath], { reject: false });
  const lines = stderr.split(/\r?\n/);

  const subTracks: SubTrack[] = [];
  const audioTracks: AudioTrack[] = [];
  let durationSeconds: number | null = null;

  for (const line of lines) {
    // Pattern: "Duration: 00:24:01.07, start: 0.000000, bitrate: ..."
    if (durationSeconds === null) {
      const durMatch = line.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (durMatch && durMatch[1] && durMatch[2] && durMatch[3]) {
        durationSeconds =
          parseInt(durMatch[1], 10) * 3600 +
          parseInt(durMatch[2], 10) * 60 +
          parseFloat(durMatch[3]);
      }
    }

    // Pattern: "Stream #0:2(eng): Subtitle: ass (default)"
    const subMatch = line.match(
      /Stream #0:(\d+)(?:\(([^)]+)\))?: Subtitle: (\w+)(?:\s*\(([^)]+)\))?/
    );
    if (subMatch && subMatch[1] !== undefined && subMatch[3] !== undefined) {
      const id = parseInt(subMatch[1], 10);
      const langCode = subMatch[2] ?? 'und';
      const codec = subMatch[3];
      const isDefault = line.includes('(default)');
      subTracks.push({
        id,
        langCode,
        langName: langName(langCode),
        isDefault,
        codec,
      });
      continue;
    }

    const audMatch = line.match(/Stream #0:(\d+)(?:\(([^)]+)\))?: Audio:/);
    if (audMatch && audMatch[1] !== undefined) {
      const id = parseInt(audMatch[1], 10);
      const langCode = audMatch[2] ?? 'und';
      audioTracks.push({
        id,
        langCode,
        langName: langName(langCode),
      });
    }
  }

  const fileName = basename(filePath);
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const signature = subTracks
    .map((t) => `${t.id}:${t.langCode}:${t.codec}`)
    .sort()
    .join('|');

  return {
    filePath,
    fileName,
    baseName,
    episodeNumber: parseEpisode(fileName),
    subTracks,
    audioTracks,
    signature,
    durationSeconds,
  };
}

export async function probeMany(paths: string[]): Promise<VideoProbe[]> {
  return Promise.all(paths.map(probeVideo));
}
