"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Cell as CellType, CellOutput } from "@/lib/types";
import Cell from "@/components/Cell";
import { Plus } from "@/components/icons";

interface Props {
  projectId: string;
  projectName: string;
}

type SaveState = "saved" | "saving" | "dirty";

let uid = 0;
function makeId(): string {
  return `c${Date.now().toString(36)}${(uid++).toString(36)}r${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export default function Notebook({ projectId, projectName }: Props) {
  const [cells, setCells] = useState<CellType[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningIndex, setRunningIndex] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [loadError, setLoadError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellsRef = useRef<CellType[]>([]);

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        setCells(Array.isArray(data.cells) ? data.cells : []);
      })
      .catch(() => {
        if (alive) setLoadError("加载项目失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const save = useMemo(
    () => () => {
      setSaveState("saving");
      fetch(`/api/projects/${projectId}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cells: cellsRef.current }),
      })
        .then((r) => (r.ok ? setSaveState("saved") : setSaveState("dirty")))
        .catch(() => setSaveState("dirty"));
    },
    [projectId]
  );

  useEffect(() => {
    if (loading) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, 900);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cells, loading, save]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        fetch(`/api/projects/${projectId}/content`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cells: cellsRef.current }),
        }).catch(() => {});
      }
    };
  }, [projectId]);

  function updateCell(id: string, patch: Partial<CellType>) {
    setSaveState("dirty");
    setCells((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  function insertCell(
    type: "markdown" | "code",
    afterIndex: number | null
  ) {
    setSaveState("dirty");
    const newCell: CellType = {
      id: makeId(),
      type,
      content:
        type === "code"
          ? "# 在这里编写 Python 代码\n"
          : "# 在这里编写 Markdown\n",
    };
    setCells((prev) => {
      const idx = afterIndex == null ? prev.length : afterIndex + 1;
      return [...prev.slice(0, idx), newCell, ...prev.slice(idx)];
    });
  }

  function deleteCell(id: string) {
    setSaveState("dirty");
    setCells((prev) => prev.filter((c) => c.id !== id));
  }

  async function runCell(index: number) {
    const cell = cells[index];
    if (!cell || cell.type !== "code" || runningIndex != null) return;
    setRunningIndex(index);
    updateCell(cell.id, { output: undefined });
    const codeCells = cells
      .slice(0, index + 1)
      .filter((c) => c.type === "code")
      .map((c) => c.content);
    try {
      const res = await fetch(`/api/projects/${projectId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeCells }),
      });
      const data: CellOutput & { error?: string } = await res.json();
      if (!res.ok) {
        updateCell(cell.id, {
          output: { stdout: "", stderr: "", error: data.error || "执行失败" },
        });
      } else {
        updateCell(cell.id, {
          output: {
            stdout: data.stdout,
            stderr: data.stderr,
            error: data.error,
            timedOut: data.timedOut,
            images: data.images,
          },
        });
      }
    } catch {
      updateCell(cell.id, {
        output: { stdout: "", stderr: "", error: "请求失败" },
      });
    } finally {
      setRunningIndex(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-panel-border px-4 py-2">
        <h2 className="min-w-0 truncate text-sm font-semibold" title={projectName}>
          {projectName}
        </h2>
        <div className="flex-1" />
        <span
          className={`text-[11px] ${
            saveState === "saved" ? "text-muted" : "text-warn"
          }`}
        >
          {loading
            ? "加载中..."
            : saveState === "saved"
              ? "已保存"
              : saveState === "saving"
                ? "保存中..."
                : "未保存"}
        </span>
        <button
          onClick={() => insertCell("markdown", null)}
          className="flex items-center gap-1 rounded bg-accent/10 px-2 py-1 text-[11px] text-accent hover:bg-accent/20"
        >
          <Plus className="h-3 w-3" /> Markdown
        </button>
        <button
          onClick={() => insertCell("code", null)}
          className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[11px] text-white hover:opacity-90"
        >
          <Plus className="h-3 w-3" /> Python
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loadError ? (
          <p className="text-sm text-danger">{loadError}</p>
        ) : loading ? (
          <p className="text-sm text-muted">加载中...</p>
        ) : (
          <div className="mx-auto max-w-3xl space-y-2">
            {cells.length === 0 && (
              <div className="rounded-lg border border-dashed border-panel-border p-8 text-center">
                <p className="mb-4 text-sm text-muted">
                  还没有内容，添加 Markdown 或 Python 单元格开始。
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => insertCell("markdown", null)}
                    className="rounded bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20"
                  >
                    + Markdown
                  </button>
                  <button
                    onClick={() => insertCell("code", null)}
                    className="rounded bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90"
                  >
                    + Python
                  </button>
                </div>
              </div>
            )}
            {cells.map((cell, i) => (
              <Cell
                key={cell.id}
                cell={cell}
                running={runningIndex === i}
                onEdit={(content) => updateCell(cell.id, { content })}
                onDelete={() => deleteCell(cell.id)}
                onRun={() => void runCell(i)}
                onInsert={(type) => insertCell(type, i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
