"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Project } from "@/lib/types";
import ProjectList from "@/components/ProjectList";
import Notebook, {
  type NotebookHandle,
  type NotebookHeaderState,
} from "@/components/Notebook";
import FileExplorer from "@/components/FileExplorer";
import EnvPanel from "@/components/EnvPanel";
import SettingsModal from "@/components/SettingsModal";
import ShellTerminal from "@/components/ShellTerminal";
import { ChevronLeft, ChevronRight, Gear, TerminalIcon, Close, Plus } from "@/components/icons";
import { ROOT_DOC_NAME } from "@/lib/wiki";

const MIN_RIGHT_WIDTH = 200;
const MIN_SHELL_HEIGHT = 120;

/** Pointer-capture based panel resizing along one axis. */
function usePanelResize(initial: number, min: number, axis: "x" | "y") {
  const [size, setSize] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ pos: number; size: number } | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    startRef.current = { pos: axis === "x" ? e.clientX : e.clientY, size };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    if (!start) return;
    const delta = (axis === "x" ? e.clientX : e.clientY) - start.pos;
    const max = Math.max(min, (axis === "x" ? window.innerWidth : window.innerHeight) * 0.7);
    setSize(Math.min(Math.max(start.size - delta, min), max));
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    startRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  return {
    size,
    dragging,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  };
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<"files" | "env">("files");
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shellOpen, setShellOpen] = useState(false);
  const [headerInfo, setHeaderInfo] = useState<NotebookHeaderState | null>(
    null
  );
  const notebookRef = useRef<NotebookHandle | null>(null);

  const rightPanel = usePanelResize(288, MIN_RIGHT_WIDTH, "x");
  const shellPanel = usePanelResize(260, MIN_SHELL_HEIGHT, "y");

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (Array.isArray(data)) {
        setProjects(data);
        setSelectedId((cur) => {
          if (cur && data.some((p) => p.id === cur)) return cur;
          return data[0]?.id ?? null;
        });
      }
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleHeaderState = useCallback((info: NotebookHeaderState) => {
    setHeaderInfo(info);
  }, []);

  async function handleCreate(name: string) {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "创建项目失败");
      return;
    }
    setProjects((prev) => [data, ...prev]);
    setSelectedId(data.id);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "删除项目失败");
      return;
    }
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      setSelectedId((cur) => (cur === id ? (next[0]?.id ?? null) : cur));
      return next;
    });
  }

  async function handleRename(id: string, name: string) {
    const clean = name.trim();
    if (!clean) return;
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: clean }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || "重命名项目失败");
      return;
    }
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: clean } : p))
    );
  }

  return (
    <div
      className={`flex h-screen w-full overflow-hidden ${
        rightPanel.dragging || shellPanel.dragging ? "select-none" : ""
      }`}
    >
      {!leftCollapsed && (
        <aside className="flex h-full w-60 shrink-0 flex-col border-r border-panel-border bg-panel-bg">
          <div className="flex items-center justify-between border-b border-panel-border px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              项目
            </span>
            <button
              onClick={() => setLeftCollapsed(true)}
              className="rounded p-1 text-muted hover:bg-hover hover:text-foreground"
              title="收起左侧"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>
          <ProjectList
            projects={projects}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onRename={handleRename}
            loading={loadingProjects}
          />
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex shrink-0 items-center gap-2 border-t border-panel-border px-3 py-2 text-xs text-muted hover:bg-hover hover:text-foreground"
            title="设置"
          >
            <Gear className="h-3.5 w-3.5" />
            设置
          </button>
        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-panel-border bg-panel-bg px-2">
          {leftCollapsed ? (
            <button
              onClick={() => setLeftCollapsed(false)}
              className="rounded p-1 text-muted hover:bg-hover hover:text-foreground"
              title="展开左侧"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className="truncate text-sm font-semibold">
            {selected ? selected.name : "Notebook"}
          </span>
          {selected && headerInfo && headerInfo.currentDoc !== ROOT_DOC_NAME && (
            <span className="hidden shrink-0 truncate text-xs text-muted md:inline">
              › {headerInfo.currentDoc}
            </span>
          )}
          <div className="flex-1" />
          {selected && (
            <>
              <span
                className={`hidden shrink-0 text-[11px] lg:inline ${
                  headerInfo && headerInfo.saveState === "saved"
                    ? "text-muted"
                    : "text-warn"
                }`}
              >
                {!headerInfo || headerInfo.loading
                  ? "加载中..."
                  : headerInfo.saveState === "saved"
                    ? "已保存"
                    : headerInfo.saveState === "saving"
                      ? "保存中..."
                      : "未保存"}
              </span>
              <button
                onClick={() => notebookRef.current?.appendBlock("python")}
                className="flex shrink-0 items-center gap-1 rounded bg-accent px-2 py-1 text-[11px] text-white hover:opacity-90"
                title="在光标后插入 Python 运行块"
              >
                <Plus className="h-3 w-3" /> Python
              </button>
              <button
                onClick={() => notebookRef.current?.appendBlock("shell")}
                className="flex shrink-0 items-center gap-1 rounded bg-warn/15 px-2 py-1 text-[11px] text-warn hover:bg-warn/25"
                title="在光标后插入 Shell 运行块"
              >
                <Plus className="h-3 w-3" /> Shell
              </button>
            </>
          )}
          <button
            onClick={() => setShellOpen((v) => !v)}
            disabled={!selected}
            className={`rounded p-1 ${
              shellOpen
                ? "bg-accent/15 text-accent"
                : "text-muted hover:bg-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            }`}
            title={shellOpen ? "收起终端面板" : "展开终端面板"}
          >
            <TerminalIcon className="h-4 w-4" />
          </button>
          {rightCollapsed ? (
            <button
              onClick={() => setRightCollapsed(false)}
              className="rounded p-1 text-muted hover:bg-hover hover:text-foreground"
              title="展开右侧"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => setRightCollapsed(true)}
              className="rounded p-1 text-muted hover:bg-hover hover:text-foreground"
              title="收起右侧"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 bg-background">
            {selected ? (
              <Notebook
                key={selected.id}
                projectId={selected.id}
                projectName={selected.name}
                ref={notebookRef}
                onHeaderState={handleHeaderState}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                在左侧选择或创建一个项目
              </div>
            )}
          </div>
        </div>

        {shellOpen && selected && (
          <div
            style={{ height: shellPanel.size }}
            className="flex shrink-0 flex-col border-t border-panel-border bg-panel-bg"
          >
            <div
              {...shellPanel.handlers}
              className="group flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-b border-panel-border transition-colors hover:bg-accent/50 active:bg-accent"
              title="拖动调整高度"
            >
              <div className="h-0.5 w-10 rounded-full bg-panel-border group-hover:bg-accent/70" />
            </div>
            <div className="flex shrink-0 items-center gap-2 border-b border-panel-border px-3 py-1.5">
              <TerminalIcon className="h-3.5 w-3.5 text-shell-label" />
              <span className="text-xs font-semibold">终端</span>
              <span className="text-[10px] text-muted">
                {selected.name}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setShellOpen(false)}
                className="rounded p-1 text-muted hover:bg-hover hover:text-foreground"
                title="关闭终端面板"
              >
                <Close className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ShellTerminal projectId={selected.id} cellId="panel" fill noHistory />
            </div>
          </div>
        )}
      </main>

      {!rightCollapsed && (
        <>
          <div
            {...rightPanel.handlers}
            className="w-1 shrink-0 cursor-col-resize border-l border-panel-border bg-panel-bg transition-colors hover:bg-accent/50 active:bg-accent"
            title="拖动调整宽度"
          />
          <aside
            style={{ width: rightPanel.size }}
            className="flex shrink-0 flex-col border-l border-panel-border bg-panel-bg"
          >
            {selected ? (
              <div className="flex h-full flex-col">
                <div className="flex shrink-0 border-b border-panel-border">
                  <button
                    onClick={() => setRightTab("files")}
                    className={`flex-1 py-1.5 text-xs font-medium ${
                      rightTab === "files"
                        ? "border-b-2 border-accent text-foreground"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    文件
                  </button>
                  <button
                    onClick={() => setRightTab("env")}
                    className={`flex-1 py-1.5 text-xs font-medium ${
                      rightTab === "env"
                        ? "border-b-2 border-accent text-foreground"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    环境
                  </button>
                </div>
                <div className="min-h-0 flex-1">
                  {rightTab === "files" ? (
                    <FileExplorer key={selected.id} projectId={selected.id} />
                  ) : (
                    <EnvPanel key={selected.id} projectId={selected.id} />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                选择一个项目
              </div>
            )}
          </aside>
        </>
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={loadProjects}
      />
    </div>
  );
}
