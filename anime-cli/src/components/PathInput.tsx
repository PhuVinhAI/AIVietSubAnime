import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';

type Props = {
  label: string;
  hint?: string;
  defaultValue?: string;
  onSubmit: (path: string) => void;
};

export function PathInput({ label, hint, defaultValue = '', onSubmit }: Props) {
  const [value, setValue] = useState(defaultValue);
  return (
    <Box flexDirection="column">
      <Text>{label}</Text>
      {hint && <Text color="gray">{hint}</Text>}
      <Box>
        <Text color="cyan">{'> '}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(v) => onSubmit(v.trim().replace(/^"(.*)"$/, '$1'))}
        />
      </Box>
    </Box>
  );
}
