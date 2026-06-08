import { Box, Text } from 'ink';

type Props = {
  step: number;
  total: number;
  title: string;
};

export function StepHeader({ step, total, title }: Props) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan" bold>
          {' '}
          [Bước {step}/{total}]{' '}
        </Text>
        <Text bold> {title}</Text>
      </Box>
      <Text color="gray">{'─'.repeat(60)}</Text>
    </Box>
  );
}
