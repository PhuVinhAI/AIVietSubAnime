/**
 * Render một thanh progress unicode đơn giản.
 * Vd: renderBar(45, 20) → "█████████░░░░░░░░░░░"
 */
export function renderBar(pct: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const fill = Math.round((clamped / 100) * width);
  return '█'.repeat(fill) + '░'.repeat(width - fill);
}

/** Format giây → "H:MM:SS" hoặc "M:SS". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}
