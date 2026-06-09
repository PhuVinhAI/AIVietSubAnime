import { Box, Text, useInput } from 'ink';
import { useState } from 'react';

import { palette, sym } from '../lib/theme.js';

export type MultiSelectItem<T> = {
  label: string;
  value: T;
  /** Disable selection (still shown but can't be toggled). */
  disabled?: boolean;
  /** Selected by default. */
  preselected?: boolean;
  /** Tag shown after label (vd "ghi đè", "mới"). */
  tag?: { text: string; color: string };
};

type Props<T> = {
  items: MultiSelectItem<T>[];
  onSubmit: (values: T[]) => void;
  onCancel?: () => void;
  /** Render at most this many items at a time (for scrolling long lists). */
  maxVisible?: number;
};

export function MultiSelect<T>({ items, onSubmit, onCancel, maxVisible = 20 }: Props<T>) {
  const [selected, setSelected] = useState<Set<number>>(
    new Set(
      items
        .map((it, i) => (it.preselected && !it.disabled ? i : -1))
        .filter((i) => i >= 0)
    )
  );
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.escape && onCancel) {
      onCancel();
      return;
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(items.length - 1, c + 1));
      return;
    }
    if (input === ' ') {
      const item = items[cursor];
      if (item && !item.disabled) {
        setSelected((s) => {
          const next = new Set(s);
          if (next.has(cursor)) next.delete(cursor);
          else next.add(cursor);
          return next;
        });
      }
      return;
    }
    if (input === 'a' || input === 'A') {
      setSelected(() => {
        const next = new Set<number>();
        items.forEach((it, i) => {
          if (!it.disabled) next.add(i);
        });
        return next;
      });
      return;
    }
    if (input === 'n' || input === 'N') {
      setSelected(() => new Set<number>());
      return;
    }
    if (key.return) {
      const values = items
        .filter((it, i) => !it.disabled && selected.has(i))
        .map((it) => it.value);
      onSubmit(values);
    }
  });

  const total = items.length;
  let start = 0;
  if (total > maxVisible) {
    start = Math.max(0, Math.min(cursor - Math.floor(maxVisible / 2), total - maxVisible));
  }
  const end = Math.min(total, start + maxVisible);
  const visible = items.slice(start, end);
  const enabledCount = items.filter((it) => !it.disabled).length;

  return (
    <Box flexDirection="column">
      {start > 0 && (
        <Text color={palette.muted}>{`  ↑  ${start} item ẩn ở trên`}</Text>
      )}
      {visible.map((it, idx) => {
        const i = start + idx;
        const isCursor = cursor === i;
        const isSel = selected.has(i);
        const box = it.disabled ? '[─]' : isSel ? '[✓]' : '[ ]';
        const labelColor = it.disabled
          ? palette.muted
          : isCursor
          ? palette.accent
          : isSel
          ? palette.text
          : palette.text;
        const pointer = isCursor ? sym.pointer : ' ';
        return (
          <Box key={i}>
            <Text color={palette.brand} bold>
              {`${pointer} `}
            </Text>
            <Text color={isSel ? palette.success : labelColor} bold={isCursor}>
              {box}
            </Text>
            <Text color={labelColor} bold={isCursor}>
              {` ${it.label}`}
            </Text>
            {it.tag && (
              <Text color={it.tag.color}>{`  ${it.tag.text}`}</Text>
            )}
          </Box>
        );
      })}
      {end < total && (
        <Text color={palette.muted}>{`  ↓  ${total - end} item ẩn ở dưới`}</Text>
      )}
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color={palette.accent} bold>
            {` ${selected.size}/${enabledCount} đã chọn`}
          </Text>
        </Box>
        <Text color={palette.muted}>
          {`↑↓ điều hướng  ${sym.bullet}  Space chọn  ${sym.bullet}  A chọn tất cả  ${sym.bullet}  N bỏ tất cả  ${sym.bullet}  Enter xác nhận`}
          {onCancel ? `  ${sym.bullet}  Esc quay lại` : ''}
        </Text>
      </Box>
    </Box>
  );
}
