import figures from 'figures';

/**
 * Bảng màu thương hiệu — cyan → violet → pink (Tailwind 400 series).
 * Dùng cho gradient hero, dot indicator, badge accent.
 */
export const brandGradient: string[] = ['#22D3EE', '#A78BFA', '#F472B6'];

/** Cyan → blue cho gradient phụ (dữ liệu, processing). */
export const accentGradient: string[] = ['#22D3EE', '#60A5FA'];

/** Map màu Ink dùng nhất quán toàn app. */
export const palette = {
  text: 'white',
  muted: 'gray',
  subtle: 'gray',
  accent: 'cyanBright',
  accentDim: 'cyan',
  brand: 'magentaBright',
  success: 'green',
  successBright: 'greenBright',
  warn: 'yellow',
  warnBright: 'yellowBright',
  error: 'red',
  errorBright: 'redBright',
  info: 'blueBright',
} as const;

/** Bộ symbol unicode chuẩn (qua `figures` để fallback an toàn). */
export const sym = {
  bullet: figures.bullet,
  tick: figures.tick,
  cross: figures.cross,
  skip: figures.lozengeOutline,
  pointer: figures.pointer,
  pointerSmall: figures.pointerSmall,
  arrowRight: figures.arrowRight,
  triangleRight: figures.triangleRightSmall,
  ellipsis: figures.ellipsis,
  info: figures.info,
  warning: figures.warning,
  dotFilled: '●',
  dotEmpty: '○',
  dotHalf: '◐',
  line: '─',
  vLine: '│',
} as const;

/** Hint hai phím — chuẩn cho tất cả màn hình. */
export const KEY_HINTS = {
  enter: 'Enter để chọn',
  esc: 'Esc quay lại',
  arrows: '↑↓ điều hướng',
} as const;
