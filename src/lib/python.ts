import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

function mimeFor(ext: string): string {
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".pdf":
      return "application/pdf";
    case ".bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

export function runPython(
  code: string,
  opts: { cwd: string; timeout?: number }
): Promise<PythonResult> {
  const timeoutMs = opts.timeout ?? 60000;

  return new Promise(async (resolve) => {
    let done = false;
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "nb-out-"));
    const child = spawn("python3", ["-u", "-c", PREAMBLE + "\n" + code], {
      cwd: opts.cwd,
      env: {
        ...process.env,
        NOTEBOOK_OUTPUT_DIR: outDir,
        PYTHONUNBUFFERED: "1",
      },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    async function finish(extra: {
      error?: string;
      stderr?: string;
      timedOut?: boolean;
    }) {
      if (done) return;
      done = true;
      clearTimeout(timer);

      const images: { name: string; data: string; mime: string }[] = [];
      const imgRe = /\[\[NOTEBOOK_IMAGE:([^\]]+)\]\]/g;
      const lines = stdout.split("\n");
      const cleaned: string[] = [];

      for (const line of lines) {
        imgRe.lastIndex = 0;
        const m = imgRe.exec(line);
        if (m) {
          try {
            const fp = m[1];
            const data = await fs.readFile(fp);
            images.push({
              name: path.basename(fp),
              mime: mimeFor(path.extname(fp).toLowerCase()),
              data: data.toString("base64"),
            });
            await fs.rm(fp, { force: true }).catch(() => {});
            cleaned.push("");
          } catch {
            cleaned.push(line);
          }
        } else {
          cleaned.push(line);
        }
      }

      // Pick up any image files written directly to the output dir.
      try {
        const files = await fs.readdir(outDir);
        for (const f of files) {
          const fp = path.join(outDir, f);
          const data = await fs.readFile(fp);
          images.push({
            name: f,
            mime: mimeFor(path.extname(f).toLowerCase()),
            data: data.toString("base64"),
          });
          await fs.rm(fp, { force: true }).catch(() => {});
        }
      } catch {
        /* no output dir */
      }
      await fs.rmdir(outDir).catch(() => {});

      resolve({
        stdout: cleaned.join("\n"),
        stderr,
        images,
        timedOut,
        ...extra,
      });
    }

    child.on("error", (err) => {
      void finish({
        error: `无法启动 python3: ${err.message}`,
      });
    });

    child.on("close", (code) => {
      if (code === 0) {
        void finish({});
      } else {
        void finish({
          error: stderr.trim() || `进程退出，退出码 ${code ?? "unknown"}`,
          stderr: "",
        });
      }
    });
  });
}
