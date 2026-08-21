"use client";

import { useEffect, useRef, useState, useCallback, useImperativeHandle } from "react";
import type { Ref } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  flushPendingCode,
  notebookSchema,
  refreshRunBlockDOM,
  setRunBlockContext,
  type RunBlockContextValue,
} from "@/lib/runBlockSchema";
import { parseContent } from "@/lib/runblock";
import type { CellOutput } from "@/lib/types";
import { Play, TerminalIcon } from "@/components/icons";

export interface BlockNoteEditorHandle {
  insertRunBlock: (kind: "python" | "shell") => void;
  getPythonBlocks: () => { id: string; code: string }[];
  getBlockCode: (blockId: string) => string;
}

interface Props {
  content: string;
  onChange: (content: string) => void;
  outputs: Record<string, CellOutput>;
  runningKey: string | null;
  onRunBlock: (blockId: string, kind: "python" | "shell") => void;
  onDeleteBlock: (blockId: string) => void;
  onToggleOutput: (blockId: string, collapsed: boolean) => void;
  ref?: Ref<BlockNoteEditorHandle>;
}

export default function BlockNoteEditor({
  content,
  onChange,
  outputs,
  runningKey,
  onRunBlock,
  onDeleteBlock,
  onToggleOutput,
  ref,
}: Props) {
  const [parsed, setParsed] = useState(false);
  const onChangeRef = useRef(onChange);
  const onRunBlockRef = useRef(onRunBlock);
  const onDeleteBlockRef = useRef(onDeleteBlock);
  const onToggleOutputRef = useRef(onToggleOutput);
  const pendingContentRef = useRef<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onRunBlockRef.current = onRunBlock;
  }, [onRunBlock]);

  useEffect(() => {
    onDeleteBlockRef.current = onDeleteBlock;
  }, [onDeleteBlock]);

  useEffect(() => {
    onToggleOutputRef.current = onToggleOutput;
  }, [onToggleOutput]);

  const editor = useCreateBlockNote(
    {
      schema: notebookSchema,
      initialContent: [{ type: "paragraph" as const }],
    },
    []
  );

  const isInitializingRef = useRef(true);

  const outputsRef = useRef(outputs);
  const runningKeyRef = useRef(runningKey);

  useEffect(() => {
    outputsRef.current = outputs;
  }, [outputs]);

  useEffect(() => {
    runningKeyRef.current = runningKey;
  }, [runningKey]);

  useEffect(() => {
    refreshRunBlockDOM(ctxRef.current);
  }, [outputs, runningKey]);

  const ctxRef = useRef<RunBlockContextValue>({
    getOutput: (blockId) => outputsRef.current[blockId],
    isRunning: (blockId) => runningKeyRef.current === blockId,
    onRun: (blockId) => {
      flushPendingCode(editor);
      const block = editor.document.find((b) => b.id === blockId);
      if (!block) return;
      const kind = block.type === "pythonRun" ? "python" : "shell";
      onRunBlockRef.current(blockId, kind as "python" | "shell");
    },
    onEdit: (blockId, code) => {
      const block = editor.document.find((b) => b.id === blockId);
      if (!block) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor.updateBlock(block, { props: { code } as any });
    },
    onDelete: (blockId) => {
      const block = editor.document.find((b) => b.id === blockId);
      if (!block) return;
      editor.removeBlocks([block]);
      onDeleteBlockRef.current(blockId);
    },
    onToggleOutput: (blockId, collapsed) => {
      onToggleOutputRef.current(blockId, collapsed);
    },
  });

  useEffect(() => {
    setRunBlockContext(ctxRef.current);
    return () => setRunBlockContext(null);
  });

  const lastContentRef = useRef<string | null>(null);

  useEffect(() => {
    if (content === lastContentRef.current) return;
    if (pendingContentRef.current !== null && pendingContentRef.current === content) {
      lastContentRef.current = content;
      pendingContentRef.current = null;
      return;
    }
    lastContentRef.current = content;

    (async () => {
      isInitializingRef.current = true;
      flushPendingCode(editor);
      const segments = parseContent(content);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allBlocks: any[] = [];

      for (const seg of segments) {
        if (seg.kind === "markdown") {
          if (seg.content.trim()) {
            const blocks = await editor.tryParseMarkdownToBlocks(seg.content);
            allBlocks.push(...blocks);
          }
        } else {
          const type = seg.kind === "python" ? "pythonRun" : "shellRun";
          allBlocks.push({
            type,
            props: { code: seg.content },
          });
        }
      }

      if (allBlocks.length === 0) {
        allBlocks.push({ type: "paragraph" });
      }

      editor.replaceBlocks(editor.document, allBlocks);
      isInitializingRef.current = false;
      setParsed(true);
    })();
  }, [editor, content]);

  const handleChange = useCallback(async () => {
    if (isInitializingRef.current) return;
    flushPendingCode(editor);
    const md = await editor.blocksToMarkdownLossy(editor.document);
    pendingContentRef.current = md;
    onChangeRef.current(md);
  }, [editor]);

  const getSlashMenuItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const defaults = getDefaultReactSlashMenuItems(editor);
      const custom: DefaultReactSuggestionItem[] = [
        {
          title: "Python 代码块",
          subtext: "插入可运行的 Python 代码块",
          icon: <Play className="h-4 w-4" />,
          group: "运行块",
          aliases: ["python", "py", "python-run"],
          onItemClick: () => {
            insertOrUpdateBlockForSlashMenu(editor, {
              type: "pythonRun",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              props: { code: "" } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
          },
        },
        {
          title: "Shell 命令块",
          subtext: "插入可运行的 Shell 命令块",
          icon: <TerminalIcon className="h-4 w-4" />,
          group: "运行块",
          aliases: ["shell", "bash", "sh", "shell-run"],
          onItemClick: () => {
            insertOrUpdateBlockForSlashMenu(editor, {
              type: "shellRun",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              props: { code: "" } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
          },
        },
      ];
      return filterSuggestionItems(
        [...defaults, ...custom],
        query
      );
    },
    [editor]
  );

  useImperativeHandle(
    ref,
    () => ({
      insertRunBlock: (kind) => {
        const type = kind === "python" ? "pythonRun" : "shellRun";
        const blocks = editor.document;
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock) {
          editor.insertBlocks(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [{ type: type as any, props: { code: "" } as any }],
            lastBlock,
            "after"
          );
        } else {
          editor.insertBlocks([
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { type: type as any, props: { code: "" } as any },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ] as any, undefined as any);
        }
      },
      getPythonBlocks: () => {
        flushPendingCode(editor);
        return editor.document
          .filter((b) => b.type === "pythonRun")
          .map((b) => ({
            id: b.id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            code: (b.props as any).code ?? "",
          }));
      },
      getBlockCode: (blockId) => {
        flushPendingCode(editor);
        const block = editor.document.find((b) => b.id === blockId);
        if (!block) return "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (block.props as any).code ?? "";
      },
    }),
    [editor]
  );

  if (!parsed) {
    return <div className="min-h-[2em]" />;
  }

  return (
    <BlockNoteView
      editor={editor}
      theme={undefined}
      formattingToolbar={true}
      slashMenu={false}
      sideMenu={true}
      linkToolbar={true}
      emojiPicker={false}
      onChange={handleChange}
    >
      <SuggestionMenuController
        triggerCharacter={"/"}
        getItems={getSlashMenuItems as (query: string) => Promise<DefaultReactSuggestionItem[]>}
      />
    </BlockNoteView>
  );
}