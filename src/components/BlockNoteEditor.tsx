"use client";

import { useEffect, useRef, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";

interface Props {
  markdown: string;
  onChange: (markdown: string) => void;
}

export default function BlockNoteEditor({ markdown, onChange }: Props) {
  const [parsed, setParsed] = useState(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useCreateBlockNote({
    initialContent: [],
  });

  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    editor.tryParseMarkdownToBlocks(markdown || " ").then((blocks) => {
      if (blocks.length > 0) {
        editor.replaceBlocks(editor.document, blocks);
      } else {
        editor.insertBlocks([
          { type: "paragraph", content: "" },
        ], editor.document[0]?.id, "before");
      }
      setParsed(true);
    });
  }, [editor, markdown]);

  useEffect(() => {
    if (!parsed) return;
    const handler = async () => {
      const md = await editor.blocksToMarkdownLossy(editor.document);
      onChangeRef.current(md);
    };
    const unsub = editor.onChange(handler);
    return () => {
      unsub?.();
    };
  }, [editor, parsed]);

  if (!parsed) {
    return <div className="min-h-[2em]" />;
  }

  return (
    <BlockNoteView
      editor={editor}
      theme={undefined}
      formattingToolbar={true}
      slashMenu={true}
      sideMenu={true}
      linkToolbar={true}
      tableHandles={false}
      emojiPicker={false}
    />
  );
}
