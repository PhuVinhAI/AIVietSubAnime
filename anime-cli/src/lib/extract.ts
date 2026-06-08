import { execa } from 'execa';
import { join } from 'node:path';
import { copyFileSafe, ensureDir, isFile } from './fsx.js';

export type ExtractOptions = {
  mkvPath: string;
  epFolder: string;
  baseName: string;
  trackId: number;
};

export async function extractAudio(mkvPath: string, mp3Path: string): Promise<void> {
  ensureDir(join(mp3Path, '..'));
  await execa('ffmpeg', [
    '-y',
    '-i', mkvPath,
    '-vn',
    '-c:a', 'libmp3lame',
    '-q:a', '2',
    mp3Path,
  ]);
}

export async function extractSub(
  mkvPath: string,
  trackId: number,
  outPath: string
): Promise<void> {
  ensureDir(join(outPath, '..'));
  await execa('mkvextract', ['tracks', mkvPath, `${trackId}:${outPath}`]);
}

/**
 * Full per-episode prep: extract audio + sub, create backup .txt + vietsub.ass.
 */
export async function prepareEpisode(opts: ExtractOptions): Promise<{
  mp3: string;
  ass: string;
  vietsub: string;
}> {
  const { epFolder, baseName, mkvPath, trackId } = opts;
  ensureDir(epFolder);

  const mp3 = join(epFolder, `${baseName}.mp3`);
  const ass = join(epFolder, `${baseName}_Track${trackId}.ass`);
  const vietsub = join(epFolder, 'vietsub.ass');

  await Promise.all([
    extractAudio(mkvPath, mp3),
    extractSub(mkvPath, trackId, ass),
  ]);

  if (isFile(ass)) {
    copyFileSafe(ass, `${ass}.txt`);
    copyFileSafe(ass, vietsub);
  }

  return { mp3, ass, vietsub };
}
