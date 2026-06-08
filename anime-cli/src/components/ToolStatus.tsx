import { Box, Text } from 'ink';
import type { ToolCheck } from '../lib/tools.js';

type Props = {
  ffmpeg: ToolCheck;
  mkvextract: ToolCheck;
  handbrake?: ToolCheck;
  showHandbrake: boolean;
};

function Row({ name, check }: { name: string; check: ToolCheck }) {
  return (
    <Box>
      <Box width={20}>
        <Text>{name}</Text>
      </Box>
      {check.ok ? (
        <Text color="green">✓ OK </Text>
      ) : (
        <Text color="red">✗ {check.error ?? 'không tìm thấy'}</Text>
      )}
      {check.ok && check.path && <Text color="gray">({check.path})</Text>}
    </Box>
  );
}

export function ToolStatus({ ffmpeg, mkvextract, handbrake, showHandbrake }: Props) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="yellow">
        Tools required:
      </Text>
      <Row name="  ffmpeg" check={ffmpeg} />
      <Row name="  mkvextract" check={mkvextract} />
      {showHandbrake && handbrake && <Row name="  HandBrake CLI" check={handbrake} />}
    </Box>
  );
}
