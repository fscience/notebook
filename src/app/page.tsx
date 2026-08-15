"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/types";
import ProjectList from "@/components/ProjectList";
import Notebook from "@/components/Notebook";
import FileExplorer from "@/components/FileExplorer";
import EnvPanel from "@/components/EnvPanel";
import { ChevronLeft, ChevronRight } from "@/components/icons";

const MIN_RIGHT_WIDTH = 200;

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<"files" | "env">("files");
  const [rightWidth, setRightWidth] = useState(288);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [draggingRight, setDraggingRight] = useState(false);
  const rightDragRef = useRef<{ startX: number; startWidth: number } | null>(
    null
  );

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

  function startRightDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    rightDragRef.current = { startX: e.clientX, startWidth: rightWidth };
    setDraggingRight(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onRightDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = rightDragRef.current;
    if (!drag) return;
    const delta = e.clientX - drag.startX;
    const max = Math.max(MIN_RIGHT_WIDTH, window.innerWidth * 0.7);
    setRightWidth(
      Math.min(Math.max(drag.startWidth - delta, MIN_RIGHT_WIDTH), max)
    );
  }

  function endRightDrag(e: React.PointerEvent<HTMLDivElement>) {
    rightDragRef.current = null;
    setDraggingRight(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  return (
    <div
      className={`flex h-screen w-full overflow-hidden ${
        draggingRight ? "select-none" : ""
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
            loading={loadingProjects}
          />
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
          <div className="flex-1" />
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
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                在左侧选择或创建一个项目
              </div>
            )}
          </div>

          {!rightCollapsed && (
            <>
              <div
                onPointerDown={startRightDrag}
                onPointerMove={onRightDragMove}
                onPointerUp={endRightDrag}
                onPointerCancel={endRightDrag}
                className="w-1 shrink-0 cursor-col-resize border-l border-panel-border bg-panel-bg transition-colors hover:bg-accent/50 active:bg-accent"
                title="拖动调整宽度"
              />
              <aside
                style={{ width: rightWidth }}
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
        </div>
      </main>
    </div>
  );
}
