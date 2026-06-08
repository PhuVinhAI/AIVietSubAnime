import type { TrackGroup, VideoProbe } from '../types.js';

/**
 * Group videos by their sub-track signature.
 * Returns array sorted: largest group first.
 */
export function groupBySignature(videos: VideoProbe[]): TrackGroup[] {
  const map = new Map<string, TrackGroup>();
  for (const v of videos) {
    const existing = map.get(v.signature);
    if (existing) {
      existing.videos.push(v);
    } else {
      map.set(v.signature, {
        signature: v.signature,
        subTracks: v.subTracks,
        videos: [v],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.videos.length - a.videos.length);
}

/**
 * Suggest the best default sub track for a group.
 * Priority: default flag > English > first .ass/ssa codec > first track.
 */
export function suggestTrack(group: TrackGroup): number | null {
  if (group.subTracks.length === 0) return null;

  const defaultTrack = group.subTracks.find((t) => t.isDefault);
  if (defaultTrack) return defaultTrack.id;

  const engTrack = group.subTracks.find((t) => t.langCode.toLowerCase().startsWith('eng'));
  if (engTrack) return engTrack.id;

  const assTrack = group.subTracks.find((t) =>
    ['ass', 'ssa', 'subrip', 'srt'].includes(t.codec.toLowerCase())
  );
  if (assTrack) return assTrack.id;

  return group.subTracks[0]?.id ?? null;
}
