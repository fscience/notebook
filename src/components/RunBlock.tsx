"use client";

import { useMemo } from "react";
import type { CellOutput } from "@/lib/types";
import type { RunBlockKind } from "@/lib/runblock";
import { highlightPython, highlightShell } from "@/lib/highlight";
import { Play, Stop, Trash, ChevronDown, ChevronUp, TerminalIcon } from "@/components/icons";

interface Props {
  kind: RunBlockKind;
  code: string;
  output?: CellOutput;
  running: boolean;
  selected: boolean;
  onEdit: (code: string) => void;
  onRun: () => void;
  onDelete: () => void;
  onToggleOutput: (collapsed: boolean) => void;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function OutputView({
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
        {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
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

export default function RunBlock({
  kind,
  code,
  output,
  running,
  selected,
  onEdit,
  onRun,
  onDelete,
  onToggleOutput,
  onSelect,
  onContextMenu,
}: Props) {
  const isPython = kind === "python";

  const highlighted = useMemo(
    () => (isPython ? highlightPython(code) : highlightShell(code)),
    [isPython, code]
  );

  return (
    <div
      className={`group run-block-wrapper ${selected ? "selected" : ""}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <div className="run-block-inner rounded-lg border border-cell-border bg-cell-bg">
        <div className="flex items-center gap-1 border-b border-cell-border px-2 py-1">
          <span
            className={`flex items-center gap-1 text-[11px] font-medium ${
              isPython ? "text-code-label" : "text-shell-label"
            }`}
          >
            {isPython ? <Play className="h-3 w-3" /> : <TerminalIcon className="h-3 w-3" />}
            {isPython ? "Python" : "Shell"}
          </span>
          <span className="text-[10px] text-muted">
            {isPython ? "```python-run" : "```shell-run"}
          </span>
          <div className="flex-1" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded p-1 text-muted opacity-0 hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
            title="删除该运行块"
          >
            <Trash className="h-3 w-3" />
          </button>
        </div>
        <div className="code-editor">
          <pre
            aria-hidden
            className="code-editor-pre"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
          <textarea
            className="code-editor-input"
            value={code}
            onChange={(e) => onEdit(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            placeholder={
              isPython ? "# 在这里编写 Python 代码..." : "# 在这里输入 Shell 命令..."
            }
          />
        </div>
        {output && <OutputView output={output} onToggle={onToggleOutput} />}
      </div>
    </div>
  );
}
