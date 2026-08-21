import fs from "node:fs/promises";
import path from "node:path";
import { projectDir, getDataRoot } from "./storage";
import { runProc, type ProcResult } from "./exec";

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

/** Runs uv with progress disabled and our shared Python download cache. */
async function runUv(
  args: string[],
  cwd: string,
  timeout: number
): Promise<ProcResult> {
  return runProc("uv", args, {
    cwd,
    timeout,
    env: {
      ...process.env,
      UV_NO_PROGRESS: "1",
      UV_PYTHON_INSTALL_DIR: await pythonInstallDir(),
      NO_COLOR: "1",
    },
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
    await fs.mkdir(pdir, { recursive: true });
    await fs.mkdir(await pythonInstallDir(), { recursive: true });
    const res = await runUv(["venv", "--python", PYTHON_VERSION, dir], pdir, 120000);
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
  try {
    await fs.access(py);
  } catch {
    return { exists: false, pythonVersion: "" };
  }
  const res = await runProc(
    py,
    ["-c", "import platform; print(platform.python_version())"],
    { cwd: await projectDir(id), timeout: 30000 }
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

export async function mutatePackages(
  id: string,
  input: unknown,
  action: "install" | "uninstall"
): Promise<ProcResult> {
  const packages = sanitizePackages(input);
  const py = await ensureEnv(id);
  return runUv(
    ["pip", action, "--python", py, ...packages],
    await projectDir(id),
    action === "install" ? 300000 : 120000
  );
}

export async function listPackages(id: string): Promise<PackageInfo[]> {
  const py = await ensureEnv(id);
  const res = await runUv(
    ["pip", "list", "--python", py, "--format", "json"],
    await projectDir(id),
    60000
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
