import { spawn } from "node:child_process";

export interface ProcResult {
  stdout: string;
  stderr: string;
  code: number | null;
  error?: string;
  timedOut?: boolean;
}

interface ProcOptions {
  cwd: string;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
}

/** Spawns a command, collects output, and enforces a timeout via SIGKILL. */
export function runProc(
  cmd: string,
  args: string[],
  opts: ProcOptions
): Promise<ProcResult> {
  const timeoutMs = opts.timeout ?? 60000;
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const finish = (extra: Partial<ProcResult> = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code: null, ...extra });
    };

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => finish({ error: err.message }));
    child.on("close", (code) =>
      finish({ code, timedOut: timedOut || undefined })
    );
  });
}
