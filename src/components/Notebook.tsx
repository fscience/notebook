"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import type { CellOutput, Document } from "@/lib/types";
import BlockNoteEditor from "@/components/BlockNoteEditor";
import RunBlock from "@/components/RunBlock";
import { ChevronLeft } from "@/components/icons";
import { ROOT_DOC_NAME } from "@/lib/wiki";
import {
  parseContent,
  serializeBlock,
  type RunBlockKind,
  type RunSegment,
} from "@/lib/runblock";

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
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<string>("");
  const outputsRef = useRef<Record<string, CellOutput>>({});
  const docsRef = useRef<Document[]>([]);
  const currentDocRef = useRef<string>(ROOT_DOC_NAME);
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);

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

  const segments = useMemo(() => parseContent(content), [content]);

  function pushUndo() {
    undoStackRef.current.push({
      content: contentRef.current,
      outputs: { ...outputsRef.current },
    });
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    redoStackRef.current = [];
  }

  function undo() {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    redoStackRef.current.push({
      content: contentRef.current,
      outputs: { ...outputsRef.current },
    });
    contentRef.current = entry.content;
    setContent(entry.content);
    outputsRef.current = entry.outputs;
    setOutputs(entry.outputs);
    setSaveState("dirty");
  }

  function redo() {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    undoStackRef.current.push({
      content: contentRef.current,
      outputs: { ...outputsRef.current },
    });
    contentRef.current = entry.content;
    setContent(entry.content);
    outputsRef.current = entry.outputs;
    setOutputs(entry.outputs);
    setSaveState("dirty");
  }

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (mod && e.key === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Escape") {
        setSelectedKey(null);
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  function appendBlock(kind: RunBlockKind) {
    pushUndo();
    const block = serializeBlock(kind, "");
    setContent((prev) => {
      if (!prev.trim()) return block;
      return prev.replace(/\n+$/, "") + "\n\n" + block;
    });
    setSaveState("dirty");
  }

  const appendBlockRef = useRef<(kind: RunBlockKind) => void>(() => {});
  useEffect(() => {
    appendBlockRef.current = appendBlock;
  });

  useImperativeHandle(
    ref,
    () => ({
      appendBlock: (kind) => appendBlockRef.current(kind),
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
        const rootContent = root ? root.content : "";
        const rootOutputs = root?.outputs ?? {};
        docsRef.current = list;
        setDocs(list);
        contentRef.current = rootContent;
        setContent(rootContent);
        outputsRef.current = rootOutputs;
        setOutputs(rootOutputs);
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
        contentRef.current = root.content;
        setContent(root.content);
        outputsRef.current = root.outputs ?? {};
        setOutputs(root.outputs ?? {});
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
  }, [content, outputs, currentDoc, loading, save]);

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
    const nextContent = existing ? existing.content : "";
    const nextOutputs = existing?.outputs ?? {};
    contentRef.current = nextContent;
    setContent(nextContent);
    outputsRef.current = nextOutputs;
    setOutputs(nextOutputs);
    currentDocRef.current = name;
    setCurrentDoc(name);
    setSelectedKey(null);
    setSaveState("dirty");
  }

  function setDocOutput(key: string, output: CellOutput | undefined) {
    setOutputs((prev) => {
      const next = { ...prev };
      if (output) next[key] = output;
      else delete next[key];
      return next;
    });
  }

  function editBlock(seg: RunSegment, code: string) {
    pushUndo();
    const serialized = serializeBlock(seg.kind, code);
    setContent((prev) =>
      prev.slice(0, seg.start) + serialized + prev.slice(seg.end)
    );
    setSaveState("dirty");
    setOutputs((prev) => {
      if (!(seg.key in prev)) return prev;
      const next = { ...prev };
      delete next[seg.key];
      return next;
    });
  }

  function deleteBlock(seg: RunSegment) {
    pushUndo();
    setContent((prev) => prev.slice(0, seg.start) + prev.slice(seg.end));
    setSaveState("dirty");
    setOutputs((prev) => {
      if (!(seg.key in prev)) return prev;
      const next = { ...prev };
      delete next[seg.key];
      return next;
    });
  }

  async function runBlock(seg: RunSegment) {
    if (runningKey != null) return;
    setRunningKey(seg.key);
    setDocOutput(seg.key, undefined);
    try {
      let res: Response;
      if (seg.kind === "shell") {
        res = await fetch(`/api/projects/${projectId}/execute-shell`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commands: seg.content }),
        });
      } else {
        const pythons = segments.filter(
          (s): s is RunSegment => s.kind === "python"
        );
        const idx = pythons.findIndex((s) => s.key === seg.key);
        const codeCells = pythons.slice(0, idx + 1).map((s) => s.content);
        res = await fetch(`/api/projects/${projectId}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codeCells }),
        });
      }
      const data: CellOutput & { error?: string } = await res.json();
      if (!res.ok) {
        setDocOutput(seg.key, {
          stdout: "",
          stderr: "",
          error: data.error || "执行失败",
        });
      } else {
        setDocOutput(seg.key, {
          stdout: data.stdout,
          stderr: data.stderr,
          error: data.error,
          timedOut: data.timedOut,
          ...(seg.kind === "python" ? { images: data.images } : {}),
        });
      }
    } catch {
      setDocOutput(seg.key, {
        stdout: "",
        stderr: "",
        error: "请求失败",
      });
    } finally {
      setRunningKey(null);
    }
  }

  function toggleOutput(seg: RunSegment, collapsed: boolean) {
    const output = outputs[seg.key];
    if (!output) return;
    setDocOutput(seg.key, { ...output, collapsed });
  }

  function handleSegmentChange(segIndex: number, newMarkdown: string) {
    const seg = segments[segIndex];
    if (!seg || seg.kind !== "markdown") return;
    
    pushUndo();
    setContent((prev) => {
      const head = prev.slice(0, seg.start);
      const tail = prev.slice(seg.end);
      const newContent = head + newMarkdown + tail;
      return newContent;
    });
    setSaveState("dirty");
  }

  function handleContextMenu(e: React.MouseEvent, key: string) {
    e.preventDefault();
    setSelectedKey(key);
  }

  function handleEmptyEdit(v: string) {
    setContent(v);
    setSaveState("dirty");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loadError ? (
          <p className="text-sm text-danger">{loadError}</p>
        ) : loading ? (
          <p className="text-sm text-muted">加载中...</p>
        ) : content.trim() === "" ? (
          <textarea
            autoFocus
            value={content}
            onChange={(e) => handleEmptyEdit(e.target.value)}
            rows={6}
            spellCheck={false}
            className="mx-auto block w-full max-w-3xl resize-y rounded-lg border border-dashed border-panel-border bg-transparent px-3 py-3 font-mono text-[13px] leading-relaxed text-muted outline-none focus:border-accent"
            placeholder="# 在这里编写 Markdown，用 ```python-run / ```shell-run 代码块插入可运行模块..."
          />
        ) : (
          <div className="relative mx-auto flex min-h-full max-w-3xl flex-col py-1">
            <div className="space-y-2">
              {segments.map((seg, segIndex) => {
                if (seg.kind === "markdown") {
                  const key = `md:${segIndex}:${seg.start}`;
                  return (
                    <div key={key} data-block-key={key}>
                      <BlockNoteEditor
                        markdown={seg.content}
                        onChange={(md) => handleSegmentChange(segIndex, md)}
                      />
                    </div>
                  );
                } else {
                  return (
                    <div
                      key={`${seg.kind}-${seg.start}`}
                      data-block-key={seg.key}
                      data-run-block
                      className={selectedKey === seg.key ? "selected" : ""}
                      onClick={() => setSelectedKey(seg.key)}
                      onContextMenu={(e) => handleContextMenu(e, seg.key)}
                    >
                      <RunBlock
                        kind={seg.kind}
                        code={seg.content}
                        output={outputs[seg.key]}
                        running={runningKey === seg.key}
                        selected={selectedKey === seg.key}
                        onEdit={(code) => editBlock(seg, code)}
                        onRun={() => void runBlock(seg)}
                        onDelete={() => deleteBlock(seg)}
                        onToggleOutput={(collapsed) =>
                          toggleOutput(seg, collapsed)
                        }
                        onSelect={() => setSelectedKey(seg.key)}
                        onContextMenu={(e) => handleContextMenu(e, seg.key)}
                      />
                    </div>
                  );
                }
              })}
            </div>
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
