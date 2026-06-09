import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';

import { accentGradient, brandGradient, palette } from '../lib/theme.js';

type Props = {
  /** Subtitle nhỏ dưới logo. */
  subtitle?: string;
  /** Compact: 1 dòng cho header trong các mode. Mặc định là hero menu. */
  compact?: boolean;
};

const RULE = '━';

export function Brand({ subtitle, compact = false }: Props) {
  if (compact) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Gradient colors={brandGradient}>
            <Text bold>◆ AIVIETSUBANIME</Text>
          </Gradient>
          <Text color={palette.muted}>{'  '}</Text>
          <Gradient colors={accentGradient}>
            <Text>cli</Text>
          </Gradient>
          {subtitle && (
            <Text color={palette.muted}>{`   ·   ${subtitle}`}</Text>
          )}
        </Box>
        <Gradient colors={brandGradient}>
          <Text>{RULE.repeat(60)}</Text>
        </Gradient>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Gradient colors={brandGradient}>
        <Text>{RULE.repeat(60)}</Text>
      </Gradient>

      <Box marginTop={1} marginBottom={1}>
        <Text color={palette.muted}>{' '}</Text>
        <Gradient colors={brandGradient}>
          <Text bold>{'◆  '}</Text>
        </Gradient>
        <Gradient colors={brandGradient}>
          <Text bold>A I V I E T S U B A N I M E</Text>
        </Gradient>
        <Text color={palette.muted}>{'   '}</Text>
        <Gradient colors={accentGradient}>
          <Text bold>cli</Text>
        </Gradient>
      </Box>

      {subtitle && (
        <Box paddingLeft={1}>
          <Text color={palette.muted}>{subtitle}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Gradient colors={brandGradient}>
          <Text>{RULE.repeat(60)}</Text>
        </Gradient>
      </Box>
    </Box>
  );
}
