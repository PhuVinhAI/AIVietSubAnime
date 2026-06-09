import { Badge } from '@inkjs/ui';
import { Box, Text } from 'ink';

import type { ToolCheck } from '../lib/tools.js';
import { palette, sym } from '../lib/theme.js';

type Props = {
  ffmpeg: ToolCheck;
  mkvextract: ToolCheck;
  handbrake?: ToolCheck;
  showHandbrake: boolean;
};

function Row({ name, check }: { name: string; check: ToolCheck }) {
  return (
    <Box>
      <Box width={18}>
        <Text color={palette.muted}>
          {`  ${sym.triangleRight} `}
        </Text>
        <Text color={palette.text}>{name}</Text>
      </Box>
      <Box marginRight={1}>
        {check.ok ? (
          <Badge color="green">READY</Badge>
        ) : (
          <Badge color="red">MISSING</Badge>
        )}
      </Box>
      {check.ok && check.path && (
        <Text color={palette.muted}>{check.path}</Text>
      )}
      {!check.ok && check.error && (
        <Text color={palette.error}>{check.error}</Text>
      )}
    </Box>
  );
}

export function ToolStatus({ ffmpeg, mkvextract, handbrake, showHandbrake }: Props) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={0}>
        <Text color={palette.muted} bold>
          SYSTEM CHECK
        </Text>
      </Box>
      <Row name="ffmpeg" check={ffmpeg} />
      <Row name="mkvextract" check={mkvextract} />
      {showHandbrake && handbrake && (
        <Row name="HandBrake CLI" check={handbrake} />
      )}
    </Box>
  );
}
