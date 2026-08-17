"use client";

import { useEffect, useRef } from "react";
import MarkdownView from "@/components/MarkdownView";

export interface CaretRequest {
  at: number;
  n: number;
}

interface Props {
  source: string;
  focused: boolean;
  caretReq?: CaretRequest | null;
  onFocus: (caret: number) => void;
  onEdit: (newSource: string, caret?: number) => void;
  onEnter: (caret: number, source: string) => void;
  onBlur: () => void;
  onNavigate: (docName: string) => void;
  placeholder?: string;
}

export default function MarkdownBlock({
  source,
  focused,
  caretReq,
  onFocus,
  onEdit,
  onEnter,
  onBlur,
  onNavigate,
  placeholder,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const applied = useRef(-1);
  const enterHandledRef = useRef(false);
  const composingRef = useRef(false);

  const contentPart = source.replace(/\n+$/, "");

  useEffect(() => {
    if (!focused || !taRef.current || !caretReq) return;
    if (caretReq.n === applied.current) return;
    if (composingRef.current) return;
    const ta = taRef.current;
    if (document.activeElement !== ta) ta.focus();
    const display = caretReq.at > contentPart.length ? source : contentPart;
    const at = Math.min(Math.max(0, caretReq.at), display.length);
    ta.setSelectionRange(at, at);
    applied.current = caretReq.n;
  }, [focused, caretReq, source, contentPart]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }
    if (e.key !== "Enter" || e.shiftKey) {
      enterHandledRef.current = false;
      return;
    }
    e.preventDefault();
    const ta = e.currentTarget;
    enterHandledRef.current = true;
    onEnter(ta.selectionStart, ta.value);
  }

  if (focused) {
    const showTrailing = caretReq != null && caretReq.at > contentPart.length;
    const displayValue = showTrailing ? source : contentPart;
    return (
      <textarea
        ref={taRef}
        value={displayValue}
        onChange={(e) => {
          if ((e.nativeEvent as InputEvent).isComposing) return;
          if (enterHandledRef.current) {
            enterHandledRef.current = false;
            return;
          }
          onEdit(e.target.value, e.target.selectionStart);
        }}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={() => { composingRef.current = false; }}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        rows={Math.max(1, displayValue.split("\n").length)}
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
        onFocus(
          Math.min(Math.round(ratio * source.length), contentPart.length)
        );
      }}
    >
      <MarkdownView content={source} onNavigate={onNavigate} />
    </div>
  );
}
