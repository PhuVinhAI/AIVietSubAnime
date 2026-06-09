import { Box, Text } from 'ink';

import { palette, sym } from '../lib/theme.js';

type Hint = { key: string; label: string };

type Props = {
  hints: Hint[];
};

/**
 * Footer hint thống nhất: `↑↓ điều hướng  ·  Enter chọn  ·  Esc quay lại`
 */
export function HintBar({ hints }: Props) {
  if (hints.length === 0) return null;
  return (
    <Box marginTop={1}>
      {hints.map((h, i) => (
        <Box key={i}>
          {i > 0 && (
            <Text color={palette.muted}>{`  ${sym.bullet}  `}</Text>
          )}
          <Text color={palette.accent} bold>
            {h.key}
          </Text>
          <Text color={palette.muted}>{` ${h.label}`}</Text>
        </Box>
      ))}
    </Box>
  );
}
