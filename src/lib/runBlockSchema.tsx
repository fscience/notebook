import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultProps,
} from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { Play, TerminalIcon, Trash, ChevronDown, ChevronUp, Stop } from "@/components/icons";
import { highlightPython, highlightShell } from "@/lib/highlight";
import { useMemo } from "react";
import type { CellOutput } from "@/lib/types";

export interface RunBlockContextValue {
  getOutput: (blockId: string) => CellOutput | undefined;
  isRunning: (blockId: string) => boolean;
  onRun: (blockId: string) => void;
  onEdit: (blockId: string, code: string) => void;
  onDelete: (blockId: string) => void;
  onToggleOutput: (blockId: string, collapsed: boolean) => void;
}

let _runBlockCtx: RunBlockContextValue | null = null;

export function setRunBlockContext(ctx: RunBlockContextValue | null) {
  _runBlockCtx = ctx;
}

export function getRunBlockContext(): RunBlockContextValue | null {
  return _runBlockCtx;
}

function RunBlockOutput({ output, onToggle }: {
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
            <pre className={`whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-relaxed ${output.error ? "text-danger" : "text-code-out"}`}>
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

function RunBlockContent({ blockId, kind, code }: {
  blockId: string;
  kind: "python" | "shell";
  code: string;
}) {
  const ctx = getRunBlockContext();
  const isPython = kind === "python";
  const output = ctx?.getOutput(blockId);
  const running = ctx?.isRunning(blockId) ?? false;

  const highlighted = useMemo(
    () => (isPython ? highlightPython(code) : highlightShell(code)),
    [isPython, code]
  );

  return (
    <div className="group run-block-wrapper">
      <div className="run-block-inner rounded-lg border border-cell-border bg-cell-bg">
        <div className="flex items-center gap-1 border-b border-cell-border px-2 py-1">
          <span className={`flex items-center gap-1 text-[11px] font-medium ${isPython ? "text-code-label" : "text-shell-label"}`}>
            {isPython ? <Play className="h-3 w-3" /> : <TerminalIcon className="h-3 w-3" />}
            {isPython ? "Python" : "Shell"}
          </span>
          <span className="text-[10px] text-muted">
            {isPython ? "```python-run" : "```shell-run"}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => ctx?.onRun(blockId)}
            disabled={running}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition ${
              running
                ? "bg-accent/15 text-accent"
                : "bg-accent text-white hover:opacity-90"
            }`}
          >
            {running ? (
              <><Stop className="h-3 w-3 animate-pulse" /> 运行中...</>
            ) : (
              <><Play className="h-3 w-3" /> 运行</>
            )}
          </button>
          <button
            onClick={() => ctx?.onDelete(blockId)}
            className="rounded p-1 text-muted opacity-0 hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
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
            onChange={(e) => ctx?.onEdit(blockId, e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            placeholder={isPython ? "# 在这里编写 Python 代码..." : "# 在这里输入 Shell 命令..."}
          />
        </div>
        {output && <RunBlockOutput output={output} onToggle={(c) => ctx?.onToggleOutput(blockId, c)} />}
      </div>
    </div>
  );
}

export const PythonRunBlock = createReactBlockSpec(
  {
    type: "pythonRun",
    propSchema: {
      ...defaultProps,
      code: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => (
      <RunBlockContent
        blockId={props.block.id}
        kind="python"
        code={props.block.props.code}
      />
    ),
    toExternalHTML: (props) => (
      <pre>
        <code className="language-python-run">{props.block.props.code}</code>
      </pre>
    ),
  }
);

export const ShellRunBlock = createReactBlockSpec(
  {
    type: "shellRun",
    propSchema: {
      ...defaultProps,
      code: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => (
      <RunBlockContent
        blockId={props.block.id}
        kind="shell"
        code={props.block.props.code}
      />
    ),
    toExternalHTML: (props) => (
      <pre>
        <code className="language-shell-run">{props.block.props.code}</code>
      </pre>
    ),
  }
);

export const notebookSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    pythonRun: PythonRunBlock,
    shellRun: ShellRunBlock,
  },
});
