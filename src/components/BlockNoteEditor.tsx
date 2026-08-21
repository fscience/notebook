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
import { parseContent, runBlockKey, type RunBlockKind } from "@/lib/runblock";
import type { CellOutput } from "@/lib/types";
import { Play, TerminalIcon } from "@/components/icons";

export interface BlockNoteEditorHandle {
  insertRunBlock: (kind: RunBlockKind) => void;
  getPythonBlocks: () => { id: string; code: string }[];
  getBlockCode: (key: string) => string;
}

interface Props {
  content: string;
  onChange: (content: string) => void;
  outputs: Record<string, CellOutput>;
  runningKey: string | null;
  onRunBlock: (blockId: string, kind: RunBlockKind) => void;
  onDeleteBlock: (blockId: string) => void;
  onToggleOutput: (blockId: string, collapsed: boolean) => void;
  ref?: Ref<BlockNoteEditorHandle>;
}

const RUN_BLOCK_TYPE: Record<RunBlockKind, "pythonRun" | "shellRun"> = {
  python: "pythonRun",
  shell: "shellRun",
};

function blockKind(type: string): RunBlockKind {
  return type === "pythonRun" ? "python" : "shell";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function blockCode(block: any): string {
  return (block.props as any).code ?? "";
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
    onRunBlockRef.current = onRunBlock;
    onDeleteBlockRef.current = onDeleteBlock;
    onToggleOutputRef.current = onToggleOutput;
  });

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
    runningKeyRef.current = runningKey;
  }, [outputs, runningKey]);

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
      const kind = blockKind(block.type);
      onRunBlockRef.current(runBlockKey(kind, blockCode(block)), kind);
    },
    onDelete: (blockId) => {
      const block = editor.document.find((b) => b.id === blockId);
      if (!block) return;
      const key = runBlockKey(blockKind(block.type), blockCode(block));
      editor.removeBlocks([block]);
      onDeleteBlockRef.current(key);
    },
    onToggleOutput: (blockId, collapsed) => {
      onToggleOutputRef.current(blockId, collapsed);
    },
  });

  useEffect(() => {
    setRunBlockContext(ctxRef.current);
    return () => setRunBlockContext(null);
    // ctxRef.current is a stable object reading fresh values through refs.
  }, []);

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
          allBlocks.push({
            type: RUN_BLOCK_TYPE[seg.kind],
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

  const slashMenuItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const defs = [
        {
          kind: "python",
          title: "Python 代码块",
          subtext: "插入可运行的 Python 代码块",
          icon: <Play className="h-4 w-4" />,
          aliases: ["python", "py", "python-run"],
        },
        {
          kind: "shell",
          title: "Shell 命令块",
          subtext: "插入可运行的 Shell 命令块",
          icon: <TerminalIcon className="h-4 w-4" />,
          aliases: ["shell", "bash", "sh", "shell-run"],
        },
      ] as const;
      const custom: DefaultReactSuggestionItem[] = defs.map((item) => ({
        title: item.title,
        subtext: item.subtext,
        icon: item.icon,
        group: "运行块",
        aliases: [...item.aliases],
        onItemClick: () => {
          insertOrUpdateBlockForSlashMenu(editor, {
            type: RUN_BLOCK_TYPE[item.kind],
            props: { code: "" },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        },
      }));
      return filterSuggestionItems(
        [...getDefaultReactSlashMenuItems(editor), ...custom],
        query
      );
    },
    [editor]
  );

  useImperativeHandle(
    ref,
    () => ({
      insertRunBlock: (kind) => {
        const blocks = editor.document;
        const lastBlock = blocks[blocks.length - 1];
        const spec = { type: RUN_BLOCK_TYPE[kind], props: { code: "" } };
        if (lastBlock) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor.insertBlocks([spec as any], lastBlock, "after");
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor.insertBlocks([spec as any], undefined as any);
        }
      },
      getPythonBlocks: () => {
        flushPendingCode(editor);
        return editor.document
          .filter((b) => b.type === "pythonRun")
          .map((b) => ({ id: b.id, code: blockCode(b) }));
      },
      getBlockCode: (key) => {
        flushPendingCode(editor);
        for (const b of editor.document) {
          if (b.type !== "pythonRun" && b.type !== "shellRun") continue;
          const code = blockCode(b);
          if (runBlockKey(blockKind(b.type), code) === key) return code;
        }
        return "";
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
      formattingToolbar={true}
      slashMenu={false}
      sideMenu={true}
      linkToolbar={true}
      emojiPicker={false}
      onChange={handleChange}
    >
      <SuggestionMenuController
        triggerCharacter={"/"}
        getItems={slashMenuItems}
      />
    </BlockNoteView>
  );
}
