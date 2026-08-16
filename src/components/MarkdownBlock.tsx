"use client";

import { useEffect, useRef } from "react";
import MarkdownView from "@/components/MarkdownView";

interface Props {
  source: string;
  focused: boolean;
  pendingCaret?: number | null;
  onFocus: (caret: number) => void;
  onEdit: (newSource: string) => void;
  onBlur: () => void;
  onNavigate: (docName: string) => void;
  placeholder?: string;
}

export default function MarkdownBlock({
  source,
  focused,
  pendingCaret,
  onFocus,
  onEdit,
  onBlur,
  onNavigate,
  placeholder,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const wasFocused = useRef(false);

  useEffect(() => {
    if (focused && !wasFocused.current && taRef.current) {
      const ta = taRef.current;
      ta.focus();
      const caret =
        pendingCaret != null
          ? Math.min(Math.max(0, pendingCaret), source.length)
          : source.length;
      ta.setSelectionRange(caret, caret);
    }
    wasFocused.current = focused;
  }, [focused, source.length, pendingCaret]);

  if (focused) {
    return (
      <textarea
        ref={taRef}
        value={source}
        onChange={(e) => onEdit(e.target.value)}
        onBlur={onBlur}
        rows={Math.max(1, source.split("\n").length)}
        spellCheck={false}
        className="w-full resize-y rounded-md border border-accent bg-cell-bg px-2 py-1.5 font-mono text-[13px] leading-relaxed text-foreground outline-none"
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      data-md-block
      className="-mx-1 cursor-text rounded px-1 transition-colors hover:bg-hover/40"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        const ratio = Math.min(
          Math.max((e.clientX - rect.left) / Math.max(rect.width, 1), 0),
          1
        );
        onFocus(Math.round(ratio * source.length));
      }}
    >
      <MarkdownView content={source} onNavigate={onNavigate} />
    </div>
  );
}
