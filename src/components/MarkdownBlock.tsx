"use client";

import { useEffect, useRef } from "react";
import MarkdownView from "@/components/MarkdownView";
import DragHandle from "@/components/DragHandle";

export interface CaretRequest {
  at: number;
  n: number;
}

interface Props {
  source: string;
  focused: boolean;
  selected: boolean;
  caretReq?: CaretRequest | null;
  onFocus: (caret: number) => void;
  onEdit: (newSource: string, caret?: number) => void;
  onEnter: (caret: number, source: string) => void;
  onBlur: () => void;
  onSelect: () => void;
  onNavigate: (docName: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onSlashTrigger: (position: { top: number; left: number }) => void;
  placeholder?: string;
}

export default function MarkdownBlock({
  source,
  focused,
  selected,
  caretReq,
  onFocus,
  onEdit,
  onEnter,
  onBlur,
  onSelect,
  onNavigate,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onSlashTrigger,
  placeholder,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const applied = useRef(-1);
  const enterHandledRef = useRef(false);
  const composingRef = useRef(false);
  const compositionFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSlashRef = useRef(false);

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
    const ta = e.currentTarget;

    if (e.key === "Tab") {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;

      if (e.shiftKey) {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const lineContent = value.slice(lineStart, start);
        if (lineContent.startsWith("  ")) {
          const newValue = value.slice(0, lineStart) + value.slice(lineStart + 2);
          onEdit(newValue, Math.max(lineStart, start - 2));
        }
      } else {
        const newValue = value.slice(0, start) + "  " + value.slice(end);
        onEdit(newValue, start + 2);
      }
      return;
    }

    if (e.key !== "Enter" || e.shiftKey) {
      enterHandledRef.current = false;
      return;
    }
    e.preventDefault();
    enterHandledRef.current = true;
    onEnter(ta.selectionStart, ta.value);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (composingRef.current) {
      if (compositionFallbackRef.current != null) {
        clearTimeout(compositionFallbackRef.current);
        compositionFallbackRef.current = null;
      }
      return;
    }
    if (enterHandledRef.current) {
      enterHandledRef.current = false;
      return;
    }

    const newValue = e.target.value;
    const caretPos = e.target.selectionStart;

    if (!prevSlashRef.current && newValue === "/") {
      const rect = taRef.current?.getBoundingClientRect();
      if (rect) {
        onSlashTrigger({ top: rect.bottom + 4, left: rect.left });
      }
    }
    prevSlashRef.current = newValue === "/" && caretPos === 1;

    onEdit(newValue, caretPos);
  }

  if (focused) {
    const showTrailing = caretReq != null && caretReq.at > contentPart.length;
    const displayValue = showTrailing ? source : contentPart;
    return (
      <div className="md-block-wrapper">
        <DragHandle onDragStart={onDragStart} onDragEnd={onDragEnd} visible={selected && !focused} />
        <textarea
          ref={taRef}
          value={displayValue}
          onChange={handleChange}
          onCompositionStart={() => {
            composingRef.current = true;
            if (compositionFallbackRef.current != null) {
              clearTimeout(compositionFallbackRef.current);
              compositionFallbackRef.current = null;
            }
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
            compositionFallbackRef.current = setTimeout(() => {
              if (taRef.current) {
                onEdit(taRef.current.value, taRef.current.selectionStart);
              }
            }, 0);
          }}
          onKeyDown={handleKeyDown}
          onBlur={onBlur}
          onClick={onSelect}
          onContextMenu={onContextMenu}
          rows={Math.max(1, displayValue.split("\n").length)}
          spellCheck={false}
          className="md-block-editor"
          placeholder={placeholder}
        />
      </div>
    );
  }

  return (
    <div
      data-md-block
      className={`md-block-wrapper ${selected ? "selected" : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        onSelect();
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
      onContextMenu={onContextMenu}
    >
      <DragHandle onDragStart={onDragStart} onDragEnd={onDragEnd} visible={selected} />
      <MarkdownView content={source} onNavigate={onNavigate} />
    </div>
  );
}
