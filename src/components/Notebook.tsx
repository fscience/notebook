"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import type { CellOutput, Document } from "@/lib/types";
import BlockNoteEditor, {
  type BlockNoteEditorHandle,
} from "@/components/BlockNoteEditor";
import { ChevronLeft } from "@/components/icons";
import { runBlockKey, type RunBlockKind } from "@/lib/runblock";
import { ROOT_DOC_NAME } from "@/lib/wiki";

export type SaveState = "saved" | "saving" | "dirty";

export interface NotebookHeaderState {
  loading: boolean;
  saveState: SaveState;
  currentDoc: string;
}

export interface NotebookHandle {
  appendBlock: (kind: RunBlockKind) => void;
}

interface Props {
  projectId: string;
  projectName: string;
  ref?: Ref<NotebookHandle>;
  onHeaderState?: (info: NotebookHeaderState) => void;
}

interface UndoEntry {
  content: string;
  outputs: Record<string, CellOutput>;
}

const MAX_UNDO = 100;

export default function Notebook({
  projectId,
  onHeaderState,
  ref,
}: Props) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [currentDoc, setCurrentDoc] = useState<string>(ROOT_DOC_NAME);
  const [content, setContent] = useState<string>("");
  const [outputs, setOutputs] = useState<Record<string, CellOutput>>({});
  const [loading, setLoading] = useState(true);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [loadError, setLoadError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<string>("");
  const outputsRef = useRef<Record<string, CellOutput>>({});
  const docsRef = useRef<Document[]>([]);
  const currentDocRef = useRef<string>(ROOT_DOC_NAME);
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const editorHandleRef = useRef<BlockNoteEditorHandle | null>(null);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    outputsRef.current = outputs;
  }, [outputs]);

  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  useEffect(() => {
    currentDocRef.current = currentDoc;
  }, [currentDoc]);

  const snapshot = useCallback(
    (): UndoEntry => ({
      content: contentRef.current,
      outputs: { ...outputsRef.current },
    }),
    []
  );

  const restore = useCallback((entry: UndoEntry) => {
    contentRef.current = entry.content;
    setContent(entry.content);
    outputsRef.current = entry.outputs;
    setOutputs(entry.outputs);
    setSaveState("dirty");
  }, []);

  function pushUndo() {
    undoStackRef.current.push(snapshot());
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    redoStackRef.current = [];
  }

  const travel = useCallback(
    (from: UndoEntry[], to: UndoEntry[]) => {
      const entry = from.pop();
      if (!entry) return;
      to.push(snapshot());
      restore(entry);
    },
    [snapshot, restore]
  );

  const undo = useCallback(
    () => travel(undoStackRef.current, redoStackRef.current),
    [travel]
  );
  const redo = useCallback(
    () => travel(redoStackRef.current, undoStackRef.current),
    [travel]
  );

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") {
        if (mod && e.key === "y") {
          e.preventDefault();
          redo();
        }
        return;
      }
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [undo, redo]);

  useImperativeHandle(
    ref,
    () => ({
      appendBlock: (kind) => editorHandleRef.current?.insertRunBlock(kind),
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
        docsRef.current = list;
        setDocs(list);
        currentDocRef.current = root ? root.name : ROOT_DOC_NAME;
        setCurrentDoc(currentDocRef.current);
        contentRef.current = root ? root.content : "";
        setContent(contentRef.current);
        outputsRef.current = root?.outputs ?? {};
        setOutputs(outputsRef.current);
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
        contentRef.current = root.content;
        setContent(root.content);
        outputsRef.current = root.outputs ?? {};
        setOutputs(root.outputs ?? {});
      }
    }
  }

  const persistContent = useCallback(() => {
    const savedName = currentDocRef.current;
    setSaveState("saving");
    fetch(`/api/projects/${projectId}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: savedName,
        content: contentRef.current,
        outputs: outputsRef.current,
      }),
    })
      .then(async (r) => {
        if (!r.ok) {
          setSaveState("dirty");
          return;
        }
        setSaveState("saved");
        applySaveResponse(await r.json().catch(() => ({})), savedName);
      })
      .catch(() => setSaveState("dirty"));
  }, [projectId]);

  useEffect(() => {
    if (loading) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(persistContent, 900);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, outputs, currentDoc, loading, persistContent]);

  // Flush pending changes when switching away from the project.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        fetch(`/api/projects/${projectId}/content`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: currentDocRef.current,
            content: contentRef.current,
            outputs: outputsRef.current,
          }),
        }).catch(() => {});
      }
    };
  }, [projectId]);

  function flushSave() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    persistContent();
  }

  async function navigate(docName: string) {
    const name = String(docName || "").trim() || ROOT_DOC_NAME;
    if (name === currentDocRef.current) return;
    flushSave();
    const existing = docsRef.current.find((d) => d.name === name);
    contentRef.current = existing ? existing.content : "";
    setContent(contentRef.current);
    outputsRef.current = existing?.outputs ?? {};
    setOutputs(outputsRef.current);
    currentDocRef.current = name;
    setCurrentDoc(name);
    setSaveState("dirty");
  }

  function handleContentChange(newContent: string) {
    if (contentRef.current === newContent) return;
    pushUndo();
    setContent(newContent);
    setSaveState("dirty");
  }

  async function handleRunBlock(key: string, kind: RunBlockKind) {
    if (runningKey != null) return;
    setRunningKey(key);
    removeOutput(key);

    let res: Response;
    try {
      if (kind === "shell") {
        res = await fetch(`/api/projects/${projectId}/execute-shell`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commands: editorHandleRef.current?.getBlockCode(key) ?? "",
          }),
        });
      } else {
        const pythons = editorHandleRef.current?.getPythonBlocks() ?? [];
        const idx = pythons.findIndex(
          (b) => runBlockKey("python", b.code) === key
        );
        res = await fetch(`/api/projects/${projectId}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codeCells: pythons.slice(0, idx + 1).map((b) => b.code),
          }),
        });
      }
      const data: CellOutput & { error?: string } = await res.json();
      setOutputs((prev) => ({
        ...prev,
        [key]: res.ok
          ? {
              stdout: data.stdout,
              stderr: data.stderr,
              error: data.error,
              timedOut: data.timedOut,
              ...(kind === "python" ? { images: data.images } : {}),
            }
          : { stdout: "", stderr: "", error: data.error || "执行失败" },
      }));
    } catch {
      setOutputError(key, "请求失败");
    } finally {
      setRunningKey(null);
    }
  }

  function removeOutput(key: string) {
    setOutputs((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function setOutputError(key: string, error: string) {
    setOutputs((prev) => ({ ...prev, [key]: { stdout: "", stderr: "", error } }));
  }

  function handleDeleteBlock(key: string) {
    pushUndo();
    removeOutput(key);
  }

  function handleToggleOutput(key: string, collapsed: boolean) {
    setOutputs((prev) => {
      const output = prev[key];
      if (!output) return prev;
      return { ...prev, [key]: { ...output, collapsed } };
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loadError ? (
          <p className="text-sm text-danger">{loadError}</p>
        ) : loading ? (
          <p className="text-sm text-muted">加载中...</p>
        ) : (
          <div className="mx-auto max-w-3xl">
            <BlockNoteEditor
              ref={(handle) => {
                editorHandleRef.current = handle;
              }}
              content={content}
              onChange={handleContentChange}
              outputs={outputs}
              runningKey={runningKey}
              onRunBlock={handleRunBlock}
              onDeleteBlock={handleDeleteBlock}
              onToggleOutput={handleToggleOutput}
            />
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
