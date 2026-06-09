import { Box, Text, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { existsSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { useEffect, useState } from 'react';

import { PathInput } from '../components/PathInput.js';
import { StatusList, type StatusItem } from '../components/StatusList.js';
import { StepHeader } from '../components/StepHeader.js';
import { ToolStatus } from '../components/ToolStatus.js';
import { runHardsub, scanHardsubJobs } from '../lib/handbrake.js';
import {
  applyStyleToAss,
  readStyleBlock,
  scanStyles,
  type StyleEntry,
} from '../lib/styles.js';
import { checkAllTools, type ToolCheck } from '../lib/tools.js';
import type { HardsubJob } from '../types.js';

type Step =
  | { kind: 'tools' }
  | { kind: 'path' }
  | { kind: 'scanning'; path: string }
  | {
      kind: 'scan-result';
      animeFolder: string;
      ready: HardsubJob[];
      skipped: { epFolder: string; reason: string }[];
    }
  | {
      kind: 'pick-style';
      animeFolder: string;
      ready: HardsubJob[];
      skipped: { epFolder: string; reason: string }[];
      styles: StyleEntry[];
    }
  | {
      kind: 'confirm';
      animeFolder: string;
      ready: HardsubJob[];
      skipped: { epFolder: string; reason: string }[];
      style: StyleEntry | null;
    }
  | {
      kind: 'processing';
      jobs: HardsubJob[];
      statuses: StatusItem[];
      current: number;
      style: StyleEntry | null;
      stylesApplied: boolean;
    }
  | { kind: 'done'; statuses: StatusItem[] };

type Props = {
  initialPath?: string;
  projectRoot: string;
};

export function HardsubMode({ initialPath, projectRoot }: Props) {
  const { exit } = useApp();
  const [tools, setTools] = useState<{
    ffmpeg: ToolCheck;
    mkvextract: ToolCheck;
    handbrake: ToolCheck;
  } | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'tools' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step.kind !== 'tools') return;
    let cancelled = false;
    checkAllTools().then((t) => {
      if (cancelled) return;
      setTools(t);
      if (!t.handbrake.ok) {
        setError(
          `Không tìm thấy HandBrakeCLI. ${t.handbrake.error ?? ''}\nTải tại https://handbrake.fr/downloads2.php và giải nén vào <project>/Tools/`
        );
        return;
      }
      if (initialPath) {
        setStep({ kind: 'scanning', path: initialPath });
      } else {
        setStep({ kind: 'path' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [step.kind, initialPath]);

  useEffect(() => {
    if (step.kind !== 'scanning') return;
    try {
      const abs = resolve(step.path);
      if (!existsSync(abs) || !statSync(abs).isDirectory()) {
        setError(`Folder không tồn tại: ${abs}`);
        setStep({ kind: 'path' });
        return;
      }
      const { ready, skipped } = scanHardsubJobs(abs);
      setStep({ kind: 'scan-result', animeFolder: abs, ready, skipped });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep({ kind: 'path' });
    }
  }, [step]);

  useEffect(() => {
    if (step.kind !== 'processing') return;
    if (!tools?.handbrake.ok || !tools.handbrake.path) return;
    let cancelled = false;
    const handbrakePath = tools.handbrake.path;

    const run = async () => {
      const statuses = [...step.statuses];

      // 1. Áp style trước (nhanh — chỉ là replace block trong text file)
      if (step.style && !step.stylesApplied) {
        try {
          const block = readStyleBlock(step.style.filePath);
          for (const job of step.jobs) {
            if (cancelled) return;
            applyStyleToAss(block, job.assPath);
          }
        } catch (e) {
          setError(`Lỗi áp style: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
      }

      // 2. Encode queue — SERIAL (x264/QSV ăn 100% CPU/GPU mỗi instance)
      for (let i = 0; i < step.jobs.length; i++) {
        if (cancelled) return;
        const job = step.jobs[i];
        if (!job) continue;

        statuses[i] = {
          ...statuses[i]!,
          status: 'running',
          detail: 'Đang encode... (10-40 phút)',
        };
        setStep((s) =>
          s.kind === 'processing' ? { ...s, statuses: [...statuses], current: i } : s
        );

        try {
          await runHardsub({ handbrakeCliPath: handbrakePath, job });
          statuses[i] = {
            ...statuses[i]!,
            status: 'done',
            detail: `→ ${basename(job.outputPath)}`,
          };
        } catch (e) {
          statuses[i] = {
            ...statuses[i]!,
            status: 'error',
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
      const timer = setTimeout(() => exit(), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [step.kind, exit]);

  if (!tools) {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Đang kiểm tra tools...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">[LỖI] {error}</Text>
        {step.kind === 'path' && (
          <Box marginTop={1}>
            <PathInput
              label="Nhập folder anime:"
              hint="Vd. C:\Users\you\Anime\Oi Tonbo 2nd Season"
              onSubmit={(path) => {
                setError(null);
                setStep({ kind: 'scanning', path });
              }}
            />
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <ToolStatus
        ffmpeg={tools.ffmpeg}
        mkvextract={tools.mkvextract}
        handbrake={tools.handbrake}
        showHandbrake
      />

      {step.kind === 'path' && (
        <Box flexDirection="column">
          <StepHeader step={1} total={4} title="Folder anime cần hardsub" />
          <PathInput
            label="Path:"
            hint="Folder anime có các Ep01/Ep02/... bên trong"
            onSubmit={(path) => setStep({ kind: 'scanning', path })}
          />
        </Box>
      )}

      {step.kind === 'scanning' && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Đang quét: {step.path}</Text>
        </Box>
      )}

      {step.kind === 'scan-result' && (
        <ScanResultUI step={step} setStep={setStep} projectRoot={projectRoot} />
      )}

      {step.kind === 'pick-style' && <PickStyleUI step={step} setStep={setStep} />}

      {step.kind === 'confirm' && <ConfirmUI step={step} setStep={setStep} />}

      {step.kind === 'processing' && (
        <Box flexDirection="column">
          <StepHeader
            step={4}
            total={4}
            title={`Hardsub ${step.current + 1}/${step.jobs.length} (serial)`}
          />
          {step.style && (
            <Box marginBottom={1}>
              <Text color="cyan">Style đã áp: </Text>
              <Text>{step.style.fileName}</Text>
            </Box>
          )}
          <StatusList items={step.statuses} />
        </Box>
      )}

      {step.kind === 'done' && (
        <Box flexDirection="column">
          <StepHeader step={4} total={4} title="HARDSUB HOÀN THÀNH" />
          <StatusList items={step.statuses} />
          <Box marginTop={1}>
            <Text color="green" bold>
              ✓ {step.statuses.filter((s) => s.status === 'done').length}/
              {step.statuses.length} ep đã hardsub
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function ScanResultUI({
  step,
  setStep,
  projectRoot,
}: {
  step: Extract<Step, { kind: 'scan-result' }>;
  setStep: (s: Step) => void;
  projectRoot: string;
}) {
  return (
    <Box flexDirection="column">
      <StepHeader step={2} total={4} title="Hàng đợi hardsub" />
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text color="cyan">Folder: </Text>
          {step.animeFolder}
        </Text>
        <Text>
          <Text color="green">Sẵn sàng: </Text>
          {step.ready.length} ep
        </Text>
        {step.skipped.length > 0 && (
          <Text>
            <Text color="yellow">Bỏ qua: </Text>
            {step.skipped.length} ep
          </Text>
        )}
        <Box flexDirection="column" marginTop={1}>
          {step.ready.map((j, i) => (
            <Text key={i} color="green">
              {'  ✓ '}
              {basename(j.epFolder)}
            </Text>
          ))}
          {step.skipped.map((s, i) => (
            <Text key={i} color="yellow">
              {'  ⊘ '}
              {s.epFolder} — {s.reason}
            </Text>
          ))}
        </Box>
      </Box>

      {step.ready.length === 0 ? (
        <Text color="red">Không có ep nào sẵn sàng. Thoát.</Text>
      ) : (
        <Box flexDirection="column">
          <Text bold color="cyan">
            Tích hợp style từ Styles/ vào vietsub.ass?
          </Text>
          <Text color="gray">
            (Sẽ replace block [V4+ Styles] trong tất cả vietsub.ass trước khi encode)
          </Text>
          <SelectInput
            items={[
              { label: 'Có — chọn style từ Styles/', value: 'yes' },
              { label: 'Không — giữ nguyên vietsub.ass', value: 'no' },
              { label: 'Huỷ', value: 'cancel' },
            ]}
            onSelect={(it) => {
              if (it.value === 'cancel') {
                process.exit(0);
                return;
              }
              if (it.value === 'no') {
                setStep({
                  kind: 'confirm',
                  animeFolder: step.animeFolder,
                  ready: step.ready,
                  skipped: step.skipped,
                  style: null,
                });
                return;
              }
              const styles = scanStyles(join(projectRoot, 'Styles'));
              if (styles.length === 0) {
                setStep({
                  kind: 'confirm',
                  animeFolder: step.animeFolder,
                  ready: step.ready,
                  skipped: step.skipped,
                  style: null,
                });
                return;
              }
              setStep({
                kind: 'pick-style',
                animeFolder: step.animeFolder,
                ready: step.ready,
                skipped: step.skipped,
                styles,
              });
            }}
          />
        </Box>
      )}
    </Box>
  );
}

function PickStyleUI({
  step,
  setStep,
}: {
  step: Extract<Step, { kind: 'pick-style' }>;
  setStep: (s: Step) => void;
}) {
  return (
    <Box flexDirection="column">
      <StepHeader step={3} total={4} title="Chọn style" />
      <Box marginBottom={1}>
        <Text color="gray">
          Tìm thấy {step.styles.length} file trong Styles/. Style được chọn sẽ inject block
          [V4+ Styles] vào TẤT CẢ vietsub.ass.
        </Text>
      </Box>
      <SelectInput
        items={step.styles.map((s) => ({
          label: s.fileName,
          value: s.filePath,
        }))}
        onSelect={(it) => {
          const chosen = step.styles.find((s) => s.filePath === it.value);
          if (!chosen) return;
          setStep({
            kind: 'confirm',
            animeFolder: step.animeFolder,
            ready: step.ready,
            skipped: step.skipped,
            style: chosen,
          });
        }}
      />
    </Box>
  );
}

function ConfirmUI({
  step,
  setStep,
}: {
  step: Extract<Step, { kind: 'confirm' }>;
  setStep: (s: Step) => void;
}) {
  return (
    <Box flexDirection="column">
      <StepHeader step={3} total={4} title="Xác nhận hardsub queue" />
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text color="cyan">Folder: </Text>
          {step.animeFolder}
        </Text>
        <Text>
          <Text color="cyan">Số ep: </Text>
          {step.ready.length}
        </Text>
        <Text>
          <Text color="cyan">Style: </Text>
          {step.style ? step.style.fileName : 'Không tích hợp (giữ nguyên)'}
        </Text>
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">HandBrake config:</Text>
          <Text color="gray"> · Video: H.265 10-bit Intel QuickSync (qsv_h265_10bit)</Text>
          <Text color="gray"> · Framerate: Same as source + VFR</Text>
          <Text color="gray"> · Quality: ICQ 18, encoder preset = quality</Text>
          <Text color="gray"> · Audio: track 1, EAC3</Text>
          <Text color="gray"> · Sub: track 1 burn-in (từ vietsub.ass)</Text>
        </Box>
      </Box>
      <SelectInput
        items={[
          { label: `Bắt đầu encode ${step.ready.length} ep (serial)`, value: 'go' },
          { label: 'Huỷ', value: 'cancel' },
        ]}
        onSelect={(it) => {
          if (it.value === 'cancel') {
            process.exit(0);
            return;
          }
          const statuses: StatusItem[] = step.ready.map((j) => ({
            label: basename(j.epFolder),
            status: 'pending',
          }));
          setStep({
            kind: 'processing',
            jobs: step.ready,
            statuses,
            current: 0,
            style: step.style,
            stylesApplied: false,
          });
        }}
      />
    </Box>
  );
}
