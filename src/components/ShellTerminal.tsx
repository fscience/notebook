"use client";

import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useCallback, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { Refresh, Trash, ChevronDown, ChevronUp } from "@/components/icons";

interface ShellTerminalProps {
  projectId: string;
  cellId: string;
  fill?: boolean;
  noHistory?: boolean;
}

interface StreamEvent {
  type: "stdout" | "cwd" | "exit" | "error" | "commands";
  text?: string;
  cwd?: string;
  root?: string;
  commands?: string[];
}

const PALETTES: Record<"dark" | "light", { background: string; foreground: string }> = {
  dark: { background: "#191919", foreground: "#e5e5e6" },
  light: { background: "#ffffff", foreground: "#333333" },
};

export default function ShellTerminal({
  projectId,
  cellId,
  fill = false,
  noHistory = false,
}: ShellTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const readyRef = useRef(false);
  const cwdRef = useRef("");
  const rootRef = useRef("");
  const inputBufRef = useRef("");
  const inputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [cwd, setCwd] = useState("");
  const [error, setError] = useState("");
  const [commands, setCommands] = useState<string[]>([]);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const sendInput = useCallback(
    (data: string) => {
      inputBufRef.current += data;
      if (inputTimerRef.current) clearTimeout(inputTimerRef.current);
      inputTimerRef.current = setTimeout(() => {
        const payload = inputBufRef.current;
        inputBufRef.current = "";
        if (!payload || !readyRef.current) return;
        fetch(`/api/projects/${projectId}/shell/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cellId, data: payload }),
        }).catch(() => {});
      }, 25);
    },
    [projectId, cellId]
  );

  const sendResize = useCallback(
    (cols: number, rows: number) => {
      if (!readyRef.current) return;
      fetch(`/api/projects/${projectId}/shell/resize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cellId, cols, rows }),
      }).catch(() => {});
    },
    [projectId, cellId]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let alive = true;

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    const palette = PALETTES[prefersDark.matches ? "dark" : "light"];
    const term = new Terminal({
      fontSize: 12,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        background: palette.background,
        foreground: palette.foreground,
        cursor: "#ef9f9f",
        cursorAccent: "#191919",
        selectionBackground: "#2d4556",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    termRef.current = term;
    fitRef.current = fit;
    term.open(container);
    try {
      fit.fit();
    } catch {
      /* container not laid out yet */
    }

    term.write(
      "\x1b[1;33mShell\x1b[0m — 交互式终端，↑/↓ 浏览历史，Ctrl+C 中止，支持 vi/vim 等全屏程序。\r\n"
    );

    const abort = new AbortController();
    abortRef.current = abort;

    term.onData((data) => sendInput(data));
    term.onResize(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        sendResize(term.cols, term.rows);
      }, 50);
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    resizeObserver.observe(container);

    async function connect() {
      if (!alive) return;
      try {
        const res = await fetch(
          `/api/projects/${projectId}/shell/session`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cellId, persistHistory: !noHistory }),
            signal: abort.signal,
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "启动终端会话失败");
        }
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        readyRef.current = true;
        if (typeof data.cwd === "string") {
          cwdRef.current = data.cwd;
          setCwd(data.cwd);
        }
        if (typeof data.root === "string") rootRef.current = data.root;
        sendResize(term.cols, term.rows);
      } catch (e) {
        if (alive && !isAbortError(e)) {
          setError((e as Error).message);
          setTimeout(() => void connect(), 1500);
        }
        return;
      }

      let streamRes: Response;
      try {
        streamRes = await fetch(
          `/api/projects/${projectId}/shell/stream?cell=${encodeURIComponent(cellId)}`,
          { signal: abort.signal }
        );
      } catch (e) {
        if (alive && !isAbortError(e)) {
          setError("终端连接失败");
          setTimeout(() => void connect(), 1500);
        }
        return;
      }
      if (!streamRes.ok || !streamRes.body) {
        if (alive) {
          setError("无法连接终端流");
          setTimeout(() => void connect(), 1500);
        }
        return;
      }

      setConnected(true);
      setError("");
      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let gotExit = false;
      let streamFailed = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const line = chunk.startsWith("data: ") ? chunk.slice(6) : chunk;
            let ev: StreamEvent;
            try {
              ev = JSON.parse(line) as StreamEvent;
            } catch {
              continue;
            }
            if (ev.type === "stdout" && typeof ev.text === "string") {
              term.write(ev.text);
            } else if (ev.type === "cwd") {
              if (typeof ev.cwd === "string") {
                cwdRef.current = ev.cwd;
                setCwd(ev.cwd);
              }
              if (typeof ev.root === "string") rootRef.current = ev.root;
            } else if (ev.type === "error") {
              if (alive) setError(ev.text || "终端错误");
            } else if (ev.type === "commands") {
              if (Array.isArray(ev.commands)) setCommands(ev.commands);
            } else if (ev.type === "exit") {
              gotExit = true;
              setConnected(false);
            }
          }
        }
      } catch (e) {
        streamFailed = true;
        if (alive && !isAbortError(e)) {
          setConnected(false);
          setError("终端连接已断开");
        }
      } finally {
        readyRef.current = false;
        if (alive) setConnected(false);
        if (alive && !gotExit && streamFailed) {
          setTimeout(() => void connect(), 1500);
        }
      }
    }

    void connect();

    return () => {
      alive = false;
      abort.abort();
      resizeObserver.disconnect();
      if (inputTimerRef.current) clearTimeout(inputTimerRef.current);
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      readyRef.current = false;
    };
  }, [projectId, cellId, resetKey, sendInput, sendResize, noHistory]);

  async function handleClearHistory() {
    if (!window.confirm("确定清空这个终端的命令历史？")) return;
    await fetch(
      `/api/projects/${projectId}/shell/history?cell=${encodeURIComponent(cellId)}`,
      { method: "DELETE" }
    ).catch(() => {});
    setCommands([]);
  }

  function handleReset() {
    setError("");
    setResetKey((k) => k + 1);
  }

  return (
    <div className={`flex flex-col ${fill ? "h-full" : ""}`}>
      <div className="flex shrink-0 items-center gap-1 px-2 py-1">
        <span className="text-[10px] font-semibold text-muted">Shell</span>
        <span className="flex items-center gap-1 text-[10px]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? "animate-pulse bg-accent" : "bg-muted/60"
            }`}
          />
          <span className={connected ? "text-accent" : "text-muted"}>
            {connected ? "已连接" : "未连接"}
          </span>
        </span>
        <div className="flex-1" />
        {cwd && (
          <span className="max-w-[50%] truncate text-[10px] text-muted" title={cwd}>
            {relCwd(cwd, rootRef.current)}
          </span>
        )}
        <button
          onClick={handleReset}
          className="rounded p-1 text-muted hover:bg-hover hover:text-foreground"
          title="重置终端（重启会话）"
        >
          <Refresh className="h-3 w-3" />
        </button>
        {!noHistory && (
          <button
            onClick={() => void handleClearHistory()}
            className="rounded p-1 text-muted hover:bg-hover hover:text-foreground"
            title="清空命令历史"
          >
            <Trash className="h-3 w-3" />
          </button>
        )}
      </div>

      {error && (
        <div className="mx-2 mb-1 shrink-0 rounded border border-danger/40 bg-danger/10 p-1.5 text-[11px] text-danger">
          {error}
        </div>
      )}

      <div
        ref={containerRef}
        className={`overflow-hidden bg-white p-1 dark:bg-cell-bg ${
          fill ? "min-h-0 flex-1" : "h-60"
        }`}
        onClick={() => termRef.current?.focus()}
      />

      {!noHistory && commands.length > 0 && (
        <div className="shrink-0 border-t border-cell-border">
          <button
            onClick={() => setHistoryCollapsed((v) => !v)}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] text-muted transition hover:bg-hover hover:text-foreground"
            title={historyCollapsed ? "展开输出" : "收起输出"}
          >
            {historyCollapsed ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
            <span className="font-medium text-foreground">输出</span>
            <span>{commands.length} 条命令</span>
            <span className="flex-1" />
            <span>{historyCollapsed ? "展开" : "收起"}</span>
          </button>
          {!historyCollapsed && (
            <pre className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-relaxed text-code-out">
              {commands.map((c) => `$ ${c}`).join("\n")}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function relCwd(cwd: string, root: string): string {
  if (!root) return cwd;
  if (cwd === root) return "~";
  if (cwd.startsWith(root + "/")) return "~" + cwd.slice(root.length);
  return cwd;
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}
