import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { projectDir, projectFilesDir } from "./storage";

const DEFAULT_CELL = "default";
const HISTORY_LIMIT = 1000;

export interface PtySession {
  key: string;
  id: string;
  cellId: string;
  cwd: string;
  root: string;
  alive: boolean;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export interface PtyStream {
  onData?: (text: string) => void;
  onExit?: () => void;
  onCommands?: (commands: string[]) => void;
}

type ControlChannel = { writable?: boolean; write(data: string): unknown };

interface SessionEntry {
  session: PtySession;
  stream: PtyStream;
  commands: string[];
  pending: string;
  inEscape: boolean;
  escBuf: string;
}

const sessions = new Map<string, SessionEntry>();
const pendingAttach = new Map<string, Promise<PtySession>>();

const COMMAND_LOG_LIMIT = 200;

const PYPROXY_VERSION = "2";
const PYPROXY_SRC = String.raw`import os, sys, struct, fcntl, termios, pty, select, time

cwd, shell = sys.argv[1], sys.argv[2]
os.chdir(cwd)

pid, master = pty.fork()
if pid == 0:
    os.chdir(cwd)
    os.execv(shell, [shell])
    os._exit(127)


def set_size(rows, cols):
    try:
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except Exception:
        pass


def terminate(graceful=True):
    try:
        os.kill(pid, 15 if graceful else 9)
    except Exception:
        pass
    if graceful:
        deadline = time.time() + 1.0
        while time.time() < deadline:
            try:
                if os.waitpid(pid, os.WNOHANG)[0] == pid:
                    return
            except Exception:
                return
            time.sleep(0.05)
        try:
            os.kill(pid, 9)
        except Exception:
            pass


set_size(24, 80)
ctrl = b""
while True:
    r, _, _ = select.select([master, 0, 3], [], [], 0.5)
    if master in r:
        try:
            data = os.read(master, 8192)
        except OSError:
            break
        if not data:
            break
        try:
            os.write(1, data)
        except OSError:
            break
    if 0 in r:
        try:
            data = os.read(0, 8192)
        except OSError:
            break
        if not data:
            break
        try:
            os.write(master, data)
        except OSError:
            break
    if 3 in r:
        try:
            ctrl += os.read(3, 8192)
        except OSError:
            ctrl = b""
        while b"\n" in ctrl:
            line, ctrl = ctrl.split(b"\n", 1)
            parts = line.split()
            if not parts:
                continue
            if parts[0] == b"SIZE" and len(parts) == 3:
                set_size(int(parts[1]), int(parts[2]))
            elif parts[0] == b"QUIT":
                terminate(True)
                os._exit(0)

terminate(False)
`;

function proxyPath(): string {
  return path.join(os.tmpdir(), `nb-pty-proxy-${PYPROXY_VERSION}.py`);
}

async function ensureProxy(): Promise<string> {
  const p = proxyPath();
  try {
    await fs.access(p);
    return p;
  } catch {
    /* write below */
  }
  await fs.writeFile(p, PYPROXY_SRC);
  return p;
}

function safeCell(cellId: unknown): string {
  if (typeof cellId !== "string" || !cellId.trim()) return DEFAULT_CELL;
  const clean = cellId.trim().replace(/[^A-Za-z0-9_-]/g, "_");
  return clean || DEFAULT_CELL;
}

function sessionKey(id: string, cellId: string): string {
  return `${id}:${safeCell(cellId)}`;
}

function stateFor(id: string, cellId: string) {
  const key = sessionKey(id, cellId);
  let entry = sessions.get(key);
  if (!entry) {
    entry = {
      session: {} as PtySession,
      stream: {},
      commands: [],
      pending: "",
      inEscape: false,
      escBuf: "",
    };
    sessions.set(key, entry);
  }
  return entry;
}

function trackInput(entry: SessionEntry, data: string) {
  for (const ch of data) {
    if (ch === "\r" || ch === "\n") {
      const line = entry.pending.trim();
      entry.pending = "";
      if (line) {
        entry.commands.push(line);
        if (entry.commands.length > COMMAND_LOG_LIMIT) entry.commands.shift();
        entry.stream.onCommands?.(entry.commands);
      }
    } else if (ch === "\x7f" || ch === "\b") {
      if (entry.inEscape) entry.inEscape = false;
      else entry.pending = entry.pending.slice(0, -1);
    } else if (ch === "\x1b") {
      entry.inEscape = true;
      entry.escBuf = "";
    } else if (entry.inEscape) {
      entry.escBuf += ch;
      if (entry.escBuf.startsWith("]")) {
        if (ch === "\x07" || ch === "\\") entry.inEscape = false;
      } else if (entry.escBuf.startsWith("[")) {
        if (entry.escBuf.length > 1 && /[\x40-\x7e]/.test(ch)) {
          entry.inEscape = false;
        }
      } else if (/[\x40-\x7e]/.test(ch)) {
        entry.inEscape = false;
      }
    } else if (ch === "\t" || ch.codePointAt(0)! >= 0x20) {
      entry.pending += ch;
    }
  }
}

export function getLiveCommands(id: string, cellId: string): string[] {
  return sessions.get(sessionKey(id, cellId))?.commands ?? [];
}

export function attachShell(id: string, cellId: string): Promise<PtySession> {
  const key = sessionKey(id, cellId);
  const existing = sessions.get(key);
  if (existing?.session.alive) return Promise.resolve(existing.session);

  const inflight = pendingAttach.get(key);
  if (inflight) return inflight;

  const task = doAttach(id, cellId, key);
  pendingAttach.set(key, task);
  task.finally(() => pendingAttach.delete(key)).catch(() => {});
  return task;
}

async function doAttach(id: string, cellId: string, key: string): Promise<PtySession> {
  const existing = sessions.get(key);
  if (existing?.session.alive) return existing.session;
  if (existing?.session.alive === false) sessions.delete(key);

  const root = await projectFilesDir(id);
  const proxy = await ensureProxy();
  const histfile = path.join(await projectDir(id), `.shell_history_${safeCell(cellId)}`);

  const child: ChildProcess = spawn(
    "python3",
    [proxy, root, process.env.SHELL || "/bin/zsh"],
    {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe", "pipe"],
      detached: true,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        PWD: root,
        HISTFILE: histfile,
        HISTSIZE: String(HISTORY_LIMIT),
        SAVEHIST: String(HISTORY_LIMIT),
        HISTCONTROL: "ignoredups:ignorespace",
      },
    }
  );

