export type RunBlockKind = "python" | "shell";

export const RUN_INFO: Record<RunBlockKind, string> = {
  python: "python-run",
  shell: "shell-run",
};

export interface MarkdownSegment {
  kind: "markdown";
  content: string;
  start: number;
  end: number;
}

export interface RunSegment {
  kind: RunBlockKind;
  content: string;
  key: string;
  start: number;
  end: number;
}

export type PageSegment = MarkdownSegment | RunSegment;

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

export function runBlockKey(kind: RunBlockKind, content: string): string {
  return `${kind}:${hashString(content)}`;
}

interface FenceOpen {
  char: string;
  len: number;
  info: string;
}

function parseFenceOpen(line: string): FenceOpen | null {
  const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  if (!m) return null;
  const fence = m[1];
  const char = fence[0];
  const info = line.slice(m[0].length).trim().split(/\s+/)[0] ?? "";
  return { char, len: fence.length, info };
}

function countRun(line: string, char: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch !== char) break;
    n++;
  }
  return n;
}

function parseFenceClose(line: string, char: string, openLen: number): boolean {
  if (char === "`") {
    return /^ {0,3}`{3,}[ \t]*$/.test(line) && countRun(line, "`") >= openLen;
  }
  return /^ {0,3}~{3,}[ \t]*$/.test(line) && countRun(line, "~") >= openLen;
}

export function parseContent(content: string): PageSegment[] {
  const segments: PageSegment[] = [];
  const lines = content.split("\n");
  const lineStartOffsets: number[] = [];
  let pos = 0;
  for (const line of lines) {
    lineStartOffsets.push(pos);
    pos += line.length + 1;
  }

  let markdownBuf: string[] = [];
  let mdStartLine = 0;
  const flushMarkdown = () => {
    if (markdownBuf.length === 0) return;
    const first = mdStartLine;
    const last = mdStartLine + markdownBuf.length - 1;
    const start = lineStartOffsets[first];
    const end =
      lineStartOffsets[last] +
      lines[last].length +
      (last < lines.length - 1 ? 1 : 0);
    segments.push({ kind: "markdown", content: markdownBuf.join("\n"), start, end });
    markdownBuf = [];
  };

  let i = 0;
  while (i < lines.length) {
    const open = parseFenceOpen(lines[i]);
    if (open && (open.info === RUN_INFO.python || open.info === RUN_INFO.shell)) {
      const kind: RunBlockKind =
        open.info === RUN_INFO.python ? "python" : "shell";
      flushMarkdown();
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !parseFenceClose(lines[j], open.char, open.len)) {
        body.push(lines[j]);
        j++;
      }
      if (j >= lines.length) {
        if (markdownBuf.length === 0) mdStartLine = i;
        markdownBuf.push(lines[i], ...body);
        i = j;
        continue;
      }
      const blockContent = body.join("\n").replace(/\n$/, "");
      const start = lineStartOffsets[i];
      const closeEnd = lineStartOffsets[j] + lines[j].length;
      const end = j < lines.length - 1 ? closeEnd + 1 : closeEnd;
      segments.push({
        kind,
        content: blockContent,
        key: runBlockKey(kind, blockContent),
        start,
        end,
      });
      i = j + 1;
    } else {
      if (markdownBuf.length === 0) mdStartLine = i;
      markdownBuf.push(lines[i]);
      i++;
    }
  }
  flushMarkdown();

  return segments;
}

function makeFence(code: string): string {
  const runs = code.match(/`+/g) ?? [];
  let max = 0;
  for (const r of runs) max = Math.max(max, r.length);
  return "`".repeat(Math.max(3, max + 1));
}

export function serializeBlock(kind: RunBlockKind, code: string): string {
  const fence = makeFence(code);
  return `${fence}${RUN_INFO[kind]}\n${code}\n${fence}\n`;
}
