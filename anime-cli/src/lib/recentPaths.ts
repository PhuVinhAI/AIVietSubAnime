import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const STORE_DIR = join(homedir(), '.aivietsub-anime-cli');
const STORE_FILE = join(STORE_DIR, 'recent.json');
const MAX_PER_CATEGORY = 10;

export type RecentCategory =
  | 'prepare-raw'
  | 'hardsub-anime'
  | 'export-anime'
  | 'export-dest';

type Store = Partial<Record<RecentCategory, string[]>>;

function readStore(): Store {
  try {
    if (!existsSync(STORE_FILE)) return {};
    const raw = readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Store = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        out[k as RecentCategory] = v.filter((x): x is string => typeof x === 'string');
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
    writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch {
    // Best-effort — không crash CLI nếu home không ghi được.
  }
}

/**
 * Lấy danh sách path gần đây cho 1 category. Path filesystem không tồn tại
 * sẽ bị lọc; MTP shell path ("This PC\...") không kiểm tra (giữ nguyên).
 */
export function getRecent(category: RecentCategory): string[] {
  const store = readStore();
  const list = store[category] ?? [];
  return list.filter((p) => isLikelyMtp(p) || existsSync(p));
}

/**
 * Đẩy path lên đầu danh sách, dedupe, cap MAX_PER_CATEGORY.
 * Path rỗng / chỉ whitespace bị bỏ qua.
 */
export function addRecent(category: RecentCategory, path: string): void {
  const trimmed = path.trim();
  if (!trimmed) return;
  const store = readStore();
  const current = store[category] ?? [];
  const deduped = [trimmed, ...current.filter((p) => p !== trimmed)].slice(
    0,
    MAX_PER_CATEGORY
  );
  store[category] = deduped;
  writeStore(store);
}

function isLikelyMtp(p: string): boolean {
  // MTP path từ classifyDestPath bắt đầu bằng "This PC\" hoặc "::{...}\"
  return /^(This PC|::\{)/i.test(p);
}
