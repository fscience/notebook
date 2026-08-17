"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import type { CellOutput, Document } from "@/lib/types";
import MarkdownBlock from "@/components/MarkdownBlock";
import type { CaretRequest } from "@/components/MarkdownBlock";
import RunBlock from "@/components/RunBlock";
import BlockToolbar from "@/components/BlockToolbar";
import SlashMenu, { type SlashCommandKind } from "@/components/SlashMenu";
import BlockContextMenu, { type ContextMenuAction } from "@/components/BlockContextMenu";
import { ChevronLeft } from "@/components/icons";
import { ROOT_DOC_NAME } from "@/lib/wiki";
import { splitMarkdownBlocks, type MarkdownBlock as MdBlock } from "@/lib/mdblocks";
import { splitBlockEnter } from "@/lib/mdblocks";
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

interface FlatMdBlock extends MdBlock {
  key: string;
  segIndex: number;
}

type RenderItem = { t: "md"; block: FlatMdBlock } | { t: "run"; seg: RunSegment };

interface ToolbarState {
  visible: boolean;
  position: { top: number; left: number } | null;
  blockKey: string;
}

interface SlashState {
  open: boolean;
  query: string;
  position: { top: number; left: number };
}

interface ContextMenuState {
  open: boolean;
  position: { x: number; y: number };
  blockKey: string;
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
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [caretReq, setCaretReq] = useState<CaretRequest | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toolbar, setToolbar] = useState<ToolbarState>({ visible: false, position: null, blockKey: "" });
  const [slash, setSlash] = useState<SlashState>({ open: false, query: "", position: { top: 0, left: 0 } });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ open: false, position: { x: 0, y: 0 }, blockKey: "" });
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<string>("");
  const outputsRef = useRef<Record<string, CellOutput>>({});
  const docsRef = useRef<Document[]>([]);
  const currentDocRef = useRef<string>(ROOT_DOC_NAME);
  const focusedKeyRef = useRef<string | null>(null);
  const selectedKeyRef = useRef<string | null>(null);
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const pendingRangeRef = useRef<{
    start: number;
    textLen: number;
    caret: number | null;
    trailing?: boolean;
  } | null>(null);
  const caretReqRef = useRef<CaretRequest | null>(null);
  const dragSourceKeyRef = useRef<string | null>(null);

  useEffect(() => {
    caretReqRef.current = caretReq;
  }, [caretReq]);

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

  useEffect(() => {
    focusedKeyRef.current = focusedKey;
  }, [focusedKey]);

  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);

  const segments = useMemo(() => parseContent(content), [content]);

  const mdBlocks = useMemo<FlatMdBlock[]>(() => {
    const out: FlatMdBlock[] = [];
    segments.forEach((seg, segIndex) => {
      if (seg.kind !== "markdown") return;
      for (const b of splitMarkdownBlocks(seg.content)) {
        out.push({
          ...b,
          key: `md:${seg.start + b.start}`,
          start: seg.start + b.start,
          end: seg.start + b.end,
          segIndex,
        });
      }
    });
    return out;
  }, [segments]);

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    let mdIdx = 0;
    segments.forEach((seg, i) => {
      if (seg.kind === "markdown") {
        while (mdIdx < mdBlocks.length && mdBlocks[mdIdx].segIndex === i) {
          items.push({ t: "md", block: mdBlocks[mdIdx] });
          mdIdx++;
        }
      } else {
        items.push({ t: "run", seg });
      }
    });
    return items;
  }, [segments, mdBlocks]);

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
        setToolbar({ visible: false, position: null, blockKey: "" });
        setSlash({ open: false, query: "", position: { top: 0, left: 0 } });
        setContextMenu({ open: false, position: { x: 0, y: 0 }, blockKey: "" });
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  function appendBlock(kind: RunBlockKind) {
    pushUndo();
    const block = serializeBlock(kind, "");
    const anchor = mdBlocks.find((b) => b.key === focusedKey);
    if (anchor) {
      const at = anchor.end;
      setContent((prev) => {
        const head = prev.slice(0, at);
        const tail = prev.slice(at);
        const headSep =
          head === "" || head.endsWith("\n\n")
            ? ""
            : head.endsWith("\n")
              ? "\n"
              : "\n\n";
        const tailSep =
          tail === "" || tail.startsWith("\n\n")
            ? ""
            : tail.startsWith("\n")
              ? "\n"
              : "\n\n";
        return head + headSep + block + tailSep + tail;
      });
    } else {
      setContent((prev) => {
        if (!prev.trim()) return block;
        return prev.replace(/\n+$/, "") + "\n\n" + block;
      });
    }
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

  useEffect(() => {
    const r = pendingRangeRef.current;
    if (!r) return;
    pendingRangeRef.current = null;
    const inRange = mdBlocks.filter(
      (b) => b.start >= r.start && b.start < r.start + r.textLen
    );
    const target = inRange.length > 0 ? inRange[inRange.length - 1] : null;
    if (!target) return;
    const caret = Math.max(
      0,
      Math.min(
        r.caret != null
          ? r.caret - (target.start - r.start)
          : r.textLen - (target.start - r.start),
        r.trailing
          ? target.source.length
          : target.source.replace(/\n+$/, "").length
      )
    );
    if (target.key !== focusedKeyRef.current || r.caret != null) {
      setFocusedKey(target.key);
      setCaretReq({ at: caret, n: (caretReqRef.current?.n ?? 0) + 1 });
    }
  }, [mdBlocks]);

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
    focusedKeyRef.current = null;
    setFocusedKey(null);
    selectedKeyRef.current = null;
    setSelectedKey(null);
    setCaretReq(null);
    pendingRangeRef.current = null;
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

  function editMdBlock(block: FlatMdBlock, newSource: string, caret?: number, opts?: { skipPendingRange?: boolean }) {
    const textPart = newSource.replace(/\n+$/, "").replace(/\u200B/g, "");
    const replaced = textPart !== "" ? textPart + "\n\n" : "";
    pushUndo();
    setContent((prev) =>
      prev.slice(0, block.start) + replaced + prev.slice(block.end)
    );
    setSaveState("dirty");
    if (opts?.skipPendingRange) {
      if (caret != null) {
        setFocusedKey(block.key);
        setCaretReq({ at: caret, n: (caretReqRef.current?.n ?? 0) + 1 });
      }
    } else {
      pendingRangeRef.current = {
        start: block.start,
        textLen: textPart.length,
        caret: caret ?? null,
      };
    }
  }

  function handleMdEnter(block: FlatMdBlock, caret: number, source: string) {
    const { newSource, newCaret } = splitBlockEnter(source, caret);
    const clean = newSource.replace(/\n+$/, "");
    const trailing = newCaret > clean.length;
    const normalized = trailing ? clean + "\n\n\u200B\n\n" : clean + "\n\n";
    const newContent =
      content.slice(0, block.start) + normalized + content.slice(block.end);
    setSaveState("dirty");
    if (newContent === content) {
      setFocusedKey(block.key);
      setCaretReq({ at: newCaret, n: (caretReqRef.current?.n ?? 0) + 1 });
      return;
    }
    pushUndo();
    setContent(newContent);
    if (trailing) {
      const newBlockStart = block.start + clean.length + 2;
      pendingRangeRef.current = {
        start: newBlockStart,
        textLen: 1,
        caret: 0,
        trailing: false,
      };
    } else {
      pendingRangeRef.current = {
        start: block.start,
        textLen: normalized.length,
        caret: newCaret,
        trailing: false,
      };
    }
  }

  function focusBlock(block: FlatMdBlock, caret: number) {
    pendingRangeRef.current = null;
    setFocusedKey(block.key);
    setCaretReq({ at: caret, n: (caretReqRef.current?.n ?? 0) + 1 });
  }

  function blurBlock() {
    setFocusedKey(null);
    setCaretReq(null);
  }

  function selectBlock(key: string) {
    setSelectedKey(key);
    const rect = document.querySelector(`[data-block-key="${key}"]`)?.getBoundingClientRect();
    if (rect) {
      setToolbar({
        visible: true,
        position: { top: rect.top - 44, left: rect.left + rect.width / 2 },
        blockKey: key,
      });
    }
  }

  function appendParagraph() {
    if (!content.trim()) return;
    const newContent = content.replace(/\n+$/, "") + "\n\n";
    const last = mdBlocks.length > 0 ? mdBlocks[mdBlocks.length - 1] : null;
    setContent(newContent);
    setSaveState("dirty");
    if (!last) return;
    const lastSource = newContent.slice(last.start);
    if (newContent === content) {
      setFocusedKey(last.key);
      setCaretReq({ at: lastSource.length, n: (caretReqRef.current?.n ?? 0) + 1 });
    } else {
      pendingRangeRef.current = {
        start: last.start,
        textLen: lastSource.replace(/\n+$/, "").length,
        caret: lastSource.length,
        trailing: true,
      };
    }
  }

  function handleEmptyEdit(v: string) {
    setContent(v);
    setSaveState("dirty");
    if (v.trim() !== "") {
      pendingRangeRef.current = {
        start: 0,
        textLen: v.replace(/\n+$/, "").length,
        caret: null,
      };
    }
  }

  function handleSlashTrigger(position: { top: number; left: number }) {
    setSlash({ open: true, query: "", position });
  }

  function handleSlashSelect(kind: SlashCommandKind) {
    setSlash({ open: false, query: "", position: { top: 0, left: 0 } });
    if (kind === "python-run" || kind === "shell-run") {
      appendBlockRef.current(kind === "python-run" ? "python" : "shell");
      return;
    }
    const prefixMap: Record<string, string> = {
      paragraph: "",
      h1: "# ",
      h2: "## ",
      h3: "### ",
      quote: "> ",
      "bullet-list": "- ",
      "ordered-list": "1. ",
      "fenced-code": "```\n",
      "thematic-break": "---",
    };
    const prefix = prefixMap[kind] ?? "";
    const selected = selectedKeyRef.current;
    if (selected) {
      const mdBlock = mdBlocks.find((b) => b.key === selected);
      if (mdBlock) {
        editMdBlock(mdBlock, prefix, prefix.length);
        return;
      }
    }
    if (content.trim() === "") {
      setContent(prefix + "\n\n");
      pendingRangeRef.current = { start: 0, textLen: prefix.length, caret: prefix.length };
    }
  }

  function handleContextMenu(e: React.MouseEvent, key: string) {
    e.preventDefault();
    setSelectedKey(key);
    setContextMenu({ open: true, position: { x: e.clientX, y: e.clientY }, blockKey: key });
  }

  function handleContextAction(action: ContextMenuAction) {
    const key = contextMenu.blockKey;
    if (!key) return;

    const mdBlock = mdBlocks.find((b) => b.key === key);
    const runItem = renderItems.find((i): i is { t: "run"; seg: RunSegment } => i.t === "run" && i.seg.key === key);
    const itemIdx = renderItems.findIndex(
      (i) => (i.t === "md" && i.block.key === key) || (i.t === "run" && i.seg.key === key)
    );

    switch (action) {
      case "move-up": {
        if (itemIdx <= 0) return;
        pushUndo();
        const above = renderItems[itemIdx - 1];
        const current = renderItems[itemIdx];
        if (above.t === "md" && current.t === "md") {
          const aboveBlock = above.block;
          const curBlock = current.block;
          const aboveText = content.slice(aboveBlock.start, aboveBlock.end);
          const curText = content.slice(curBlock.start, curBlock.end);
          const newContent =
            content.slice(0, aboveBlock.start) +
            curText +
            aboveText +
            content.slice(curBlock.end);
          setContent(newContent);
          setSaveState("dirty");
        }
        break;
      }
      case "move-down": {
        if (itemIdx < 0 || itemIdx >= renderItems.length - 1) return;
        pushUndo();
        const below = renderItems[itemIdx + 1];
        const current = renderItems[itemIdx];
        if (below.t === "md" && current.t === "md") {
          const belowBlock = below.block;
          const curBlock = current.block;
          const curText = content.slice(curBlock.start, curBlock.end);
          const belowText = content.slice(belowBlock.start, belowBlock.end);
          const newContent =
            content.slice(0, curBlock.start) +
            belowText +
            curText +
            content.slice(belowBlock.end);
          setContent(newContent);
          setSaveState("dirty");
        }
        break;
      }
      case "duplicate": {
        if (mdBlock) {
          pushUndo();
          const text = content.slice(mdBlock.start, mdBlock.end);
          setContent((prev) => {
            const head = prev.slice(0, mdBlock.end);
            const tail = prev.slice(mdBlock.end);
            return head + text + tail;
          });
          setSaveState("dirty");
        } else if (runItem) {
          pushUndo();
          const serialized = serializeBlock(runItem.seg.kind, runItem.seg.content);
          setContent((prev) => {
            const head = prev.slice(0, runItem.seg.end);
            const tail = prev.slice(runItem.seg.end);
            return head + serialized + tail;
          });
          setSaveState("dirty");
        }
        break;
      }
      case "delete": {
        if (mdBlock) {
          pushUndo();
          setContent((prev) => prev.slice(0, mdBlock.start) + prev.slice(mdBlock.end));
          setSaveState("dirty");
        } else if (runItem) {
          deleteBlock(runItem.seg);
        }
        break;
      }
      case "insert-python": {
        if (mdBlock) {
          pushUndo();
          const block = serializeBlock("python", "");
          const at = mdBlock.end;
          setContent((prev) => {
            const head = prev.slice(0, at);
            const tail = prev.slice(at);
            const sep = head.endsWith("\n\n") ? "" : head.endsWith("\n") ? "\n" : "\n\n";
            return head + sep + block + tail;
          });
          setSaveState("dirty");
        }
        break;
      }
      case "insert-shell": {
        if (mdBlock) {
          pushUndo();
          const block = serializeBlock("shell", "");
          const at = mdBlock.end;
          setContent((prev) => {
            const head = prev.slice(0, at);
            const tail = prev.slice(at);
            const sep = head.endsWith("\n\n") ? "" : head.endsWith("\n") ? "\n" : "\n\n";
            return head + sep + block + tail;
          });
          setSaveState("dirty");
        }
        break;
      }
      case "copy-markdown": {
        const text = mdBlock
          ? content.slice(mdBlock.start, mdBlock.end)
          : runItem
            ? serializeBlock(runItem.seg.kind, runItem.seg.content)
            : "";
        navigator.clipboard.writeText(text).catch(() => {});
        break;
      }
      case "convert-paragraph":
      case "convert-h1":
      case "convert-h2":
      case "convert-h3":
      case "convert-quote":
      case "convert-bullet-list":
      case "convert-ordered-list":
      case "convert-code": {
        if (!mdBlock) return;
        pushUndo();
        const text = mdBlock.source.replace(/\n+$/, "");
        const prefixMap: Record<string, string> = {
          "convert-paragraph": "",
          "convert-h1": "# ",
          "convert-h2": "## ",
          "convert-h3": "### ",
          "convert-quote": "> ",
          "convert-bullet-list": "- ",
          "convert-ordered-list": "1. ",
          "convert-code": "```\n",
        };
        const prefix = prefixMap[action] ?? "";
        const newSource = prefix + text;
        setContent((prev) =>
          prev.slice(0, mdBlock.start) + newSource + "\n\n" + prev.slice(mdBlock.end)
        );
        setSaveState("dirty");
        break;
      }
      case "format-bold":
      case "format-italic":
      case "format-code": {
        if (!mdBlock) return;
        pushUndo();
        const markers: Record<string, string> = {
          "format-bold": "**",
          "format-italic": "*",
          "format-code": "`",
        };
        const marker = markers[action];
        const src = mdBlock.source.replace(/\n+$/, "");
        const wrapped = marker + src + marker;
        setContent((prev) =>
          prev.slice(0, mdBlock.start) + wrapped + "\n\n" + prev.slice(mdBlock.end)
        );
        setSaveState("dirty");
        break;
      }
    }
  }

  function handleToolbarFormat(action: string) {
    const key = toolbar.blockKey;
    if (!key) return;
    const mdBlock = mdBlocks.find((b) => b.key === key);
    if (!mdBlock) return;

    pushUndo();
    const text = mdBlock.source.replace(/\n+$/, "");
    let newSource = text;

    switch (action) {
      case "bold": newSource = "**" + text + "**"; break;
      case "italic": newSource = "*" + text + "*"; break;
      case "strikethrough": newSource = "~~" + text + "~~"; break;
      case "code": newSource = "`" + text + "`"; break;
      case "heading-1": newSource = "# " + text.replace(/^#{1,6}\s*/, ""); break;
      case "heading-2": newSource = "## " + text.replace(/^#{1,6}\s*/, ""); break;
      case "heading-3": newSource = "### " + text.replace(/^#{1,6}\s*/, ""); break;
      case "paragraph": newSource = text.replace(/^#{1,6}\s*/, ""); break;
      case "bullet-list": newSource = "- " + text.replace(/^[-+*]\s*/, ""); break;
      case "ordered-list": newSource = "1. " + text.replace(/^\d+[.)]\s*/, ""); break;
      case "blockquote": newSource = "> " + text.replace(/^>\s*/, ""); break;
      default: return;
    }

    setContent((prev) =>
      prev.slice(0, mdBlock.start) + newSource + "\n\n" + prev.slice(mdBlock.end)
    );
    setSaveState("dirty");
  }

  function handleToolbarBlockAction(action: string) {
    if (action === "__close__") {
      setToolbar({ visible: false, position: null, blockKey: "" });
      return;
    }
    const key = toolbar.blockKey;
    if (!key) return;

    switch (action) {
      case "move-up":
      case "move-down":
      case "duplicate":
      case "delete":
      case "insert-python":
      case "insert-shell":
      case "copy-markdown":
      case "format-bold":
      case "format-italic":
      case "format-code": {
        handleContextAction(action as ContextMenuAction);
        break;
      }
    }
  }

  function handleDragStart(e: React.DragEvent, key: string) {
    dragSourceKeyRef.current = key;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", key);
  }

  function handleDragEnd() {
    dragSourceKeyRef.current = null;
    setDragOverKey(null);
  }

  function handleDragOver(e: React.DragEvent, key: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverKey(key);
  }

  function handleDrop(e: React.DragEvent, targetKey: string) {
    e.preventDefault();
    const sourceKey = dragSourceKeyRef.current;
    if (!sourceKey || sourceKey === targetKey) return;

    const sourceIdx = renderItems.findIndex(
      (i) => (i.t === "md" && i.block.key === sourceKey) || (i.t === "run" && i.seg.key === sourceKey)
    );
    const targetIdx = renderItems.findIndex(
      (i) => (i.t === "md" && i.block.key === targetKey) || (i.t === "run" && i.seg.key === targetKey)
    );
    if (sourceIdx < 0 || targetIdx < 0) return;

    pushUndo();
    const sourceItem = renderItems[sourceIdx];
    const sourceText = sourceItem.t === "md"
      ? content.slice(sourceItem.block.start, sourceItem.block.end)
      : content.slice(sourceItem.seg.start, sourceItem.seg.end);
    const sourceStart = sourceItem.t === "md" ? sourceItem.block.start : sourceItem.seg.start;

    let newContent = content.slice(0, sourceStart) + content.slice(sourceStart + sourceText.length);
    const targetItem = renderItems[targetIdx];
    const targetStart = targetItem.t === "md" ? targetItem.block.start : targetItem.seg.start;
    const adjustedStart = targetStart > sourceStart ? targetStart - sourceText.length : targetStart;

    newContent = newContent.slice(0, adjustedStart) + sourceText + newContent.slice(adjustedStart);
    setContent(newContent);
    setSaveState("dirty");
    setDragOverKey(null);
    dragSourceKeyRef.current = null;
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
            <div className="space-y-1">
              {renderItems.map((item) =>
                item.t === "md" ? (
                  <div
                    key={item.block.key}
                    data-block-key={item.block.key}
                    className={`block-container ${dragOverKey === item.block.key ? "drag-over" : ""}`}
                    onDragOver={(e) => handleDragOver(e, item.block.key)}
                    onDrop={(e) => handleDrop(e, item.block.key)}
                  >
                    <MarkdownBlock
                      source={item.block.source}
                      focused={focusedKey === item.block.key}
                      selected={selectedKey === item.block.key}
                      caretReq={
                        focusedKey === item.block.key ? caretReq : null
                      }
                      onFocus={(caret) => focusBlock(item.block, caret)}
                      onEdit={(src, caret) => editMdBlock(item.block, src, caret, { skipPendingRange: true })}
                      onEnter={(caret, source) => handleMdEnter(item.block, caret, source)}
                      onBlur={blurBlock}
                      onSelect={() => selectBlock(item.block.key)}
                      onNavigate={(name) => void navigate(name)}
                      onContextMenu={(e) => handleContextMenu(e, item.block.key)}
                      onDragStart={(e) => handleDragStart(e, item.block.key)}
                      onDragEnd={handleDragEnd}
                      onSlashTrigger={handleSlashTrigger}
                    />
                  </div>
                ) : (
                  <div
                    key={`${item.seg.kind}-${item.seg.start}`}
                    data-block-key={item.seg.key}
                    data-run-block
                    className={`block-container ${dragOverKey === item.seg.key ? "drag-over" : ""}`}
                    onDragOver={(e) => handleDragOver(e, item.seg.key)}
                    onDrop={(e) => handleDrop(e, item.seg.key)}
                  >
                    <RunBlock
                      kind={item.seg.kind}
                      code={item.seg.content}
                      output={outputs[item.seg.key]}
                      running={runningKey === item.seg.key}
                      selected={selectedKey === item.seg.key}
                      onEdit={(code) => editBlock(item.seg, code)}
                      onRun={() => void runBlock(item.seg)}
                      onDelete={() => deleteBlock(item.seg)}
                      onToggleOutput={(collapsed) =>
                        toggleOutput(item.seg, collapsed)
                      }
                      onSelect={() => selectBlock(item.seg.key)}
                      onContextMenu={(e) => handleContextMenu(e, item.seg.key)}
                      onDragStart={(e) => handleDragStart(e, item.seg.key)}
                      onDragEnd={handleDragEnd}
                    />
                  </div>
                )
              )}
            </div>
            <div
              className="flex-1 cursor-text"
              onClick={(e) => {
                e.stopPropagation();
                appendParagraph();
              }}
            />
          </div>
        )}
      </div>

      {toolbar.visible && (
        <BlockToolbar
          blockType={
            (() => {
              const mdBlock = mdBlocks.find((b) => b.key === toolbar.blockKey);
              if (mdBlock) return mdBlock.blockType;
              const runItem = renderItems.find((i): i is { t: "run"; seg: RunSegment } => i.t === "run" && i.seg.key === toolbar.blockKey);
              if (runItem) return runItem.seg.kind;
              return "paragraph";
            })()
          }
          headingLevel={mdBlocks.find((b) => b.key === toolbar.blockKey)?.headingLevel}
          onFormat={handleToolbarFormat}
          onBlockAction={handleToolbarBlockAction}
          position={toolbar.position}
        />
      )}

      <SlashMenu
        open={slash.open}
        query={slash.query}
        position={slash.position}
        onSelect={handleSlashSelect}
        onClose={() => setSlash({ open: false, query: "", position: { top: 0, left: 0 } })}
      />

      <BlockContextMenu
        open={contextMenu.open}
        position={contextMenu.position}
        isMarkdown={!!mdBlocks.find((b) => b.key === contextMenu.blockKey)}
        onAction={handleContextAction}
        onClose={() => setContextMenu({ open: false, position: { x: 0, y: 0 }, blockKey: "" })}
      />

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
