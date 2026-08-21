import { runProc } from "./exec";

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
  return runProc(process.env.SHELL || "/bin/zsh", ["-c", commands], {
    cwd: opts.cwd,
    timeout: opts.timeout ?? 60000,
  }).then((res) => ({
    stdout: res.stdout,
    stderr: res.stderr,
    timedOut: res.timedOut,
    error: res.error
      ? `无法启动 shell: ${res.error}`
      : res.code !== 0
        ? res.stderr.trim() || `进程退出，退出码 ${res.code ?? "unknown"}`
        : undefined,
  }));
}
