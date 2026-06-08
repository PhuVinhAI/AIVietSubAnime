import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export type StatusItem = {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skip';
  detail?: string;
};

export function StatusList({ items }: { items: StatusItem[] }) {
  return (
    <Box flexDirection="column">
      {items.map((it, i) => (
        <Box key={i}>
          <Box width={3}>
            {it.status === 'running' ? (
              <Text color="cyan">
                <Spinner type="dots" />
              </Text>
            ) : it.status === 'done' ? (
              <Text color="green">✓</Text>
            ) : it.status === 'error' ? (
              <Text color="red">✗</Text>
            ) : it.status === 'skip' ? (
              <Text color="yellow">⊘</Text>
            ) : (
              <Text color="gray">·</Text>
            )}
          </Box>
          <Box flexDirection="column">
            <Text
              color={
                it.status === 'done'
                  ? 'green'
                  : it.status === 'error'
                  ? 'red'
                  : it.status === 'skip'
                  ? 'yellow'
                  : it.status === 'running'
                  ? 'cyan'
                  : 'gray'
              }
            >
              {it.label}
            </Text>
            {it.detail && <Text color="gray"> {it.detail}</Text>}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
