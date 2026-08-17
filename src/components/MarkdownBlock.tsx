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
}

function FloatingToolbar({ containerRef, onApply }: FloatingToolbarProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ta = container.querySelector<HTMLTextAreaElement>("textarea");
    if (!ta) return;
    const textarea = ta;

    function check() {
      if (
        textarea.selectionStart !== textarea.selectionEnd &&
        document.activeElement === textarea
      ) {
        const start = Math.min(textarea.selectionStart, textarea.selectionEnd);
        const end = Math.max(textarea.selectionStart, textarea.selectionEnd);
        const text = textarea.value.substring(start, end);
        if (text.trim().length === 0) {
          setVisible(false);
          return;
        }

        const beforeText = textarea.value.substring(0, start);
        const linesBefore = beforeText.split("\n");
        const lineIndex = linesBefore.length - 1;
        const charOnLine = linesBefore[lineIndex]?.length || 0;

        const lineHeight = 22.4;
        const charWidth = 7.8;
        const top = textarea.getBoundingClientRect().top + lineIndex * lineHeight - 40;
        const left =
          textarea.getBoundingClientRect().left + Math.min(charOnLine * charWidth, 200);

        setPos({ top, left });
        setVisible(true);
      } else {
        setVisible(false);
      }
    }

    textarea.addEventListener("select", check);
    textarea.addEventListener("input", check);
    textarea.addEventListener("keyup", check);
    textarea.addEventListener("click", check);
    return () => {
      textarea.removeEventListener("select", check);
      textarea.removeEventListener("input", check);
      textarea.removeEventListener("keyup", check);
      textarea.removeEventListener("click", check);
    };
  }, [containerRef]);

  if (!visible || !pos) return null;

  return (
    <div
      className="floating-toolbar"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        className="floating-toolbar-btn"
        title="加粗 (Ctrl+B)"
        onClick={() => onApply("bold")}
      >
        <strong>B</strong>
      </button>
      <button
        className="floating-toolbar-btn"
        title="斜体 (Ctrl+I)"
        onClick={() => onApply("italic")}
      >
        <em>I</em>
      </button>
      <button
        className="floating-toolbar-btn"
        title="行内代码"
        onClick={() => onApply("code")}
      >
        <code className="text-xs">&lt;/&gt;</code>
      </button>
      <button
        className="floating-toolbar-btn"
        title="删除线"
        onClick={() => onApply("strikethrough")}
      >
        <span className="line-through text-xs font-mono">S</span>
      </button>
      <div className="floating-toolbar-divider" />
      <button
        className="floating-toolbar-btn"
        title="链接"
        onClick={() => onApply("link")}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M6.82 5.57a2.5 2.5 0 0 1 3.54 3.54l-2.12 2.13a2.5 2.5 0 0 1-3.54-3.54l.18-.18a.75.75 0 0 1 1.06 1.06l-.18.18a1 1 0 0 0 1.42 1.42l2.12-2.13a1 1 0 0 0-1.42-1.42L6.82 5.57ZM9.18 10.43a2.5 2.5 0 0 1-3.54-3.54l2.12-2.13a2.5 2.5 0 0 1 3.54 3.54l-.18.18a.75.75 0 0 1-1.06-1.06l.18-.18a1 1 0 0 0-1.42-1.42L6.16 6.97a1 1 0 0 0 1.42 1.42l2.13-2.13a1 1 0 0 0-1.42-1.42L6.16 5.57" />
        </svg>
      </button>
      <div className="floating-toolbar-divider" />
      <button
        className="floating-toolbar-btn"
        title="引用"
        onClick={() => onApply("blockquote")}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M3 3.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5Zm0 4a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5Zm0 4a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5Z" />
        </svg>
      </button>
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
  placeholder,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const applied = useRef(-1);
  const enterHandledRef = useRef(false);
  const composingRef = useRef(false);
  const compositionFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSlashRef = useRef(false);
  const [showToolbar, setShowToolbar] = useState(false);

  const contentPart = source.replace(/\n+$/, "");
  const displayValue = useMemo(() => {
    const showTrailing = caretReq != null && caretReq.at > contentPart.length;
    return showTrailing ? source : contentPart;
  }, [source, contentPart, caretReq]);

  const highlightedHtml = useMemo(() => highlightMarkdown(displayValue), [displayValue]);

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
        case "blockquote": {
          const lineStart = value.lastIndexOf("\n", start - 1) + 1;
          const newValue =
            value.substring(0, lineStart) + "> " + value.substring(lineStart);
          onEdit(newValue, start + 2);
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
            onInput={syncScroll}
            onScroll={syncScroll}
            onBlur={onBlur}
            onClick={() => {
              onSelect();
              setShowToolbar(false);
            }}
            onContextMenu={onContextMenu}
            spellCheck={false}
            className="md-editor-textarea"
            placeholder={placeholder ?? "开始编写 Markdown..."}
          />
          {showToolbar && (
            <FloatingToolbar
              containerRef={containerRef}
              onApply={handleToolbarAction}
            />
          )}
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
