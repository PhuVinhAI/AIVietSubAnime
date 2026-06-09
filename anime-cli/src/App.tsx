import { Select } from '@inkjs/ui';
import { Box, Text } from 'ink';
import { useState } from 'react';

import { Brand } from './components/Brand.js';
import { HintBar } from './components/HintBar.js';
import { palette, sym } from './lib/theme.js';
import { ExportMode } from './modes/ExportMode.js';
import { HardsubMode } from './modes/HardsubMode.js';
import { PrepareMode } from './modes/PrepareMode.js';
import { YoutubeMode } from './modes/YoutubeMode.js';

type Mode = 'menu' | 'prepare' | 'hardsub' | 'export' | 'youtube';

type Props = {
  initialMode?: 'prepare' | 'hardsub' | 'export' | 'youtube';
  initialPath?: string;
  projectRoot: string;
};

export function App({ initialMode, initialPath, projectRoot }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode ?? 'menu');

  if (mode === 'menu') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Brand subtitle="Tự động hoá pipeline dịch sub" />

        <Box marginBottom={1}>
          <Text color={palette.muted} bold>
            {` ${sym.triangleRight} CHỌN CHẾ ĐỘ`}
          </Text>
        </Box>

        <Select
          options={[
            {
              label: 'Prepare    ·  Quét raw + tách audio/sub cho toàn series',
              value: 'prepare',
            },
            {
              label: 'YouTube    ·  Tải video + audio + sub từ link, convert sang .ass',
              value: 'youtube',
            },
            {
              label: 'Hardsub    ·  Burn-in vietsub.ass vào video qua HandBrake',
              value: 'hardsub',
            },
            {
              label: 'Export     ·  Copy *_vietsub.mp4 ra USB / điện thoại',
              value: 'export',
            },
            { label: 'Thoát', value: 'exit' },
          ]}
          onChange={(value) => {
            if (value === 'exit') {
              process.exit(0);
            } else {
              setMode(value as Mode);
            }
          }}
        />

        <HintBar
          hints={[
            { key: '↑↓', label: 'điều hướng' },
            { key: 'Enter', label: 'chọn' },
            { key: 'Ctrl+C', label: 'thoát' },
          ]}
        />
      </Box>
    );
  }

  if (mode === 'prepare') {
    return <PrepareMode initialPath={initialPath} projectRoot={projectRoot} />;
  }

  if (mode === 'youtube') {
    return <YoutubeMode initialUrl={initialPath} projectRoot={projectRoot} />;
  }

  if (mode === 'export') {
    return <ExportMode initialPath={initialPath} />;
  }

  return <HardsubMode initialPath={initialPath} projectRoot={projectRoot} />;
}
