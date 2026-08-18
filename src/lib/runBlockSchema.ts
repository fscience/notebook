import {
  BlockNoteSchema,
  createBlockSpec,
  defaultBlockSpecs,
  defaultProps,
} from "@blocknote/core";
import { highlightPython, highlightShell } from "@/lib/highlight";
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

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  ...children: (HTMLElement | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className") element.className = v;
      else element.setAttribute(k, v);
    }
  }
  for (const child of children) {
    if (typeof child === "string") element.appendChild(document.createTextNode(child));
    else element.appendChild(child);
  }
  return element;
}

function svgIcon(paths: string, className = ""): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("class", className);
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", paths);
  svg.appendChild(p);
  return svg;
}

const PLAY_PATH = "M5 2.75a.75.75 0 0 1 1.13-.65l7.5 4.75a.75.75 0 0 1 0 1.3l-7.5 4.75a.75.75 0 0 1-1.13-.65V2.75Z";
const TERMINAL_PATH = "M2 2.5A1.5 1.5 0 0 1 3.5 1h9A1.5 1.5 0 0 1 14 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-11Zm2.62 1.38a.75.75 0 0 0-1.24 1.24l1.5 1.5a.75.75 0 0 0 0 1.06l-1.5 1.5a.75.75 0 0 0 1.06 1.06l2-2a.75.75 0 0 0 0-1.06l-2-2Zm4.38.87a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5H9Z";
const TRASH_PATH = "M6 1.5h4a1.5 1.5 0 0 1 1.5 1.5v.5h2.25a.75.75 0 0 1 0 1.5h-.31l-.6 9.06A1.5 1.5 0 0 1 11.35 16H4.65a1.5 1.5 0 0 1-1.49-1.44l-.6-9.06h-.31a.75.75 0 0 1 0-1.5H4.5V3A1.5 1.5 0 0 1 6 1.5Zm.75 3.25h2.5V3.25h-2.5v1.5ZM6 6.5a.75.75 0 0 0-.75.75v5.5a.75.75 0 0 0 1.5 0v-5.5A.75.75 0 0 0 6 6.5Zm4 0a.75.75 0 0 0-.75.75v5.5a.75.75 0 0 0 1.5 0v-5.5A.75.75 0 0 0 10 6.5Z";
const STOP_PATH = "M3 3h10v10H3z";
const CHEVRON_DOWN = "M3.3 5.7a1 1 0 0 1 1.4 0L8 9.6l3.3-3.9a1 1 0 0 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z";
const CHEVRON_UP = "M3.3 10.3a1 1 0 0 1 1.4 0L8 6.4l3.3 3.9a1 1 0 0 1 1.4-1.4l-4-4a1 1 0 0 1-1.4 0l-4 4a1 1 0 0 1 0 1.4Z";

function createRunBlockDOM(
  blockId: string,
  kind: "python" | "shell",
  code: string,
  onUpdate: (code: string) => void
) {
  const ctx = getRunBlockContext();
  const isPython = kind === "python";
  const output = ctx?.getOutput(blockId);
  const running = ctx?.isRunning(blockId) ?? false;

  const wrapper = el("div", { className: "group run-block-wrapper" });
  const inner = el("div", { className: "run-block-inner rounded-lg border border-cell-border bg-cell-bg" });

  const header = el("div", { className: "flex items-center gap-1 border-b border-cell-border px-2 py-1" });

  const label = el("span", {
    className: `flex items-center gap-1 text-[11px] font-medium ${isPython ? "text-code-label" : "text-shell-label"}`,
  });
  const icon = svgIcon(isPython ? PLAY_PATH : TERMINAL_PATH, "h-3 w-3");
  label.appendChild(icon);
  label.appendChild(document.createTextNode(isPython ? "Python" : "Shell"));
  header.appendChild(label);

  const fenceLabel = el("span", { className: "text-[10px] text-muted" });
  fenceLabel.textContent = isPython ? "```python-run" : "```shell-run";
  header.appendChild(fenceLabel);

  const spacer = el("div", { className: "flex-1" });
  header.appendChild(spacer);

  const runBtn = el("button", {
    className: `flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition ${
      running ? "bg-accent/15 text-accent" : "bg-accent text-white hover:opacity-90"
    }`,
  });
  if (running) {
    runBtn.appendChild(svgIcon(STOP_PATH, "h-3 w-3 animate-pulse"));
    runBtn.appendChild(document.createTextNode(" 运行中..."));
    runBtn.setAttribute("disabled", "true");
  } else {
    runBtn.appendChild(svgIcon(PLAY_PATH, "h-3 w-3"));
    runBtn.appendChild(document.createTextNode(" 运行"));
    runBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ctx?.onRun(blockId);
    });
  }
  header.appendChild(runBtn);

  const delBtn = el("button", {
    className: "rounded p-1 text-muted opacity-0 hover:bg-danger/15 hover:text-danger group-hover:opacity-100",
  });
  delBtn.appendChild(svgIcon(TRASH_PATH, "h-3 w-3"));
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    ctx?.onDelete(blockId);
  });
  header.appendChild(delBtn);

  inner.appendChild(header);

  const codeEditor = el("div", { className: "code-editor" });

  const highlighted = isPython ? highlightPython(code) : highlightShell(code);
  const pre = el("pre", { className: "code-editor-pre", "aria-hidden": "true" });
  pre.innerHTML = highlighted;
  codeEditor.appendChild(pre);

  const textarea = el("textarea", {
    className: "code-editor-input",
    spellcheck: "false",
    autocapitalize: "off",
    autocomplete: "off",
    autocorrect: "off",
    placeholder: isPython ? "# 在这里编写 Python 代码..." : "# 在这里输入 Shell 命令...",
  }) as HTMLTextAreaElement;
  textarea.value = code;
  textarea.addEventListener("input", () => {
    onUpdate(textarea.value);
  });
  codeEditor.appendChild(textarea);

  inner.appendChild(codeEditor);

  if (output) {
    inner.appendChild(createOutputDOM(blockId, output));
  }

  wrapper.appendChild(inner);
  return wrapper;
}