  const entry = stateFor(id, cellId);
  const decoder = new TextDecoder();
  let exited = false;
  child.stdout!.on("data", (d: Buffer) => {
    entry.stream.onData?.(decoder.decode(d, { stream: true }));
  });
  child.stderr!.on("data", () => {
    /* proxy diagnostics, ignore */
  });
  child.on("error", () => {
    if (!exited) {
      exited = true;
      entry.session.alive = false;
      entry.stream.onExit?.();
    }
  });
  child.on("close", () => {
    if (!exited) {
      exited = true;
      entry.session.alive = false;
      entry.stream.onExit?.();
    }
  });

  const session: PtySession = {
    key,
    id,
    cellId,
    cwd: root,
    root,
    alive: true,
    write(data) {
      if (child.stdin?.writable) {
        child.stdin.write(data);
        trackInput(entry, data);
      }
    },
    resize(cols, rows) {
      const c = Math.max(2, Math.floor(cols) || 80);
      const r = Math.max(1, Math.floor(rows) || 24);
      const ctrl = child.stdio[3] as ControlChannel | null;
      if (ctrl?.writable) ctrl.write(`SIZE ${r} ${c}\n`);
    },
    kill() {
      const ctrl = child.stdio[3] as ControlChannel | null;
      if (ctrl?.writable) ctrl.write("QUIT\n");
      try {
        if (child.pid != null) process.kill(-child.pid, "SIGTERM");
      } catch {
        /* ignore */
      }
      session.alive = false;
      sessions.delete(key);
    },
  };

  entry.session = session;
  return session;
}

export function setStream(
  id: string,
  cellId: string,
  stream: PtyStream
): PtyStream {
  const entry = stateFor(id, cellId);
  entry.stream = stream;
  return stream;
}

export function currentStream(id: string, cellId: string): PtyStream | null {
  return sessions.get(sessionKey(id, cellId))?.stream ?? null;
}

export function getSession(id: string, cellId: string): PtySession | null {
  const entry = sessions.get(sessionKey(id, cellId));
  return entry?.session.alive ? entry.session : null;
}

async function histfilePath(id: string, cellId: string): Promise<string> {
  return path.join(await projectDir(id), `.shell_history_${safeCell(cellId)}`);
}

export async function getShellHistory(id: string, cellId?: string): Promise<string[]> {
  const live = getLiveCommands(id, safeCell(cellId ?? ""));
  if (live.length > 0) return [...live];
  try {
    const raw = await fs.readFile(await histfilePath(id, safeCell(cellId)), "utf8");
    return raw
      .split("\n")
      .map((line) => line.replace(/^:\s*\d+:\d+;\s*/, "").trim())
      .filter(Boolean)
      .slice(-HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export async function clearShellHistory(id: string, cellId?: string): Promise<void> {
  const clean = safeCell(cellId);
  const entry = sessions.get(sessionKey(id, clean));
  if (entry) entry.commands = [];
  try {
    await fs.rm(await histfilePath(id, clean), { force: true });
  } catch {
    /* ignore */
  }
}

export async function getShellCwd(id: string, cellId?: string): Promise<string> {
  const session = getSession(id, safeCell(cellId));
  if (session) return session.cwd;
  return projectFilesDir(id);
}

export function disposeProjectShellSessions(id: string): void {
  const prefix = `${id}:`;
  for (const key of sessions.keys()) {
    if (key.startsWith(prefix)) {
      sessions.get(key)?.session.kill();
      sessions.delete(key);
    }
  }
}
