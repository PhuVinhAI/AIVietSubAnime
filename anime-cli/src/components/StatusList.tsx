import { ProgressBar } from '@inkjs/ui';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

import { palette, sym } from '../lib/theme.js';

export type StatusItem = {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skip';
  /** Một dòng phụ (đường dẫn output / lỗi / meta). */
  detail?: string;
  /** % tiến độ live khi `status === 'running'`. Bỏ qua ngược lại. */
  progress?: number;
  /** Phụ trợ inline kế bên progress bar (vd "ETA 12:34 · 60 fps"). */
  meta?: string;
};

const STYLE = {
  pending: { color: palette.muted, icon: sym.bullet },
  running: { color: palette.accent, icon: '' /* spinner */ },
  done: { color: palette.success, icon: sym.tick },
  error: { color: palette.error, icon: sym.cross },
  skip: { color: palette.warn, icon: sym.skip },
} as const;

export function StatusList({ items }: { items: StatusItem[] }) {
  return (
    <Box flexDirection="column">
      {items.map((it, i) => {
        const s = STYLE[it.status];
        const isRunning = it.status === 'running';
        return (
          <Box key={i} flexDirection="column" marginBottom={isRunning ? 0 : 0}>
            <Box>
              <Box width={3}>
                {isRunning ? (
                  <Text color={s.color}>
                    <Spinner type="dots" />
                  </Text>
                ) : (
                  <Text color={s.color}>{s.icon}</Text>
                )}
              </Box>
              <Text color={s.color} bold={isRunning}>
                {it.label}
              </Text>
              {it.meta && (
                <Text color={palette.muted}>{`   ${it.meta}`}</Text>
              )}
            </Box>

            {isRunning && it.progress !== undefined && (
              <Box paddingLeft={3}>
                <Box width={32}>
                  <ProgressBar value={Math.max(0, Math.min(100, it.progress))} />
                </Box>
                <Text color={palette.accent}>{`  ${it.progress.toFixed(1)}%`}</Text>
                {it.detail && (
                  <Text color={palette.muted}>{`   ${sym.triangleRight} ${it.detail}`}</Text>
                )}
              </Box>
            )}

            {!isRunning && it.detail && (
              <Box paddingLeft={3}>
                <Text color={palette.muted}>{it.detail}</Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
