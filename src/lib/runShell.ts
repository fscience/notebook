import { spawn } from "node:child_process";

export interface ShellResult {
  stdout: string;
  stderr: string;
  error?: string;
  timedOut?: boolean;
}

export function runShell(
  commands: string,
  opts: { cwd: string; timeout?: number }
): Promise<ShellResult> {
  const timeoutMs = opts.timeout ?? 60000;

  return new Promise((resolve) => {
    const child = spawn(process.env.SHELL || "/bin/zsh", ["-c", commands], {
      cwd: opts.cwd,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let done = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    function finish(extra: { error?: string; timedOut?: boolean }) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, timedOut, ...extra });
    }

    child.on("error", (err) => {
      finish({ error: `无法启动 shell: ${err.message}` });
    });

    child.on("close", (code) => {
      if (code === 0) {
        finish({});
      } else {
        finish({
          error: stderr.trim() || `进程退出，退出码 ${code ?? "unknown"}`,
        });
      }
    });
  });
}
