import { Alert, Badge, Select, Spinner as UiSpinner } from '@inkjs/ui';
import { Box, Text, useApp, useInput } from 'ink';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { useEffect, useState } from 'react';

import { Brand } from '../components/Brand.js';
import { HintBar } from '../components/HintBar.js';
import { KeyValue } from '../components/KeyValue.js';
import { MultiSelect } from '../components/MultiSelect.js';
import { PathInput } from '../components/PathInput.js';
import { StatusList, type StatusItem } from '../components/StatusList.js';
import { StepHeader } from '../components/StepHeader.js';
import { classifyDestPath, copyFileWithProgress, scanExportCandidates } from '../lib/exportSync.js';
import { copyToMtpShell } from '../lib/mtpCopy.js';
import { humanBytes } from '../lib/progress.js';
import { palette, sym } from '../lib/theme.js';
import { useStepNav } from '../lib/useStepNav.js';
import type { ExportCandidate, ExportJob } from '../types.js';

const TOTAL_STEPS = 5;

type Step =
  | { kind: 'path' }
  | { kind: 'scanning'; path: string }
  | {
      kind: 'scan-result';
      animeFolder: string;
      candidates: ExportCandidate[];
      skipped: { epName: string; reason: string }[];
    }
  | {
      kind: 'pick-eps';
      animeFolder: string;
      candidates: ExportCandidate[];
      skipped: { epName: string; reason: string }[];
    }
  | {
      kind: 'dest';
      animeFolder: string;
      candidates: ExportCandidate[];
    }
  | {
      kind: 'confirm';
      animeFolder: string;
      candidates: ExportCandidate[];
      destDir: string;
      destKind: 'fs' | 'mtp';
    }
  | {
      kind: 'processing';
      jobs: ExportJob[];
      statuses: StatusItem[];
      current: number;
      destKind: 'fs' | 'mtp';
    }
  | { kind: 'done'; statuses: StatusItem[] };

type Nav = { go: (next: Step) => void; back: () => boolean };

type Props = {
  initialPath?: string;
};

const STEP_NUMBER: Partial<Record<Step['kind'], number>> = {
  path: 1,
  scanning: 1,
  'scan-result': 2,
  'pick-eps': 2,
  dest: 3,
  confirm: 4,
  processing: 5,
  done: 5,
};

function metaForCopy(p: { bytesCopied: number; totalBytes: number; bytesPerSecond: number }): string {
  const remaining = Math.max(0, p.totalBytes - p.bytesCopied);
  const etaSec = p.bytesPerSecond > 0 ? remaining / p.bytesPerSecond : 0;
  const etaStr =
    etaSec > 0 && Number.isFinite(etaSec)
      ? `ETA ${etaSec >= 60 ? `${Math.floor(etaSec / 60)}m${Math.floor(etaSec % 60)
          .toString()
          .padStart(2, '0')}s` : `${Math.ceil(etaSec)}s`}`
      : '';
  const sizeStr = `${humanBytes(p.bytesCopied)} / ${humanBytes(p.totalBytes)}`;
  const speedStr = `${humanBytes(p.bytesPerSecond)}/s`;
  return [sizeStr, speedStr, etaStr].filter(Boolean).join(`  ${sym.bullet}  `);
}

