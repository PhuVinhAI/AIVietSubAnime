import { Box, Text, useInput } from 'ink';
import { useState } from 'react';

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
    new Set(items.map((it, i) => (it.preselected && !it.disabled ? i : -1)).filter((i) => i >= 0))
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
      // toggle all (non-disabled)
      setSelected((s) => {
        const next = new Set(s);
        const allOn = items.every((it, i) => it.disabled || next.has(i));
        items.forEach((it, i) => {
          if (it.disabled) return;
          if (allOn) next.delete(i);
          else next.add(i);
        });
        return next;
      });
      return;
    }
    if (key.return) {
      const values = items.filter((it, i) => !it.disabled && selected.has(i)).map((it) => it.value);
      onSubmit(values);
    }
  });

  const total = items.length;
  // simple scroll window centered on cursor
  let start = 0;
  if (total > maxVisible) {
    start = Math.max(0, Math.min(cursor - Math.floor(maxVisible / 2), total - maxVisible));
  }
  const end = Math.min(total, start + maxVisible);
  const visible = items.slice(start, end);

  return (
    <Box flexDirection="column">
      {start > 0 && <Text color="gray"> ↑ ({start} item ẩn ở trên)</Text>}
      {visible.map((it, idx) => {
        const i = start + idx;
        const isCursor = cursor === i;
        const isSel = selected.has(i);
        const box = it.disabled ? '─' : isSel ? '[x]' : '[ ]';
        const color = it.disabled ? 'gray' : isCursor ? 'cyan' : undefined;
        return (
          <Box key={i}>
            <Text color={isCursor ? 'cyan' : undefined}>{isCursor ? '> ' : '  '}</Text>
            <Text color={color}>
              {box} {it.label}
            </Text>
            {it.tag && (
              <Text color={it.tag.color}> {it.tag.text}</Text>
            )}
          </Box>
        );
      })}
      {end < total && <Text color="gray"> ↓ ({total - end} item ẩn ở dưới)</Text>}
      <Box marginTop={1}>
        <Text color="gray">
          ↑↓ di chuyển · Space chọn · A toggle all · Enter xác nhận
          {onCancel ? ' · Esc huỷ' : ''}
        </Text>
        <Text color="cyan"> · đã chọn {selected.size}/{items.filter((it) => !it.disabled).length}</Text>
      </Box>
    </Box>
  );
}
