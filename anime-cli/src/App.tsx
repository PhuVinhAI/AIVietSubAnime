import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { useState } from 'react';

import { HardsubMode } from './modes/HardsubMode.js';
import { PrepareMode } from './modes/PrepareMode.js';

type Mode = 'menu' | 'prepare' | 'hardsub';

type Props = {
  initialMode?: 'prepare' | 'hardsub';
  initialPath?: string;
  projectRoot: string;
};

export function App({ initialMode, initialPath, projectRoot }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode ?? 'menu');

  if (mode === 'menu') {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1} flexDirection="column">
          <Text color="cyan" bold>
            ╔══════════════════════════════════════════════════════════╗
          </Text>
          <Text color="cyan" bold>
            ║   AIVietSubAnime CLI — Tự động hoá pipeline dịch sub     ║
          </Text>
          <Text color="cyan" bold>
            ╚══════════════════════════════════════════════════════════╝
          </Text>
        </Box>
        <Text>Chọn chế độ:</Text>
        <SelectInput
          items={[
            {
              label: 'Prepare — Quét raw + tách audio/sub cho toàn series',
              value: 'prepare',
            },
            {
              label: 'Hardsub — Burn-in vietsub.ass vào video qua HandBrake CLI',
              value: 'hardsub',
            },
            { label: 'Thoát', value: 'exit' },
          ]}
          onSelect={(item) => {
            if (item.value === 'exit') {
              process.exit(0);
            } else {
              setMode(item.value as Mode);
            }
          }}
        />
      </Box>
    );
  }

  if (mode === 'prepare') {
    return <PrepareMode initialPath={initialPath} projectRoot={projectRoot} />;
  }

  return <HardsubMode initialPath={initialPath} projectRoot={projectRoot} />;
}
