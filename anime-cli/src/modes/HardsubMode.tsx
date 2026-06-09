import { Alert, Select, Spinner as UiSpinner } from '@inkjs/ui';
import { Box, Text, useApp, useInput } from 'ink';
import { existsSync, statSync, unlinkSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { useEffect, useState } from 'react';

import { Brand } from '../components/Brand.js';
import { HintBar } from '../components/HintBar.js';
import { KeyValue } from '../components/KeyValue.js';
import { MultiSelect } from '../components/MultiSelect.js';
import { PathInput } from '../components/PathInput.js';
import { StatusList, type StatusItem } from '../components/StatusList.js';
import { StepHeader } from '../components/StepHeader.js';
import { ToolStatus } from '../components/ToolStatus.js';
import { runHardsub, scanHardsubCandidates } from '../lib/handbrake.js';
import { formatDuration } from '../lib/progress.js';
import {
  applyStyleToAss,
  readStyleBlock,
  scanStyles,
  type StyleEntry,
} from '../lib/styles.js';
import { palette, sym } from '../lib/theme.js';
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

type Nav = { go: (next: Step) => void; back: () => boolean };

type Props = {
  initialPath?: string;
  projectRoot: string;
};

const TOTAL_STEPS = 5;

function metaFor(percent: number, etaSec: number | null, fps: number | null): string {
  const parts: string[] = [];
  if (etaSec !== null && etaSec > 0) parts.push(`ETA ${formatDuration(etaSec)}`);
  if (fps !== null && fps > 0) parts.push(`${fps.toFixed(0)} fps`);
  return parts.join(`  ${sym.bullet}  `);
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

      for (let i = 0; i < step.jobs.length; i++) {
        if (cancelled) return;
        const job = step.jobs[i];
        if (!job) continue;

        statuses[i] = {
          ...statuses[i]!,
          status: 'running',
          progress: 0,
          meta: 'Đang khởi động HandBrake...',
        };
        setStep((s) =>
          s.kind === 'processing' ? { ...s, statuses: [...statuses], current: i } : s
        );

        try {
          if (existsSync(job.outputPath)) {
            try {
              unlinkSync(job.outputPath);
            } catch {}
          }

          let lastFlush = 0;
          await runHardsub({
            handbrakeCliPath: handbrakePath,
            job,
            onProgress: ({ percent, etaSeconds, fps }) => {
              const now = performance.now();
              if (percent < 100 && now - lastFlush < 200) return;
              lastFlush = now;
              statuses[i] = {
                ...statuses[i]!,
                status: 'running',
                progress: percent,
                meta: metaFor(percent, etaSeconds, fps),
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
            progress: undefined,
            meta: undefined,
            detail: `${sym.arrowRight} ${basename(job.outputPath)}`,
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

  if (!tools) {
    return (
      <Box paddingX={1} paddingY={1}>
        <UiSpinner label=" Đang kiểm tra tools..." />
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Brand subtitle="Hardsub mode" compact />
        <Box marginBottom={1}>
          <Alert variant="error" title="Đã xảy ra lỗi">
            {error}
          </Alert>
        </Box>
        {step.kind === 'path' && (
          <PathInput
            label="Nhập folder anime:"
            hint="Vd. C:\Users\you\Anime\Oi Tonbo 2nd Season"
            category="hardsub-anime"
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
      <Brand subtitle="Hardsub mode" compact />
      <ToolStatus
        ffmpeg={tools.ffmpeg}
        mkvextract={tools.mkvextract}
        handbrake={tools.handbrake}
        showHandbrake
      />

      {step.kind === 'path' && (
        <Box flexDirection="column">
          <StepHeader
            step={stepNumber}
            total={TOTAL_STEPS}
            title="Folder anime cần hardsub"
            subtitle="Trỏ tới folder anime có các Ep01/Ep02/... bên trong"
          />
          <PathInput
            label="Path"
            hint="Folder chứa nhiều subfolder EpNN/"
            category="hardsub-anime"
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

      {step.kind === 'ask-style' && (
        <AskStyleUI
          step={step}
          nav={{ go, back }}
          projectRoot={projectRoot}
          stepNumber={stepNumber}
        />
      )}

      {step.kind === 'pick-style' && (
        <PickStyleUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'confirm' && (
        <ConfirmUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'processing' && (
        <Box flexDirection="column">
          <StepHeader
            step={TOTAL_STEPS}
            total={TOTAL_STEPS}
            title={`Hardsub ${step.current + 1}/${step.jobs.length} (serial)`}
            subtitle={
              step.style
                ? `Style: ${step.style.fileName}`
                : 'Không tích hợp style (giữ nguyên)'
            }
          />
          <StatusList items={step.statuses} />
        </Box>
      )}

      {step.kind === 'done' && (
        <Box flexDirection="column">
          <StepHeader step={TOTAL_STEPS} total={TOTAL_STEPS} title="Hardsub hoàn thành" />
          <StatusList items={step.statuses} />
          <Box marginTop={1}>
            <Alert variant="success" title="Tất cả ep đã encode xong">
              {`${step.statuses.filter((s) => s.status === 'done').length}/${step.statuses.length} ep encode thành công. CLI sẽ thoát sau 2 giây.`}
            </Alert>
          </Box>
        </Box>
      )}

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

const STEP_NUMBER: Partial<Record<Step['kind'], number>> = {
  path: 1,
  scanning: 1,
  'scan-result': 2,
  'pick-eps': 2,
  'ask-style': 3,
  'pick-style': 3,
  confirm: 4,
  processing: 5,
  done: 5,
};

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
  stepNumber,
}: {
  step: Extract<Step, { kind: 'scan-result' }>;
  nav: Nav;
  stepNumber: number;
}) {
  const ready = step.candidates.filter((c) => !c.missingAss && !c.hasOutput);
  const overwrite = step.candidates.filter((c) => !c.missingAss && c.hasOutput);
  const missingAss = step.candidates.filter((c) => c.missingAss);

  const choices: { label: string; value: string }[] = [];
  if (ready.length > 0 && overwrite.length > 0) {
    choices.push({
      label: `Encode tất cả  (${ready.length} mới + ${overwrite.length} ghi đè)`,
      value: 'all-with-overwrite',
    });
    choices.push({
      label: `Chỉ encode mới  (${ready.length} file)`,
      value: 'only-new',
    });
  } else if (ready.length > 0) {
    choices.push({
      label: `Encode tất cả  (${ready.length} file)`,
      value: 'all-new',
    });
  } else if (overwrite.length > 0) {
    choices.push({
      label: `Ghi đè tất cả  (${overwrite.length} file)`,
      value: 'all-overwrite',
    });
  }
  choices.push({ label: 'Pick chọn riêng (multiselect)', value: 'pick' });
  choices.push({ label: 'Huỷ', value: 'cancel' });

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Hàng đợi hardsub"
        subtitle={step.animeFolder}
      />
      <Box flexDirection="column" marginBottom={1}>
        {step.candidates.map((c, i) => (
          <Box key={i}>
            <Text color={c.missingAss ? palette.error : c.hasOutput ? palette.warn : palette.success}>
              {`  ${c.missingAss ? sym.cross : c.hasOutput ? sym.warning : sym.tick} `}
            </Text>
            <Text color={c.missingAss ? palette.error : c.hasOutput ? palette.warn : palette.text}>
              {c.epName}
            </Text>
            <Text color={palette.muted}>
              {c.missingAss
                ? `  ${sym.bullet} thiếu vietsub.ass`
                : c.hasOutput
                ? `  ${sym.bullet} đã có _vietsub.mp4`
                : `  ${sym.bullet} sẵn sàng`}
            </Text>
          </Box>
        ))}
        {step.skipped.map((s, i) => (
          <Box key={`s${i}`}>
            <Text color={palette.muted}>{`  ${sym.skip} ${s.epName}  ${sym.bullet} ${s.reason}`}</Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text color={palette.muted}>
            {`Tổng: ${step.candidates.length} ep  ${sym.bullet}  ${ready.length} mới  ${sym.bullet}  ${overwrite.length} ghi đè  ${sym.bullet}  ${missingAss.length} thiếu sub`}
          </Text>
        </Box>
      </Box>

      {ready.length + overwrite.length === 0 ? (
        <Alert variant="error" title="Không có ep nào encode được">
          Cần ít nhất 1 ep có đủ .mkv + vietsub.ass.
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
            let chosen: HardsubCandidate[] = [];
            if (value === 'all-with-overwrite' || value === 'all-new') {
              chosen = [...ready, ...overwrite];
            } else if (value === 'only-new') {
              chosen = ready;
            } else if (value === 'all-overwrite') {
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
  stepNumber,
}: {
  step: Extract<Step, { kind: 'pick-eps' }>;
  nav: Nav;
  stepNumber: number;
}) {
  const items = step.candidates.map((c) => ({
    label: c.epName,
    value: c.epFolder,
    disabled: c.missingAss,
    preselected: !c.missingAss && !c.hasOutput,
    tag: c.missingAss
      ? { text: 'thiếu sub', color: palette.error }
      : c.hasOutput
      ? { text: 'ghi đè', color: palette.warn }
      : { text: 'mới', color: palette.success },
  }));

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Chọn ep để hardsub"
        subtitle="Mặc định tick các ep mới. Tick thêm các ep ⚠ ghi đè nếu muốn re-encode."
      />
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
  stepNumber,
}: {
  step: Extract<Step, { kind: 'ask-style' }>;
  nav: Nav;
  projectRoot: string;
  stepNumber: number;
}) {
  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Tích hợp style?"
        subtitle={`Áp style vào ${step.jobs.length} vietsub.ass trước khi encode (replace block [V4+ Styles]).`}
      />
      <Select
        options={[
          { label: 'Có  ·  chọn style từ Styles/', value: 'yes' },
          { label: 'Không  ·  giữ nguyên', value: 'no' },
          { label: 'Huỷ', value: 'cancel' },
        ]}
        onChange={(value) => {
          if (value === 'cancel') {
            process.exit(0);
            return;
          }
          if (value === 'no') {
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
  stepNumber,
}: {
  step: Extract<Step, { kind: 'pick-style' }>;
  nav: Nav;
  stepNumber: number;
}) {
  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Chọn style"
        subtitle={`Tìm thấy ${step.styles.length} file trong Styles/.`}
      />
      <Select
        visibleOptionCount={Math.min(8, step.styles.length)}
        options={step.styles.map((s) => ({
          label: s.fileName,
          value: s.filePath,
        }))}
        onChange={(value) => {
          const chosen = step.styles.find((s) => s.filePath === value);
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
  stepNumber,
}: {
  step: Extract<Step, { kind: 'confirm' }>;
  nav: Nav;
  stepNumber: number;
}) {
  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Xác nhận hardsub queue"
      />
      <Box flexDirection="column" marginBottom={1}>
        <KeyValue
          rows={[
            { key: 'Folder', value: step.animeFolder },
            { key: 'Số ep', value: String(step.jobs.length), color: palette.accent, highlight: true },
            {
              key: 'Style',
              value: step.style ? step.style.fileName : 'Không tích hợp (giữ nguyên)',
              color: step.style ? palette.brand : palette.muted,
            },
          ]}
        />
        <Box marginTop={1} flexDirection="column">
          <Text color={palette.muted} bold>{`${sym.triangleRight} HANDBRAKE CONFIG`}</Text>
          <Text color={palette.muted}>{`    Video       H.265 10-bit Intel QuickSync (qsv_h265_10bit)`}</Text>
          <Text color={palette.muted}>{`    Framerate   Same as source + VFR`}</Text>
          <Text color={palette.muted}>{`    Quality     ICQ 18  ${sym.bullet}  encoder preset = quality`}</Text>
          <Text color={palette.muted}>{`    Audio       track 1, EAC3`}</Text>
          <Text color={palette.muted}>{`    Subtitle    burn-in vietsub.ass  ${sym.bullet}  loại bỏ internal sub`}</Text>
        </Box>
      </Box>
      <Select
        options={[
          { label: `Bắt đầu encode ${step.jobs.length} ep (serial)`, value: 'go' },
          { label: 'Huỷ', value: 'cancel' },
        ]}
        onChange={(value) => {
          if (value === 'cancel') {
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
