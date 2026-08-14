"use client";

import { useEffect, useState } from "react";
import type { FileEntry } from "@/lib/types";
import { Close } from "@/components/icons";

const TEXT_EXTS = new Set([
  "txt", "md", "markdown", "json", "csv", "tsv", "log", "py", "js", "jsx",
  "ts", "tsx", "html", "htm", "css", "scss", "xml", "yaml", "yml", "toml",
  "ini", "sql", "sh", "bash", "ipynb", "env", "conf", "cfg", "gitignore",
  "dockerfile", "lock",
]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);

function extOf(name: string): string {
  const base = name.toLowerCase();
  if (base === "dockerfile") return "dockerfile";
  if (base === ".gitignore") return "gitignore";
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i + 1) : "";
}

interface Props {
  projectId: string;
  file: FileEntry;
  onClose: () => void;
}

export default function FilePreview({ projectId, file, onClose }: Props) {
  const ext = extOf(file.name);
  const isImage = IMAGE_EXTS.has(ext);
  const isPdf = ext === "pdf";
  const isText = TEXT_EXTS.has(ext) || ext === "dockerfile" || ext === "gitignore";
  const rawUrl = `/api/projects/${projectId}/files/raw?path=${encodeURIComponent(
    file.path
  )}`;
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(isText);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isText) return;
    let alive = true;
    fetch(rawUrl)
      .then(async (r) => {
        if (!r.ok) throw new Error("读取失败");
        const t = await r.text();
        if (alive) setText(t);
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [rawUrl, isText]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-panel-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-panel-border px-3 py-2">
          <span className="min-w-0 truncate text-sm font-medium" title={file.path}>
            {file.path}
          </span>
          <div className="flex-1" />
          <a
            href={rawUrl}
            download={file.name}
            className="rounded bg-accent px-2 py-1 text-[11px] text-white hover:opacity-90"
          >
            下载
          </a>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-hover hover:text-foreground"
          >
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-preview-bg p-3">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={rawUrl}
              alt={file.name}
              className="mx-auto max-h-full max-w-full object-contain"
            />
          ) : isPdf ? (
            <iframe src={rawUrl} title={file.name} className="h-full w-full rounded" />
          ) : isText ? (
            loading ? (
              <p className="text-sm text-muted">加载中...</p>
            ) : error ? (
              <p className="text-sm text-danger">{error}</p>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed">
                {text}
              </pre>
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted">
              <p>此文件类型无法预览</p>
              <a
                href={rawUrl}
                download={file.name}
                className="rounded bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90"
              >
                下载文件
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
