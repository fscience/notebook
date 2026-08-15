import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { projectDir, getDataRoot } from "./storage";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  error?: string;
  timedOut?: boolean;
}

export interface PackageInfo {
  name: string;
  version: string;
}

export const PYTHON_VERSION = "3.12";

async function pythonInstallDir(): Promise<string> {
  return path.join(await getDataRoot(), "pythons");
}

export async function venvDir(id: string): Promise<string> {
  return path.join(await projectDir(id), ".venv");
}

export async function venvPython(id: string): Promise<string> {
  return path.join(await venvDir(id), "bin", "python");
}

function exec(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout?: number; pythonInstallDir?: string }
): Promise<ExecResult> {
  const timeoutMs = opts.timeout ?? 120000;
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: {
        ...process.env,
        UV_NO_PROGRESS: "1",
        UV_PYTHON_INSTALL_DIR: opts.pythonInstallDir ?? "",
        NO_COLOR: "1",
      },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    function finish(extra: Partial<ExecResult> = {}) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        code: null,
        ...extra,
      });
    }

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => finish({ error: err.message }));
    child.on("close", (code) =>
      finish({ code, timedOut: timedOut || undefined })
    );
  });
}

export async function ensureEnv(id: string): Promise<string> {
  const py = await venvPython(id);
  try {
    await fs.access(py);
    return py;
  } catch {
    const dir = await venvDir(id);
    const pdir = await projectDir(id);
    const pyDir = await pythonInstallDir();
    await fs.mkdir(pdir, { recursive: true });
    await fs.mkdir(pyDir, { recursive: true });
    const res = await exec(
      "uv",
      ["venv", "--python", PYTHON_VERSION, dir],
      { cwd: pdir, pythonInstallDir: pyDir, timeout: 120000 }
    );
    if (res.error) {
      throw new Error(`无法启动 uv: ${res.error}`);
    }
    if ((res.code ?? 1) !== 0) {
      throw new Error(res.stderr.trim() || "创建 Python 环境失败");
    }
    return py;
  }
}

export async function envStatus(id: string): Promise<{
  exists: boolean;
  pythonVersion: string;
}> {
  const py = await venvPython(id);
  const pdir = await projectDir(id);
  try {
    await fs.access(py);
  } catch {
    return { exists: false, pythonVersion: "" };
  }
  const res = await exec(
    py,
    ["-c", "import platform; print(platform.python_version())"],
    { cwd: pdir, pythonInstallDir: await pythonInstallDir(), timeout: 30000 }
  );
  return {
    exists: true,
    pythonVersion: (res.stdout || "").trim(),
  };
}

function sanitizePackages(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[\s,]+/)
      : [];
  const out: string[] = [];
  for (const item of raw) {
    const p = String(item).trim();
    if (!p) continue;
    if (p.startsWith("-")) throw new Error(`非法参数: ${p}`);
    if (!/^[A-Za-z0-9_.\-\[\]<>!=~,\s]+$/.test(p)) {
      throw new Error(`非法包名: ${p}`);
    }
    out.push(p);
  }
  if (out.length === 0) throw new Error("未指定包名");
  return out;
}

export async function installPackages(
  id: string,
  input: unknown
): Promise<ExecResult> {
  const packages = sanitizePackages(input);
  const py = await ensureEnv(id);
  return exec(
    "uv",
    ["pip", "install", "--python", py, ...packages],
    { cwd: await projectDir(id), pythonInstallDir: await pythonInstallDir(), timeout: 300000 }
  );
}

export async function uninstallPackages(
  id: string,
  input: unknown
): Promise<ExecResult> {
  const packages = sanitizePackages(input);
  const py = await ensureEnv(id);
  return exec(
    "uv",
    ["pip", "uninstall", "--python", py, ...packages],
    { cwd: await projectDir(id), pythonInstallDir: await pythonInstallDir(), timeout: 120000 }
  );
}

export async function listPackages(id: string): Promise<PackageInfo[]> {
  const py = await ensureEnv(id);
  const res = await exec(
    "uv",
    ["pip", "list", "--python", py, "--format", "json"],
    { cwd: await projectDir(id), pythonInstallDir: await pythonInstallDir(), timeout: 60000 }
  );
  if (res.error) throw new Error(`无法启动 uv: ${res.error}`);
  if ((res.code ?? 1) !== 0) {
    throw new Error(res.stderr.trim() || "列出已安装包失败");
  }
  try {
    const parsed: unknown = JSON.parse(res.stdout);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => {
        const item = p as Record<string, unknown>;
        return {
          name: String(item.name ?? ""),
          version: String(item.version ?? ""),
        };
      })
      .filter((p) => p.name);
  } catch {
    return [];
  }
}
