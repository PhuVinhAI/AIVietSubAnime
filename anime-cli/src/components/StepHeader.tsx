import { Box, Text } from 'ink';

import { palette, sym } from '../lib/theme.js';

type Props = {
  step: number;
  total: number;
  title: string;
  /** Mô tả phụ một dòng (vd: "Quét xong, chọn ep để encode"). */
  subtitle?: string;
};

/**
 * Header chuẩn AWWWARDS:
 *
 *   BƯỚC 3/5    ● ● ◐ ○ ○
 *   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   Chọn ep để hardsub
 *   Mặc định tick các ep mới...
 */
export function StepHeader({ step, total, title, subtitle }: Props) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={palette.muted}>{`BƯỚC ${step}/${total}`}</Text>
        <Text color={palette.muted}>{`    `}</Text>
        <Dots step={step} total={total} />
      </Box>
      <Text color={palette.muted}>{sym.line.repeat(60)}</Text>
      <Box marginTop={0}>
        <Text bold color={palette.text}>
          {title}
        </Text>
      </Box>
      {subtitle && <Text color={palette.muted}>{subtitle}</Text>}
    </Box>
  );
}

function Dots({ step, total }: { step: number; total: number }) {
  return (
    <Box>
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const isDone = n < step;
        const isCurrent = n === step;
        const color = isDone
          ? palette.accent
          : isCurrent
          ? palette.brand
          : palette.muted;
        const symbol = isCurrent ? sym.dotHalf : isDone ? sym.dotFilled : sym.dotEmpty;
        return (
          <Text key={i} color={color} bold={isCurrent}>
            {symbol}
            {i < total - 1 ? ' ' : ''}
          </Text>
        );
      })}
    </Box>
  );
}
