import { Box, Text, type TextProps } from 'ink';

import { palette } from '../lib/theme.js';

export type KVRow = {
  key: string;
  value: string;
  /** Override màu value (mặc định = palette.text). */
  color?: TextProps['color'];
  /** Highlight (bold). */
  highlight?: boolean;
};

type Props = {
  rows: KVRow[];
  /** Chiều rộng cột key (mặc định 16). */
  keyWidth?: number;
};

/**
 * Block summary đồng nhất.
 *   ANIME            Oi Tonbo 2nd Season
 *   SỐ EP            12  (3 ghi đè)
 *   STYLE            netflix.ass
 */
export function KeyValue({ rows, keyWidth = 16 }: Props) {
  return (
    <Box flexDirection="column">
      {rows.map((r, i) => (
        <Box key={i}>
          <Box width={keyWidth}>
            <Text color={palette.muted}>{r.key.toUpperCase()}</Text>
          </Box>
          <Text color={r.color ?? palette.text} bold={r.highlight}>
            {r.value}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