function createOutputDOM(blockId: string, output: CellOutput) {
  const ctx = getRunBlockContext();
  const collapsed = !!output.collapsed;

  const container = el("div", { className: "border-t border-cell-border" });

  const toggle = el("button", {
    className: "flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] text-muted transition hover:bg-hover hover:text-foreground",
  });

  const chevron = svgIcon(collapsed ? CHEVRON_DOWN : CHEVRON_UP, "h-3 w-3");
  toggle.appendChild(chevron);
  toggle.appendChild(el("span", { className: "font-medium text-foreground" }, "输出"));

  const stdout = output.stdout ?? "";
  const stderr = output.stderr ?? "";
  const error = output.error ?? "";
  const lineCount = [stdout, stderr, error].reduce(
    (n, s) => n + s.split("\n").filter((l) => l.length > 0).length,
    0
  );
  const imageCount = output.images?.length ?? 0;

  const info = el("span");
  info.textContent = `${lineCount} 行${imageCount > 0 ? ` · ${imageCount} 张图` : ""}`;
  toggle.appendChild(info);

  toggle.appendChild(el("span", { className: "flex-1" }));
  const toggleLabel = el("span");
  toggleLabel.textContent = collapsed ? "展开" : "收起";
  toggle.appendChild(toggleLabel);

  toggle.addEventListener("click", () => {
    ctx?.onToggleOutput(blockId, !collapsed);
  });

  container.appendChild(toggle);

  if (!collapsed) {
    const content = el("div");

    if (stdout || error) {
      const pre = el("pre", {
        className: `whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-relaxed ${error ? "text-danger" : "text-code-out"}`,
      });
      pre.textContent = stdout;
      content.appendChild(pre);
    }

    if (stderr) {
      const pre = el("pre", {
        className: "whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-relaxed text-warn",
      });
      pre.textContent = stderr;
      content.appendChild(pre);
    }

    if (error) {
      const pre = el("pre", {
        className: "whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-relaxed text-danger",
      });
      pre.textContent = error;
      content.appendChild(pre);
    }

    if (output.timedOut) {
      const p = el("p", { className: "px-3 py-2 text-[12px] text-warn" });
      p.textContent = "执行超时，进程已被终止。";
      content.appendChild(p);
    }

    if (output.images && output.images.length > 0) {
      const imgContainer = el("div", { className: "flex flex-wrap gap-2 px-3 py-2" });
      for (const img of output.images) {
        const imgEl = document.createElement("img");
        imgEl.src = `data:${img.mime || "image/png"};base64,${img.data}`;
        imgEl.alt = img.name;
        imgEl.className = "max-h-80 max-w-full rounded border border-cell-border";
        imgContainer.appendChild(imgEl);
      }
      content.appendChild(imgContainer);
    }

    container.appendChild(content);
  }

  return container;
}

export const PythonRunBlock = createBlockSpec(
  {
    type: "pythonRun" as const,
    propSchema: {
      ...defaultProps,
      code: { default: "" },
    },
    content: "none",
  },
  {
    render: (block, editor) => {
      const blockId = block.id;
      const code = block.props.code;

      const dom = createRunBlockDOM(blockId, "python", code, (newCode) => {
        const b = editor.document.find((bl) => bl.id === blockId);
        if (b) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor.updateBlock(b, { props: { code: newCode } as any });
        }
      });

      return { dom };
    },
    toExternalHTML: (block) => {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.className = "language-python-run";
      code.textContent = block.props.code;
      pre.appendChild(code);
      return { dom: pre };
    },
  }
);

export const ShellRunBlock = createBlockSpec(
  {
    type: "shellRun" as const,
    propSchema: {
      ...defaultProps,
      code: { default: "" },
    },
    content: "none",
  },
  {
    render: (block, editor) => {
      const blockId = block.id;
      const code = block.props.code;

      const dom = createRunBlockDOM(blockId, "shell", code, (newCode) => {
        const b = editor.document.find((bl) => bl.id === blockId);
        if (b) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor.updateBlock(b, { props: { code: newCode } as any });
        }
      });

      return { dom };
    },
    toExternalHTML: (block) => {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.className = "language-shell-run";
      code.textContent = block.props.code;
      pre.appendChild(code);
      return { dom: pre };
    },
  }
);

export const notebookSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    pythonRun: PythonRunBlock,
    shellRun: ShellRunBlock,
  },
});
