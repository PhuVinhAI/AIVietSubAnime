import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useMemo, useState } from 'react';

import { addRecent, getRecent, type RecentCategory } from '../lib/recentPaths.js';
import { palette, sym } from '../lib/theme.js';

type Props = {
  label: string;
  hint?: string;
  defaultValue?: string;
  /**
   * Khi pass vào, PathInput tự load recent paths từ store + lưu lại khi submit.
   */
  category?: RecentCategory;
  onSubmit: (path: string) => void;
};

function cleanPath(raw: string): string {
  return raw.trim().replace(/^"(.*)"$/, '$1');
}

export function PathInput({ label, hint, defaultValue = '', category, onSubmit }: Props) {
  const [value, setValue] = useState(defaultValue);
  const recent = useMemo(() => (category ? getRecent(category) : []), [category]);
  // -1 = focus on text input, 0..N-1 = focus on recent[idx]
  const [selectedIdx, setSelectedIdx] = useState(-1);

  const submit = (raw: string) => {
    const path = cleanPath(raw);
    if (!path) return;
    if (category) addRecent(category, path);
    onSubmit(path);
  };

  useInput((_input, key) => {
    if (recent.length === 0) return;
    if (key.downArrow) {
      setSelectedIdx((i) => (i + 1 > recent.length - 1 ? -1 : i + 1));
      return;
    }
    if (key.upArrow) {
      setSelectedIdx((i) => (i <= -1 ? recent.length - 1 : i - 1));
      return;
    }
    if (key.return && selectedIdx >= 0) {
      const chosen = recent[selectedIdx];
      if (chosen) submit(chosen);
    }
  });

  const isTypingFocused = selectedIdx === -1;

  return (
    <Box flexDirection="column">
      <Text color={palette.text} bold>
        {label}
      </Text>
      {hint && <Text color={palette.muted}>{hint}</Text>}
      <Box marginTop={0}>
        <Text color={isTypingFocused ? palette.brand : palette.muted} bold>{`${sym.pointer} `}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(v) => submit(v)}
          focus={isTypingFocused}
          showCursor={isTypingFocused}
        />
      </Box>

      {recent.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={palette.muted}>
            {`${sym.triangleRight} Recent  ${sym.bullet}  ↑↓ chọn  ${sym.bullet}  Enter dùng lại`}
          </Text>
          {recent.map((p, i) => {
            const isCursor = i === selectedIdx;
            return (
              <Box key={p}>
                <Text color={isCursor ? palette.brand : palette.muted} bold={isCursor}>
                  {`  ${isCursor ? sym.pointer : ' '} `}
                </Text>
                <Text color={isCursor ? palette.accent : palette.muted} bold={isCursor}>
                  {p}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
