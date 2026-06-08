/**
 * Parse episode number from anime filename.
 * Tries multiple common patterns:
 *  - " - 01 " (Erai-raws, HorribleSubs style)
 *  - " - 01v2 ", " - 01 (Repack)"
 *  - "_01_", "_E01_"
 *  - " 01 [", " 01."
 *  - "Ep01", "Episode 01"
 *
 * Returns 2-digit zero-padded string ("01", "13") or null.
 */
export function parseEpisode(fileName: string): string | null {
  const base = fileName.replace(/\.(mkv|mp4|avi)$/i, '');

  const patterns: RegExp[] = [
    / - (\d{1,3})(?:v\d+)?(?:\s|\[|\(|$)/i,
    /\bEp(?:isode)?\.?\s*(\d{1,3})\b/i,
    /[\s_-]E(\d{1,3})[\s_\-\[\]]/i,
    /_(\d{1,3})_/,
    /\s(\d{1,3})\s*\[/,
    /\s(\d{1,3})$/,
  ];

  for (const re of patterns) {
    const m = base.match(re);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (n >= 0 && n < 1000) {
        return n.toString().padStart(2, '0');
      }
    }
  }
  return null;
}

/**
 * Auto-detect anime name from a set of filenames by finding the
 * longest common substring after stripping [tags] and trailing -NN [...]
 */
export function detectAnimeName(fileNames: string[]): string | null {
  if (fileNames.length === 0) return null;

  const cleaned = fileNames
    .map((f) => f.replace(/\.(mkv|mp4|avi)$/i, ''))
    .map((f) => f.replace(/^\[[^\]]+\]\s*/g, ''))
    .map((f) => f.replace(/\s*-\s*\d{1,3}(?:v\d+)?\b.*$/i, ''))
    .map((f) => f.replace(/\s+\(\d{4}\).*$/, ''))
    .map((f) => f.trim());

  const first = cleaned[0];
  if (!first) return null;

  if (cleaned.every((s) => s === first)) return first;

  let common = first;
  for (const s of cleaned.slice(1)) {
    let i = 0;
    while (i < common.length && i < s.length && common[i] === s[i]) i++;
    common = common.slice(0, i).trimEnd().replace(/[-_\s]+$/, '');
    if (!common) break;
  }
  return common.length > 0 ? common : null;
}
