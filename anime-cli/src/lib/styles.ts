import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export type StyleEntry = {
  filePath: string;
  fileName: string;
};

/**
 * Scan a Styles/ folder for .ass / .txt style files.
 */
export function scanStyles(stylesDir: string): StyleEntry[] {
  try {
    if (!statSync(stylesDir).isDirectory()) return [];
    return readdirSync(stylesDir)
      .filter((f) => /\.(ass|txt)$/i.test(f))
      .map((f) => ({ filePath: join(stylesDir, f), fileName: f }))
      .sort((a, b) => a.fileName.localeCompare(b.fileName));
  } catch {
    return [];
  }
}

/**
 * Read a style file and extract its [V4+ Styles] block.
 * If the file is purely a block already (just `[V4+ Styles]` + Format/Style lines),
 * returns it as-is. Otherwise extracts only the matching section.
 */
export function readStyleBlock(stylePath: string): string {
  const content = readFileSync(stylePath, 'utf-8');
  const blockMatch = content.match(/\[V4\+ Styles\][\s\S]*?(?=\r?\n\r?\n?\[|$)/);
  if (blockMatch) return blockMatch[0].trimEnd();
  return content.trimEnd();
}

/**
 * Replace the [V4+ Styles] block in target .ass with the supplied block content.
 * Preserves [Script Info], [Events], etc.
 */
export function applyStyleToAss(styleBlock: string, assPath: string): void {
  let content = readFileSync(assPath, 'utf-8');
  const cleanBlock = styleBlock.trimEnd() + '\n';

  const blockRegex = /\[V4\+ Styles\][\s\S]*?(?=\r?\n\[)/;
  if (blockRegex.test(content)) {
    content = content.replace(blockRegex, cleanBlock);
  } else {
    // Try to insert before [Events] if exists, else prepend
    const eventsIdx = content.indexOf('[Events]');
    if (eventsIdx >= 0) {
      content = content.slice(0, eventsIdx) + cleanBlock + '\n' + content.slice(eventsIdx);
    } else {
      content = cleanBlock + '\n' + content;
    }
  }
  writeFileSync(assPath, content, 'utf-8');
}

export function styleDisplayName(entry: StyleEntry): string {
  return basename(entry.fileName, /\.(ass|txt)$/i.exec(entry.fileName)?.[0] ?? '');
}
