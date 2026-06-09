import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';

export type MtpProgressEvent =
  | { type: 'started'; totalBytes: number }
  | { type: 'progress'; bytesCopied: number; totalBytes: number }
  | { type: 'done' };

export type MtpCopyOptions = {
  src: string;
  /**
   * Shell namespace path đến folder đích. Vd:
   *   "This PC\\OPPO Reno4\\Bộ nhớ trong dùng chung\\Download"
   * Mình tự navigate xuống từng segment qua Shell.Application.
   */
  destShellPath: string;
  onProgress?: (e: MtpProgressEvent) => void;
  /** Chu kỳ poll size file đích (ms). Mặc định 800ms — MTP chậm. */
  pollIntervalMs?: number;
};

/**
 * Script PowerShell driver. Đọc env var thay vì arg để né mọi quote-escape khi
 * tên file/folder có dấu (vd "Bộ nhớ trong dùng chung").
 *
 * Output stdout (mỗi dòng):
 *   STARTED <totalBytes>
 *   PROGRESS <bytesCopied> <totalBytes>
 *   DONE
 *
 * Lỗi → throw → exit code != 0, message ở stderr.
 */
const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$Src = $env:MTP_SRC
$DestShellPath = $env:MTP_DEST
$PollMs = [int]$env:MTP_POLL

if (-not $Src -or -not $DestShellPath) { throw "MTP_SRC / MTP_DEST chưa set" }
if (-not (Test-Path -LiteralPath $Src)) { throw "Source không tồn tại: $Src" }

$srcSize = (Get-Item -LiteralPath $Src).Length
# Dùng [IO.Path] static methods thay vì Split-Path: PS 5.1 không cho
# Split-Path nhận đồng thời -LiteralPath + -Parent (khác parameter set).
$srcDir  = [System.IO.Path]::GetDirectoryName($Src)
$srcName = [System.IO.Path]::GetFileName($Src)

$shell = New-Object -ComObject Shell.Application

# Mở dest folder qua shell namespace.
# B1: thử pass thẳng path → Windows tự parse. Một số máy/Win build trả $null.
# B2: nếu fail → tự navigate từ This PC (CSIDL 0x11) qua từng segment theo Name.
function Resolve-DestFolder([string]$p) {
  $folder = $shell.NameSpace($p)
  if ($folder) { return $folder }
  $segs = $p -split '[\\\\/]+' | Where-Object { $_ }
  if ($segs.Count -eq 0) { throw "Path đích rỗng" }
  $start = 0
  if ($segs[0] -in @('This PC', 'Computer', 'My Computer', 'Máy tính này', 'Máy tính')) {
    $start = 1
  }
  $current = $shell.NameSpace(0x11)  # 0x11 = CSIDL_DRIVES = This PC
  for ($i = $start; $i -lt $segs.Count; $i++) {
    $seg = $segs[$i]
    $next = $null
    foreach ($it in $current.Items()) {
      if ($it.Name -eq $seg) {
        $next = $it.GetFolder
        break
      }
    }
    if (-not $next) {
      $names = ($current.Items() | ForEach-Object { $_.Name }) -join ', '
      throw "Không tìm thấy '$seg' (có sẵn: $names)"
    }
    $current = $next
  }
  return $current
}

$srcFolder = $shell.NameSpace($srcDir)
if (-not $srcFolder) { throw "Không mở được source folder: $srcDir" }
$srcItem = $srcFolder.ParseName($srcName)
if (-not $srcItem) { throw "Không tìm thấy source file trong folder: $srcName" }

$destFolder = Resolve-DestFolder $DestShellPath

[Console]::Out.WriteLine("STARTED $srcSize")
[Console]::Out.Flush()

# CopyHere flag:
#   0x004 = FOF_SILENT          (không dialog tiến độ)
#   0x010 = FOF_NOCONFIRMATION  (ghi đè không hỏi)
#   0x400 = FOF_NOERRORUI       (không dialog lỗi)
# Tổng = 1044. Trên MTP, flag không luôn được tôn trọng — Windows có thể vẫn
# hiện dialog của nó, nhưng copy vẫn chạy ngầm.
$destFolder.CopyHere($srcItem, 4 + 16 + 1024)

# Poll size trên dest. ExtendedProperty('System.Size') trả số byte cho MTP
# (đáng tin hơn .Size vốn là chuỗi đã format).
$deadline = (Get-Date).AddMinutes(120)
$lastSize = -1
$stallCount = 0
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds $PollMs
  $exists = $false
  $size = 0
  foreach ($it in $destFolder.Items()) {
    if ($it.Name -eq $srcName) {
      $exists = $true
      try {
        $sz = $it.ExtendedProperty('System.Size')
        if ($sz -ne $null) { $size = [int64]$sz }
      } catch {}
      break
    }
  }
  [Console]::Out.WriteLine("PROGRESS $size $srcSize")
  [Console]::Out.Flush()

  if ($exists -and $srcSize -gt 0 -and $size -ge $srcSize) {
    [Console]::Out.WriteLine("DONE")
    [Console]::Out.Flush()
    exit 0
  }

  # Phát hiện stall: nếu 30 lần poll liên tiếp size không nhúc nhích VÀ file
  # chưa xuất hiện → thiết bị có thể đã rút.
  if ($size -eq $lastSize) {
    $stallCount++
    if ($stallCount -ge 60 -and -not $exists) {
      throw "Stall: 30s không thấy file xuất hiện trên đích. USB có thể đã rút."
    }
  } else {
    $stallCount = 0
    $lastSize = $size
  }
}
throw "Timeout: Copy không hoàn thành trong 120 phút."
`;

/**
 * Copy 1 file qua MTP / shell namespace bằng PowerShell Shell.Application.
 * Không stream được — Shell COM tự handle MTP protocol — nên progress phải
 * poll size trên đích.
 */
export async function copyToMtpShell(opts: MtpCopyOptions): Promise<void> {
  const { src, destShellPath, onProgress, pollIntervalMs = 800 } = opts;
  statSync(src); // throw sớm nếu source mất

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
      {
        env: {
          ...process.env,
          MTP_SRC: src,
          MTP_DEST: destShellPath,
          MTP_POLL: String(pollIntervalMs),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let stderrBuf = '';
    let stdoutBuf = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8');
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      let idx: number;
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, idx).trim();
        stdoutBuf = stdoutBuf.slice(idx + 1);
        if (!line) continue;
        if (line.startsWith('STARTED ')) {
          const total = parseInt(line.slice(8).trim(), 10);
          onProgress?.({ type: 'started', totalBytes: Number.isFinite(total) ? total : 0 });
        } else if (line.startsWith('PROGRESS ')) {
          const parts = line.split(/\s+/);
          if (parts.length === 3) {
            const copied = parseInt(parts[1]!, 10);
            const total = parseInt(parts[2]!, 10);
            if (!isNaN(copied) && !isNaN(total)) {
              onProgress?.({ type: 'progress', bytesCopied: copied, totalBytes: total });
            }
          }
        } else if (line === 'DONE') {
          onProgress?.({ type: 'done' });
        }
      }
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderrBuf.trim() || `PowerShell exited code ${code}`));
    });
  });
}
