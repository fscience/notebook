"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FileEntry } from "@/lib/types";
import FilePreview from "@/components/FilePreview";
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  FileIcon,
  Upload,
  NewFolder,
  Refresh,
  Trash,
} from "@/components/icons";

interface Props {
  projectId: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileExplorer({ projectId }: Props) {
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setError(null);
      setEntries(data.entries ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId, path]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  function navTo(p: string) {
    setLoading(true);
    setPath(p);
    setPreview(null);
  }

  function parentOf(p: string): string {
    const idx = p.lastIndexOf("/");
    return idx >= 0 ? p.slice(0, idx) : "";
  }

  function refresh() {
    setLoading(true);
    void load();
  }

  function dirOf(rel: string): string {
    const idx = rel.lastIndexOf("/");
    return idx > 0 ? rel.slice(0, idx) : "";
  }

  interface UploadItem {
    name: string;
    relpath: string;
    data: ArrayBuffer;
  }

  async function filesFromDataTransfer(
    dt: DataTransfer
  ): Promise<{ files: UploadItem[]; dirs: string[] }> {
    const files: UploadItem[] = [];
    const dirs: string[] = [];
    const items = Array.from(dt.items ?? []);
    let handled = false;
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (!entry) continue;
      handled = true;
      await walkEntry(entry, "", files, dirs);
    }
    if (!handled) {
      for (const f of Array.from(dt.files)) {
        files.push({ name: f.name, relpath: "", data: await f.arrayBuffer() });
      }
    }
    return { files, dirs };
  }

