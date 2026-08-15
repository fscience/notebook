"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Cell as CellType, CellOutput } from "@/lib/types";
import { highlightPython } from "@/lib/highlight";
import { remarkDocLinks, docNameFromHref } from "@/lib/wiki";
import {
  MarkdownIcon,
  Play,
  Stop,
  Trash,
  Edit,
  ChevronDown,
  ChevronUp,
} from "@/components/icons";

interface Props {
  cell: CellType;
  running: boolean;
  onEdit: (content: string) => void;
  onDelete: () => void;
  onRun: () => void;
  onInsert: (type: "markdown" | "code", position: "before" | "after") => void;
  onToggleOutput: (collapsed: boolean) => void;
  onNavigate: (docName: string) => void;
}

function CellOutputView({
  output,
  onToggle,
}: {
  output: CellOutput;
  onToggle: (collapsed: boolean) => void;
}) {
  const collapsed = !!output.collapsed;

  const lineCount = [
    output.stdout ?? "",
    output.stderr ?? "",
    output.error ?? "",
  ].reduce((n, s) => n + s.split("\n").filter((l) => l.length > 0).length, 0);
  const imageCount = output.images?.length ?? 0;

  return (
    <div className="border-t border-cell-border">
      <button
        onClick={() => onToggle(!collapsed)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] text-muted transition hover:bg-hover hover:text-foreground"
        title={collapsed ? "展开输出" : "收起输出"}
      >
        {collapsed ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronUp className="h-3 w-3" />
        )}
        <span className="font-medium text-foreground">输出</span>
        <span>
          {lineCount} 行{imageCount > 0 ? ` · ${imageCount} 张图` : ""}
        </span>
        <span className="flex-1" />
        <span>{collapsed ? "展开" : "收起"}</span>
      </button>
      {!collapsed && (
        <div>
          {output.stdout || output.error ? (
            <pre
              className={`whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-relaxed ${
                output.error ? "text-danger" : "text-code-out"
              }`}
            >
              {output.stdout}
            </pre>
          ) : null}
          {output.stderr ? (
            <pre className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-relaxed text-warn">
              {output.stderr}
            </pre>
          ) : null}
          {output.error ? (
            <pre className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-relaxed text-danger">
              {output.error}
            </pre>
          ) : null}
          {output.timedOut ? (
            <p className="px-3 py-2 text-[12px] text-warn">执行超时，进程已被终止。</p>
          ) : null}
          {output.images && output.images.length > 0 ? (
            <div className="flex flex-wrap gap-2 px-3 py-2">
              {output.images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={`data:${img.mime || "image/png"};base64,${img.data}`}
                  alt={img.name}
                  className="max-h-80 max-w-full rounded border border-cell-border"
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function Cell({
  cell,
  running,
  onEdit,
  onDelete,
  onRun,
  onInsert,
  onToggleOutput,
  onNavigate,
}: Props) {
  const isCode = cell.type === "code";
  const [editing, setEditing] = useState(false);

  const output = cell.output;

  const highlighted = useMemo(
    () => (isCode ? highlightPython(cell.content) : ""),
    [isCode, cell.content]
  );

  return (
    <div className={`group rounded-lg border border-cell-border bg-cell-bg`}>
      <div className="flex items-center gap-1 border-b border-cell-border px-2 py-1">
        <span
          className={`flex items-center gap-1 text-[11px] font-medium ${
            isCode ? "text-code-label" : "text-md-label"
          }`}
        >
          {isCode ? (
            <>
              <Play className="h-3 w-3" /> Python
            </>
          ) : (
            <>
              <MarkdownIcon className="h-3 w-3" /> Markdown
            </>
          )}
        </span>
        <div className="flex-1" />
        {isCode ? (
          <button
            onClick={onRun}
            disabled={running}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition ${
              running
                ? "bg-accent/15 text-accent"
                : "bg-accent text-white hover:opacity-90"
            }`}
          >
            {running ? (
              <>
                <Stop className="h-3 w-3 animate-pulse" /> 运行中...
              </>
            ) : (
              <>
                <Play className="h-3 w-3" /> 运行
              </>
            )}
          </button>
        ) : (
          <button
            onClick={() => setEditing((v) => !v)}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted hover:bg-hover hover:text-foreground"
            title={editing ? "预览" : "编辑"}
          >
            <Edit className="h-3 w-3" /> {editing ? "预览" : "编辑"}
          </button>
        )}
        <button
          onClick={onDelete}
          className="rounded p-1 text-muted opacity-0 hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
          title="删除单元格"
        >
          <Trash className="h-3 w-3" />
        </button>
      </div>

      {isCode ? (
        <div>
          <div className="code-editor">
            <pre
              aria-hidden
              className="code-editor-pre"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
            <textarea
              className="code-editor-input"
              value={cell.content}
              onChange={(e) => onEdit(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              placeholder="# 在这里编写 Python 代码..."
            />
          </div>
          {output && <CellOutputView output={output} onToggle={onToggleOutput} />}
        </div>
      ) : editing ? (
        <div>
          <textarea
            value={cell.content}
            onChange={(e) => onEdit(e.target.value)}
            rows={Math.max(4, cell.content.split("\n").length + 1)}
            className="w-full resize-y border-none bg-transparent px-3 py-2 font-mono text-[13px] leading-relaxed outline-none"
            placeholder="# 在这里编写 Markdown..."
          />
          <div className="px-3 pb-2">
            <button
              onClick={() => setEditing(false)}
              className="rounded bg-accent px-3 py-1 text-[11px] text-white hover:opacity-90"
            >
              完成
            </button>
          </div>
        </div>
      ) : (
        <div
          className="markdown-body cursor-text px-3 py-2"
          onDoubleClick={() => setEditing(true)}
          title="双击编辑"
        >
          {cell.content.trim() ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkDocLinks]}
              components={{
                code({ className, children, ...props }) {
                  const lang = /language-([\w-]+)/.exec(className || "")?.[1];
                  const codeStr = String(children ?? "").replace(/\n$/, "");
                  if (lang === "python" || lang === "py") {
                    return (
                      <code
                        className={className}
                        dangerouslySetInnerHTML={{ __html: highlightPython(codeStr) }}
                        {...props}
                      />
                    );
                  }
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
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
                  return (
                    <a href={href} {...props}>
                      {children}
                    </a>
                  );
                },
              }}
            >
              {cell.content}
            </ReactMarkdown>
          ) : (
            <p className="text-muted italic">双击添加 Markdown 内容...</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-center gap-1 border-t border-dashed border-cell-border px-2 py-0.5 opacity-0 transition group-hover:opacity-100">
        <button
          onClick={() => onInsert("markdown", "after")}
          className="rounded px-2 py-0.5 text-[10px] text-muted hover:bg-hover hover:text-foreground"
          title="在此后插入 Markdown 单元格"
        >
          + Markdown
        </button>
        <button
          onClick={() => onInsert("code", "after")}
          className="rounded px-2 py-0.5 text-[10px] text-muted hover:bg-hover hover:text-foreground"
          title="在此后插入 Python 单元格"
        >
          + Python
        </button>
      </div>
    </div>
  );
}
