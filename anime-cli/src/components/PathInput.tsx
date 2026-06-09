import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';

import { palette, sym } from '../lib/theme.js';

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
      <Text color={palette.text} bold>
        {label}
      </Text>
      {hint && <Text color={palette.muted}>{hint}</Text>}
      <Box marginTop={0}>
        <Text color={palette.brand} bold>{`${sym.pointer} `}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(v) => onSubmit(v.trim().replace(/^"(.*)"$/, '$1'))}
        />
      </Box>
    </Box>
  );
}
