"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import type {
  Cell as CellType,
  CellOutput,
  Document,
} from "@/lib/types";
import Cell from "@/components/Cell";
import { ChevronLeft } from "@/components/icons";

import { ROOT_DOC_NAME } from "@/lib/wiki";

export type SaveState = "saved" | "saving" | "dirty";

export interface NotebookHeaderState {
  loading: boolean;
  saveState: SaveState;
  currentDoc: string;
}

export interface NotebookHandle {
  insertCell: (type: CellType["type"]) => void;
}

interface Props {
  projectId: string;
  projectName: string;
  ref?: Ref<NotebookHandle>;
  onHeaderState?: (info: NotebookHeaderState) => void;
}

let uid = 0;
function makeId(): string {
  return `c${Date.now().toString(36)}${(uid++).toString(36)}r${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export default function Notebook({
  projectId,
  onHeaderState,
  ref,
}: Props) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [currentDoc, setCurrentDoc] = useState<string>(ROOT_DOC_NAME);
  const [cells, setCells] = useState<CellType[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningIndex, setRunningIndex] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [loadError, setLoadError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellsRef = useRef<CellType[]>([]);
  const docsRef = useRef<Document[]>([]);
  const currentDocRef = useRef<string>(ROOT_DOC_NAME);

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  useEffect(() => {
    currentDocRef.current = currentDoc;
  }, [currentDoc]);

  useImperativeHandle(
    ref,
    () => ({
      insertCell: (type) => insertCell(type, null),
    }),
    []
  );

  useEffect(() => {
    onHeaderState?.({ loading, saveState, currentDoc });
  }, [loading, saveState, currentDoc, onHeaderState]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        const list = Array.isArray(data.documents) ? data.documents : [];
        const root =
          list.find((d: Document) => d.name === ROOT_DOC_NAME) ??
          list[0] ??
          null;
        const rootCells = root ? root.cells : [];
        docsRef.current = list;
        setDocs(list);
        cellsRef.current = rootCells;
        setCells(rootCells);
        currentDocRef.current = root ? root.name : ROOT_DOC_NAME;
        setCurrentDoc(root ? root.name : ROOT_DOC_NAME);
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

  function applySaveResponse(
    documents: Document[] | undefined,
    savedName: string
  ) {
    if (!Array.isArray(documents)) return;
    docsRef.current = documents;
    setDocs(documents);
    if (savedName !== currentDocRef.current) return;
    const cur = currentDocRef.current;
    if (!documents.some((d) => d.name === cur)) {
      const root =
        documents.find((d) => d.name === ROOT_DOC_NAME) ?? documents[0];
      if (root) {
        currentDocRef.current = root.name;
        setCurrentDoc(root.name);
        cellsRef.current = root.cells;
        setCells(root.cells);
      }
    }
  }

  const save = useMemo(
    () => () => {
      const savedName = currentDocRef.current;
      setSaveState("saving");
      fetch(`/api/projects/${projectId}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: savedName, cells: cellsRef.current }),
      })
        .then(async (r) => {
          if (!r.ok) {
            setSaveState("dirty");
            return;
          }
          setSaveState("saved");
          const data = await r.json().catch(() => ({}));
          applySaveResponse(data.documents, savedName);
        })
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
  }, [cells, currentDoc, loading, save]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        fetch(`/api/projects/${projectId}/content`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: currentDocRef.current,
            cells: cellsRef.current,
          }),
        }).catch(() => {});
      }
    };
  }, [projectId]);

  async function flushSave() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await save();
  }

  async function navigate(docName: string) {
    const name = String(docName || "").trim() || ROOT_DOC_NAME;
    if (name === currentDocRef.current) return;
    await flushSave();
    const existing = docsRef.current.find((d) => d.name === name);
    const nextCells = existing ? existing.cells : [];
    cellsRef.current = nextCells;
    setCells(nextCells);
    currentDocRef.current = name;
    setCurrentDoc(name);
    setSaveState("dirty");
  }

  function updateCell(id: string, patch: Partial<CellType>) {
    setSaveState("dirty");
    setCells((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  function insertCell(
    type: "markdown" | "code" | "shell",
    afterIndex: number | null
  ) {
    setSaveState("dirty");
    const newCell: CellType = {
      id: makeId(),
      type,
      content:
        type === "code"
          ? "# 在这里编写 Python 代码\n"
          : type === "markdown"
            ? "# 在这里编写 Markdown\n"
            : "",
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
    if (
      !cell ||
      (cell.type !== "code" && cell.type !== "shell") ||
      runningIndex != null
    )
      return;
    setRunningIndex(index);
    updateCell(cell.id, { output: undefined });
    try {
      if (cell.type === "shell") {
        const res = await fetch(`/api/projects/${projectId}/execute-shell`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commands: cell.content }),
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
            },
          });
        }
        return;
      }
      const codeCells = cells
        .slice(0, index + 1)
        .filter((c) => c.type === "code")
        .map((c) => c.content);
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
                  还没有内容，添加 Markdown、Python 或 Shell 单元格开始。
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
                  <button
                    onClick={() => insertCell("shell", null)}
                    className="rounded bg-warn/15 px-3 py-1.5 text-xs text-warn hover:bg-warn/25"
                  >
                    + Shell
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
                onToggleOutput={(collapsed) => {
                  if (!cell.output) return;
                  updateCell(cell.id, { output: { ...cell.output, collapsed } });
                }}
                onNavigate={(name) => void navigate(name)}
              />
            ))}
          </div>
        )}
      </div>

      {currentDoc !== ROOT_DOC_NAME && (
        <div className="flex shrink-0 items-center justify-center border-t border-panel-border bg-panel-bg px-4 py-2">
          <button
            onClick={() => void navigate(ROOT_DOC_NAME)}
            className="flex items-center gap-1 rounded bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20"
            title="返回首页"
          >
            <ChevronLeft className="h-3 w-3" /> 返回首页
          </button>
        </div>
      )}
    </div>
  );
}
