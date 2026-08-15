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

  async function handleUpload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("path", path);
      for (const f of list) {
        fd.append("files", f);
        fd.append("relpath", dirOf(f.webkitRelativePath));
      }
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "上传失败");
      }
      setLoading(true);
      await load();
    } finally {
      setUploading(false);
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
    void handleUpload(e.dataTransfer.files);
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
          <Upload className="h-3 w-3" /> {uploading ? "上传中..." : "上传"}
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
