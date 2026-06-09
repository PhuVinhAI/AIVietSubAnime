import { Box, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { existsSync, statSync, unlinkSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { useEffect, useState } from 'react';

import { MultiSelect } from '../components/MultiSelect.js';
import { PathInput } from '../components/PathInput.js';
import { StatusList, type StatusItem } from '../components/StatusList.js';
import { StepHeader } from '../components/StepHeader.js';
import { ToolStatus } from '../components/ToolStatus.js';
import { runHardsub, scanHardsubCandidates } from '../lib/handbrake.js';
import { formatDuration, renderBar } from '../lib/progress.js';
import {
  applyStyleToAss,
  readStyleBlock,
  scanStyles,
  type StyleEntry,
} from '../lib/styles.js';
import { checkAllTools, type ToolCheck } from '../lib/tools.js';
import { useStepNav } from '../lib/useStepNav.js';
import type { HardsubCandidate, HardsubJob } from '../types.js';

type Step =
  | { kind: 'tools' }
  | { kind: 'path' }
  | { kind: 'scanning'; path: string }
  | {
      kind: 'scan-result';
      animeFolder: string;
      candidates: HardsubCandidate[];
      skipped: { epName: string; reason: string }[];
    }
  | {
      kind: 'pick-eps';
      animeFolder: string;
      candidates: HardsubCandidate[];
      skipped: { epName: string; reason: string }[];
    }
  | {
      kind: 'ask-style';
      animeFolder: string;
      jobs: HardsubJob[];
      skipped: { epName: string; reason: string }[];
    }
  | {
      kind: 'pick-style';
      animeFolder: string;
      jobs: HardsubJob[];
      skipped: { epName: string; reason: string }[];
      styles: StyleEntry[];
    }
  | {
      kind: 'confirm';
      animeFolder: string;
      jobs: HardsubJob[];
      skipped: { epName: string; reason: string }[];
      style: StyleEntry | null;
    }
  | {
      kind: 'processing';
      jobs: HardsubJob[];
      statuses: StatusItem[];
      current: number;
      style: StyleEntry | null;
    }
  | { kind: 'done'; statuses: StatusItem[] };

type Nav = {
  go: (next: Step) => void;
  back: () => boolean;
};

type Props = {
  initialPath?: string;
  projectRoot: string;
};

function formatHardsubDetail(
  percent: number,
  etaSeconds: number | null,
  fps: number | null
): string {
  const bar = renderBar(percent, 18);
  const parts = [`${bar} ${percent.toFixed(1)}%`];
  if (etaSeconds !== null && etaSeconds > 0) {
    parts.push(`ETA ${formatDuration(etaSeconds)}`);
  }
  if (fps !== null && fps > 0) {
    parts.push(`${fps.toFixed(0)} fps`);
  }
  return parts.join(' · ');
}

export function HardsubMode({ initialPath, projectRoot }: Props) {
  const { exit } = useApp();
  const [tools, setTools] = useState<{
    ffmpeg: ToolCheck;
    mkvextract: ToolCheck;
    handbrake: ToolCheck;
  } | null>(null);
  const nav = useStepNav<Step>({ kind: 'tools' });
  const { step, setStep, go, back, canBack } = nav;
  const [error, setError] = useState<string | null>(null);

  // Esc → quay lại bước trước. Bỏ qua processing/done/auto-transitions và pick-eps
  // (MultiSelect tự bind onCancel → back).
  const isBackEnabled =
    !error &&
    canBack &&
    step.kind !== 'tools' &&
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const { candidates, skipped } = scanHardsubCandidates(abs);
      setStep({ kind: 'scan-result', animeFolder: abs, candidates, skipped });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep({ kind: 'path' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step.kind !== 'processing') return;
    if (!tools?.handbrake.ok || !tools.handbrake.path) return;
    let cancelled = false;
    const handbrakePath = tools.handbrake.path;

    const run = async () => {
      const statuses = [...step.statuses];

      // 1. Áp style trước (rất nhanh)
      if (step.style) {
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

      // 2. Encode queue serial — QSV cũng ăn 100% GPU/iGPU per instance
      for (let i = 0; i < step.jobs.length; i++) {
        if (cancelled) return;
        const job = step.jobs[i];
        if (!job) continue;

        statuses[i] = {
          ...statuses[i]!,
          status: 'running',
          detail: formatHardsubDetail(0, null, null),
        };
        setStep((s) =>
          s.kind === 'processing' ? { ...s, statuses: [...statuses], current: i } : s
        );

        try {
          // Nếu output đã có thì xoá trước (overwrite case)
          if (existsSync(job.outputPath)) {
            try {
              unlinkSync(job.outputPath);
            } catch {}
          }

          // Throttle: HandBrake spam stderr nhiều lần/giây → chỉ flush mỗi 250ms
          let lastFlush = 0;
          await runHardsub({
            handbrakeCliPath: handbrakePath,
            job,
            onProgress: ({ percent, etaSeconds, fps }) => {
              const now = performance.now();
              if (percent < 100 && now - lastFlush < 250) return;
              lastFlush = now;
              statuses[i] = {
                ...statuses[i]!,
                status: 'running',
                detail: formatHardsubDetail(percent, etaSeconds, fps),
              };
              setStep((s) =>
                s.kind === 'processing'
                  ? { ...s, statuses: [...statuses], current: i }
                  : s
              );
            },
          });
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
                go({ kind: 'scanning', path });
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
          <StepHeader step={1} total={5} title="Folder anime cần hardsub" />
          <PathInput
            label="Path:"
            hint="Folder anime có các Ep01/Ep02/... bên trong"
            onSubmit={(path) => go({ kind: 'scanning', path })}
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
        <ScanResultUI step={step} nav={{ go, back }} />
      )}

      {step.kind === 'pick-eps' && (
        <PickEpsUI step={step} nav={{ go, back }} />
      )}

      {step.kind === 'ask-style' && (
        <AskStyleUI step={step} nav={{ go, back }} projectRoot={projectRoot} />
      )}

      {step.kind === 'pick-style' && (
        <PickStyleUI step={step} nav={{ go, back }} />
      )}

      {step.kind === 'confirm' && (
        <ConfirmUI step={step} nav={{ go, back }} />
      )}

      {step.kind === 'processing' && (
        <Box flexDirection="column">
          <StepHeader
            step={5}
            total={5}
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
          <StepHeader step={5} total={5} title="HARDSUB HOÀN THÀNH" />
          <StatusList items={step.statuses} />
          <Box marginTop={1}>
            <Text color="green" bold>
              ✓ {step.statuses.filter((s) => s.status === 'done').length}/
              {step.statuses.length} ep đã hardsub
            </Text>
          </Box>
        </Box>
      )}

      {isBackEnabled && (
        <Box marginTop={1}>
          <Text color="gray">[Esc] quay lại bước trước</Text>
        </Box>
      )}
    </Box>
  );
}

function candidateToJob(c: HardsubCandidate): HardsubJob {
  return {
    epFolder: c.epFolder,
    mkvPath: c.mkvPath,
    assPath: c.assPath,
    outputPath: c.outputPath,
  };
}

function ScanResultUI({
  step,
  nav,
}: {
  step: Extract<Step, { kind: 'scan-result' }>;
  nav: Nav;
}) {
  const ready = step.candidates.filter((c) => !c.missingAss && !c.hasOutput);
  const overwrite = step.candidates.filter((c) => !c.missingAss && c.hasOutput);
  const missingAss = step.candidates.filter((c) => c.missingAss);

  const choices: { label: string; value: string }[] = [];
  if (ready.length > 0 && overwrite.length > 0) {
    choices.push({
      label: `Encode tất cả (${ready.length} mới + ${overwrite.length} ghi đè)`,
      value: 'all-with-overwrite',
    });
    choices.push({ label: `Chỉ encode mới (${ready.length} file)`, value: 'only-new' });
  } else if (ready.length > 0) {
    choices.push({ label: `Encode tất cả (${ready.length} file)`, value: 'all-new' });
  } else if (overwrite.length > 0) {
    choices.push({
      label: `Ghi đè tất cả (${overwrite.length} file)`,
      value: 'all-overwrite',
    });
  }
  choices.push({ label: 'Pick chọn riêng (multiselect)', value: 'pick' });
  choices.push({ label: 'Huỷ', value: 'cancel' });

  return (
    <Box flexDirection="column">
      <StepHeader step={2} total={5} title="Hàng đợi hardsub" />
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text color="cyan">Folder: </Text>
          {step.animeFolder}
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {step.candidates.map((c, i) => (
            <Box key={i}>
              <Text
                color={
                  c.missingAss ? 'red' : c.hasOutput ? 'yellow' : 'green'
                }
              >
                {c.missingAss ? '  ✗ ' : c.hasOutput ? '  ⚠ ' : '  ✓ '}
                {c.epName}
              </Text>
              <Text color="gray">
                {c.missingAss
                  ? ' — thiếu vietsub.ass'
                  : c.hasOutput
                  ? ' — đã có _vietsub.mp4'
                  : ' — sẵn sàng'}
              </Text>
            </Box>
          ))}
          {step.skipped.map((s, i) => (
            <Text key={`s${i}`} color="gray">
              {'  ⊘ '}
              {s.epName} — {s.reason}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text>
            Tổng: {step.candidates.length} ep ({ready.length} mới, {overwrite.length} đã có
            output, {missingAss.length} thiếu sub)
          </Text>
        </Box>
      </Box>

      {ready.length + overwrite.length === 0 ? (
        <Text color="red">Không có ep nào encode được. Thoát.</Text>
      ) : (
        <SelectInput
          items={choices}
          onSelect={(it) => {
            if (it.value === 'cancel') {
              process.exit(0);
              return;
            }
            if (it.value === 'pick') {
              nav.go({
                kind: 'pick-eps',
                animeFolder: step.animeFolder,
                candidates: step.candidates,
                skipped: step.skipped,
              });
              return;
            }
            let chosen: HardsubCandidate[] = [];
            if (it.value === 'all-with-overwrite' || it.value === 'all-new') {
              chosen = [...ready, ...overwrite];
            } else if (it.value === 'only-new') {
              chosen = ready;
            } else if (it.value === 'all-overwrite') {
              chosen = overwrite;
            }
            const jobs = chosen.map(candidateToJob);
            nav.go({
              kind: 'ask-style',
              animeFolder: step.animeFolder,
              jobs,
              skipped: step.skipped,
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
}: {
  step: Extract<Step, { kind: 'pick-eps' }>;
  nav: Nav;
}) {
  const items = step.candidates.map((c) => ({
    label: c.epName,
    value: c.epFolder,
    disabled: c.missingAss,
    preselected: !c.missingAss && !c.hasOutput,
    tag: c.missingAss
      ? { text: 'thiếu sub', color: 'red' }
      : c.hasOutput
      ? { text: 'ghi đè', color: 'yellow' }
      : { text: 'mới', color: 'green' },
  }));

  return (
    <Box flexDirection="column">
      <StepHeader step={3} total={5} title="Chọn ep để hardsub" />
      <Box marginBottom={1}>
        <Text color="gray">
          Mặc định tick các ep mới. Tick thêm các ⚠ "ghi đè" nếu muốn encode lại.
        </Text>
      </Box>
      <MultiSelect
        items={items}
        onCancel={() => nav.back()}
        onSubmit={(epFolders) => {
          const chosen = step.candidates.filter((c) => epFolders.includes(c.epFolder));
          if (chosen.length === 0) {
            process.exit(0);
            return;
          }
          const jobs = chosen.map(candidateToJob);
          nav.go({
            kind: 'ask-style',
            animeFolder: step.animeFolder,
            jobs,
            skipped: step.skipped,
          });
        }}
      />
    </Box>
  );
}

function AskStyleUI({
  step,
  nav,
  projectRoot,
}: {
  step: Extract<Step, { kind: 'ask-style' }>;
  nav: Nav;
  projectRoot: string;
}) {
  return (
    <Box flexDirection="column">
      <StepHeader step={4} total={5} title="Tích hợp style?" />
      <Box marginBottom={1} flexDirection="column">
        <Text color="cyan">
          Áp style vào {step.jobs.length} vietsub.ass trước khi encode?
        </Text>
        <Text color="gray">(Replace block [V4+ Styles] với style đã chọn)</Text>
      </Box>
      <SelectInput
        items={[
          { label: 'Có — chọn style từ Styles/', value: 'yes' },
          { label: 'Không — giữ nguyên', value: 'no' },
          { label: 'Huỷ', value: 'cancel' },
        ]}
        onSelect={(it) => {
          if (it.value === 'cancel') {
            process.exit(0);
            return;
          }
          if (it.value === 'no') {
            nav.go({
              kind: 'confirm',
              animeFolder: step.animeFolder,
              jobs: step.jobs,
              skipped: step.skipped,
              style: null,
            });
            return;
          }
          const styles = scanStyles(join(projectRoot, 'Styles'));
          if (styles.length === 0) {
            nav.go({
              kind: 'confirm',
              animeFolder: step.animeFolder,
              jobs: step.jobs,
              skipped: step.skipped,
              style: null,
            });
            return;
          }
          nav.go({
            kind: 'pick-style',
            animeFolder: step.animeFolder,
            jobs: step.jobs,
            skipped: step.skipped,
            styles,
          });
        }}
      />
    </Box>
  );
}

function PickStyleUI({
  step,
  nav,
}: {
  step: Extract<Step, { kind: 'pick-style' }>;
  nav: Nav;
}) {
  return (
    <Box flexDirection="column">
      <StepHeader step={4} total={5} title="Chọn style" />
      <Box marginBottom={1}>
        <Text color="gray">
          Tìm thấy {step.styles.length} file trong Styles/.
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
          nav.go({
            kind: 'confirm',
            animeFolder: step.animeFolder,
            jobs: step.jobs,
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
  nav,
}: {
  step: Extract<Step, { kind: 'confirm' }>;
  nav: Nav;
}) {
  return (
    <Box flexDirection="column">
      <StepHeader step={4} total={5} title="Xác nhận hardsub queue" />
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text color="cyan">Folder: </Text>
          {step.animeFolder}
        </Text>
        <Text>
          <Text color="cyan">Số ep: </Text>
          {step.jobs.length}
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
          { label: `Bắt đầu encode ${step.jobs.length} ep (serial)`, value: 'go' },
          { label: 'Huỷ', value: 'cancel' },
        ]}
        onSelect={(it) => {
          if (it.value === 'cancel') {
            process.exit(0);
            return;
          }
          const statuses: StatusItem[] = step.jobs.map((j) => ({
            label: basename(j.epFolder),
            status: 'pending',
          }));
          nav.go({
            kind: 'processing',
            jobs: step.jobs,
            statuses,
            current: 0,
            style: step.style,
          });
        }}
      />
    </Box>
  );
}