export function ExportMode({ initialPath }: Props) {
  const { exit } = useApp();
  const nav = useStepNav<Step>(initialPath ? { kind: 'scanning', path: initialPath } : { kind: 'path' });
  const { step, setStep, go, back, canBack } = nav;
  const [error, setError] = useState<string | null>(null);

  const isBackEnabled =
    !error &&
    canBack &&
    step.kind !== 'scanning' &&
    step.kind !== 'processing' &&
    step.kind !== 'done' &&
    step.kind !== 'pick-eps';
  useInput(
    (_input, key) => {
      if (key.escape) back();
    },
    { isActive: isBackEnabled }
  );

  useEffect(() => {
    if (step.kind !== 'scanning') return;
    try {
      const abs = resolve(step.path);
      if (!existsSync(abs) || !statSync(abs).isDirectory()) {
        setError(`Folder không tồn tại: ${abs}`);
        setStep({ kind: 'path' });
        return;
      }
      const { candidates, skipped } = scanExportCandidates(abs);
      setStep({ kind: 'scan-result', animeFolder: abs, candidates, skipped });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep({ kind: 'path' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step.kind !== 'processing') return;
    let cancelled = false;
    const destKind = step.destKind;

    const run = async () => {
      const statuses = [...step.statuses];

      // Copy SERIAL — USB và MTP đều 1 channel; parallel chỉ tổ thrash.
      for (let i = 0; i < step.jobs.length; i++) {
        if (cancelled) return;
        const job = step.jobs[i];
        if (!job) continue;

        statuses[i] = {
          ...statuses[i]!,
          status: 'running',
          progress: destKind === 'mtp' ? undefined : 0,
          meta:
            destKind === 'mtp'
              ? `${humanBytes(job.candidate.sizeBytes)}  ${sym.bullet}  xem dialog copy của Windows`
              : `0 / ${humanBytes(job.candidate.sizeBytes)}`,
        };
        setStep((s) =>
          s.kind === 'processing' ? { ...s, statuses: [...statuses], current: i } : s
        );

        try {
          let lastFlush = 0;
          const flush = (progress: number, meta: string) => {
            statuses[i] = {
              ...statuses[i]!,
              status: 'running',
              progress,
              meta,
            };
            setStep((s) =>
              s.kind === 'processing'
                ? { ...s, statuses: [...statuses], current: i }
                : s
            );
          };

          if (destKind === 'mtp') {
            // MTP qua Shell.Application — Windows tự hiện dialog copy với
            // progress bar riêng của nó. CLI chỉ giữ spinner + nhãn tĩnh,
            // không vẽ thêm bar để khỏi giẫm chân nhau.
            await copyToMtpShell({
              src: job.candidate.vietsubPath,
              destShellPath: dirname(job.destPath),
              // Bỏ qua mọi progress event — ta chỉ cần "done" để qua file tiếp.
            });
          } else {
            // FS stream copy — vận tốc và ETA tính trực tiếp trong lib.
            await copyFileWithProgress({
              src: job.candidate.vietsubPath,
              dest: job.destPath,
              onProgress: (p) => {
                const now = performance.now();
                if (p.bytesCopied < p.totalBytes && now - lastFlush < 200) return;
                lastFlush = now;
                const pct = p.totalBytes > 0 ? (p.bytesCopied / p.totalBytes) * 100 : 0;
                flush(pct, metaForCopy(p));
              },
            });
          }

          statuses[i] = {
            ...statuses[i]!,
            status: 'done',
            progress: undefined,
            meta: undefined,
            detail: `${sym.arrowRight} ${job.destPath}`,
          };
        } catch (e) {
          statuses[i] = {
            ...statuses[i]!,
            status: 'error',
            progress: undefined,
            meta: undefined,
            detail: e instanceof Error ? e.message : String(e),
          };
        }
        setStep((s) =>
          s.kind === 'processing' ? { ...s, statuses: [...statuses], current: i } : s
        );
      }
      if (cancelled) return;
      setStep({ kind: 'done', statuses });
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  useEffect(() => {
    if (step.kind === 'done') {
      const timer = setTimeout(() => exit(), 2500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [step.kind, exit]);

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Brand subtitle="Export mode" compact />
        <Box marginBottom={1}>
          <Alert variant="error" title="Đã xảy ra lỗi">
            {error}
          </Alert>
        </Box>
        {step.kind === 'path' && (
          <PathInput
            label="Nhập folder anime:"
            hint="Folder anime có các Ep01/Ep02/... bên trong"
            onSubmit={(path) => {
              setError(null);
              go({ kind: 'scanning', path });
            }}
          />
        )}
      </Box>
    );
  }

  const stepNumber = STEP_NUMBER[step.kind] ?? 1;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Brand subtitle="Export mode" compact />

      {step.kind === 'path' && (
        <Box flexDirection="column">
          <StepHeader
            step={stepNumber}
            total={TOTAL_STEPS}
            title="Folder anime cần export"
            subtitle="Folder anime có các Ep01/Ep02/... bên trong (mỗi Ep có *_vietsub.mp4)."
          />
          <PathInput
            label="Path"
            hint="Vd. C:\Users\you\Docs\AIVietSubAnime\Anime\Oi Tonbo 2nd Season"
            onSubmit={(path) => go({ kind: 'scanning', path })}
          />
        </Box>
      )}

      {step.kind === 'scanning' && (
        <Box flexDirection="column">
          <StepHeader
            step={stepNumber}
            total={TOTAL_STEPS}
            title="Đang quét folder"
            subtitle={step.path}
          />
          <UiSpinner label=" Đang đọc các Ep folder..." />
        </Box>
      )}

      {step.kind === 'scan-result' && (
        <ScanResultUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'pick-eps' && (
        <PickEpsUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'dest' && (
        <DestUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'confirm' && (
        <ConfirmUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'processing' && (
        <Box flexDirection="column">
          <StepHeader
            step={TOTAL_STEPS}
            total={TOTAL_STEPS}
            title={`Đang copy  ${sym.bullet}  ${step.current + 1}/${step.jobs.length}`}
            subtitle="Copy serial từng file để USB không bị thrash."
          />
          <StatusList items={step.statuses} />
        </Box>
      )}

      {step.kind === 'done' && (() => {
        const okCount = step.statuses.filter((s) => s.status === 'done').length;
        const errCount = step.statuses.filter((s) => s.status === 'error').length;
        const total = step.statuses.length;
        const allOk = okCount === total;
        const allErr = errCount === total;
        return (
          <Box flexDirection="column">
            <StepHeader
              step={TOTAL_STEPS}
              total={TOTAL_STEPS}
              title={allOk ? 'Export hoàn thành' : allErr ? 'Export thất bại' : 'Export xong (có lỗi)'}
            />
            <StatusList items={step.statuses} />
            <Box marginTop={1}>
              <Alert
                variant={allOk ? 'success' : allErr ? 'error' : 'warning'}
                title={
                  allOk
                    ? 'Đã copy xong'
                    : allErr
                    ? 'Không file nào copy được'
                    : `${okCount}/${total} file thành công`
                }
              >
                {`${okCount}/${total} file đã copy${errCount > 0 ? `  ·  ${errCount} lỗi` : ''}. CLI sẽ thoát sau 2 giây.`}
              </Alert>
            </Box>
          </Box>
        );
      })()}

      {isBackEnabled && (
        <HintBar
          hints={[
            { key: '↑↓', label: 'điều hướng' },
            { key: 'Enter', label: 'chọn' },
            { key: 'Esc', label: 'quay lại' },
          ]}
        />
      )}
    </Box>
  );
}

function ScanResultUI({
  step,
  nav,
  stepNumber,
}: {
  step: Extract<Step, { kind: 'scan-result' }>;
  nav: Nav;
  stepNumber: number;
}) {
  const total = step.candidates.length;
  const totalBytes = step.candidates.reduce((acc, c) => acc + c.sizeBytes, 0);

  const choices: { label: string; value: string }[] = [];
  if (total > 0) {
    choices.push({
      label: `Copy tất cả  (${total} file  ${sym.bullet}  ${humanBytes(totalBytes)})`,
      value: 'all',
    });
    choices.push({ label: 'Pick chọn riêng (multiselect)', value: 'pick' });
  }
  choices.push({ label: 'Huỷ', value: 'cancel' });

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Hàng đợi export"
        subtitle={step.animeFolder}
      />
      <Box flexDirection="column" marginBottom={1}>
        {step.candidates.map((c, i) => (
          <Box key={i}>
            <Text color={palette.success}>{`  ${sym.tick} `}</Text>
            <Text color={palette.text}>{c.epName}</Text>
            <Text color={palette.muted}>{`  ${sym.bullet} ${humanBytes(c.sizeBytes)}  ${sym.bullet} ${c.fileName}`}</Text>
          </Box>
        ))}
        {step.skipped.map((s, i) => (
          <Box key={`s${i}`}>
            <Text color={palette.muted}>{`  ${sym.skip} ${s.epName}  ${sym.bullet} ${s.reason}`}</Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text color={palette.muted}>
            {`Tổng: ${total} ep sẵn sàng  ${sym.bullet}  ${humanBytes(totalBytes)}  ${sym.bullet}  ${step.skipped.length} bỏ qua`}
          </Text>
        </Box>
      </Box>

      {total === 0 ? (
        <Alert variant="warning" title="Không có file vietsub.mp4 nào">
          Chạy hardsub trước để tạo các file _vietsub.mp4.
        </Alert>
      ) : (
        <Select
          options={choices}
          onChange={(value) => {
            if (value === 'cancel') {
              process.exit(0);
              return;
            }
            if (value === 'pick') {
              nav.go({
                kind: 'pick-eps',
                animeFolder: step.animeFolder,
                candidates: step.candidates,
                skipped: step.skipped,
              });
              return;
            }
            nav.go({
              kind: 'dest',
              animeFolder: step.animeFolder,
              candidates: step.candidates,
            });
          }}
        />
      )}
    </Box>
  );
}

function PickEpsUI({
  step,
  nav,
  stepNumber,
}: {
  step: Extract<Step, { kind: 'pick-eps' }>;
  nav: Nav;
  stepNumber: number;
}) {
  const items = step.candidates.map((c) => ({
    label: `${c.epName}  ${sym.bullet}  ${humanBytes(c.sizeBytes)}  ${sym.bullet}  ${c.fileName}`,
    value: c.epFolder,
    preselected: true,
    tag: { text: 'sẵn sàng', color: palette.success },
  }));

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Chọn ep để export"
        subtitle="Mặc định tick tất cả. Bỏ tick file không muốn copy."
      />
      <MultiSelect
        items={items}
        onCancel={() => nav.back()}
        onSubmit={(folders) => {
          const chosen = step.candidates.filter((c) => folders.includes(c.epFolder));
          if (chosen.length === 0) {
            process.exit(0);
            return;
          }
          nav.go({
            kind: 'dest',
            animeFolder: step.animeFolder,
            candidates: chosen,
          });
        }}
      />
    </Box>
  );
}

function DestUI({
  step,
  nav,
  stepNumber,
}: {
  step: Extract<Step, { kind: 'dest' }>;
  nav: Nav;
  stepNumber: number;
}) {
  const totalBytes = step.candidates.reduce((acc, c) => acc + c.sizeBytes, 0);
  const [destError, setDestError] = useState<string | null>(null);

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Folder đích (USB / SD hoặc MTP)"
        subtitle={`Sẽ copy ${step.candidates.length} file  ${sym.bullet}  tổng ${humanBytes(totalBytes)}`}
      />
      <Box marginBottom={1} flexDirection="column">
        <Text color={palette.muted}>
          {`${sym.triangleRight} Filesystem:  D:\\Anime  /  E:\\Download  /  \\\\nas\\share\\anime`}
        </Text>
        <Text color={palette.muted}>
          {`${sym.triangleRight} MTP Android: This PC\\<tên máy>\\Bộ nhớ trong dùng chung\\Download`}
        </Text>
        <Text color={palette.muted}>
          {`  ${sym.ellipsis} MTP qua Windows Shell COM (PowerShell), chậm hơn 5-10× filesystem.`}
        </Text>
      </Box>
      {destError && (
        <Box marginBottom={1}>
          <Alert variant="error" title="Path không hợp lệ">
            {destError}
          </Alert>
        </Box>
      )}
      <PathInput
        label="Path đích"
        hint='Folder sẽ được tạo nếu chưa tồn tại (FS). MTP folder phải đã có sẵn trên thiết bị.'
        onSubmit={(path) => {
          const result = classifyDestPath(path);
          if (!result.ok) {
            setDestError(result.reason);
            return;
          }
          setDestError(null);
          nav.go({
            kind: 'confirm',
            animeFolder: step.animeFolder,
            candidates: step.candidates,
            destDir: result.kind === 'fs' ? result.abs : result.shellPath,
            destKind: result.kind,
          });
        }}
      />
    </Box>
  );
}

function ConfirmUI({
  step,
  nav,
  stepNumber,
}: {
  step: Extract<Step, { kind: 'confirm' }>;
  nav: Nav;
  stepNumber: number;
}) {
  const totalBytes = step.candidates.reduce((acc, c) => acc + c.sizeBytes, 0);
  const jobs: ExportJob[] = step.candidates.map((c) => ({
    candidate: c,
    destPath: join(step.destDir, c.fileName),
  }));
  const isMtp = step.destKind === 'mtp';

  return (
    <Box flexDirection="column">
      <StepHeader step={stepNumber} total={TOTAL_STEPS} title="Xác nhận export" />
      <Box flexDirection="column" marginBottom={1}>
        <Box marginBottom={1}>
          <Box width={16}>
            <Text color={palette.muted}>METHOD</Text>
          </Box>
          <Badge color={isMtp ? 'yellow' : 'cyan'}>
            {isMtp ? 'MTP · Shell COM' : 'FILESYSTEM · Stream'}
          </Badge>
          {isMtp && (
            <Text color={palette.muted}>
              {`   ${sym.bullet}  qua PowerShell, chậm hơn ~5-10×`}
            </Text>
          )}
        </Box>
        <KeyValue
          rows={[
            { key: 'Nguồn', value: step.animeFolder },
            {
              key: 'Đích',
              value: step.destDir,
              color: palette.brand,
              highlight: true,
            },
            {
              key: 'Số file',
              value: `${jobs.length}  ${sym.bullet}  ${humanBytes(totalBytes)}`,
              color: palette.accent,
              highlight: true,
            },
          ]}
        />
        <Box flexDirection="column" marginTop={1}>
          {jobs.map((j, i) => (
            <Text key={i} color={palette.muted}>
              {`  ${sym.triangleRight} ${j.candidate.epName}  ${sym.arrowRight}  ${basename(j.destPath)}  ${sym.bullet} ${humanBytes(j.candidate.sizeBytes)}`}
            </Text>
          ))}
        </Box>
      </Box>
      {isMtp && (
        <Box marginBottom={1}>
          <Alert variant="info" title="Trước khi bắt đầu">
            {`Đảm bảo điện thoại đã unlock + chế độ "Truyền tập tin (MTP)" đã bật. Windows có thể hiện thêm dialog của nó — không cần tương tác, CLI tự chờ.`}
          </Alert>
        </Box>
      )}
      <Select
        options={[
          { label: `Bắt đầu copy ${jobs.length} file (serial)`, value: 'go' },
          { label: 'Huỷ', value: 'cancel' },
        ]}
        onChange={(value) => {
          if (value === 'cancel') {
            process.exit(0);
            return;
          }
          const statuses: StatusItem[] = jobs.map((j) => ({
            label: `${j.candidate.epName}  ${sym.bullet}  ${j.candidate.fileName}`,
            status: 'pending',
          }));
          nav.go({
            kind: 'processing',
            jobs,
            statuses,
            current: 0,
            destKind: step.destKind,
          });
        }}
      />
    </Box>
  );
}
