import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runProc } from "./exec";

export interface PythonResult {
  stdout: string;
  stderr: string;
  error?: string;
  timedOut?: boolean;
  images: { name: string; data: string; mime: string }[];
}

const PREAMBLE = `
import os as _os
import shutil as _shutil
import uuid as _uuid

_OUT = _os.environ.get("NOTEBOOK_OUTPUT_DIR", "")
if _OUT:
    _os.makedirs(_OUT, exist_ok=True)

def display_image(_p, _width=None):
    _e = _os.path.splitext(str(_p))[1] or ".png"
    _d = _os.path.join(_OUT, _uuid.uuid4().hex + _e)
    _shutil.copy(str(_p), _d)
    print(f"[[NOTEBOOK_IMAGE:{_d}]]", flush=True)

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as _plt
    def _notebook_show(*_a, **_k):
        _f = _os.path.join(_OUT, _uuid.uuid4().hex + ".png")
        _plt.savefig(_f, bbox_inches="tight")
        print(f"[[NOTEBOOK_IMAGE:{_f}]]", flush=True)
    _plt.show = _notebook_show
except Exception:
    pass
`;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".bmp": "image/bmp",
};

function mimeFor(ext: string): string {
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

async function collectImage(fp: string) {
  const data = await fs.readFile(fp);
  return {
    name: path.basename(fp),
    mime: mimeFor(path.extname(fp).toLowerCase()),
    data: data.toString("base64"),
  };
}

export async function runPython(
  code: string,
  opts: { cwd: string; pythonPath: string; timeout?: number }
): Promise<PythonResult> {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "nb-out-"));
  try {
    const res = await runProc(opts.pythonPath, ["-u", "-c", PREAMBLE + "\n" + code], {
      cwd: opts.cwd,
      timeout: opts.timeout ?? 60000,
      env: {
        ...process.env,
        NOTEBOOK_OUTPUT_DIR: outDir,
        PYTHONUNBUFFERED: "1",
      },
    });

    // Replace image markers in stdout with inline base64 images.
    const images: PythonResult["images"] = [];
    const imgRe = /\[\[NOTEBOOK_IMAGE:([^\]]+)\]\]/;
    const cleaned: string[] = [];
    for (const line of res.stdout.split("\n")) {
      const m = imgRe.exec(line);
      if (!m) {
        cleaned.push(line);
        continue;
      }
      try {
        images.push(await collectImage(m[1]));
        await fs.rm(m[1], { force: true }).catch(() => {});
        cleaned.push("");
      } catch {
        cleaned.push(line);
      }
    }

    // Pick up any image files written directly to the output dir.
    try {
      for (const f of await fs.readdir(outDir)) {
        images.push(await collectImage(path.join(outDir, f)));
      }
    } catch {
      /* no output dir */
    }

    return {
      stdout: cleaned.join("\n"),
      stderr:
        res.code === 0 || res.error ? res.stderr : "",
      error: res.error
        ? `无法启动 python3: ${res.error}`
        : res.code !== 0
          ? res.stderr.trim() || `进程退出，退出码 ${res.code ?? "unknown"}`
          : undefined,
      images,
      timedOut: res.timedOut,
    };
  } finally {
    await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
  }
}