  function walkEntry(
    entry: FileSystemEntry,
    rel: string,
    files: UploadItem[],
    dirs: string[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (entry.isFile) {
        (entry as FileSystemFileEntry).file(
          async (file) => {
            try {
              files.push({
                name: file.name,
                relpath: dirOf(rel),
                data: await file.arrayBuffer(),
              });
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          reject
        );
      } else if (entry.isDirectory) {
        const base = rel || entry.name;
        if (base) dirs.push(base);
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const readAll: () => void = () => {
          reader.readEntries(
            async (entries) => {
              if (entries.length === 0) {
                resolve();
                return;
              }
              for (const e of entries) {
                await walkEntry(
                  e,
                  base ? `${base}/${e.name}` : e.name,
                  files,
                  dirs
                );
              }
              readAll();
            },
            reject
          );
        };
        readAll();
      } else {
        resolve();
      }
    });
  }

  async function handleUpload(source: DataTransfer | FileList | File[]) {
    let items: UploadItem[] = [];
    let dirs: string[] = [];
    try {
      if (source instanceof DataTransfer) {
        const r = await filesFromDataTransfer(source);
        items = r.files;
        dirs = r.dirs;
      } else {
        const list = Array.from(source);
        items = await Promise.all(
          list.map(async (f) => ({
            name: f.name,
            relpath: dirOf(f.webkitRelativePath),
            data: await f.arrayBuffer(),
          }))
        );
      }
    } catch (e) {
      alert(`读取拖入的文件失败: ${(e as Error).message}`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (items.length === 0 && dirs.length === 0) return;
    setUploading(true);
    setProgress([0, items.length + dirs.length]);
    let failed = 0;
    try {
      let done = 0;
      for (const { name, relpath, data } of items) {
        setProgress([done, items.length + dirs.length]);
        const fd = new FormData();
        fd.append("path", path);
        fd.append("files", new Blob([data]), name);
        fd.append("relpath", relpath);
        try {
          const res = await fetch(`/api/projects/${projectId}/files`, {
            method: "POST",
            body: fd,
          });
          if (!res.ok) {
            failed++;
            const err = await res.json().catch(() => ({}));
            console.warn(`上传 ${name} 失败:`, err.error || res.status);
          }
        } catch (e) {
          failed++;
          console.warn(`上传 ${name} 失败:`, e);
        }
        done++;
      }
      for (const dir of dirs) {
        const parent = dirOf(dir);
        const dirName = dir.split("/").pop() ?? "";
        setProgress([done, items.length + dirs.length]);
        await fetch(`/api/projects/${projectId}/files/mkdir`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: parent, name: dirName }),
        }).catch(() => {});
        done++;
      }
    } finally {
      setUploading(false);
      setProgress(null);
      if (failed > 0) alert(`有 ${failed} 个文件上传失败`);
      setLoading(true);
      await load();
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current--;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void handleUpload(e.dataTransfer);
  }

  async function handleNewFolder() {
    const name = window.prompt("新建文件夹名称:");
    if (!name) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/files/mkdir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "创建失败");
      }
      setLoading(true);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDelete(entry: FileEntry) {
    const msg = entry.isDir
      ? `确定删除文件夹 ${entry.name} 及其全部内容?`
      : `确定删除文件 ${entry.name}?`;
    if (!window.confirm(msg)) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/files/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: entry.path }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "删除失败");
      }
      setLoading(true);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const crumbs = path.split("/").filter(Boolean);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-panel-border px-2 py-1.5">
        <span className="text-xs font-semibold">文件</span>
        <div className="flex-1" />
        <button
          onClick={refresh}
          className="rounded p-1 text-muted hover:bg-hover hover:text-foreground"
          title="刷新"
        >
          <Refresh className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-panel-border px-2 py-1.5">
        <button
          onClick={() => navTo(parentOf(path))}
          disabled={!path}
          className="rounded p-1 text-muted hover:bg-hover hover:text-foreground disabled:opacity-30"
          title="上一级"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 text-[11px]">
          <button
            onClick={() => navTo("")}
            className={`rounded px-1 py-0.5 hover:bg-hover ${path ? "text-muted" : "font-medium text-foreground"}`}
          >
            根目录
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center">
              <ChevronRight className="h-3 w-3 shrink-0 text-muted" />
              <button
                onClick={() => navTo(crumbs.slice(0, i + 1).join("/"))}
                className="truncate rounded px-1 py-0.5 hover:bg-hover"
              >
                {c}
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-panel-border px-2 py-1.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void handleUpload(e.target.files);
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[11px] text-white hover:opacity-90 disabled:opacity-50"
          title="上传文件到当前文件夹"
        >
          <Upload className="h-3 w-3" />{" "}
          {uploading
            ? progress
              ? `上传中 ${progress[0] + 1}/${progress[1]}`
              : "上传中..."
            : "上传"}
        </button>
        <button
          onClick={() => void handleNewFolder()}
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted hover:bg-hover hover:text-foreground"
          title="新建文件夹"
        >
          <NewFolder className="h-3 w-3" /> 新建文件夹
        </button>
      </div>

      <div
        className="relative flex-1 overflow-y-auto p-1.5"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {loading ? (
          <p className="p-2 text-xs text-muted">加载中...</p>
        ) : error ? (
          <p className="p-2 text-xs text-danger">{error}</p>
        ) : entries.length === 0 ? (
          <p className="p-2 text-xs text-muted">
            空文件夹，拖拽文件或文件夹到此上传
          </p>
        ) : (
          entries.map((e) => (
            <div
              key={e.path}
              className="group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-hover"
              onClick={() => (e.isDir ? navTo(e.path) : setPreview(e))}
              title={e.isDir ? `打开 ${e.name}` : `预览 ${e.name}`}
            >
              {e.isDir ? (
                <Folder className="h-4 w-4 shrink-0 text-accent" />
              ) : (
                <FileIcon className="h-4 w-4 shrink-0 text-muted" />
              )}
              <span className="min-w-0 flex-1 truncate text-[13px]">{e.name}</span>
              <span className="shrink-0 text-[10px] text-muted">
                {e.isDir ? "" : formatSize(e.size)}
              </span>
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  void handleDelete(e);
                }}
                className="shrink-0 rounded p-1 text-muted opacity-0 hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
                title="删除"
              >
                <Trash className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
        {dragging && (
          <div className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-accent/10">
            <p className="text-xs font-medium text-accent">
              松开以上传到 {path || "根目录"}
            </p>
          </div>
        )}
      </div>

      {preview && (
        <FilePreview
          projectId={projectId}
          file={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
