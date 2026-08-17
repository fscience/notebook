"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkDocLinks, docNameFromHref } from "@/lib/wiki";
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
  onBlockAction?: (action: string) => void;
  onBackspaceEmpty?: () => void;
  placeholder?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightMarkdown(text: string): string {
  if (!text) return "\n";

  const lines = text.split("\n");
  const result: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (inFence) {
      result.push(
        `<span class="hl-fence">${escapeHtml(line)}</span>`
      );
      if (line.trimEnd().endsWith("```")) {
        inFence = false;
      }
      continue;
    }

    if (line.trimEnd().startsWith("```")) {
      inFence = true;
      result.push(
        `<span class="hl-fence">${escapeHtml(line)}</span>`
      );
      continue;
    }

    const escaped = escapeHtml(line);

    let highlighted = escaped;

    // Headings
    const headingMatch = escaped.match(/^(#{1,6})\s/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      highlighted = `<span class="hl-heading hl-h${level}">${escaped}</span>`;
      result.push(highlighted);
      continue;
    }

    // Blockquote
    if (escaped.match(/^(&gt;\s?)/)) {
      highlighted = `<span class="hl-blockquote">${escaped}</span>`;
      result.push(highlighted);
      continue;
    }

    // Horizontal rule
    if (escaped.match(/^(-{3,}|_{3,}|\*{3,})$/)) {
      highlighted = `<span class="hl-hr">${escaped}</span>`;
      result.push(highlighted);
      continue;
    }

    // Unordered list
    if (escaped.match(/^[\s]*[-*+]\s/)) {
      highlighted = escaped.replace(
        /^([\s]*[-*+]\s)/,
        '<span class="hl-list-marker">$1</span>'
      );
      result.push(highlighted);
      continue;
    }

    // Ordered list
    if (escaped.match(/^[\s]*\d+\.\s/)) {
      highlighted = escaped.replace(
        /^([\s]*\d+\.\s)/,
        '<span class="hl-list-marker">$1</span>'
      );
      result.push(highlighted);
      continue;
    }

    // Inline formatting within the line
    highlighted = highlighted
      // Inline code (must be processed first to avoid conflicts)
      .replace(
        /(`[^`]+`)/g,
        '<span class="hl-inline-code">$1</span>'
      )
      // Bold + italic
      .replace(
        /(\*\*\*[^*]+\*\*\*)/g,
        '<span class="hl-bold-italic">$1</span>'
      )
      // Bold
      .replace(
        /(\*\*[^*]+\*\*)/g,
        '<span class="hl-bold">$1</span>'
      )
      // Italic
      .replace(
        /(\*[^*]+\*)/g,
        '<span class="hl-italic">$1</span>'
      )
      // Strikethrough
      .replace(
        /(~~[^~]+~~)/g,
        '<span class="hl-strikethrough">$1</span>'
      )
      // Links
      .replace(
        /(\[[^\]]+\]\([^)]+\))/g,
        '<span class="hl-link">$1</span>'
      )
      // Images
      .replace(
        /(!\[[^\]]*\]\([^)]+\))/g,
        '<span class="hl-link">$1</span>'
      );

    result.push(highlighted);
  }

  const joined = result.join("\n");
  if (text.endsWith("\n")) return joined + "\n";
  return joined;
}

interface FloatingToolbarProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onApply: (action: string) => void;
  onBlockAction?: (action: string) => void;
}

function FloatingToolbar({ containerRef, onApply, onBlockAction }: FloatingToolbarProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    if (!textarea) return;
    const ta = textarea;

    function check() {
      if (
        ta.selectionStart !== ta.selectionEnd &&
        document.activeElement === ta
      ) {
        const start = Math.min(ta.selectionStart, ta.selectionEnd);
        const end = Math.max(ta.selectionStart, ta.selectionEnd);
        const text = ta.value.substring(start, end);
        if (text.trim().length === 0) {
          setVisible(false);
          return;
        }

        const beforeText = ta.value.substring(0, start);
        const linesBefore = beforeText.split("\n");
        const lineIndex = linesBefore.length - 1;
        const charOnLine = linesBefore[lineIndex]?.length || 0;

        const lineHeight = 22.4;
        const charWidth = 7.8;
        const taRect = ta.getBoundingClientRect();
        const top = taRect.top + lineIndex * lineHeight - 48;
        const left = taRect.left + Math.min(charOnLine * charWidth, 200);

        setPos({ top: Math.max(0, top), left });
        setVisible(true);
      } else {
        setVisible(false);
      }
    }

    ta.addEventListener("select", check);
    ta.addEventListener("input", check);
    ta.addEventListener("keyup", check);
    ta.addEventListener("click", check);
    return () => {
      ta.removeEventListener("select", check);
      ta.removeEventListener("input", check);
      ta.removeEventListener("keyup", check);
      ta.removeEventListener("click", check);
    };
  }, [containerRef]);

  if (!visible || !pos) return null;

  return (
    <div
      className="floating-toolbar"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="floating-toolbar-row">
        <button className="floating-toolbar-btn" title="加粗 (Ctrl+B)" onClick={() => onApply("bold")}>
          <strong>B</strong>
        </button>
        <button className="floating-toolbar-btn" title="斜体 (Ctrl+I)" onClick={() => onApply("italic")}>
          <em>I</em>
        </button>
        <button className="floating-toolbar-btn" title="行内代码" onClick={() => onApply("code")}>
          <code className="text-xs">&lt;/&gt;</code>
        </button>
        <button className="floating-toolbar-btn" title="删除线" onClick={() => onApply("strikethrough")}>
          <span className="line-through text-xs font-mono">S</span>
        </button>
        <div className="floating-toolbar-divider" />
        <button className="floating-toolbar-btn" title="链接" onClick={() => onApply("link")}>
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M6.82 5.57a2.5 2.5 0 0 1 3.54 3.54l-2.12 2.13a2.5 2.5 0 0 1-3.54-3.54l.18-.18a.75.75 0 0 1 1.06 1.06l-.18.18a1 1 0 0 0 1.42 1.42l2.12-2.13a1 1 0 0 0-1.42-1.42L6.82 5.57ZM9.18 10.43a2.5 2.5 0 0 1-3.54-3.54l2.12-2.13a2.5 2.5 0 0 1 3.54 3.54l-.18.18a.75.75 0 0 1-1.06-1.06l.18-.18a1 1 0 0 0-1.42-1.42L6.16 6.97a1 1 0 0 0 1.42 1.42l2.13-2.13a1 1 0 0 0-1.42-1.42L6.16 5.57" />
          </svg>
        </button>
      </div>
      <div className="floating-toolbar-row">
        <button className="floating-toolbar-btn" title="标题 1" onClick={() => onApply("heading-1")}>
          <span className="text-xs font-bold">H1</span>
        </button>
        <button className="floating-toolbar-btn" title="标题 2" onClick={() => onApply("heading-2")}>
          <span className="text-xs font-bold">H2</span>
        </button>
        <button className="floating-toolbar-btn" title="标题 3" onClick={() => onApply("heading-3")}>
          <span className="text-xs font-bold">H3</span>
        </button>
        <button className="floating-toolbar-btn" title="正文" onClick={() => onApply("paragraph")}>
          <span className="text-xs font-bold">P</span>
        </button>
        <div className="floating-toolbar-divider" />
        <button className="floating-toolbar-btn" title="无序列表" onClick={() => onApply("bullet-list")}>
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><circle cx="2" cy="4" r="1.2" /><circle cx="2" cy="8" r="1.2" /><circle cx="2" cy="12" r="1.2" /><rect x="5" y="3.2" width="9" height="1.6" rx=".8" /><rect x="5" y="7.2" width="9" height="1.6" rx=".8" /><rect x="5" y="11.2" width="9" height="1.6" rx=".8" /></svg>
        </button>
        <button className="floating-toolbar-btn" title="有序列表" onClick={() => onApply("ordered-list")}>
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><text x="0" y="5.5" fontSize="5" fontWeight="600">1.</text><text x="0" y="9.5" fontSize="5" fontWeight="600">2.</text><text x="0" y="13.5" fontSize="5" fontWeight="600">3.</text><rect x="5" y="3.2" width="9" height="1.6" rx=".8" /><rect x="5" y="7.2" width="9" height="1.6" rx=".8" /><rect x="5" y="11.2" width="9" height="1.6" rx=".8" /></svg>
        </button>
        <button className="floating-toolbar-btn" title="引用" onClick={() => onApply("blockquote")}>
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M3 3.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5Zm0 4a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5Zm0 4a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5Z" />
          </svg>
        </button>
        {onBlockAction && (
          <>
            <div className="floating-toolbar-divider" />
            <button className="floating-toolbar-btn" title="上移" onClick={() => onBlockAction("move-up")}>
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 3.5l-4 4h3v5h2v-5h3l-4-4z" /></svg>
            </button>
            <button className="floating-toolbar-btn" title="下移" onClick={() => onBlockAction("move-down")}>
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 12.5l4-4h-3v-5H7v5H4l4 4z" /></svg>
            </button>
            <button className="floating-toolbar-btn" title="复制块" onClick={() => onBlockAction("duplicate")}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5"><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" /></svg>
            </button>
            <button className="floating-toolbar-btn danger" title="删除块" onClick={() => onBlockAction("delete")}>
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M6 1.5h4a1.5 1.5 0 0 1 1.5 1.5v.5h2.25a.75.75 0 0 1 0 1.5h-.31l-.6 9.06A1.5 1.5 0 0 1 11.35 16H4.65a1.5 1.5 0 0 1-1.49-1.44l-.6-9.06h-.31a.75.75 0 0 1 0-1.5H4.5V3A1.5 1.5 0 0 1 6 1.5Z" /></svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
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
  onBlockAction,
  onBackspaceEmpty,
  placeholder,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const applied = useRef(-1);
  const enterHandledRef = useRef(false);
  const composingRef = useRef(false);
  const prevSlashRef = useRef(false);
  const [composingText, setComposingText] = useState<string | null>(null);

  const contentPart = source.replace(/\n+$/, "");
  const displayValue = useMemo(() => {
    const showTrailing = caretReq != null && caretReq.at > contentPart.length;
    return showTrailing ? source : contentPart;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caretReq intentionally excluded: including it would reset textarea cursor on every keystroke
  }, [source, contentPart]);

  const effectiveValue = composingText ?? displayValue;
  const highlightedHtml = useMemo(() => highlightMarkdown(effectiveValue), [effectiveValue]);

  useEffect(() => {
    if (!focused || !taRef.current || !caretReq) return;
    if (caretReq.n === applied.current) return;
    if (composingRef.current) return;
    const ta = taRef.current;
    if (document.activeElement !== ta) ta.focus();
    const at = Math.min(Math.max(0, caretReq.at), displayValue.length);
    ta.setSelectionRange(at, at);
    applied.current = caretReq.n;
  }, [focused, caretReq, displayValue]);

  useEffect(() => {
    if (!composingRef.current) {
      setComposingText(null);
    }
  }, [source]);

  const syncScroll = useCallback(() => {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  }, []);

  const wrapSelection = useCallback(
    (before: string, after: string) => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;
      const selected = value.substring(start, end);

      const newValue =
        value.substring(0, start) +
        before +
        selected +
        after +
        value.substring(end);

      onEdit(newValue, start + before.length + selected.length + after.length);

      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(
          start + before.length,
          end + before.length
        );
      });
    },
    [onEdit]
  );

  const toggleWrap = useCallback(
    (marker: string) => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;
      const selected = value.substring(start, end);

      const beforeMarker = value.substring(start - marker.length, start);
      const afterMarker = value.substring(end, end + marker.length);

      if (beforeMarker === marker && afterMarker === marker) {
        const newValue =
          value.substring(0, start - marker.length) +
          selected +
          value.substring(end + marker.length);
        onEdit(newValue, start - marker.length);
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(start - marker.length, end - marker.length);
        });
      } else {
        wrapSelection(marker, marker);
      }
    },
    [onEdit, wrapSelection]
  );

  const handleToolbarAction = useCallback(
    (action: string) => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;

      switch (action) {
        case "bold":
          toggleWrap("**");
          break;
        case "italic":
          toggleWrap("*");
          break;
        case "code":
          toggleWrap("`");
          break;
        case "strikethrough":
          toggleWrap("~~");
          break;
        case "link": {
          const selected = value.substring(start, end);
          if (selected) {
            const newValue =
              value.substring(0, start) +
              `[${selected}](url)` +
              value.substring(end);
            onEdit(newValue, end + 3);
          } else {
            const newValue =
              value.substring(0, start) +
              `[text](url)` +
              value.substring(end);
            onEdit(newValue, start + 1);
          }
          requestAnimationFrame(() => {
            ta.focus();
            if (!value.substring(start, end)) {
              ta.setSelectionRange(start + 1, start + 5);
            }
          });
          break;
        }
        case "heading-1":
        case "heading-2":
        case "heading-3":
        case "paragraph":
        case "bullet-list":
        case "ordered-list":
        case "blockquote": {
          const lineStart = value.lastIndexOf("\n", start - 1) + 1;
          const lineEnd = value.indexOf("\n", start);
          const actualEnd = lineEnd === -1 ? value.length : lineEnd;
          const line = value.substring(lineStart, actualEnd);
          const clean = line
            .replace(/^#{1,6}\s*/, "")
            .replace(/^[-+*]\s*/, "")
            .replace(/^\d+[.)]\s*/, "")
            .replace(/^>\s*/, "");
          let prefix = "";
          switch (action) {
            case "heading-1": prefix = "# "; break;
            case "heading-2": prefix = "## "; break;
            case "heading-3": prefix = "### "; break;
            case "paragraph": prefix = ""; break;
            case "bullet-list": prefix = "- "; break;
            case "ordered-list": prefix = "1. "; break;
            case "blockquote": prefix = "> "; break;
          }
          const newLine = prefix + clean;
          const newValue = value.substring(0, lineStart) + newLine + value.substring(actualEnd);
          const delta = newLine.length - line.length;
          onEdit(newValue, start + delta);
          requestAnimationFrame(() => ta.focus());
          break;
        }
      }
    },
    [toggleWrap, onEdit]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }
    const ta = e.currentTarget;

    // Formatting shortcuts
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case "b":
          e.preventDefault();
          toggleWrap("**");
          return;
        case "i":
          e.preventDefault();
          toggleWrap("*");
          return;
        case "e":
          e.preventDefault();
          toggleWrap("`");
          return;
        case "k":
          e.preventDefault();
          handleToolbarAction("link");
          return;
        case "u":
          e.preventDefault();
          toggleWrap("~~");
          return;
      }
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;

      if (e.shiftKey) {
        // Dedent
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const lineContent = value.slice(lineStart, start);
        if (lineContent.startsWith("  ")) {
          const newValue = value.slice(0, lineStart) + value.slice(lineStart + 2);
          onEdit(newValue, Math.max(lineStart, start - 2));
        }
      } else if (start !== end) {
        // Indent selection
        const v = ta.value;
        const ls = v.lastIndexOf("\n", start - 1) + 1;
        const endAdj = end > start && v[end - 1] === "\n" ? end - 1 : end;
        const le = v.indexOf("\n", endAdj);
        const blockEnd = le === -1 ? v.length : le;
        const block = v.slice(ls, blockEnd);
        const replacement = block.replace(/^/gm, "  ");
        const newValue = v.slice(0, ls) + replacement + v.slice(blockEnd);
        onEdit(newValue, start + 2);
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(start + 2, end + 2);
        });
      } else {
        // Insert spaces at cursor
        const newValue = value.slice(0, start) + "  " + value.slice(end);
        onEdit(newValue, start + 2);
      }
      return;
    }

    if (e.key === "Backspace" && onBackspaceEmpty) {
      const visible = ta.value.replace(/\u200B/g, "").replace(/\n+$/, "");
      if (visible === "" && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        e.preventDefault();
        onBackspaceEmpty();
        return;
      }
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
      setComposingText(e.target.value);
      return;
    }
    if (enterHandledRef.current) {
      enterHandledRef.current = false;
      return;
    }

    const newValue = e.target.value;
    const caretPos = e.target.selectionStart;

    const charBefore = caretPos > 0 ? newValue[caretPos - 1] : "";
    const lineStart = newValue.lastIndexOf("\n", caretPos - 1) + 1;
    const textBeforeCursor = newValue.slice(lineStart, caretPos);
    const isAtLineStart = textBeforeCursor === "/";

    if (
      !prevSlashRef.current &&
      charBefore === "/" &&
      isAtLineStart
    ) {
      const rect = taRef.current?.getBoundingClientRect();
      if (rect) {
        onSlashTrigger({ top: rect.bottom + 4, left: rect.left });
      }
    }
    prevSlashRef.current = charBefore === "/" && isAtLineStart;

    onEdit(newValue, caretPos);
  }

  if (focused) {
    return (
      <div className="md-block-wrapper">
        <DragHandle
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          visible={selected && !focused}
        />
        <div className="md-editor-overlay" ref={containerRef}>
          <pre
            ref={preRef}
            className="md-editor-highlight"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
          <textarea
            ref={taRef}
            value={effectiveValue}
            onChange={handleChange}
            onCompositionStart={() => {
              composingRef.current = true;
              setComposingText(displayValue);
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
              const finalValue = taRef.current?.value ?? effectiveValue;
              const finalCaret = taRef.current?.selectionStart ?? 0;
              setComposingText(null);
              onEdit(finalValue, finalCaret);
            }}
            onKeyDown={handleKeyDown}
            onInput={syncScroll}
            onScroll={syncScroll}
            onBlur={onBlur}
            onClick={onSelect}
            onContextMenu={onContextMenu}
            spellCheck={false}
            className="md-editor-textarea"
            placeholder={placeholder ?? "开始编写 Markdown..."}
          />
          <FloatingToolbar
            containerRef={containerRef}
            onApply={handleToolbarAction}
            onBlockAction={onBlockAction}
          />
        </div>
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
        const overlay = e.currentTarget.querySelector(".md-editor-overlay") as HTMLElement | null;
        if (!overlay) {
          onFocus(0);
          return;
        }
        const probe = document.createElement("div");
        probe.textContent = displayValue;
        probe.style.cssText = [
          "position:absolute",
          "top:0",
          "left:0",
          "width:100%",
          "white-space:pre-wrap",
          "word-wrap:break-word",
          "overflow-wrap:break-word",
          "font:14px/1.7 var(--font-sans)",
          "padding:4px 6px",
          "margin:0",
          "border:none",
          "pointer-events:none",
        ].join(";");
        overlay.appendChild(probe);
        let pos = contentPart.length;
        const doc = document as unknown as {
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
        };
        if (doc.caretPositionFromPoint) {
          const cp = doc.caretPositionFromPoint(e.clientX, e.clientY);
          if (cp && probe.contains(cp.offsetNode)) {
            pos = cp.offset;
          }
        } else if (doc.caretRangeFromPoint) {
          const range = doc.caretRangeFromPoint(e.clientX, e.clientY);
          if (range && probe.contains(range.startContainer)) {
            pos = range.startOffset;
          }
        }
        overlay.removeChild(probe);
        onFocus(Math.min(pos, contentPart.length));
      }}
      onContextMenu={onContextMenu}
    >
      <DragHandle
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        visible={selected}
      />
      <div className="md-editor-overlay">
        {!source.trim() ? (
          <p className="md-editor-placeholder-text">开始编写 Markdown...</p>
        ) : (
          <div className="markdown-body" style={{ padding: "4px 6px", margin: 0 }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkDocLinks]}
              components={{
                a({ href, children, ...props }) {
                  const doc = typeof href === "string" ? docNameFromHref(href) : null;
                  if (doc != null) {
                    return (
                      <a
                        href={href}
                        title={`打开文档：${doc}`}
                        className="wiki-link"
                        onClick={(e) => {
                          e.preventDefault();
                          onNavigate(doc);
                        }}
                      >
                        {children}
                      </a>
                    );
                  }
                  return <a href={href} {...props}>{children}</a>;
                },
              }}
            >
              {source.replace(/\u200B/g, "").replace(/^(>.*?)\n(?=>)/gm, "$1  \n")}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
